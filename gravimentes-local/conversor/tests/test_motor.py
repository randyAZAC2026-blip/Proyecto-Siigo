import base64
import io
import json
import re
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from motor import DEFAULTS, config_validated, connect, document, process
from servidor import application
from revision import inspect_xml

FIXTURE = (Path(__file__).parent/'factura.xml').read_bytes()
CONFIG = {**DEFAULTS, 'nit':'900111222', 'empresa':'Empresa de prueba', 'reglas':[{'texto':'PAPEL','cuenta':'519515'}]}


def support_xml(own_supplier=True, adjustment=False):
    xml = FIXTURE.replace(b'<cbc:InvoiceTypeCode>01', b'<cbc:InvoiceTypeCode>05')
    xml = re.sub(br'<cac:TaxTotal>.*?</cac:TaxTotal>', b'', xml, flags=re.S)
    xml = xml.replace(b'119000.1190', b'100000.1000')
    if own_supplier:
        xml = xml.replace(b'900111222', b'OWN_NIT').replace(b'800999888', b'900111222').replace(b'OWN_NIT', b'800999888')
    if adjustment:
        xml = xml.replace(b'Invoice', b'CreditNote').replace(b'<cbc:CreditNoteTypeCode>05', b'<cbc:CreditNoteTypeCode>95')
    return xml


def zipped(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, content in files:
            archive.writestr(name, content)
    return buffer.getvalue()


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name)/'test.sqlite3'

    def test_decimal_and_header_tax_not_double_counted(self):
        doc = document(FIXTURE, config_validated(CONFIG))
        self.assertEqual(doc['iva'], '19000.0190')
        self.assertEqual(doc['debitos'], '119000.1190')
        self.assertEqual(doc['creditos'], doc['debitos'])
        self.assertEqual(doc['filas'][0][0], '519515')
        self.assertEqual(doc['retenciones'], '0')
        self.assertEqual(doc['filas'][0][1], '00003')

    def test_support_expense_uses_counterparty_in_both_xml_layouts(self):
        config={**CONFIG,'comprobante_ds':'00009','proveedor_ds':'23359501','reglas':[]}
        for own_supplier in (True,False):
            with self.subTest(own_supplier=own_supplier):
                doc=document(support_xml(own_supplier),config)
                self.assertTrue(doc['clasificacion']['soporte'])
                self.assertEqual(doc['nit'],'800999888')
                self.assertTrue(all(row[5]=='800999888' for row in doc['filas']))
                self.assertEqual(doc['filas'][0][:2],['519530','00009'])
                self.assertEqual(doc['filas'][0][7],'1')
                self.assertEqual(doc['filas'][-1][0],'23359501')
                self.assertEqual(doc['debitos'],doc['creditos'])

    def test_support_adjustment_reverses_expense_and_payable(self):
        doc=document(support_xml(adjustment=True),{**CONFIG,'comprobante_ajuste_ds':'00010'})
        self.assertEqual(doc['clasificacion']['codigo'],'95')
        self.assertEqual(doc['filas'][0][7],'2')
        self.assertEqual(doc['filas'][-1][0],'233595')
        self.assertEqual(doc['filas'][-1][7],'1')
        self.assertTrue(all(row[1]=='00010' for row in doc['filas']))

    def test_support_still_requires_own_company_and_does_not_classify_sales_as_expenses(self):
        with self.assertRaisesRegex(ValueError, 'emisor o como receptor'):
            document(support_xml().replace(b'900111222', b'999999999'), CONFIG)
        with self.assertRaisesRegex(ValueError, 'Comprador'):
            document(support_xml().replace(b'<cbc:InvoiceTypeCode>05', b'<cbc:InvoiceTypeCode>01'), CONFIG)

    def test_inspection_preserves_failed_fields_attributes_and_container(self):
        bad=FIXTURE.replace(b'2026-09-23',b'2026-02-30').replace(b'>COP<',b'>USD<').replace(b'<cbc:ID>PRUEBA100',b'<cbc:ID schemeID="test">PRUEBA100')
        wrapper=b'<AttachedDocument><Attachment><ExternalReference><Description><![CDATA['+bad+b']]></Description></ExternalReference></Attachment></AttachedDocument>'
        result=inspect_xml(wrapper,CONFIG)
        self.assertFalse(result['apto'])
        self.assertEqual(result['resumen']['documento'],'PRUEBA100')
        self.assertGreaterEqual(len([c for c in result['controles'] if c['estado']=='error']),2)
        self.assertTrue(result['campos_contenedor'])
        self.assertTrue(any(f['atributos'].get('schemeID')=='test' for f in result['campos']))
        self.assertIn('xmlns:cac',result['xml_original'])
        self.assertIn('USD',result['xml_ubl'])
        broken=inspect_xml(b'<Invoice><broken>',CONFIG)
        self.assertFalse(broken['apto'])
        self.assertEqual(broken['xml_original'],'<Invoice><broken>')
        self.assertIn('mal formado',broken['controles'][0]['detalle'])

    def test_credit_note_reverses_all_entries(self):
        xml = FIXTURE.replace(b'Invoice', b'CreditNote')
        original = document(FIXTURE, CONFIG)['filas']
        reverse = document(xml, CONFIG)['filas']
        self.assertEqual([r[8] for r in original], [r[8] for r in reverse])
        self.assertEqual([r[7] for r in reverse], ['2','2','1'])

    def test_xml_withholding_payable_net_and_gross(self):
        hold = b'''<cac:WithholdingTaxTotal><cbc:TaxAmount>2500.0025</cbc:TaxAmount><cac:TaxSubtotal>
        <cbc:TaxableAmount>100000.1000</cbc:TaxableAmount><cbc:TaxAmount>2500.0025</cbc:TaxAmount>
        <cac:TaxCategory><cac:TaxScheme><cbc:ID>06</cbc:ID></cac:TaxScheme></cac:TaxCategory>
        </cac:TaxSubtotal></cac:WithholdingTaxTotal>'''
        xml = FIXTURE.replace(b'<cac:LegalMonetaryTotal>', hold+b'<cac:LegalMonetaryTotal>')
        gross = document(xml, CONFIG)
        net = document(xml.replace(b'<cbc:PayableAmount>119000.1190', b'<cbc:PayableAmount>116500.1165'), CONFIG)
        self.assertEqual(gross['filas'], net['filas'])
        self.assertEqual(gross['neto'], '116500.1165')
        self.assertEqual(len(gross['filas']), 4)

    def test_global_discount_and_no_forced_balance(self):
        xml = FIXTURE.replace(b'<cbc:TaxInclusiveAmount>', b'<cbc:AllowanceTotalAmount>1000</cbc:AllowanceTotalAmount><cbc:TaxInclusiveAmount>')
        xml = xml.replace(b'119000.1190', b'117810.1190')
        xml = xml.replace(b'<cbc:TaxableAmount>100000.1000', b'<cbc:TaxableAmount>99000.1000', 1)
        xml = xml.replace(b'<cbc:TaxAmount>19000.0190', b'<cbc:TaxAmount>18810.0190', 2)
        doc = document(xml, CONFIG)
        self.assertEqual(doc['debitos'], doc['creditos'])
        self.assertTrue(any(r[0]=='519530' and r[7]=='2' for r in doc['filas']))
        adjusted = document(xml.replace(b'<cbc:PayableAmount>117810.1190', b'<cbc:PayableAmount>117810.1200'), CONFIG)
        self.assertEqual(adjusted['filas'], doc['filas'])
        self.assertTrue(any('Valor a pagar' in w for w in adjusted['advertencias']))

    def test_same_batch_cufe_conflict_and_missing_header_iva(self):
        changed = FIXTURE.replace(b'100000.1000',b'200000.2000').replace(b'19000.0190',b'38000.0380').replace(b'119000.1190',b'238000.2380')
        result = process(self.db,[('original.xml',FIXTURE),('changed.xml',changed)],CONFIG)
        self.assertEqual((result['aceptados'],result['errores']), (1,1))
        self.assertIn('datos fiscales diferentes',result['documentos'][1]['mensaje'])
        root_start = FIXTURE.index(b'<cac:TaxTotal>')
        root_end = FIXTURE.index(b'</cac:TaxTotal>',root_start)+len(b'</cac:TaxTotal>')
        missing = FIXTURE[:root_start]+FIXTURE[root_end:]
        recovered = document(missing, CONFIG)
        self.assertEqual(recovered['iva'], '19000.0190')
        self.assertEqual(recovered['filas'], document(FIXTURE, CONFIG)['filas'])

    def test_rounding_and_prepaid_preserve_invoice_accrual(self):
        for rounding in ('-0.01', '-0.39', '2.00'):
            with self.subTest(rounding=rounding):
                fields = f'<cbc:PayableRoundingAmount>{rounding}</cbc:PayableRoundingAmount><cbc:PrepaidAmount>10000</cbc:PrepaidAmount>'.encode()
                xml = FIXTURE.replace(b'<cbc:PayableAmount>119000.1190', fields+b'<cbc:PayableAmount>'+str(Decimal('109000.1190')+Decimal(rounding)).encode())
                doc = document(xml, CONFIG)
                self.assertEqual(Decimal(doc['total']), Decimal('119000.1190')+Decimal(rounding))
                self.assertEqual(doc['debitos'], doc['creditos'])
                self.assertEqual(doc['anticipo'], '10000.0000')
                self.assertFalse(any('Valor a pagar' in w for w in doc['advertencias']))
        for field in ('PayableRoundingAmount', 'PrepaidAmount'):
            xml = FIXTURE.replace(b'<cbc:PayableAmount>', f'<cbc:{field}>NaN</cbc:{field}><cbc:PayableAmount>'.encode())
            with self.assertRaisesRegex(ValueError, 'Importe inv'):
                document(xml, CONFIG)

    def test_nested_zip_attached_and_bad_file_report(self):
        wrapped = b'<AttachedDocument><Attachment><ExternalReference><Description><![CDATA['+FIXTURE+b']]></Description></ExternalReference></Attachment></AttachedDocument>'
        archive = zipped([('nested.zip', zipped([('attached.xml', wrapped)])), ('bad.xml', b'<broken>'), ('invalid.zip', b'bad zip')])
        batch = process(self.db, [('lote.zip',archive)], CONFIG)
        self.assertEqual((batch['aceptados'],batch['errores']), (1,2))
        con = connect(self.db)
        try:
            package = con.execute('SELECT paquete FROM lotes').fetchone()[0]
        finally:
            con.close()
        with zipfile.ZipFile(io.BytesIO(package)) as output:
            self.assertIn('documentos.csv', output.namelist())
            self.assertIn('fuentes/1_lote.zip', output.namelist())
            rows = output.read('CONT_AI_900111222.txt').decode().splitlines()
            self.assertTrue(all(len(r.split('\t'))==13 for r in rows))

    def test_header_iva_is_authoritative_and_differences_are_reported(self):
        start = FIXTURE.index(b'<cac:InvoiceLine>')
        xml = FIXTURE[:start] + FIXTURE[start:].replace(b'19000.0190', b'19002.0190')
        xml = xml.replace(b'<cbc:TaxInclusiveAmount>119000.1190', b'<cbc:TaxInclusiveAmount>119005.1190')
        doc = document(xml, CONFIG)
        self.assertEqual(doc['iva'], '19000.0190')
        self.assertEqual(doc['filas'], document(FIXTURE, CONFIG)['filas'])
        self.assertEqual(len(doc['advertencias']), 2)
        inspection = inspect_xml(xml, CONFIG)
        self.assertTrue(inspection['apto'])
        self.assertIn('IVA de líneas distinto', inspection['controles'][-1]['detalle'])

    def test_persistent_dedup_and_explicit_reconversion(self):
        first = process(self.db, [('factura.xml', FIXTURE)], CONFIG)
        second = process(self.db, [('factura.xml', FIXTURE)], CONFIG)
        self.assertEqual(second['duplicados'], 1)
        self.assertEqual(second['lineas'], 0)
        changed = {**CONFIG, 'reglas':[{'texto':'PAPEL','cuenta':'143515'}]}
        third = process(self.db, [('factura.xml', FIXTURE), ('repeat.xml', FIXTURE)], changed, first['id'])
        self.assertEqual((third['aceptados'],third['duplicados']), (1,1))
        self.assertEqual(third['documentos'][0]['asiento'][0][0], '143515')
        fourth = process(self.db, [('factura.xml', FIXTURE)], CONFIG, third['id'])
        self.assertEqual(fourth['aceptados'], 1)
        duplicate = process(self.db, [('factura.xml', FIXTURE)], CONFIG)
        self.assertEqual(duplicate['documentos'][0]['lote_original'], fourth['id'])
        self.assertEqual(duplicate['lineas'], 0)

    def test_bad_buyer_date_currency_and_amount(self):
        for old,new in [(b'900111222',b'900222333'),(b'2026-09-23',b'2026-02-30'),(b'>COP<',b'>USD<'),(b'100000.1000',b'NaN')]:
            with self.subTest(new=new):
                result = process(self.db, [('bad.xml',FIXTURE.replace(old,new))], CONFIG)
                self.assertEqual(result['errores'], 1)
                self.assertEqual(result['aceptados'], 0)

    def test_transaction_rollback_and_concurrent_import(self):
        # Ambas solicitudes compiten por el mismo CUFE; solo una puede convertirlo.
        connect(self.db).close()
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(process,self.db,[('f.xml',FIXTURE)],CONFIG) for _ in range(2)]
            batches = [f.result() for f in futures]
        self.assertEqual(sum(b['aceptados'] for b in batches), 1)
        self.assertEqual(sum(b['duplicados'] for b in batches), 1)
        con = connect(self.db)
        before = con.execute('SELECT count(*) FROM lotes').fetchone()[0]
        con.close()
        with self.assertRaises(ValueError):
            process(self.db,[('f.xml',FIXTURE)],CONFIG,'missing-lot')
        con = connect(self.db)
        self.assertEqual(con.execute('SELECT count(*) FROM lotes').fetchone()[0],before)
        con.close()

    def test_cli_folder_produces_downloadable_package(self):
        folder = Path(self.tmp.name)/'entrada'
        folder.mkdir()
        (folder/'prueba.xml').write_bytes(FIXTURE)
        cfg = Path(self.tmp.name)/'empresa.json'
        cfg.write_text(json.dumps(CONFIG))
        run = subprocess.run([sys.executable,str(ROOT/'servidor.py'),'--entrada',str(folder),'--config',str(cfg),'--salida',str(Path(self.tmp.name)/'salida'),'--db',str(self.db)],capture_output=True,text=True)
        self.assertEqual(run.returncode,0,run.stderr)
        result=json.loads(run.stdout)
        self.assertEqual(result['convertidos'],1)
        self.assertTrue(Path(result['paquete']).exists())


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.server = ThreadingHTTPServer(('127.0.0.1',0),application(Path(self.tmp.name)/'api.sqlite3'))
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def request(self,path,payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(self.url+path,data=data,headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req) as response:
            return response.read()

    def test_upload_history_download_reconversion(self):
        start=json.loads(self.request('/api/inicio'))
        self.assertEqual(start['lotes'],[])
        payload=dict(configuracion=CONFIG,archivos=[dict(nombre='prueba.xml',contenido=base64.b64encode(FIXTURE).decode())])
        result=json.loads(self.request('/api/procesar',payload))
        self.assertEqual(result['aceptados'],1)
        base='/api/lotes/'+result['id']
        self.assertIn(b'519515',self.request(base+'/txt'))
        with zipfile.ZipFile(io.BytesIO(self.request(base+'/zip'))) as z:
            self.assertIn('informe.json',z.namelist())
        version=json.loads(self.request(base+'/regenerar',{**CONFIG,'centro':'02'}))
        self.assertEqual(version['aceptados'],1)
        self.assertEqual(version['documentos'][0]['asiento'][0][10],'02')
        self.assertEqual(len(json.loads(self.request('/api/inicio'))['lotes']),2)
        self.request('/api/lotes', {})
        cleared=json.loads(self.request('/api/inicio'))
        self.assertEqual(cleared['lotes'], [])
        self.assertEqual(len(cleared['empresas']), 1)
        imported=json.loads(self.request('/api/procesar',payload))
        self.assertEqual((imported['aceptados'], imported['duplicados']), (1, 0))

    def test_review_endpoint_including_rejected_and_nested_sources(self):
        bad=FIXTURE.replace(b'>COP<',b'>USD<')
        archive=zipped([('bad.xml',bad),('soporte.xml',support_xml()),('roto.xml',b'<broken>')])
        payload=dict(configuracion=CONFIG,archivos=[dict(nombre='lote.zip',contenido=base64.b64encode(archive).decode())])
        result=json.loads(self.request('/api/procesar',payload))
        self.assertEqual((result['aceptados'],result['errores']),(1,2))
        base='/api/lotes/'+result['id']+'/revision/'
        rejected=json.loads(self.request(base+'0'))
        self.assertEqual(rejected['resultado_guardado']['estado'],'error')
        self.assertFalse(rejected['apto'])
        self.assertEqual(rejected['resumen']['moneda'],'USD')
        self.assertEqual(self.request(base+'0/xml'),bad)
        support=json.loads(self.request(base+'1'))
        self.assertTrue(support['apto'])
        self.assertEqual(support['resumen']['clasificacion']['codigo'],'05')
        self.assertIn('233595',[r[0] for r in support['asiento']])
        self.assertIn('mal formado',json.loads(self.request(base+'2'))['controles'][0]['detalle'])
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request(base+'99')
        self.assertEqual(error.exception.code,404)

    def test_old_support_error_can_be_reviewed_and_reconverted(self):
        payload=dict(configuracion=CONFIG,archivos=[dict(nombre='soporte.xml',contenido=base64.b64encode(support_xml()).decode())])
        result=json.loads(self.request('/api/procesar',payload))
        # Simular un informe de la versión que rechazaba los DS, conservando fuentes.
        legacy={**result,'aceptados':0,'errores':1}
        legacy['documentos']=[dict(archivo='soporte.xml',estado='error',mensaje='Documento soporte: requiere un flujo distinto de compras recibidas.')]
        con=connect(Path(self.tmp.name)/'api.sqlite3')
        with con:
            con.execute('UPDATE lotes SET informe=? WHERE id=?',(json.dumps(legacy),result['id']))
        con.close()
        base='/api/lotes/'+result['id']
        inspection=json.loads(self.request(base+'/revision/0'))
        self.assertEqual(inspection['resultado_guardado']['estado'],'error')
        self.assertTrue(inspection['apto'])
        regenerated=json.loads(self.request(base+'/regenerar',CONFIG))
        self.assertEqual(regenerated['aceptados'],1)


if __name__ == '__main__':
    unittest.main()
