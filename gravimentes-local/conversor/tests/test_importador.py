import base64
import io
import json
import unittest
import zipfile
from xml.sax.saxutils import escape

import facturas
import importador
import nomina
import test_facturas
import test_motor
from motor import connect
from test_motor import CONFIG, FIXTURE, zipped


PAYROLL=b'''<NominaIndividual><Empleador NIT="900111222"/><InformacionGeneral CUNE="CUNE-PRUEBA" FechaGen="2026-09-30"/><NumeroSecuenciaXML Prefijo="N" Consecutivo="1" Numero="N1"/><Periodo FechaLiquidacionInicio="2026-09-01"/><Trabajador NumeroDocumento="12345678" PrimerNombre="Empleado" PrimerApellido="Prueba"/><Devengados><Basico DiasTrabajados="30" SueldoTrabajado="1000"/></Devengados><Deducciones><Salud Deduccion="40"/><FondoPension Deduccion="40"/></Deducciones><DevengadosTotal>1000</DevengadosTotal><DeduccionesTotal>80</DeduccionesTotal><ComprobanteTotal>920</ComprobanteTotal></NominaIndividual>'''


def workbook(rows):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
        for row in rows:sheet+='<row>'+''.join('<c t="inlineStr"><is><t>'+escape(str(cell))+'</t></is></c>' for cell in row)+'</row>'
        z.writestr('xl/worksheets/sheet1.xml',sheet+'</sheetData></worksheet>')
    return stream.getvalue()


def history_rows():
    return [['Cuenta','Comprobante','Documento','NIT','Detalle','Tipo','Valor','Base','Centro de Costo'],
            ['519599','00008','FE100','800999888','PAPEL DE OFICINA','1','100000','0','02'],
            ['240810','00008','FE100','800999888','IVA DESCONTABLE','1','19000','100000','02'],
            ['220599','00008','FE100','800999888','PROVEEDOR','2','119000','0','02']]


class ImportTests(unittest.TestCase):
    setUp=test_facturas.InvoiceTests.setUp

    def test_mixed_nested_zip_classifies_payroll_invoice_and_preserves_originals(self):
        files=[('mixto.zip',zipped([('factura.xml',FIXTURE),('dentro.zip',zipped([('nomina.xml',PAYROLL)])),('roto.xml',b'<bad>')]))]
        result=importador.upload(self.db,files,CONFIG)
        self.assertEqual((result['nuevas'],result['nominas'],len(result['errores'])),(1,1,1))
        self.assertEqual(len(facturas.listing(self.db,CONFIG['nit'])),1)
        self.assertEqual(len(nomina.listing(self.db,CONFIG['nit'])),1)
        con=connect(self.db)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM archivos_importados').fetchone()[0],2)
        con.close()
        repeated=importador.upload(self.db,files,CONFIG)
        self.assertEqual((repeated['nuevas'],repeated['nominas'],repeated['duplicadas']),(0,0,2))
        importador.undo(self.db,CONFIG['nit'],result['id'])
        self.assertEqual(facturas.listing(self.db,CONFIG['nit']),[])
        self.assertEqual(nomina.listing(self.db,CONFIG['nit']),[])

    def test_historical_xlsx_learns_config_accounts_and_balanced_rejection(self):
        result=importador.upload(self.db,[('historico.xlsx',workbook(history_rows()))],CONFIG)
        self.assertEqual(result['errores'],[])
        cfg=importador.overview(self.db,CONFIG['nit'])['configuracion']
        self.assertEqual((cfg['proveedor'],cfg['gasto'],cfg['comprobante'],cfg['centro']),('220599','519599','00008','02'))
        self.assertEqual(facturas.learning_dashboard(self.db,CONFIG['nit'])['activos'],1)
        result2=importador.upload(self.db,[('factura.xml',FIXTURE)],cfg)
        self.assertEqual(result2['nuevas'],1)
        invoice=facturas.listing(self.db,CONFIG['nit'])[0]
        self.assertEqual(facturas.detail(self.db,invoice['id'])['cuentas'],['519599'])
        self.assertEqual(facturas.preview(self.db,invoice['id'])['filas'][-1][0],'220599')
        broken=history_rows();broken[-1][6]='118000'
        rejected=importador.upload(self.db,[('roto.xlsx',workbook(broken))],cfg)
        self.assertEqual(rejected['historicos'],0)
        self.assertTrue(rejected['errores'])
        self.assertEqual(importador.overview(self.db,CONFIG['nit'])['configuracion'],cfg)

    def test_master_blocks_unknown_accounts_and_undo_restores_company(self):
        facturas.upload(self.db,[('f.xml',FIXTURE)],CONFIG)
        invoice=facturas.listing(self.db,CONFIG['nit'])[0]
        facturas.save_accounts(self.db,invoice['id'],['519515'])
        original=facturas.preview(self.db,invoice['id']);self.assertTrue(original['apto'])
        master=workbook([['Cuenta','Nombre','Activa','Recibe'],['519515','Papel','S','S']])
        result=importador.upload(self.db,[('maestro.xlsx',master)],CONFIG)
        self.assertEqual(result['maestros'],1)
        self.assertFalse(facturas.preview(self.db,invoice['id'])['apto'])
        self.assertEqual(facturas.listing(self.db,CONFIG['nit'])[0]['revision'],'error')
        importador.undo(self.db,CONFIG['nit'],result['id'])
        self.assertTrue(facturas.preview(self.db,invoice['id'])['apto'])

    def test_token_json_reconciles_by_cufe_and_does_not_fabricate_invoice(self):
        token=[{'CUFE':'CUFE-SINTETICO-PRUEBA-100','Documento':'PRUEBA100','Fecha Emisión':'2026-09-23','NIT Emisor':'800999888','NIT Receptor':CONFIG['nit'],'Total':'119000.1190'}]
        imported=importador.upload(self.db,[('token.json',json.dumps(token).encode())],CONFIG)
        self.assertEqual(imported['resumenes'],1)
        self.assertEqual(facturas.listing(self.db,CONFIG['nit']),[])
        self.assertEqual(importador.overview(self.db,CONFIG['nit'])['tokens'][0]['estado'],'Pendiente de XML')
        facturas.upload(self.db,[('f.xml',FIXTURE)],CONFIG)
        self.assertEqual(importador.overview(self.db,CONFIG['nit'])['tokens'][0]['estado'],'Vinculado a XML')
        token[0]['NIT Receptor']='999999999'
        failed=importador.upload(self.db,[('otro.json',json.dumps(token).encode())],CONFIG)
        self.assertTrue(failed['errores'])

    def test_payroll_accounts_preview_export_and_reversal(self):
        result=importador.upload(self.db,[('nomina.xml',PAYROLL)],CONFIG)
        self.assertEqual(result['nominas'],1)
        row=nomina.listing(self.db,CONFIG['nit'])[0]
        accounts={c['clave']:'510506' if c['tipo']=='1' else '250505' if c['clave']=='Neto' else '237005' for c in row['conceptos']}
        importador.save_payroll(self.db,CONFIG['nit'],row['id'],accounts,True)
        latest=importador.operations(self.db,CONFIG['nit'])[0]
        importador.undo(self.db,CONFIG['nit'],latest['id'][3:])
        self.assertFalse(all(nomina.listing(self.db,CONFIG['nit'])[0]['cuentas'].values()))
        importador.save_payroll(self.db,CONFIG['nit'],row['id'],accounts)
        exported=nomina.export(self.db,CONFIG['nit'],[row['id']])['lotes'][0]
        self.assertEqual(exported['debitos'],exported['creditos'])
        self.assertEqual(facturas.listing(self.db,CONFIG['nit']),[])
        importador.clear_history(self.db,CONFIG['nit'])
        op=importador.operations(self.db,CONFIG['nit'])[0]
        importador.undo(self.db,CONFIG['nit'],op['id'][3:])
        con=connect(self.db);self.assertEqual(con.execute('SELECT COUNT(*) FROM lotes').fetchone()[0],1);con.close()

    def test_undo_import_refuses_later_account_changes_and_exports(self):
        result=importador.upload(self.db,[('f.xml',FIXTURE)],CONFIG)
        invoice=facturas.listing(self.db,CONFIG['nit'])[0]
        facturas.save_accounts(self.db,invoice['id'],['519515'])
        with self.assertRaises(ValueError):importador.undo(self.db,CONFIG['nit'],result['id'])
        facturas.undo_change(self.db,CONFIG['nit'])
        importador.undo(self.db,CONFIG['nit'],result['id'])
        self.assertEqual(facturas.listing(self.db,CONFIG['nit']),[])

    def test_warning_approval_expires_and_is_reversible(self):
        xml=FIXTURE.replace(b'119000.1190',b'119100.1190')
        facturas.upload(self.db,[('f.xml',xml)],CONFIG)
        invoice=facturas.listing(self.db,CONFIG['nit'])[0]
        facturas.save_accounts(self.db,invoice['id'],['519515'])
        data=facturas.detail(self.db,invoice['id']);self.assertFalse(data['aprobada'])
        with self.assertRaises(ValueError):facturas.generate(self.db,[invoice['id']],CONFIG)
        facturas.approve(self.db,CONFIG['nit'],{invoice['id']:data['firma_revision']})
        self.assertTrue(facturas.detail(self.db,invoice['id'])['aprobada'])
        facturas.undo_change(self.db,CONFIG['nit'])
        self.assertFalse(facturas.detail(self.db,invoice['id'])['aprobada'])
        facturas.approve(self.db,CONFIG['nit'],{invoice['id']:data['firma_revision']})
        facturas.save_accounts(self.db,invoice['id'],['143515'])
        self.assertFalse(facturas.detail(self.db,invoice['id'])['aprobada'])


class UniversalApiTests(unittest.TestCase):
    setUp=test_motor.ApiTests.setUp
    tearDown=test_motor.ApiTests.tearDown
    request=test_motor.ApiTests.request

    def test_universal_upload_config_payroll_and_global_undo(self):
        payload=dict(configuracion=CONFIG,archivos=[dict(nombre='n.xml',contenido=base64.b64encode(PAYROLL).decode())])
        result=json.loads(self.request('/api/importar',payload));self.assertEqual(result['nominas'],1)
        row=json.loads(self.request('/api/nominas?nit='+CONFIG['nit']))[0]
        accounts={c['clave']:'510506' if c['tipo']=='1' else '250505' for c in row['conceptos']}
        self.request('/api/nominas/cuentas',dict(nit=CONFIG['nit'],id=row['id'],cuentas=accounts))
        preview=json.loads(self.request('/api/nominas/preview',dict(nit=CONFIG['nit'],id=row['id'],cuentas=accounts)))
        self.assertEqual(len(preview['filas']),4)
        self.request('/api/cambios/deshacer',{'nit':CONFIG['nit']})
        self.assertFalse(all(json.loads(self.request('/api/nominas?nit='+CONFIG['nit']))[0]['cuentas'].values()))
        self.request('/api/cambios/deshacer',{'nit':CONFIG['nit']})
        self.assertEqual(json.loads(self.request('/api/nominas?nit='+CONFIG['nit'])),[])


if __name__=='__main__':unittest.main()
