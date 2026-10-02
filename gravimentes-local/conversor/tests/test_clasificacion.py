import base64
import json
import sqlite3
import unittest
import uuid
from xml.etree import ElementTree as ET

import clasificacion
import facturas
import importador
import test_facturas
import test_motor
from motor import connect, fiscal_parties, nit, nit_check_digit, ubl_root
from test_motor import CONFIG, FIXTURE, support_xml


def emitted(missing_receiver=False, support=False, missing_name=False):
    root=ubl_root(support_xml(True) if support else FIXTURE)
    if not support:
        root.find('AccountingSupplierParty/Party/PartyTaxScheme/CompanyID').text=CONFIG['nit']
        root.find('AccountingCustomerParty/Party/PartyTaxScheme/CompanyID').text='800999888'
    if missing_receiver:
        root.find('AccountingCustomerParty/Party/PartyTaxScheme/CompanyID').text=''
    if missing_name:
        root.find('AccountingCustomerParty/Party/PartyTaxScheme/RegistrationName').text=''
    return ET.tostring(root)


class ClassificationTests(unittest.TestCase):
    setUp=test_facturas.InvoiceTests.setUp

    def upload(self, content=FIXTURE):
        result=facturas.upload(self.db,[('factura.xml',content)],CONFIG)
        self.assertEqual(result['errores'],[])
        return facturas.listing(self.db,CONFIG['nit'])[0]['id']

    def original_data(self, identity):
        con=connect(self.db)
        try:return json.loads(con.execute('SELECT datos FROM facturas WHERE id=?',(identity,)).fetchone()[0])
        finally:con.close()

    def change_data(self, identity, **values):
        data=self.original_data(identity);data.update(values)
        con=connect(self.db)
        with con:con.execute('UPDATE facturas SET datos=? WHERE id=?',(json.dumps(data),identity))
        con.close();return data

    def profile(self, identifier='800999888'):
        con=connect(self.db)
        try:
            row=con.execute('SELECT datos FROM terceros_locales WHERE nit_empresa=? AND nit=?',(CONFIG['nit'],identifier)).fetchone()
            return json.loads(row['datos']) if row else None
        finally:con.close()

    def test_nit_canonical_explicit_and_verified_dv_without_truncating_identity(self):
        base='800999888';dv=nit_check_digit(base)
        self.assertEqual(nit(' 800.999.888-'+dv+'\u200b'),base)
        self.assertEqual(nit(base+'—'+dv),base)
        self.assertEqual(nit(base+dv,dv,'31'),base)
        self.assertEqual(nit(base+dv,None,'31'),base)
        self.assertEqual(nit(base+dv),base+dv)
        self.assertEqual(nit(base+dv,dv,'13'),base+dv)
        self.assertEqual(nit(base,dv,'31'),base)
        self.assertEqual(nit(None),'')
        root=ubl_root(FIXTURE)
        node=root.find('AccountingSupplierParty/Party/PartyTaxScheme/CompanyID')
        node.text=base+dv;node.set('schemeID',dv);node.set('schemeName','31')
        self.assertEqual(fiscal_parties(root,CONFIG['nit'])['contraparte']['nit'],base)

    def test_sale_counterparty_is_receiver_and_missing_receiver_is_not_self(self):
        parties=fiscal_parties(ubl_root(emitted()),CONFIG['nit'])
        self.assertEqual((parties['tipo_operacion'],parties['trat'],parties['contraparte']['nit']),('venta','ingreso','800999888'))
        missing=fiscal_parties(ubl_root(emitted(True)),CONFIG['nit'])
        self.assertEqual(missing['contraparte']['nit'],'')
        self.assertTrue(missing['esCli']);self.assertFalse(missing['esProv'])
        identity=self.upload(emitted(True))
        self.change_data(identity,nit_proveedor='700123456',proveedor='Cliente previo')
        result=clasificacion.reclassify(self.db,CONFIG['nit'],[identity])
        data=self.original_data(identity)
        self.assertEqual(data['nit_proveedor'],'700123456')
        self.assertTrue(data['tercero_conservado'])
        self.assertEqual(len(result['diagnostico']['incidencias']),1)
        self.assertIsNone(self.profile(CONFIG['nit']))

    def test_purchase_resets_income_treatment_and_undo_removes_new_third(self):
        identity=self.upload()
        before=self.change_data(identity,tipo='venta',tipo_operacion='venta',trat='ingreso')
        con=connect(self.db);source=con.execute('SELECT contenido FROM facturas WHERE id=?',(identity,)).fetchone()[0];con.close()
        result=clasificacion.reclassify(self.db,CONFIG['nit'],[identity])
        data=self.original_data(identity)
        self.assertEqual((data['tipo'],data['tipo_operacion'],data['trat']),('compra','compra','gasto'))
        self.assertTrue(data['revisar_cuentas_por_cambio_tipo'])
        profile=self.profile()
        self.assertEqual((profile['esProv'],profile['esCli']),(True,False))
        self.assertEqual(uuid.UUID(profile['id']).version,4)
        self.assertEqual(result['diagnostico']['por_fuente'],{'nit_receptor':1})
        self.assertEqual(result['diagnostico']['nuevosTercerosIds'],[profile['id']])
        self.assertIsNotNone(result['id'])
        importador.undo(self.db,CONFIG['nit'],result['id'])
        self.assertEqual(self.original_data(identity),before)
        self.assertIsNone(self.profile())
        con=connect(self.db)
        self.assertEqual(con.execute('SELECT contenido FROM facturas WHERE id=?',(identity,)).fetchone()[0],source)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM terceros_outbox').fetchone()[0],0)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM terceros_historial').fetchone()[0],2)
        con.close()

    def test_support_issued_uses_provider_label_and_restores_previous_flags(self):
        identity=self.upload(emitted(support=True,missing_name=True))
        old={'nit':'800999888','nombre':'Cliente','esCli':True,'esProv':False,'simple':True,'id':'tercero-existente'}
        con=connect(self.db)
        with con:con.execute('INSERT INTO terceros_locales VALUES (?,?,?,?)',(CONFIG['nit'],'800999888',json.dumps(old),'2026-01-01'))
        con.close()
        result=clasificacion.reclassify(self.db,CONFIG['nit'],[identity])
        third=self.profile();data=self.original_data(identity)
        self.assertEqual(data['trat'],'gasto')
        self.assertEqual(third['nombre'],'Proveedor 800999888')
        self.assertTrue(third['esProv']);self.assertFalse(third['esCli']);self.assertTrue(third['simple'])
        self.assertEqual(result['diagnostico']['por_fuente'],{'codigo_dian':1})
        importador.undo(self.db,CONFIG['nit'],result['id'])
        self.assertEqual(self.profile(),old)

    def test_existing_nit_aliases_merge_reversibly_and_conflicting_accounts_abort(self):
        identity=self.upload();alias='800.999.888-'+nit_check_digit('800999888')
        con=connect(self.db)
        with con:
            con.execute('INSERT INTO terceros_locales VALUES (?,?,?,?)',(CONFIG['nit'],alias,json.dumps({'nit':alias,'nombre':'Proveedor previo','esCli':True}),'2026-01-01'))
            con.execute('INSERT INTO tercero_cuentas VALUES (?,?,?)',(CONFIG['nit'],alias,'519530'))
            con.execute('INSERT INTO tercero_cuentas VALUES (?,?,?)',(CONFIG['nit'],'800999888','143515'))
        con.close()
        original=self.original_data(identity)
        with self.assertRaisesRegex(ValueError,'cuentas distintas'):
            clasificacion.reclassify(self.db,CONFIG['nit'],[identity])
        self.assertEqual(self.original_data(identity),original)
        con=connect(self.db)
        with con:con.execute('UPDATE tercero_cuentas SET cuenta=? WHERE nit_empresa=?',('519530',CONFIG['nit']))
        con.close()
        result=clasificacion.reclassify(self.db,CONFIG['nit'],[identity])
        self.assertIsNotNone(self.profile());self.assertIsNone(self.profile(alias))
        importador.undo(self.db,CONFIG['nit'],result['id'])
        self.assertIsNone(self.profile());self.assertIsNotNone(self.profile(alias))

    def test_failed_write_rolls_back_invoice_profiles_and_operation(self):
        identity=self.upload();before=self.change_data(identity,trat='ingreso')
        con=connect(self.db)
        con.execute("CREATE TRIGGER fallo_guardado BEFORE INSERT ON terceros_locales BEGIN SELECT RAISE(ABORT,'fallo simulado'); END")
        con.close()
        with self.assertRaises(sqlite3.IntegrityError):clasificacion.reclassify(self.db,CONFIG['nit'],[identity])
        self.assertEqual(self.original_data(identity),before)
        self.assertIsNone(self.profile())
        con=connect(self.db);self.assertEqual(con.execute('SELECT COUNT(*) FROM operaciones_locales').fetchone()[0],0);con.close()

    def test_undo_refuses_later_changes_or_new_references_and_company_isolation(self):
        identity=self.upload();result=clasificacion.reclassify(self.db,CONFIG['nit'],[identity])
        with self.assertRaises(ValueError):importador.undo(self.db,'900222333',result['id'])
        with self.assertRaises(ValueError):clasificacion.reclassify(self.db,'900222333',[identity])
        facturas.save_accounts(self.db,identity,['519515'])
        with self.assertRaisesRegex(ValueError,'factura cambió'):importador.undo(self.db,CONFIG['nit'],result['id'])
        facturas.undo_change(self.db,CONFIG['nit'])
        second=FIXTURE.replace(b'PRUEBA100',b'PRUEBA101').replace(b'CUFE-SINTETICO-PRUEBA-100',b'CUFE-CLAS-101')
        facturas.upload(self.db,[('otra.xml',second)],CONFIG)
        with self.assertRaisesRegex(ValueError,'relaciones posteriores'):importador.undo(self.db,CONFIG['nit'],result['id'])
        self.assertIsNotNone(self.profile())

    def test_repeat_is_idempotent_and_a_third_can_have_both_roles(self):
        purchase=self.upload()
        sale=emitted().replace(b'PRUEBA100',b'VENTA200').replace(b'CUFE-SINTETICO-PRUEBA-100',b'CUFE-VENTA-200')
        facturas.upload(self.db,[('venta.xml',sale)],CONFIG)
        ids=[r['id'] for r in facturas.listing(self.db,CONFIG['nit'])]
        first=clasificacion.reclassify(self.db,CONFIG['nit'],ids)
        self.assertEqual(first['diagnostico']['por_fuente'],{'nit_receptor':1,'nit_emisor':1})
        self.assertTrue(self.profile()['esCli']);self.assertTrue(self.profile()['esProv'])
        second=clasificacion.reclassify(self.db,CONFIG['nit'],ids)
        self.assertIsNone(second['id']);self.assertEqual(second['actualizadas'],0)


class ClassificationApiTests(unittest.TestCase):
    setUp=test_motor.ApiTests.setUp
    tearDown=test_motor.ApiTests.tearDown
    request=test_motor.ApiTests.request

    def test_reclassification_and_undo_on_cmd_api(self):
        self.request('/api/facturas/importar',dict(configuracion=CONFIG,archivos=[dict(nombre='f.xml',contenido=base64.b64encode(FIXTURE).decode())]))
        identity=json.loads(self.request('/api/facturas?nit='+CONFIG['nit']))[0]['id']
        original=json.loads(self.request('/api/facturas/'+identity))
        result=json.loads(self.request('/api/facturas/reclasificar',dict(nit=CONFIG['nit'],ids=[identity])))
        self.assertEqual(result['diagnostico']['por_fuente'],{'nit_receptor':1})
        self.assertEqual(json.loads(self.request('/api/facturas/'+identity))['trat'],'gasto')
        self.request('/api/cambios/deshacer',{'nit':CONFIG['nit'],'id':'op:'+result['id']})
        self.assertEqual(json.loads(self.request('/api/facturas/'+identity))['clasificacion'],original['clasificacion'])


if __name__=='__main__':unittest.main()
