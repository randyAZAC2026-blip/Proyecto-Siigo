import base64
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from test_motor import CONFIG, FIXTURE, zipped
import test_motor
import facturas
from motor import connect, process


def two_lines():
    start = FIXTURE.index(b'<cac:InvoiceLine>')
    end = FIXTURE.index(b'</cac:InvoiceLine>')+len(b'</cac:InvoiceLine>')
    header = FIXTURE[:start].replace(b'100000.1000', b'200000.2000').replace(b'19000.0190', b'38000.0380').replace(b'119000.1190', b'238000.2380')
    line = FIXTURE[start:end]
    return header+line+line.replace(b'<cbc:ID>1', b'<cbc:ID>2')+FIXTURE[end:]


class InvoiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name)/'facturas.sqlite3'

    def test_content_and_cufe_dedup_nested_archives_and_concurrency(self):
        wrapper = b'<AttachedDocument><Attachment><ExternalReference><Description><![CDATA['+FIXTURE+b']]></Description></ExternalReference></Attachment></AttachedDocument>'
        files = [('same.xml', FIXTURE), ('nested.zip', zipped([('renamed.xml', FIXTURE), ('wrapper.xml', wrapper)]))]
        result = facturas.upload(self.db, files, CONFIG)
        self.assertEqual((result['nuevas'], result['duplicadas'], result['errores']), (1, 2, []))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: facturas.upload(self.db, [('again.xml', FIXTURE)], CONFIG), range(2)))
        self.assertEqual(sum(r['nuevas'] for r in results), 0)
        self.assertEqual(len(facturas.listing(self.db, CONFIG['nit'])), 1)
        changed = FIXTURE.replace(b'119000.1190', b'119100.1190')
        conflict = facturas.upload(self.db, [('changed.xml', changed)], CONFIG)
        self.assertEqual(conflict['nuevas'], 0)
        self.assertIn('mismo CUFE', conflict['errores'][0])

    def test_individual_item_accounts_persist_and_reach_export(self):
        facturas.upload(self.db, [('f.xml', two_lines())], CONFIG)
        invoice = facturas.listing(self.db, CONFIG['nit'])[0]
        self.assertEqual(invoice['estado'], 'pendiente')
        with self.assertRaises(ValueError):
            facturas.generate(self.db, [invoice['id']], CONFIG)
        with self.assertRaises(ValueError):
            facturas.save_accounts(self.db, invoice['id'], ['519515'])
        with self.assertRaises(ValueError):
            facturas.save_accounts(self.db, invoice['id'], ['abcd', '143515'])
        facturas.save_accounts(self.db, invoice['id'], ['519515', '143515'])
        saved = facturas.detail(self.db, invoice['id'])
        self.assertEqual(saved['cuentas'], ['519515', '143515'])
        self.assertEqual(saved['estado'], 'lista')
        batch = facturas.generate(self.db, [invoice['id']], CONFIG)['lotes'][0]
        self.assertEqual(batch['aceptados'], 1)
        rows = batch['documentos'][0]['asiento']
        self.assertEqual([r[0] for r in rows[:2]], ['519515', '143515'])
        self.assertEqual(batch['debitos'], batch['creditos'])
        self.assertEqual(facturas.detail(self.db, invoice['id'])['estado'], 'generada')
        with self.assertRaises(ValueError):
            facturas.generate(self.db, [invoice['id']], CONFIG)
        facturas.save_accounts(self.db, invoice['id'], ['519530', '143515'])
        version = facturas.generate(self.db, [invoice['id']], CONFIG)['lotes'][0]
        self.assertEqual(version['aceptados'], 1)
        self.assertEqual(version['reprocesa'], batch['id'])
        self.assertEqual(version['documentos'][0]['asiento'][0][0], '519530')
        self.assertEqual(len(facturas.listing(self.db, CONFIG['nit'])), 1)

    def test_legacy_sources_migrate_once_with_accounts_and_company_errors(self):
        batch = process(self.db, [('invoice.xml', FIXTURE)], CONFIG)
        entries = facturas.listing(self.db, CONFIG['nit'])
        self.assertEqual(len(entries), 1)
        migrated = facturas.detail(self.db, entries[0]['id'])
        self.assertEqual(migrated['cuentas'], ['519515'])
        self.assertEqual(migrated['estado'], 'generada')
        self.assertEqual(migrated['lote'], batch['id'])
        self.assertEqual(len(facturas.listing(self.db, CONFIG['nit'])), 1)
        wrong = FIXTURE.replace(b'900111222', b'900222333').replace(b'CUFE-SINTETICO-PRUEBA-100', b'WRONG-BUYER')
        facturas.upload(self.db, [('wrong.xml', wrong)], CONFIG)
        errors = [d for d in facturas.listing(self.db, CONFIG['nit']) if d['estado'] == 'error']
        self.assertEqual(len(errors), 1)
        self.assertIn('Comprador', facturas.detail(self.db, errors[0]['id'])['errores'][0])

    def test_withholding_rate_appears_in_invoice_detail_and_plan(self):
        hold = b'''<cac:WithholdingTaxTotal><cbc:TaxAmount>2500.0025</cbc:TaxAmount><cac:TaxSubtotal>
        <cbc:TaxableAmount>100000.1000</cbc:TaxableAmount><cbc:TaxAmount>2500.0025</cbc:TaxAmount>
        <cac:TaxCategory><cbc:Percent>5</cbc:Percent><cac:TaxScheme><cbc:ID>05</cbc:ID><cac:TaxSchemeName>ReteIVA</cac:TaxSchemeName></cac:TaxScheme></cac:TaxCategory>
        </cac:TaxSubtotal></cac:WithholdingTaxTotal>'''
        xml = FIXTURE.replace(b'<cac:LegalMonetaryTotal>', hold+b'<cac:LegalMonetaryTotal>')
        data = facturas.describe(xml, CONFIG)
        self.assertEqual(len(data['retenciones']), 1)
        self.assertEqual(data['retenciones'][0]['nombre'], 'ReteIVA')
        self.assertEqual(data['retenciones'][0]['tarifa'], '5')
        facturas.upload(self.db, [('withhold.xml', xml)], CONFIG)
        invoice = facturas.listing(self.db, CONFIG['nit'])[0]
        self.assertEqual(invoice['estado'], 'pendiente')
        facturas.save_accounts(self.db, invoice['id'], ['519515'])
        batch = facturas.generate(self.db, [invoice['id']], CONFIG)['lotes'][0]
        self.assertEqual(batch['aceptados'], 1)
        self.assertIn('ReteIVA 5%', batch['documentos'][0]['asiento'][2][6])


class InvoiceApiTests(unittest.TestCase):
    setUp = test_motor.ApiTests.setUp
    tearDown = test_motor.ApiTests.tearDown
    request = test_motor.ApiTests.request

    def test_upload_assign_generate_and_clear_preserves_invoice(self):
        payload = dict(configuracion=CONFIG, archivos=[dict(nombre='invoice.xml', contenido=base64.b64encode(FIXTURE).decode())])
        upload = json.loads(self.request('/api/facturas/importar', payload))
        self.assertEqual(upload['nuevas'], 1)
        listing = json.loads(self.request('/api/facturas?nit='+CONFIG['nit']))
        invoice_id = listing[0]['id']
        detail = json.loads(self.request('/api/facturas/'+invoice_id))
        self.assertEqual(detail['items'][0]['descripcion'], 'PAPEL para oficina')
        self.request('/api/facturas/'+invoice_id+'/cuentas', {'cuentas':['143515']})
        generated = json.loads(self.request('/api/facturas/generar', {'configuracion':CONFIG, 'ids':[invoice_id]}))
        self.assertIn(b'143515', self.request('/api/lotes/'+generated['lotes'][0]['id']+'/txt'))
        self.request('/api/lotes', {})
        listing = json.loads(self.request('/api/facturas?nit='+CONFIG['nit']))
        self.assertEqual((len(listing), listing[0]['estado']), (1, 'lista'))
        reupload = json.loads(self.request('/api/facturas/importar', payload))
        self.assertEqual((reupload['nuevas'], reupload['duplicadas']), (0, 1))


if __name__ == '__main__':
    unittest.main()
