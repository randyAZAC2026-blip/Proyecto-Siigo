"""Bandeja de facturas únicas y asignación contable por ítem."""
import hashlib
import io
import json
import re
import uuid
import zipfile
import math
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from motor import amount, config_validated, connect, document, fiscal_parties, process, sources, text, ubl_root, validate_adjustments


def describe(content, config):
    root = ubl_root(content)
    if root.tag not in ('Invoice', 'CreditNote', 'DebitNote'):
        raise ValueError('El archivo no es una factura o nota UBL.')
    cufe, number = text(root, 'UUID'), text(root, 'ID')
    if not cufe or not number:
        raise ValueError('Documento sin número o CUFE/CUDE.')
    parties = fiscal_parties(root, config['nit'])
    for key, tag in (('supplier', 'AccountingSupplierParty'), ('customer', 'AccountingCustomerParty')):
        party = root.find(tag+'/Party')
        address = party.find('PhysicalLocation/Address') if party is not None else None
        if address is None and party is not None:
            address = party.find('PostalAddress')
        parties[key].update(direccion=text(address, 'AddressLine/Line') or text(address, 'StreetName'),
                            ciudad=text(address, 'CityName'), departamento=text(address, 'CountrySubentity'),
                            pais=text(address, 'Country/Name'), telefono=text(party, 'Contact/Telephone'),
                            email=text(party, 'Contact/ElectronicMail'), responsabilidad=text(party, 'PartyTaxScheme/TaxLevelCode'))
    total = root.find('LegalMonetaryTotal')
    if total is None:
        total = root.find('RequestedMonetaryTotal')
    items = []
    for line in root.findall({'Invoice':'InvoiceLine', 'CreditNote':'CreditNoteLine', 'DebitNote':'DebitNoteLine'}[root.tag]):
        quantity = text(line, 'InvoicedQuantity') or text(line, 'CreditedQuantity') or text(line, 'DebitedQuantity')
        taxes = [dict(codigo=text(s, 'TaxCategory/TaxScheme/ID'), nombre=tax_name(s),
                      tarifa=text(s, 'TaxCategory/Percent'), valor=str(amount(s, 'TaxAmount')))
                 for s in line.findall('TaxTotal/TaxSubtotal')]
        items.append(dict(descripcion=text(line, 'Item/Description') or text(line, 'Item/Name') or 'Compra',
                          codigo=text(line, 'Item/SellersItemIdentification/ID'), cantidad=quantity,
                          precio=text(line, 'Price/PriceAmount'), valor=str(amount(line, 'LineExtensionAmount', True)),
                          impuestos=taxes, descuento=str(sum((amount(a, 'Amount') for a in line.findall('AllowanceCharge')
                                                             if text(a, 'ChargeIndicator') == 'false'), Decimal(0)))))
    errors, warnings = [], []
    try:
        checked = document(content, config)
        warnings = checked['advertencias']
    except (ValueError, TypeError) as e:
        errors.append(str(e))
    return dict(cufe=cufe, documento=number, proveedor=parties['contraparte']['nombre'],
                nit_proveedor=parties['contraparte']['nit'], clasificacion=parties,
                tipo_operacion=parties['tipo_operacion'],trat=parties['trat'],
                fecha=text(root, 'IssueDate'), vencimiento=text(root, 'DueDate') or text(root, 'PaymentMeans/PaymentDueDate'),
                moneda=text(root, 'DocumentCurrencyCode'), total=str(amount(total, 'PayableAmount')),
                totales={n.tag: (n.text or '').strip() for n in total} if total is not None else {},
                pago=text(root, 'PaymentMeans/PaymentMeansCode'), forma_pago=text(root, 'PaymentMeans/ID'),
                orden=text(root, 'OrderReference/ID'), referencia=text(root, 'BillingReference/InvoiceDocumentReference/ID'),
                impuestos=[dict(nombre=tax_name(s), tarifa=text(s, 'TaxCategory/Percent'), valor=str(amount(s, 'TaxAmount')))
                           for s in root.findall('TaxTotal/TaxSubtotal')],
                retenciones=[dict(nombre=tax_name(s), tarifa=text(s, 'TaxCategory/Percent'), valor=str(amount(s, 'TaxAmount'))) for s in root.findall('WithholdingTaxTotal/TaxSubtotal')],
                notas=[n.text or '' for n in root.findall('Note')],
                items=items, errores=errors, advertencias=warnings)


def tax_name(subtotal):
    code = text(subtotal, 'TaxCategory/TaxScheme/ID')
    return text(subtotal, 'TaxCategory/TaxScheme/Name') or {'01':'IVA', '02':'IC', '03':'ICA', '04':'INC',
            '05':'ReteIVA', '06':'Retefuente', '07':'ReteICA'}.get(code, code)


def ingest(con, files, config, previous=None):
    result = dict(nuevas=0, duplicadas=0, errores=[])
    hashes = set()
    for name, content, error in sources(files):
        try:
            if error:
                raise ValueError(error)
            digest = hashlib.sha256(content).hexdigest()
            if digest in hashes or con.execute('SELECT 1 FROM facturas WHERE nit=? AND hash=?', (config['nit'], digest)).fetchone():
                result['duplicadas'] += 1
                continue
            hashes.add(digest)
            data = describe(content, config)
            prior = con.execute('SELECT datos,contenido FROM facturas WHERE nit=? AND cufe=?', (config['nit'], data['cufe'])).fetchone()
            if prior:
                # Los metadatos derivados pueden pertenecer a una versión anterior del parser.
                if describe(prior['contenido'],config) != data:
                    raise ValueError(f'{data["documento"]}: mismo CUFE con contenido diferente; se conserva la factura existente.')
                result['duplicadas'] += 1
                continue
            supplier_account = con.execute('SELECT cuenta FROM tercero_cuentas WHERE nit_empresa=? AND nit_tercero=?',
                                           (config['nit'], data['nit_proveedor'])).fetchone()
            accounts = [supplier_account['cuenta'] if supplier_account else ''] * len(data['items'])
            if not supplier_account and not data['errores']:
                examples=[(set(e['tokens']),e['cuenta']) for e in learning_examples(con,config['nit']) if not e['excluido']]
                predicted=predict_items(data['items'],examples)
                accounts=[p['cuenta'] if p and p['automatica'] else '' for p in predicted]
            old = (previous or {}).get(data['cufe'])
            if old and len(old.get('lineas', [])) == len(accounts):
                accounts = [line['cuenta'] for line in old['lineas']]
            encoded = json.dumps(accounts)
            con.execute('INSERT INTO facturas VALUES (?,?,?,?,?,?,?,?)',
                        (uuid.uuid4().hex, config['nit'], data['cufe'], digest, content, json.dumps(data), encoded, encoded if old else ''))
            result['nuevas'] += 1
        except (ValueError, TypeError) as e:
            result['errores'].append(str(e))
    return result


def upload(db, files, config):
    config = config_validated(config)
    con = connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            result = ingest(con, files, config)
            con.execute('INSERT OR REPLACE INTO empresas VALUES (?,?)', (config['nit'], json.dumps(config)))
        return result
    finally:
        con.close()


def migrate(con, company):
    # Incorporar las fuentes históricas una sola vez sin duplicar CUFE.
    rows = con.execute('SELECT id,informe,paquete FROM lotes WHERE nit=? AND id NOT IN (SELECT lote FROM facturas_migradas) ORDER BY fecha DESC', (company,)).fetchall()
    for row in rows:
        report = json.loads(row['informe'])
        if report.get('tipo') == 'nomina':
            con.execute('INSERT OR IGNORE INTO facturas_migradas VALUES (?)',(row['id'],))
            continue
        previous = {d['cufe']: d for d in report['documentos'] if d.get('estado') == 'convertido'}
        with zipfile.ZipFile(io.BytesIO(row['paquete'])) as archive:
            files = [(n, archive.read(n)) for n in archive.namelist() if n.startswith('fuentes/')]
        ingest(con, files, report['configuracion'], previous)
        con.execute('INSERT INTO facturas_migradas VALUES (?)', (row['id'],))


def presented(row):
    data = json.loads(row['datos'])
    cuentas_raw = row['cuentas'] or '[]'
    accounts = json.loads(cuentas_raw)
    adjustments = json.loads(row['ajustes'])
    try:
        checked=document(row['contenido'],json.loads(row['config']),{row['cufe']:accounts} if accounts and all(accounts) else None,adjustments)
        data['errores']=[];data['advertencias']=checked['advertencias']
    except (ValueError,TypeError) as error:
        data['errores']=[str(error)]
    if data.get('revisar_cuentas_por_cambio_tipo'):
        data['advertencias']=list(data.get('advertencias',[]))+['La clasificación cambió. Revisa las cuentas asignadas antes de aprobar el documento.']
    same_config=json.loads(row['config_exportada'] or '{}')==json.loads(row['config'])
    status = 'error' if data['errores'] else 'pendiente' if not accounts or not all(accounts) else 'generada' if row['lote'] and row['cuentas'] == row['exportadas'] and row['ajustes'] == row['ajustes_exportados'] and same_config else 'lista'
    signature=hashlib.sha256(json.dumps([row['cufe'],accounts,adjustments,json.loads(row['config']),data.get('advertencias',[])],sort_keys=True).encode()).hexdigest()
    approved=status in ('lista','generada') and (not data.get('advertencias') or row['aprobacion']==signature)
    revision = 'error' if data['errores'] else 'revisar' if not approved else 'lista'
    motivos = list(data['errores']) + ([] if approved else list(data.get('advertencias', [])))
    if not accounts or not all(accounts):
        motivos.append('Asigna una cuenta contable a cada ítem.')
    return dict(**data, id=row['id'], cuentas=accounts, ajustes=adjustments, estado=status, lote=row['lote'], revision=revision, motivos_revision=motivos,firma_revision=signature,aprobada=approved)


SELECT = "SELECT f.id,f.nit,f.cufe,f.datos,f.cuentas,f.exportadas,f.contenido,e.config,d.lote,p.huella aprobacion,json_extract(l.informe,'$.configuracion') config_exportada,COALESCE(a.ajustes,'{}') ajustes,COALESCE(a.exportados,'{}') ajustes_exportados FROM facturas f JOIN empresas e ON e.nit=f.nit LEFT JOIN documentos d ON d.nit=f.nit AND d.cufe=f.cufe LEFT JOIN lotes l ON l.id=d.lote LEFT JOIN factura_ajustes a ON a.id=f.id LEFT JOIN factura_aprobaciones p ON p.id=f.id"


def listing(db, company):
    con = connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            migrate(con, company)
        result = []
        examples=learning_examples(con,company)
        for row in con.execute(SELECT+' WHERE f.nit=?', (company,)):
            data = presented(row)
            item={k: data[k] for k in ('id','documento','proveedor','nit_proveedor','fecha','total','moneda','estado','lote','retenciones','revision','motivos_revision','firma_revision','aprobada')}
            item['sugerencias']=predict_items(data['items'],[(set(e['tokens']),e['cuenta']) for e in examples if not e['excluido'] and e['factura']!=data['id']]) if data['estado']=='pendiente' else []
            result.append(item)
        return sorted(result, key=lambda d: (d['fecha'], d['documento']), reverse=True)
    finally:
        con.close()


def detail(db, invoice_id):
    con = connect(db)
    try:
        row = con.execute(SELECT+' WHERE f.id=?', (invoice_id,)).fetchone()
        if not row:
            return None
        result = presented(row)
        account = con.execute('SELECT cuenta FROM tercero_cuentas WHERE nit_empresa=? AND nit_tercero=?',
                              (row['nit'], result['nit_proveedor'])).fetchone()
        result['cuenta_tercero'] = account['cuenta'] if account else ''
        return result
    finally:
        con.close()


def save_accounts(db, invoice_id, accounts, adjustments=None, expected=None):
    if not isinstance(accounts, list) or any(not isinstance(a, str) or (a and not re.fullmatch(r'\d{4,12}', a)) for a in accounts):
        raise ValueError('Cada cuenta debe contener de 4 a 12 dígitos. Puedes dejar ítems pendientes.')
    con = connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute(SELECT.replace('SELECT f.id', 'SELECT f.contenido,f.id')+' WHERE f.id=?', (invoice_id,)).fetchone()
            if not row:
                raise ValueError('Factura no encontrada.')
            if len(accounts) != len(json.loads(row['datos'])['items']):
                raise ValueError('La cantidad de cuentas no coincide con los ítems.')
            before = dict(cuentas=json.loads(row['cuentas']), ajustes=json.loads(row['ajustes']))
            if expected is not None and expected != before:
                raise ValueError('La factura cambió en otra ventana. Vuelve a abrirla antes de guardar.')
            after = dict(cuentas=accounts, ajustes=validate_adjustments(adjustments) if adjustments is not None else before['ajustes'])
            if after['ajustes'] and all(accounts):
                document(row['contenido'], company_config(con, row['nit']), {row['cufe']:accounts}, after['ajustes'])
            con.execute('UPDATE facturas SET cuentas=? WHERE id=?', (json.dumps(accounts), invoice_id))
            con.execute('INSERT INTO factura_ajustes(id,ajustes) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET ajustes=excluded.ajustes',
                        (invoice_id, json.dumps(after['ajustes'], sort_keys=True)))
            if before != after:
                con.execute('INSERT INTO factura_cambios(factura,nit,fecha,antes,despues) VALUES (?,?,?,?,?)',
                            (invoice_id, row['nit'], datetime.now(timezone.utc).isoformat(), json.dumps(before), json.dumps(after)))
    finally:
        con.close()
    return detail(db, invoice_id)


def generate(db, ids, config):
    config = config_validated(config)
    if not isinstance(ids, list) or not 1 <= len(ids) <= 200 or any(not isinstance(i, str) for i in ids):
        raise ValueError('Selecciona entre 1 y 200 facturas.')
    groups = defaultdict(list)
    con = connect(db)
    try:
        for invoice_id in dict.fromkeys(ids):
            row = con.execute(SELECT.replace('SELECT f.id', 'SELECT f.contenido,f.id')+' WHERE f.id=? AND f.nit=?', (invoice_id, config['nit'])).fetchone()
            if not row:
                raise ValueError('Factura no encontrada para esta empresa.')
            data = presented(row)
            if data['estado'] != 'lista' or not data['aprobada']:
                raise ValueError(f'{data["documento"]}: asigna todas las cuentas y resuelve las incidencias; una factura ya generada se descarga del historial.')
            groups[row['lote']].append(dict(row))
        results = []
        for ancestor, rows in groups.items():
            batch = process(db, [(r['id']+'.xml', r['contenido']) for r in rows], config, reprocess_from=ancestor)
            results.append(batch)
            accepted = {d.get('cufe'):d for d in batch['documentos'] if d['estado'] == 'convertido'}
            with con:
                for row in rows:
                    if row['cufe'] in accepted:
                        exported = accepted[row['cufe']]
                        con.execute('UPDATE facturas SET exportadas=? WHERE id=?',
                                    (json.dumps([line['cuenta'] for line in exported['lineas']]), row['id']))
                        con.execute('UPDATE factura_ajustes SET exportados=? WHERE id=?',
                                    (json.dumps(exported.get('ajustes', {}), sort_keys=True), row['id']))
                con.execute('INSERT OR IGNORE INTO facturas_migradas VALUES (?)', (batch['id'],))
        return dict(lotes=results)
    finally:
        con.close()


def company_config(con, company):
    row = con.execute('SELECT config FROM empresas WHERE nit=?', (company,)).fetchone()
    if not row:
        raise ValueError('Empresa no encontrada.')
    return config_validated(json.loads(row['config']))


def save_supplier_account(db, invoice_id, account, expected=None):
    if not isinstance(account, str) or (account and not re.fullmatch(r'\d{4,12}', account)):
        raise ValueError('La cuenta del tercero debe contener de 4 a 12 dígitos, o estar vacía para quitarla.')
    con = connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute('SELECT nit,datos FROM facturas WHERE id=?', (invoice_id,)).fetchone()
            if not row:
                raise ValueError('Factura no encontrada.')
            supplier = json.loads(row['datos'])['nit_proveedor']
            if not supplier:
                raise ValueError('El tercero no tiene identificación.')
            previous = con.execute('SELECT cuenta FROM tercero_cuentas WHERE nit_empresa=? AND nit_tercero=?', (row['nit'],supplier)).fetchone()
            old_account = previous['cuenta'] if previous else ''
            if expected is not None and expected != old_account:
                raise ValueError('La cuenta del tercero cambió en otra ventana. Vuelve a abrir la factura.')
            if account:
                con.execute('INSERT INTO tercero_cuentas VALUES (?,?,?) ON CONFLICT(nit_empresa,nit_tercero) DO UPDATE SET cuenta=excluded.cuenta',
                            (row['nit'], supplier, account))
            else:
                con.execute('DELETE FROM tercero_cuentas WHERE nit_empresa=? AND nit_tercero=?', (row['nit'], supplier))
            if old_account != account:
                before = dict(nit_tercero=supplier, cuenta_tercero=old_account)
                after = dict(nit_tercero=supplier, cuenta_tercero=account)
                con.execute('INSERT INTO factura_cambios(factura,nit,fecha,antes,despues) VALUES (?,?,?,?,?)',
                            (invoice_id, row['nit'], datetime.now(timezone.utc).isoformat(), json.dumps(before), json.dumps(after)))
        return dict(cuenta=account, nit_tercero=supplier)
    finally:
        con.close()


def approve(db, company, signatures):
    if not isinstance(signatures,dict) or not 1<=len(signatures)<=200:
        raise ValueError('Selecciona de 1 a 200 facturas revisadas.')
    con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            for identity,signature in signatures.items():
                row=con.execute(SELECT+' WHERE f.id=? AND f.nit=?',(identity,company)).fetchone()
                if not row:raise ValueError('Factura no encontrada para esta empresa.')
                data=presented(row)
                if data['estado'] not in ('lista','generada') or data['errores']:
                    raise ValueError(data['documento']+': corrige los errores y asigna las cuentas antes de aprobar.')
                if signature!=data['firma_revision']:
                    raise ValueError('La factura o su configuración cambió; vuelve a revisar los avisos.')
                previous=row['aprobacion'] or ''
                if previous!=signature:
                    con.execute('INSERT INTO factura_aprobaciones VALUES (?,?) ON CONFLICT(id) DO UPDATE SET huella=excluded.huella',(identity,signature))
                    con.execute('INSERT INTO factura_cambios(factura,nit,fecha,antes,despues) VALUES (?,?,?,?,?)',(identity,company,datetime.now(timezone.utc).isoformat(),json.dumps({'aprobacion':previous}),json.dumps({'aprobacion':signature})))
        return dict(aprobadas=len(signatures))
    finally:con.close()


def accept_suggestions(db, company, invoice_id, signature):
    data=detail(db,invoice_id)
    con=connect(db)
    try:
        if not con.execute('SELECT 1 FROM facturas WHERE id=? AND nit=?',(invoice_id,company)).fetchone():raise ValueError('Factura ajena a la empresa.')
    finally:con.close()
    if not data or signature!=data['firma_revision']:raise ValueError('La factura cambió; actualiza la bandeja.')
    predicted=suggestions(db,invoice_id)
    accounts=[a or (p['cuenta'] if p else '') for a,p in zip(data['cuentas'],predicted)]
    if accounts==data['cuentas']:raise ValueError('No hay sugerencias nuevas para aplicar.')
    return save_accounts(db,invoice_id,accounts,expected={'cuentas':data['cuentas'],'ajustes':data['ajustes']})


def preview(db, invoice_id, accounts=None, adjustments=None):
    """Calcula con el mismo motor que exporta, sin guardar ni crear un lote."""
    con = connect(db)
    try:
        row = con.execute(SELECT.replace('SELECT f.id', 'SELECT f.contenido,f.id')+' WHERE f.id=?', (invoice_id,)).fetchone()
        if not row:
            raise ValueError('Factura no encontrada.')
        accounts = json.loads(row['cuentas']) if accounts is None else accounts
        if not isinstance(accounts, list) or any(not isinstance(a, str) for a in accounts):
            raise ValueError('Cuentas inválidas.')
        settings = json.loads(row['ajustes']) if adjustments is None else validate_adjustments(adjustments)
        config = company_config(con, row['nit'])
        try:
            doc = document(row['contenido'], config, {row['cufe']: accounts}, settings)
            return dict(apto=True, filas=doc['filas'], debitos=doc['debitos'], creditos=doc['creditos'],
                        advertencias=doc['advertencias'], retenciones=doc['retenciones_detalle'], neto=doc['neto'])
        except (ValueError, TypeError) as error:
            return dict(apto=False, filas=[], errores=[str(error)])
    finally:
        con.close()


def preview_batch(db, company, ids):
    """Vista consistente del lote, sin crear exportaciones ni alterar registros."""
    if not isinstance(ids, list) or len(ids)>200 or any(not isinstance(i, str) for i in ids):
        raise ValueError('Selecciona hasta 200 facturas para preparar el lote.')
    con = connect(db)
    try:
        con.execute('BEGIN')
        config = company_config(con, company)
        rows, documents, errors = [], [], []
        for invoice_id in dict.fromkeys(ids):
            row = con.execute(SELECT.replace('SELECT f.id', 'SELECT f.contenido,f.id')+' WHERE f.id=? AND f.nit=?', (invoice_id, company)).fetchone()
            if not row:
                raise ValueError('Factura no encontrada para esta empresa.')
            data = presented(row)
            try:
                if data['estado'] != 'lista' or not data['aprobada']:
                    raise ValueError('La factura no está lista o su plano ya fue generado.')
                checked = document(row['contenido'], config, {row['cufe']:data['cuentas']}, data['ajustes'])
                rows.extend(checked['filas'])
                documents.append(dict(id=invoice_id, documento=data['documento'], debitos=checked['debitos'],
                                      creditos=checked['creditos'], advertencias=checked['advertencias']))
            except (ValueError, TypeError) as error:
                errors.append(dict(id=invoice_id, documento=data['documento'], mensaje=str(error)))
        debits = sum((Decimal(r[8]) for r in rows if r[7]=='1'), Decimal(0))
        credits = sum((Decimal(r[8]) for r in rows if r[7]=='2'), Decimal(0))
        return dict(apto=bool(documents) and not errors, facturas=len(documents), solicitadas=len(set(ids)),
                    filas=rows, documentos=documents, errores=errors, debitos=str(debits), creditos=str(credits))
    finally:
        con.close()


def change_resource(snapshot, invoice_id):
    if 'aprobacion' in snapshot:
        return ('aprobacion',invoice_id)
    if 'cuenta_tercero' in snapshot:
        return ('tercero', snapshot['nit_tercero'])
    if 'aprendizaje' in snapshot:
        return ('aprendizaje', invoice_id, snapshot['aprendizaje'])
    return ('factura', invoice_id)


def change_history(db, company):
    con = connect(db)
    try:
        return [dict(id=r['id'], factura=r['factura'], documento=json.loads(r['datos'])['documento'] if r['datos'] else 'Ejemplo histórico', fecha=r['fecha'], revertido=bool(r['revertido']),
                     tipo=change_resource(json.loads(r['despues']), r['factura'])[0])
                for r in con.execute('SELECT c.*,f.datos FROM factura_cambios c LEFT JOIN facturas f ON f.id=c.factura WHERE c.nit=? ORDER BY c.id DESC LIMIT 20', (company,))]
    finally:
        con.close()


def undo_change(db, company, change_id=None):
    con = connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            clause, values = (' AND id=?', (company, change_id)) if change_id is not None else ('', (company,))
            change = con.execute('SELECT * FROM factura_cambios WHERE nit=? AND revertido=0'+clause+' ORDER BY id DESC LIMIT 1', values).fetchone()
            if not change:
                raise ValueError('No hay cambios para deshacer.')
            # No pisar cambios posteriores, ni siquiera si llegaron a los mismos valores.
            before = json.loads(change['antes'])
            after = json.loads(change['despues'])
            resource = change_resource(after, change['factura'])
            for later in con.execute('SELECT factura,despues FROM factura_cambios WHERE nit=? AND id>? AND revertido=0', (company, change['id'])):
                if change_resource(json.loads(later['despues']), later['factura']) == resource:
                    raise ValueError('Deshaz primero los cambios posteriores de esta factura, tercero o regla de aprendizaje.')
            if resource[0] == 'aprobacion':
                row=con.execute('SELECT huella FROM factura_aprobaciones WHERE id=?',(change['factura'],)).fetchone()
                if (row['huella'] if row else '')!=after['aprobacion']:raise ValueError('La aprobación cambió después.')
                if before['aprobacion']:con.execute('INSERT INTO factura_aprobaciones VALUES (?,?) ON CONFLICT(id) DO UPDATE SET huella=excluded.huella',(change['factura'],before['aprobacion']))
                else:con.execute('DELETE FROM factura_aprobaciones WHERE id=?',(change['factura'],))
            elif resource[0] == 'tercero':
                row = con.execute('SELECT cuenta FROM tercero_cuentas WHERE nit_empresa=? AND nit_tercero=?', (company, before['nit_tercero'])).fetchone()
                if (row['cuenta'] if row else '') != after['cuenta_tercero']:
                    raise ValueError('La cuenta del tercero cambió; no se sobrescriben valores nuevos.')
                if before['cuenta_tercero']:
                    con.execute('INSERT INTO tercero_cuentas VALUES (?,?,?) ON CONFLICT(nit_empresa,nit_tercero) DO UPDATE SET cuenta=excluded.cuenta',
                                (company, before['nit_tercero'], before['cuenta_tercero']))
                else:
                    con.execute('DELETE FROM tercero_cuentas WHERE nit_empresa=? AND nit_tercero=?', (company, before['nit_tercero']))
            elif resource[0] == 'aprendizaje':
                row = con.execute('SELECT 1 FROM aprendizaje_exclusiones WHERE factura=? AND item=?', (change['factura'], before['aprendizaje'])).fetchone()
                if bool(row) != after['excluido']:
                    raise ValueError('La exclusión de aprendizaje cambió; vuelve a consultar el panel.')
                if before['excluido']:
                    con.execute('INSERT OR IGNORE INTO aprendizaje_exclusiones VALUES (?,?)', (change['factura'],before['aprendizaje']))
                else:
                    con.execute('DELETE FROM aprendizaje_exclusiones WHERE factura=? AND item=?', (change['factura'],before['aprendizaje']))
            else:
                row = con.execute(SELECT+' WHERE f.id=?', (change['factura'],)).fetchone()
                current = dict(cuentas=json.loads(row['cuentas']), ajustes=json.loads(row['ajustes']))
                if current != after:
                    raise ValueError('La factura cambió; no se sobrescriben valores nuevos.')
                con.execute('UPDATE facturas SET cuentas=? WHERE id=?', (json.dumps(before['cuentas']), change['factura']))
                con.execute('UPDATE factura_ajustes SET ajustes=? WHERE id=?', (json.dumps(before['ajustes'], sort_keys=True), change['factura']))
            con.execute('UPDATE factura_cambios SET revertido=1 WHERE id=?', (change['id'],))
        return detail(db, change['factura']) or dict(id=None)
    finally:
        con.close()


def tokens(description):
    text_value = ''.join(c for c in unicodedata.normalize('NFKD', description.casefold()) if not unicodedata.combining(c))
    text_value = text_value.replace('limpiavidrios', 'limpia vidrio')
    ignored = {'de','del','la','el','los','las','para','por','con','sin','y','en','un','una','unidad','und','ml','gr','kg','cm','ref','cod','sku','marca'}
    words = re.findall(r'\b[a-z]{3,}\b', text_value)
    return {w[:-2] if len(w)>5 and w.endswith('es') else w[:-1] if len(w)>4 and w.endswith('s') else w for w in words if w not in ignored}


def learning_examples(con, company, exclude_invoice=None):
    excluded = {(r['factura'],r['item']) for r in con.execute('SELECT e.* FROM aprendizaje_exclusiones e JOIN facturas f ON f.id=e.factura WHERE f.nit=?', (company,))}
    examples = []
    for row in con.execute('SELECT id,datos,cuentas FROM facturas WHERE nit=? ORDER BY id', (company,)):
        if row['id'] == exclude_invoice:
            continue
        data = json.loads(row['datos'])
        if data['errores']:
            continue
        for index, (item, account) in enumerate(zip(data['items'], json.loads(row['cuentas']))):
            words = tokens(item['descripcion'])
            if re.fullmatch(r'\d{4,12}', account) and words:
                examples.append(dict(factura=row['id'], documento=data['documento'], item=index, descripcion=item['descripcion'],
                                     cuenta=account, tokens=sorted(words), excluido=(row['id'],index) in excluded))
    for row in con.execute('SELECT * FROM aprendizaje_historico WHERE nit=? ORDER BY id',(company,)):
        words=tokens(row['descripcion']);identity='h:'+row['id']
        if words:
            blocked=con.execute('SELECT 1 FROM aprendizaje_exclusiones WHERE factura=? AND item=0',(identity,)).fetchone()
            examples.append(dict(factura=identity,documento=row['documento'],item=0,descripcion=row['descripcion'],cuenta=row['cuenta'],tokens=sorted(words),excluido=bool(blocked)))
    return examples


def learning_dashboard(db, company, query='', page=0):
    if not isinstance(query,str) or not isinstance(page,int) or page<0:
        raise ValueError('Filtro de aprendizaje inválido.')
    con = connect(db)
    try:
        examples = learning_examples(con, company)
        active = [e for e in examples if not e['excluido']]
        by_token = defaultdict(lambda: defaultdict(int))
        for e in active:
            for word in e['tokens']:
                by_token[word][e['cuenta']] += 1
        top = sorted(by_token.items(), key=lambda item:(-sum(item[1].values()),item[0]))[:20]
        matches = [e for e in examples if query.casefold() in (e['documento']+' '+e['descripcion']+' '+e['cuenta']+' '+' '.join(e['tokens'])).casefold()]
        pages = max(1,(len(matches)+49)//50)
        page = min(page,pages-1)
        return dict(activos=len(active), excluidos=len(examples)-len(active), coincidencias=len(matches), pagina=page, paginas=pages,
                    tokens=[dict(token=word, cuentas=[dict(cuenta=a,frecuencia=n) for a,n in sorted(counts.items(),key=lambda item:(-item[1],item[0]))]) for word,counts in top],
                    ejemplos=matches[page*50:(page+1)*50])
    finally:
        con.close()


def set_learning_exclusion(db, company, invoice_id, index, excluded, expected=None):
    if type(index) is not int or index<0 or type(excluded) is not bool or (expected is not None and type(expected) is not bool):
        raise ValueError('Indica el ítem y si debe excluirse del aprendizaje.')
    con = connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute('SELECT datos FROM facturas WHERE id=? AND nit=?', (invoice_id,company)).fetchone()
            historical=con.execute('SELECT id FROM aprendizaje_historico WHERE id=? AND nit=?',(invoice_id[2:],company)).fetchone() if isinstance(invoice_id,str) and invoice_id.startswith('h:') else None
            if (not historical and (not row or index>=len(json.loads(row['datos'])['items']))) or (historical and index!=0):
                raise ValueError('Ítem no encontrado para esta empresa.')
            previous = bool(con.execute('SELECT 1 FROM aprendizaje_exclusiones WHERE factura=? AND item=?', (invoice_id,index)).fetchone())
            if expected is not None and previous != expected:
                raise ValueError('La exclusión cambió en otra ventana. Actualiza el panel.')
            if previous != excluded:
                if excluded:
                    con.execute('INSERT INTO aprendizaje_exclusiones VALUES (?,?)', (invoice_id,index))
                else:
                    con.execute('DELETE FROM aprendizaje_exclusiones WHERE factura=? AND item=?', (invoice_id,index))
                before, after = dict(aprendizaje=index, excluido=previous), dict(aprendizaje=index, excluido=excluded)
                con.execute('INSERT INTO factura_cambios(factura,nit,fecha,antes,despues) VALUES (?,?,?,?,?)',
                            (invoice_id,company,datetime.now(timezone.utc).isoformat(),json.dumps(before),json.dumps(after)))
        return dict(factura=invoice_id,item=index,excluido=excluded)
    finally:
        con.close()


def suggestions(db, invoice_id):
    con = connect(db)
    try:
        invoice = con.execute('SELECT * FROM facturas WHERE id=?', (invoice_id,)).fetchone()
        if not invoice:
            raise ValueError('Factura no encontrada.')
        examples = [(set(e['tokens']),e['cuenta']) for e in learning_examples(con, invoice['nit'], invoice_id) if not e['excluido']]
        return predict_items(json.loads(invoice['datos'])['items'],examples)
    finally:
        con.close()


def predict_items(items, examples):
        frequency = defaultdict(int)
        for words, _ in examples:
            for word in words:
                frequency[word] += 1
        def weight(word):
            return 1 + math.log((1+len(examples))/(1+frequency.get(word, 0)))
        result = []
        for item in items:
            words = tokens(item['descripcion'])
            scores = defaultdict(float)
            for known, account in examples:
                union = words | known
                score = sum(weight(w) for w in words & known) / sum(weight(w) for w in union) if union else 0
                scores[account] = max(scores[account], score)
            ordered = sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))
            if not ordered or ordered[0][1] <= 0:
                result.append(None)
                continue
            account, score = ordered[0]
            competitor = ordered[1][1] if len(ordered)>1 else 0
            confidence = round(100*score*(1-.5*competitor/score))
            result.append(dict(cuenta=account, confianza=confidence, automatica=confidence>=60) if confidence>=30 else None)
        return result


def tabular(db, company):
    # Importaciones antiguas se migran mediante el mismo flujo del listado.
    listing(db, company)
    con = connect(db)
    try:
        result = []
        for row in con.execute(SELECT.replace('SELECT f.id', 'SELECT f.contenido,f.id')+' WHERE f.nit=?', (company,)):
            data = presented(row)
            root = ubl_root(row['contenido'])
            taxes = root.findall('TaxTotal')
            if not taxes:
                taxes = [tax for kind in ('InvoiceLine','CreditNoteLine','DebitNoteLine') for line in root.findall(kind) for tax in line.findall('TaxTotal')]
            values = {'5':Decimal(0), '19':Decimal(0), 'otros':Decimal(0)}
            for tax in taxes:
                for sub in tax.findall('TaxSubtotal'):
                    if text(sub, 'TaxCategory/TaxScheme/ID') == '01':
                        rate = amount(sub, 'TaxCategory/Percent')
                        key = str(int(rate)) if rate in (Decimal(5),Decimal(19)) else 'otros'
                        values[key] += amount(sub, 'TaxAmount')
            calc = preview(db, row['id'])
            holds = calc.get('retenciones', {})
            if not holds:
                for tax in root.findall('WithholdingTaxTotal/TaxSubtotal'):
                    key = {'06':'retefte','05':'reteiva','07':'reteica'}.get(text(tax,'TaxCategory/TaxScheme/ID'))
                    if key:
                        prior = holds.setdefault(key, {'valor':'0', 'base':'0'})
                        prior['valor'] = str(Decimal(prior['valor'])+amount(tax,'TaxAmount'))
                        prior['base'] = str(Decimal(prior['base'])+amount(tax,'TaxableAmount'))
            counterpart = data['clasificacion']['contraparte']['nit']
            parties = data['clasificacion']
            party = parties['supplier'] if parties['supplier']['nit']==counterpart else parties['customer']
            result.append(dict(id=row['id'], factura=data['documento'], nombre=data['proveedor'], nit=data['nit_proveedor'],
                               regimen=party.get('responsabilidad',''), fecha=data['fecha'], subtotal=data['totales'].get('LineExtensionAmount',''),
                               iva5=str(values['5']), iva19=str(values['19']), iva_total=str(sum(values.values())),
                               retefte=holds.get('retefte',{}).get('valor','0'), reteiva=holds.get('reteiva',{}).get('valor','0'), reteica=holds.get('reteica',{}).get('valor','0'),
                               retefte_tarifa=str((Decimal(holds['retefte']['valor'])*100/Decimal(holds['retefte']['base'])).quantize(Decimal('0.0001'))) if holds.get('retefte') and Decimal(holds['retefte'].get('base','0')) else '',
                               total_xml=data['total'], neto_asiento=calc.get('neto',''), revision=data['revision'] if calc['apto'] or data['estado']=='pendiente' else 'error',
                               motivos=data['motivos_revision']+calc.get('errores',[])))
        return result
    finally:
        con.close()


def tabular_xlsx(rows):
    """Excel mínimo OOXML sin dependencias ni conversión de NIT a números."""
    from xml.sax.saxutils import escape
    columns = [('factura','Factura'),('nombre','Nombre'),('nit','NIT'),('regimen','Régimen'),('fecha','Fecha'),('subtotal','Subtotal'),
               ('iva5','IVA 5%'),('iva19','IVA 19%'),('iva_total','IVA total'),('retefte','ReteFuente'),('reteiva','ReteIVA'),('reteica','ReteICA'),
               ('total_xml','Total XML'),('neto_asiento','Neto asiento'),('revision','Revisión'),('retefte_tarifa','ReteFuente tarifa efectiva %')]
    body = []
    for index, values in enumerate([[label for _,label in columns]]+[[row.get(key,'') for key,_ in columns] for row in rows],1):
        cells = []
        for col, value in enumerate(values):
            cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(value))
            number = None
            if index>1 and (5<=col<=13 or col==15) and cleaned:
                try:
                    parsed = Decimal(cleaned)
                    if parsed.is_finite():
                        number = parsed
                except InvalidOperation:
                    pass
            if number is None:
                cells.append(f'<c t="inlineStr"><is><t xml:space="preserve">{escape(cleaned)}</t></is></c>')
            else:
                cells.append(f'<c t="n"><v>{number}</v></c>')
        body.append('<row>'+''.join(cells)+'</row>')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Revision" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(body)+'</sheetData></worksheet>')
    return output.getvalue()
