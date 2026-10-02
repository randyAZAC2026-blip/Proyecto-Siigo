import copy
import base64
import io
import json
import unittest
from unittest.mock import patch
import zipfile
from decimal import Decimal
from xml.etree import ElementTree as ET
from urllib.error import HTTPError

import facturas
from motor import connect, ubl_root
import test_facturas
import test_motor
from test_facturas import two_lines
from test_motor import CONFIG, FIXTURE


class WorkflowTests(unittest.TestCase):
    setUp = test_facturas.InvoiceTests.setUp

    def upload(self, xml=FIXTURE, config=CONFIG):
        facturas.upload(self.db, [('test.xml', xml)], config)
        return next(d for d in facturas.listing(self.db, config['nit']) if d['documento'] == ubl_root(xml).findtext('ID'))

    def test_supplier_defaults_scope_future_imports_and_item_exceptions(self):
        original = self.upload(two_lines())
        facturas.save_supplier_account(self.db, original['id'], '519530')
        self.assertEqual(facturas.detail(self.db, original['id'])['cuentas'], ['', ''])
        new_xml = two_lines().replace(b'PRUEBA100', b'PRUEBA101').replace(b'CUFE-SINTETICO-PRUEBA-100', b'CUFE-NUEVO')
        new = self.upload(new_xml)
        self.assertEqual(facturas.detail(self.db, new['id'])['cuentas'], ['519530', '519530'])
        facturas.save_accounts(self.db, new['id'], ['519530', '143515'])
        facturas.save_supplier_account(self.db, new['id'], '519599')
        self.assertEqual(facturas.detail(self.db, new['id'])['cuentas'], ['519530', '143515'])
        other_config = {**CONFIG, 'nit':'900222333'}
        other = self.upload(new_xml.replace(b'900111222', b'900222333'), other_config)
        self.assertEqual(facturas.detail(self.db, other['id'])['cuentas'], ['', ''])
        facturas.save_supplier_account(self.db, original['id'], '')
        self.assertEqual(facturas.detail(self.db, original['id'])['cuenta_tercero'], '')
        with self.assertRaises(ValueError):
            facturas.save_supplier_account(self.db, original['id'], '12x')

    def test_preview_export_adjustments_and_undo_do_not_change_originals(self):
        invoice = self.upload()
        settings = {'cxp':'220599', 'retenciones':{'retefte':{'base':'100000.1000','tarifa':'2.5','cuenta':'236540'}}}
        preview = facturas.preview(self.db, invoice['id'], ['519515'], settings)
        self.assertTrue(preview['apto'])
        self.assertEqual(preview['debitos'], preview['creditos'])
        self.assertEqual(preview['filas'][-1][0], '220599')
        self.assertEqual(facturas.detail(self.db, invoice['id'])['cuentas'], [''])
        facturas.save_accounts(self.db, invoice['id'], ['519515'])
        base = facturas.generate(self.db, [invoice['id']], CONFIG)['lotes'][0]
        facturas.save_accounts(self.db, invoice['id'], ['519515'], settings)
        generated = facturas.generate(self.db, [invoice['id']], CONFIG)['lotes'][0]
        self.assertEqual(generated['aceptados'], 1)
        self.assertEqual(generated['reprocesa'], base['id'])
        self.assertEqual(generated['documentos'][0]['asiento'], preview['filas'])
        history = facturas.change_history(self.db, CONFIG['nit'])
        with self.assertRaises(ValueError):
            facturas.undo_change(self.db, CONFIG['nit'], history[-1]['id'])
        undone = facturas.undo_change(self.db, CONFIG['nit'])
        self.assertEqual(undone['ajustes'], {})
        self.assertEqual(undone['estado'], 'lista')
        con = connect(self.db)
        self.assertEqual(con.execute('SELECT contenido FROM facturas').fetchone()[0], FIXTURE)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM lotes').fetchone()[0], 2)
        con.close()

    def test_save_rejects_stale_snapshot_and_undo_is_company_scoped(self):
        invoice = self.upload()
        prior = {'cuentas':[''], 'ajustes':{}}
        facturas.save_accounts(self.db, invoice['id'], ['519515'], expected=prior)
        with self.assertRaisesRegex(ValueError, 'otra ventana'):
            facturas.save_accounts(self.db, invoice['id'], ['143515'], expected=prior)
        with self.assertRaises(ValueError):
            facturas.undo_change(self.db, '900000000')
        self.assertEqual(facturas.detail(self.db, invoice['id'])['cuentas'], ['519515'])
        self.assertEqual(facturas.undo_change(self.db, CONFIG['nit'])['cuentas'], [''])
        with self.assertRaises(ValueError):
            facturas.undo_change(self.db, CONFIG['nit'])

    def test_invalid_preview_cannot_fabricate_balanced_rows(self):
        invoice = self.upload()
        self.assertFalse(facturas.preview(self.db, invoice['id'])['apto'])
        with self.assertRaises(ValueError):
            facturas.preview(self.db, invoice['id'], ['519515'], {'cxp':'xx'})
        for rate in ('-1','101','NaN'):
            with self.assertRaises(ValueError):
                facturas.preview(self.db, invoice['id'], ['519515'], {'retenciones':{'retefte':{'base':'100','tarifa':rate,'cuenta':'236540'}}})
        result = facturas.preview(self.db, invoice['id'], ['519515'], {'retenciones':{'retefte':{'base':'1000000','tarifa':'100','cuenta':'236540'}}})
        self.assertFalse(result['apto'])
        self.assertEqual(result['filas'], [])
        with self.assertRaises(ValueError):
            facturas.save_accounts(self.db, invoice['id'], ['519515'], {'retenciones':{'retefte':{'base':'1000000','tarifa':'100','cuenta':'236540'}}})
        self.assertEqual(facturas.detail(self.db, invoice['id'])['cuentas'], [''])

    def test_predictor_uses_saved_accounts_corrections_and_company_only(self):
        first = self.upload()
        second = self.upload(FIXTURE.replace(b'PRUEBA100',b'PRUEBA101').replace(b'CUFE-SINTETICO-PRUEBA-100',b'CUFE-101'))
        self.assertEqual(facturas.suggestions(self.db, second['id']), [None])
        facturas.save_accounts(self.db, first['id'], ['519515'])
        prediction = facturas.suggestions(self.db, second['id'])[0]
        self.assertEqual((prediction['cuenta'], prediction['confianza']), ('519515',100))
        facturas.save_accounts(self.db, first['id'], ['143515'])
        self.assertEqual(facturas.suggestions(self.db, second['id'])[0]['cuenta'], '143515')
        other = self.upload(FIXTURE.replace(b'900111222',b'900222333'), {**CONFIG,'nit':'900222333'})
        self.assertEqual(facturas.suggestions(self.db, other['id']), [None])
        facturas.undo_change(self.db, CONFIG['nit'])
        self.assertEqual(facturas.suggestions(self.db, second['id'])[0]['cuenta'], '519515')

    def test_tabular_mixed_rates_uses_header_once_and_exports_real_xlsx(self):
        root = ubl_root(two_lines())
        header = root.find('TaxTotal')
        sub = header.find('TaxSubtotal')
        sub.find('TaxableAmount').text = '100000.1000'
        sub.find('TaxAmount').text = '19000.0190'
        five = copy.deepcopy(sub)
        five.find('TaxCategory/Percent').text = '5'
        five.find('TaxAmount').text = '5000.0050'
        header.append(five)
        header.find('TaxAmount').text = '24000.0240'
        line = root.findall('InvoiceLine')[1]
        line.find('TaxTotal/TaxAmount').text = '5000.0050'
        line.find('TaxTotal/TaxSubtotal/TaxAmount').text = '5000.0050'
        line.find('TaxTotal/TaxSubtotal/TaxCategory/Percent').text = '5'
        root.find('LegalMonetaryTotal/PayableAmount').text = '224000.2240'
        invoice = self.upload(ET.tostring(root))
        facturas.save_accounts(self.db, invoice['id'], ['519515','519515'])
        rows = facturas.tabular(self.db, CONFIG['nit'])
        self.assertEqual(Decimal(rows[0]['iva5']), Decimal('5000.0050'))
        self.assertEqual(Decimal(rows[0]['iva19']), Decimal('19000.0190'))
        self.assertEqual(Decimal(rows[0]['iva_total']), Decimal('24000.0240'))
        with zipfile.ZipFile(io.BytesIO(facturas.tabular_xlsx(rows))) as archive:
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            self.assertEqual(len(sheet.find('{*}sheetData')), 2)
            self.assertIn(b'5000.0050', archive.read('xl/worksheets/sheet1.xml'))

    def test_batch_preview_equals_export_is_read_only_and_scoped(self):
        first = self.upload()
        second = self.upload(FIXTURE.replace(b'PRUEBA100', b'PRUEBA101').replace(b'CUFE-SINTETICO-PRUEBA-100', b'CUFE-LOTE-101'))
        facturas.save_accounts(self.db, first['id'], ['519515'])
        facturas.save_accounts(self.db, second['id'], ['143515'], {'cxp':'220599'})
        ids = [first['id'], second['id']]
        preview = facturas.preview_batch(self.db, CONFIG['nit'], ids+[ids[0]])
        self.assertTrue(preview['apto'])
        self.assertEqual(preview['facturas'], 2)
        self.assertEqual(preview['debitos'], preview['creditos'])
        con = connect(self.db)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM lotes').fetchone()[0], 0)
        con.close()
        batch = facturas.generate(self.db, ids, CONFIG)['lotes'][0]
        self.assertEqual(preview['filas'], [r for doc in batch['documentos'] for r in doc['asiento']])
        already = facturas.preview_batch(self.db, CONFIG['nit'], ids)
        self.assertFalse(already['apto'])
        self.assertEqual(len(already['errores']), 2)
        other = self.upload(FIXTURE.replace(b'900111222', b'900222333'), {**CONFIG,'nit':'900222333'})
        with self.assertRaisesRegex(ValueError, 'esta empresa'):
            facturas.preview_batch(self.db, CONFIG['nit'], [other['id']])

    def test_batch_preview_partial_pending_empty_limit_and_effective_rate(self):
        first = self.upload()
        second = self.upload(FIXTURE.replace(b'PRUEBA100', b'PRUEBA101').replace(b'CUFE-SINTETICO-PRUEBA-100', b'CUFE-PEND-101'))
        facturas.save_accounts(self.db, first['id'], ['519515'], {'retenciones':{'retefte':{'base':'100000.1000','tarifa':'2.5','cuenta':'236540'}}})
        preview = facturas.preview_batch(self.db, CONFIG['nit'], [first['id'],second['id']])
        self.assertFalse(preview['apto'])
        self.assertEqual(preview['facturas'], 1)
        self.assertEqual(preview['errores'][0]['id'], second['id'])
        empty = facturas.preview_batch(self.db, CONFIG['nit'], [])
        self.assertFalse(empty['apto'])
        self.assertEqual(empty['filas'], [])
        with self.assertRaises(ValueError):
            facturas.preview_batch(self.db, CONFIG['nit'], [first['id']]*201)
        table = facturas.tabular(self.db, CONFIG['nit'])
        row = next(r for r in table if r['id']==first['id'])
        self.assertEqual(Decimal(row['retefte_tarifa']), Decimal('2.5'))

    def test_edit_after_export_keeps_invoice_pending_new_version(self):
        invoice = self.upload()
        facturas.save_accounts(self.db, invoice['id'], ['519515'], {'cxp':'220599'})
        original_process = facturas.process
        def interleaved_process(*args, **kwargs):
            result = original_process(*args, **kwargs)
            facturas.save_accounts(self.db, invoice['id'], ['519515'], {'cxp':'220588'})
            return result
        with patch.object(facturas, 'process', side_effect=interleaved_process):
            batch = facturas.generate(self.db, [invoice['id']], CONFIG)['lotes'][0]
        self.assertEqual(batch['documentos'][0]['ajustes']['cxp'], '220599')
        current = facturas.detail(self.db, invoice['id'])
        self.assertEqual(current['ajustes']['cxp'], '220588')
        self.assertEqual(current['estado'], 'lista')

    def test_supplier_history_undo_across_invoices_preserves_item_accounts(self):
        first = self.upload()
        facturas.save_supplier_account(self.db, first['id'], '519530', expected='')
        initial_change = facturas.change_history(self.db, CONFIG['nit'])[0]
        self.assertEqual(initial_change['tipo'], 'tercero')
        second = self.upload(FIXTURE.replace(b'PRUEBA100', b'PRUEBA101').replace(b'CUFE-SINTETICO-PRUEBA-100', b'CUFE-TERCERO-101'))
        self.assertEqual(facturas.detail(self.db, second['id'])['cuentas'], ['519530'])
        facturas.save_supplier_account(self.db, second['id'], '143515', expected='519530')
        with self.assertRaisesRegex(ValueError, 'posteriores'):
            facturas.undo_change(self.db, CONFIG['nit'], initial_change['id'])
        with self.assertRaisesRegex(ValueError, 'otra ventana'):
            facturas.save_supplier_account(self.db, first['id'], '519515', expected='519530')
        facturas.undo_change(self.db, CONFIG['nit'])
        self.assertEqual(facturas.detail(self.db, first['id'])['cuenta_tercero'], '519530')
        facturas.save_accounts(self.db, first['id'], ['519515'])
        # Un cambio de ítem posterior no bloquea revertir la regla del tercero.
        facturas.undo_change(self.db, CONFIG['nit'], initial_change['id'])
        self.assertEqual(facturas.detail(self.db, first['id'])['cuenta_tercero'], '')
        self.assertEqual(facturas.detail(self.db, first['id'])['cuentas'], ['519515'])
        self.assertEqual(facturas.detail(self.db, second['id'])['cuentas'], ['519530'])

    def test_learning_dashboard_exclusion_restore_undo_and_company_isolation(self):
        source = self.upload()
        target = self.upload(FIXTURE.replace(b'PRUEBA100', b'PRUEBA101').replace(b'CUFE-SINTETICO-PRUEBA-100', b'CUFE-APRENDER-101'))
        facturas.save_accounts(self.db, source['id'], ['519515'])
        dashboard = facturas.learning_dashboard(self.db, CONFIG['nit'])
        self.assertEqual((dashboard['activos'],dashboard['excluidos']), (1,0))
        self.assertEqual(dashboard['ejemplos'][0]['cuenta'], '519515')
        self.assertTrue(any(t['token']=='papel' for t in dashboard['tokens']))
        self.assertEqual(facturas.learning_dashboard(self.db, CONFIG['nit'], 'SIN-COINCIDENCIA')['coincidencias'], 0)
        self.assertEqual(facturas.learning_dashboard(self.db, '900000000')['activos'], 0)
        with self.assertRaises(ValueError):
            facturas.set_learning_exclusion(self.db, '900000000', source['id'], 0, True)
        facturas.set_learning_exclusion(self.db, CONFIG['nit'], source['id'], 0, True, expected=False)
        self.assertEqual(facturas.suggestions(self.db, target['id']), [None])
        self.assertEqual(facturas.detail(self.db, source['id'])['cuentas'], ['519515'])
        dashboard = facturas.learning_dashboard(self.db, CONFIG['nit'])
        self.assertEqual((dashboard['activos'],dashboard['excluidos'],dashboard['tokens']), (0,1,[]))
        with self.assertRaises(ValueError):
            facturas.set_learning_exclusion(self.db, CONFIG['nit'], source['id'], 0, False, expected=False)
        exclusion = facturas.change_history(self.db, CONFIG['nit'])[0]
        self.assertEqual(exclusion['tipo'], 'aprendizaje')
        facturas.undo_change(self.db, CONFIG['nit'], exclusion['id'])
        self.assertEqual(facturas.suggestions(self.db, target['id'])[0]['cuenta'], '519515')
        facturas.set_learning_exclusion(self.db, CONFIG['nit'], source['id'], 0, True)
        facturas.set_learning_exclusion(self.db, CONFIG['nit'], source['id'], 0, False)
        self.assertEqual(facturas.learning_dashboard(self.db, CONFIG['nit'])['excluidos'], 0)
        facturas.undo_change(self.db, CONFIG['nit'])
        self.assertEqual(facturas.learning_dashboard(self.db, CONFIG['nit'])['excluidos'], 1)


class WorkflowApiTests(unittest.TestCase):
    setUp = test_motor.ApiTests.setUp
    tearDown = test_motor.ApiTests.tearDown
    request = test_motor.ApiTests.request

    def test_preview_history_supplier_and_xlsx_routes(self):
        self.request('/api/facturas/importar', dict(configuracion=CONFIG, archivos=[dict(nombre='f.xml', contenido=base64.b64encode(FIXTURE).decode())]))
        invoice = json.loads(self.request('/api/facturas?nit='+CONFIG['nit']))[0]
        path = '/api/facturas/'+invoice['id']
        default = json.loads(self.request(path+'/cuenta-tercero', {'cuenta':'519530'}))
        self.assertEqual(default['cuenta'], '519530')
        self.assertEqual(json.loads(self.request(path+'/sugerencias')), [None])
        preview = json.loads(self.request(path+'/preview', {'cuentas':['519530'],'ajustes':{'cxp':'220599'}}))
        self.assertTrue(preview['apto'])
        self.request(path+'/cuentas', {'cuentas':['519530'],'ajustes':{'cxp':'220599'},'anterior':{'cuentas':[''],'ajustes':{}}})
        batch_preview = json.loads(self.request('/api/facturas/preview-lote', {'nit':CONFIG['nit'],'ids':[invoice['id']]}))
        self.assertEqual(batch_preview['filas'], preview['filas'])
        changes = json.loads(self.request('/api/cambios?nit='+CONFIG['nit']))
        self.assertEqual(len(changes), 2)
        self.assertEqual(changes[1]['tipo'], 'tercero')
        table = json.loads(self.request('/api/revision-tabular?nit='+CONFIG['nit']))
        self.assertEqual(table[0]['factura'], invoice['documento'])
        exported = self.request('/api/revision-tabular/xlsx', {'nit':CONFIG['nit'],'ids':[invoice['id']]})
        self.assertTrue(zipfile.is_zipfile(io.BytesIO(exported)))
        with self.assertRaises(HTTPError) as rejected:
            self.request('/api/cambios/deshacer', {'nit':'900222333','id':changes[0]['id']})
        self.assertEqual(rejected.exception.code, 400)
        restored = json.loads(self.request('/api/cambios/deshacer', {'nit':CONFIG['nit'],'id':changes[0]['id']}))
        self.assertEqual(restored['cuentas'], [''])

    def test_learning_routes_and_reversible_exclusion(self):
        self.request('/api/facturas/importar', dict(configuracion=CONFIG, archivos=[dict(nombre='f.xml', contenido=base64.b64encode(FIXTURE).decode())]))
        invoice = json.loads(self.request('/api/facturas?nit='+CONFIG['nit']))[0]
        self.request('/api/facturas/'+invoice['id']+'/cuentas', {'cuentas':['519530']})
        panel = json.loads(self.request('/api/aprendizaje?nit='+CONFIG['nit']+'&q=PAPEL&pagina=0'))
        self.assertEqual(panel['activos'], 1)
        payload = dict(nit=CONFIG['nit'], factura=invoice['id'], item=0, excluido=True, anterior=False)
        changed = json.loads(self.request('/api/aprendizaje/exclusion', payload))
        self.assertTrue(changed['excluido'])
        with self.assertRaises(HTTPError) as error:
            self.request('/api/aprendizaje/exclusion', {**payload, 'nit':'999999999'})
        self.assertEqual(error.exception.code, 400)
        self.request('/api/cambios/deshacer', {'nit':CONFIG['nit']})
        self.assertEqual(json.loads(self.request('/api/aprendizaje?nit='+CONFIG['nit']))['excluidos'], 0)


if __name__ == '__main__':
    unittest.main()
