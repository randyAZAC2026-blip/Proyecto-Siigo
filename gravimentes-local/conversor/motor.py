"""Conversión UBL → Contai, sin dependencias externas ni estado del navegador."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sqlite3
import uuid
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from xml.etree import ElementTree as ET

HEADERS = ['Cuenta', 'Comprobante', 'Fecha(yyyy-mm-dd)', 'Documento', 'Documento Ref.',
           'NIT', 'Detalle', 'Tipo', 'Valor', 'Base', 'Centro de Costo', 'Trans. Ext', 'Plazo']
DEFAULTS = dict(nit='', empresa='', gasto='519530', proveedor='220505', iva19='240810',
                iva5='240810', retefte='236540', reteiva='236701', reteica='236801',
                comprobante='00003', comprobante_nc='00003', centro='01', reglas=[],
                proveedor_ds='233595', comprobante_ds='00003', comprobante_ajuste_ds='00003')
LIMIT = 64 * 1024 * 1024
ZERO = Decimal('0')
PRECISION = Decimal('0.0001')


def money(value):
    try:
        result = Decimal(str(value))
        if not result.is_finite():
            raise ValueError()
        return result.quantize(PRECISION, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValueError(f'Importe inválido: {str(value)[:60]}') from None


def text(node, path, default=''):
    item = node.find(path) if node is not None else None
    return item.text.strip() if item is not None and item.text else default


def amount(node, path, required=False):
    value = text(node, path)
    if required and not value:
        raise ValueError(f'Falta el importe {path}')
    return money(value or '0')


def nit_check_digit(value):
    """DV DIAN de un NIT base; no infiere el tipo de documento."""
    if not value or not value.isdigit() or len(value)>15:
        return None
    weights=(71,67,59,53,47,43,41,37,29,23,19,17,13,7,3)
    remainder=sum(int(d)*w for d,w in zip(value,weights[-len(value):]))%11
    return str(remainder if remainder<2 else 11-remainder)


def nit(value, dv=None, document_type=None):
    """Quita DV explícito; un número ambiguo sin metadatos conserva sus dígitos."""
    raw=re.sub(r'[\u200b-\u200d\ufeff]','',str(value or '')).strip()
    explicit=re.fullmatch(r'([\d.\s]+)\s*[-\u2010-\u2015]\s*(\d)',raw)
    if explicit:
        return re.sub(r'\D','',explicit.group(1))
    digits=re.sub(r'\D','',raw)
    declared=str(document_type or '').strip()
    if len(digits)==10 and digits[0] in '89' and declared in ('','31'):
        expected=nit_check_digit(digits[:-1])
        if expected==digits[-1] and ((dv is not None and str(dv)==expected) or declared=='31'):
            return digits[:-1]
    return digits


def config_validated(config):
    out = {**DEFAULTS, **config}
    out['nit'] = nit(out['nit'])
    if not re.fullmatch(r'\d{5,15}', out['nit']):
        raise ValueError('Escribe el NIT comprador sin dígito de verificación.')
    for field in ('gasto', 'proveedor', 'proveedor_ds', 'iva19', 'iva5', 'retefte', 'reteiva', 'reteica'):
        out[field] = str(out[field]).strip()
        if not re.fullmatch(r'\d{4,12}', out[field]):
            raise ValueError(f'Cuenta inválida: {field}')
    for field in ('comprobante', 'comprobante_nc', 'comprobante_ds', 'comprobante_ajuste_ds', 'centro'):
        out[field] = str(out[field]).strip()
        if not re.fullmatch(r'\d{1,12}', out[field]):
            raise ValueError(f'Código inválido: {field}')
    if not isinstance(out['reglas'], list) or len(out['reglas']) > 100:
        raise ValueError('Las reglas deben ser una lista de máximo 100 elementos.')
    for rule in out['reglas']:
        if not isinstance(rule, dict) or not isinstance(rule.get('texto'), str) or not rule['texto'].strip() or not re.fullmatch(r'\d{4,12}', str(rule.get('cuenta', ''))):
            raise ValueError('Cada regla necesita un texto y una cuenta de 4 a 12 dígitos.')
    master=out.get('maestro',{})
    if not isinstance(master,dict) or len(master)>50000:
        raise ValueError('El maestro debe ser un diccionario de hasta 50000 cuentas.')
    for account,data in master.items():
        if not re.fullmatch(r'\d{1,12}',str(account)) or not isinstance(data,dict) or type(data.get('activa')) is not bool or type(data.get('recibe')) is not bool or not isinstance(data.get('nombre'),str):
            raise ValueError('Cada cuenta del maestro requiere nombre e indicadores activa/recibe.')
    payroll=out.get('nomina_cuentas',{})
    if not isinstance(payroll,dict) or len(payroll)>500 or any(not isinstance(a,str) or (a and not re.fullmatch(r'\d{4,12}',a)) for a in payroll.values()):
        raise ValueError('Mapeo de nómina inválido.')
    if 'comprobante_nomina' in out and not re.fullmatch(r'\d{1,12}',str(out['comprobante_nomina'])):
        raise ValueError('Código de comprobante de nómina inválido.')
    return out


def parse_xml(content):
    if len(content) > LIMIT:
        raise ValueError('XML demasiado grande.')
    # Rechazar entidades/DTD también para documentos UTF-16/32.
    if re.search(br'<!\s*(DOCTYPE|ENTITY)', content.replace(b'\x00', b''), re.I):
        raise ValueError('XML con DTD o entidades no admitido.')
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        raise ValueError(f'XML mal formado: {e}') from None
    for node in root.iter():
        node.tag = node.tag.rsplit('}', 1)[-1]
    return root


def ubl_root(content):
    root = parse_xml(content)
    if root.tag == 'AttachedDocument':
        embedded = text(root, 'Attachment/ExternalReference/Description')
        if not embedded:
            raise ValueError('AttachedDocument sin XML embebido.')
        root = parse_xml(embedded.encode('utf-8'))
    return root


def fiscal_parties(root, company):
    """Una decisión fiscal para importación, revisión y reclasificación."""
    company=nit(company)
    code=text(root,'InvoiceTypeCode') or text(root,'CreditNoteTypeCode') or text(root,'DebitNoteTypeCode')
    support=code in ('05','95')
    def party(node):
        identifier=node.find('PartyTaxScheme/CompanyID') if node is not None else None
        if identifier is None and node is not None:
            identifier=node.find('PartyLegalEntity/CompanyID')
        value=(identifier.text or '').strip() if identifier is not None else ''
        dv=identifier.get('schemeID') if identifier is not None else None
        doc_type=identifier.get('schemeName') if identifier is not None else None
        return dict(nit=nit(value,dv,doc_type),nombre=text(node,'PartyTaxScheme/RegistrationName') or text(node,'PartyLegalEntity/RegistrationName'))
    supplier=party(root.find('AccountingSupplierParty/Party'))
    customer=party(root.find('AccountingCustomerParty/Party'))
    own_supplier=bool(company and supplier['nit']==company)
    own_customer=bool(company and customer['nit']==company)
    counterpart={'nit':'','nombre':''}
    operation='sin_clasificar';source='sin_vinculo'
    role='AccountingSupplierParty' if own_supplier else 'AccountingCustomerParty' if own_customer else 'ninguno'
    if support:
        operation='compra';source='codigo_dian'
        if own_supplier != own_customer:
            counterpart=customer if own_supplier else supplier
        kind='Nota de ajuste de documento soporte' if code=='95' else 'Documento soporte (gasto)'
        reason='Documento soporte: es una adquisición/gasto; el proveedor es la contraparte distinta de la empresa.'
    elif own_supplier and not own_customer:
        operation='venta';source='nit_emisor';counterpart=customer
        kind='Documento emitido de venta'
        reason='La empresa es el emisor; el cliente corresponde al receptor, nunca a la empresa propia.'
    elif own_customer and not own_supplier:
        operation='compra';source='nit_receptor';counterpart=supplier
        kind={'Invoice':'Factura de compra','CreditNote':'Nota crédito de compra','DebitNote':'Nota débito de compra'}.get(root.tag,root.tag)
        reason='Compra recibida: el proveedor corresponde al emisor.'
    else:
        kind='Documento sin contraparte verificable'
        reason='Verifica los NIT de emisor y receptor; no se asigna la empresa propia como tercero.'
    if counterpart['nit']==company:
        counterpart={'nit':'','nombre':''}
    return dict(codigo=code,soporte=support,tipo=kind,supplier=supplier,customer=customer,
                contraparte=counterpart,rol_empresa=role,explicacion=reason,
                vinculada=own_supplier or own_customer,tipo_operacion=operation,
                trat={'venta':'ingreso','compra':'gasto'}.get(operation,''),fuente=source,
                esCli=operation=='venta',esProv=operation=='compra')


def validate_adjustments(value):
    """Decisiones explícitas por factura; nunca se alteran los XML originales."""
    if not isinstance(value, dict) or set(value) - {'cxp', 'retenciones'}:
        raise ValueError('Ajustes contables inválidos.')
    result = {}
    if value.get('cxp'):
        if not isinstance(value['cxp'], str) or not re.fullmatch(r'\d{4,12}', value['cxp']):
            raise ValueError('La cuenta por pagar debe contener de 4 a 12 dígitos.')
        result['cxp'] = value['cxp']
    holds = value.get('retenciones', {})
    if not isinstance(holds, dict) or set(holds) - {'retefte', 'reteiva', 'reteica'}:
        raise ValueError('Tipo de retención inválido.')
    for key, data in holds.items():
        if not isinstance(data, dict) or set(data) != {'base', 'tarifa', 'cuenta'}:
            raise ValueError('Cada retención requiere base, tarifa y cuenta.')
        base, rate = money(data['base']), money(data['tarifa'])
        if base < 0 or not ZERO <= rate <= 100 or not isinstance(data['cuenta'], str) or not re.fullmatch(r'\d{4,12}', data['cuenta']):
            raise ValueError('Revisa base, tarifa (0 a 100 %) y cuenta de retención.')
        result.setdefault('retenciones', {})[key] = dict(base=str(base), tarifa=str(rate), cuenta=data['cuenta'])
    return result


def document(content, config, accounts=None, adjustments=None):
    config = {**DEFAULTS, **config}
    config['nit']=nit(config['nit'])
    adjustments = validate_adjustments(adjustments or {})
    root = ubl_root(content)
    if root.tag not in ('Invoice', 'CreditNote', 'DebitNote'):
        raise ValueError(f'Tipo XML no admitido: {root.tag}')
    parties = fiscal_parties(root, config['nit'])
    support = parties['soporte']
    if support and ((parties['codigo'] == '05' and root.tag != 'Invoice') or (parties['codigo'] == '95' and root.tag != 'CreditNote')):
        raise ValueError('Código de documento soporte incompatible con el tipo de XML (05=Invoice, 95=CreditNote).')
    if text(root, 'DocumentCurrencyCode') != 'COP':
        raise ValueError('Se requiere moneda COP; no se aplica conversión de divisas.')
    seller, name = parties['contraparte']['nit'], parties['contraparte']['nombre']
    if support and not parties['vinculada']:
        raise ValueError('La empresa debe figurar como emisor o como receptor del documento soporte.')
    if not support and (parties['customer']['nit'] != config['nit'] or seller == config['nit']):
        raise ValueError(f'Comprador {parties["customer"]["nit"]} distinto al NIT {config["nit"]}, o proveedor igual al comprador.')
    if not re.fullmatch(r'\d{5,15}', seller) or not name:
        raise ValueError('Proveedor ausente o sin NIT/razón social.')
    number, cufe, issued = text(root, 'ID'), text(root, 'UUID'), text(root, 'IssueDate')
    if not number or not cufe:
        raise ValueError('Documento sin número o CUFE/CUDE.')
    try:
        if date.fromisoformat(issued).isoformat() != issued:
            raise ValueError()
    except ValueError:
        raise ValueError('Fecha de emisión inválida.') from None
    totals = root.find('LegalMonetaryTotal')
    if totals is None:
        totals = root.find('RequestedMonetaryTotal')
    subtotal = amount(totals, 'LineExtensionAmount', True)
    payable = amount(totals, 'PayableAmount', True)
    rounding = amount(totals, 'PayableRoundingAmount')
    prepaid = amount(totals, 'PrepaidAmount')
    warnings = []
    if prepaid:
        warnings.append('Anticipo informado: se causa la factura completa; la aplicación del anticipo se registra por separado.')
    lines = root.findall({'Invoice': 'InvoiceLine', 'CreditNote': 'CreditNoteLine', 'DebitNote': 'DebitNoteLine'}[root.tag])
    if not lines:
        raise ValueError('Documento sin líneas de compra.')
    expenses, detail_lines = {}, []
    assigned = (accounts or {}).get(cufe)
    if assigned is not None and (len(assigned) != len(lines) or any(not re.fullmatch(r'\d{4,12}', str(a)) for a in assigned)):
        raise ValueError('Asigna una cuenta válida a cada ítem de la factura.')
    for index, line in enumerate(lines):
        value = amount(line, 'LineExtensionAmount', True)
        desc = text(line, 'Item/Description') or text(line, 'Item/Name') or 'Compra'
        account = next((str(r['cuenta']) for r in config['reglas'] if r['texto'].casefold() in desc.casefold()), config['gasto'])
        if assigned is not None:
            account = assigned[index]
        expenses[account] = expenses.get(account, ZERO) + value
        detail_lines.append(dict(descripcion=desc, cuenta=account, valor=str(value)))
    line_sum = sum(expenses.values(), ZERO)
    discount, charge = amount(totals, 'AllowanceTotalAmount'), amount(totals, 'ChargeTotalAmount')
    base = subtotal - discount + charge
    if base < 0:
        raise ValueError('Descuentos superiores al subtotal y cargos.')
    # Si la suma de líneas difiere del subtotal, se ajusta la cuenta gasto.
    # UBL permite cargos/descuentos globales no detallados en las líneas.
    expenses[config['gasto']] = expenses.get(config['gasto'], ZERO) + (subtotal - line_sum) - discount + charge + rounding
    if subtotal != line_sum:
        warnings.append('Se utiliza el subtotal de cabecera; diferencia de líneas aplicada a gasto.')
    taxes, holds = [], {}
    header_taxes = root.findall('TaxTotal')
    tax_nodes = header_taxes or [tax for line in lines for tax in line.findall('TaxTotal')]
    if not header_taxes and tax_nodes:
        warnings.append('IVA recuperado de las líneas porque falta TaxTotal en cabecera.')
    for tax in tax_nodes:
        subtaxes = tax.findall('TaxSubtotal')
        if amount(tax, 'TaxAmount') and not subtaxes:
            raise ValueError('Impuesto sin desglose TaxSubtotal.')
        tax_sum = ZERO
        for sub in subtaxes:
            code = text(sub, 'TaxCategory/TaxScheme/ID')
            value = amount(sub, 'TaxAmount', True)
            taxable = amount(sub, 'TaxableAmount', True)
            rate = amount(sub, 'TaxCategory/Percent')
            if code != '01':
                if value:
                    raise ValueError(f'Impuesto {code} requiere cuenta específica; no se convierte automáticamente.')
                continue
            if value and rate not in (Decimal(19), Decimal(5)):
                raise ValueError(f'Tarifa IVA no admitida: {rate}')
            if abs((taxable * rate / 100).quantize(PRECISION) - value) > Decimal('1'):
                raise ValueError('Base y tarifa de IVA no coinciden con el valor informado.')
            if value:
                taxes.append((config['iva5'] if rate == 5 else config['iva19'], value, taxable))
            tax_sum += value
        if abs(amount(tax, 'TaxAmount', True) - tax_sum) > PRECISION:
            raise ValueError('Total de impuesto distinto a su desglose.')
    for tax in root.findall('WithholdingTaxTotal'):
        summed = ZERO
        for sub in tax.findall('TaxSubtotal'):
            code = text(sub, 'TaxCategory/TaxScheme/ID')
            field = {'06': 'retefte', '05': 'reteiva', '07': 'reteica'}.get(code)
            value = amount(sub, 'TaxAmount', True)
            if not field:
                raise ValueError(f'Retención no admitida: {code}')
            rate = amount(sub, 'TaxCategory/Percent') or ZERO
            nombre = text(sub, 'TaxCategory/TaxScheme/Name') or {'01':'IVA','02':'IC','03':'ICA','04':'INC','05':'ReteIVA','06':'Retefuente','07':'ReteICA'}.get(code, code)
            old = holds.get(field, (ZERO, ZERO, ZERO, ''))
            holds[field] = (old[0] + value, old[1] + amount(sub, 'TaxableAmount'), rate, nombre)
            summed += value
        if abs(amount(tax, 'TaxAmount', True) - summed) > PRECISION:
            raise ValueError('Retención total distinta a su desglose.')
    for field, data in adjustments.get('retenciones', {}).items():
        base_manual, rate_manual = money(data['base']), money(data['tarifa'])
        value_manual = (base_manual * rate_manual / 100).quantize(PRECISION)
        name_manual = {'retefte':'Retefuente', 'reteiva':'ReteIVA', 'reteica':'ReteICA'}[field]
        holds[field] = (value_manual, base_manual, rate_manual, name_manual)
        config[field] = data['cuenta']
    iva = sum((v for _, v, _ in taxes), ZERO)
    if sum((b for _, _, b in taxes), ZERO) > base + Decimal('1'):
        warnings.append('Las bases de IVA superan la base neta; se conservan las bases informadas en el XML.')
    if not discount and not charge and any(line.find('TaxTotal') is not None for line in lines):
        iva_lines = sum((amount(sub, 'TaxAmount', True) for line in lines for sub in line.findall('TaxTotal/TaxSubtotal') if text(sub, 'TaxCategory/TaxScheme/ID') == '01'), ZERO)
        if abs(iva_lines - iva) > Decimal('1'):
            warnings.append('IVA de líneas distinto a cabecera; se utiliza el IVA de cabecera.')
    gross = base + iva + rounding
    total_holds = sum((v for v, _, _, _ in holds.values()), ZERO)
    # UBL de proveedores puede informar PayableAmount bruto o neto de retenciones.
    if min(abs(payable - gross + prepaid), abs(payable - (gross - total_holds - prepaid))) > PRECISION:
        warnings.append('Valor a pagar distinto al calculado; el asiento utiliza base, IVA, redondeo y retenciones.')
    inclusive = text(totals, 'TaxInclusiveAmount')
    if inclusive and abs(money(inclusive) - (base + iva)) > Decimal('1'):
        warnings.append('Total con impuestos distinto a base más IVA; se utilizan los componentes del XML.')
    if gross <= 0 or total_holds > gross:
        raise ValueError('Total o retenciones inválidos.')
    rows = []
    reverse = root.tag == 'CreditNote'
    comp = (config['comprobante_ajuste_ds'] if reverse else config['comprobante_ds']) if support else (config['comprobante_nc'] if reverse else config['comprobante'])
    def row(account, debit, value, taxbase=ZERO, detalle=None):
        if not value:
            return
        if value < 0:
            debit, value = not debit, -value
        if reverse:
            debit = not debit
        rows.append([account, comp, issued, number, number, seller, detalle or name[:60], '1' if debit else '2',
                     f'{value:.4f}', f'{taxbase:.4f}', config['centro'], '', '0'])
    for account, value in expenses.items():
        row(account, True, value)
    for account, value, taxbase in taxes:
        row(account, True, value, taxbase)
    for field, (value, taxbase, rate, nombre) in holds.items():
        row(config[field], False, value, taxbase, f'{nombre} {str(rate.normalize())}%')
    row(adjustments.get('cxp') or (config['proveedor_ds'] if support else config['proveedor']), False, gross - total_holds)
    db = sum((Decimal(r[8]) for r in rows if r[7] == '1'), ZERO)
    cr = sum((Decimal(r[8]) for r in rows if r[7] == '2'), ZERO)
    maestro = config.get('maestro', {})
    if maestro and any(not maestro.get(r[0], {}).get('activa') or not maestro.get(r[0], {}).get('recibe') for r in rows):
        raise ValueError('El asiento usa cuentas ausentes, inactivas o no receptoras en el maestro de esta empresa.')
    if db != cr:
        raise ValueError('Asiento descuadrado; no se generó el plano.')
    metadata = dict(documento=number, cufe=cufe, fecha=issued, proveedor=name, nit=seller,
                    tipo=root.tag, subtotal=str(subtotal), iva=str(iva), total=str(gross),
                    retenciones=str(total_holds), neto=str(gross-total_holds), debitos=str(db), creditos=str(cr),
                    lineas=detail_lines, filas=rows)
    # La identidad fiscal depende del original, no de decisiones contables reversibles.
    if adjustments:
        metadata['huella'] = document(content, config)['huella']
    else:
        metadata['huella'] = hashlib.sha256(json.dumps({k:v for k,v in metadata.items() if k not in ('lineas','filas','debitos','creditos')}, sort_keys=True).encode()).hexdigest()
    metadata['ajustes'] = adjustments
    metadata['retenciones_detalle'] = {key: dict(valor=str(v), base=str(b), tarifa=str(r), nombre=n) for key, (v,b,r,n) in holds.items()}
    metadata['clasificacion'] = parties
    metadata.update(advertencias=warnings, anticipo=str(prepaid), redondeo=str(rounding), payable_xml=str(payable))
    return metadata


def sources(files):
    """Enumera XML y errores individuales; nunca extrae archivos al sistema."""
    budget = {'bytes': 0, 'count': 0}
    def walk(name, data, depth=0):
        budget['bytes'] += len(data)
        budget['count'] += 1
        if depth > 6 or budget['bytes'] > LIMIT or budget['count'] > 2000:
            raise ValueError('Límite de descompresión: 64 MB, 2000 entradas o 6 niveles.')
        if name.lower().endswith('.xml'):
            yield name, data, None
        elif name.lower().endswith('.zip'):
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    if len(archive.infolist()) > 2000:
                        raise ValueError('El ZIP contiene más de 2000 entradas.')
                    for entry in archive.infolist():
                        if entry.is_dir() or not entry.filename.lower().endswith(('.zip', '.xml')):
                            continue
                        try:
                            if entry.file_size > LIMIT - budget['bytes']:
                                raise ValueError('Archivo expandido excede 64 MB.')
                            yield from walk(name + ' / ' + entry.filename, archive.read(entry), depth + 1)
                        except (ValueError, RuntimeError, zipfile.BadZipFile) as e:
                            yield name + ' / ' + entry.filename, None, str(e)
            except (zipfile.BadZipFile, RuntimeError) as e:
                yield name, None, 'ZIP no legible: ' + str(e)
        else:
            yield name, None, 'Formato no admitido; selecciona XML o ZIP.'
    for name, data in files:
        try:
            yield from walk(name, data)
        except ValueError as e:
            yield name, None, str(e)


def tsv(rows):
    return '\r\n'.join('\t'.join(str(v).replace('\t', ' ').replace('\n', ' ').replace('\r', ' ') for v in row) for row in [HEADERS, *rows]) + '\r\n'


def connect(db):
    con = sqlite3.connect(db, timeout=30)
    con.row_factory = sqlite3.Row
    con.executescript('''
      CREATE TABLE IF NOT EXISTS empresas(nit TEXT PRIMARY KEY, config TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lotes(id TEXT PRIMARY KEY, fecha TEXT, nit TEXT, informe TEXT, paquete BLOB);
      CREATE TABLE IF NOT EXISTS documentos(nit TEXT, cufe TEXT, lote TEXT, huella TEXT,
        PRIMARY KEY(nit,cufe));
      CREATE TABLE IF NOT EXISTS facturas(id TEXT PRIMARY KEY, nit TEXT NOT NULL, cufe TEXT NOT NULL,
        hash TEXT NOT NULL, contenido BLOB NOT NULL, datos TEXT NOT NULL, cuentas TEXT NOT NULL,
        exportadas TEXT NOT NULL DEFAULT '', UNIQUE(nit,cufe), UNIQUE(nit,hash));
      CREATE TABLE IF NOT EXISTS facturas_migradas(lote TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS factura_ajustes(id TEXT PRIMARY KEY, ajustes TEXT NOT NULL DEFAULT '{}', exportados TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS factura_cambios(id INTEGER PRIMARY KEY AUTOINCREMENT, factura TEXT NOT NULL,
        nit TEXT NOT NULL, fecha TEXT NOT NULL, antes TEXT NOT NULL, despues TEXT NOT NULL, revertido INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS cambios_empresa ON factura_cambios(nit,id);
      CREATE TABLE IF NOT EXISTS tercero_cuentas(nit_empresa TEXT NOT NULL, nit_tercero TEXT NOT NULL,
        cuenta TEXT NOT NULL, PRIMARY KEY(nit_empresa,nit_tercero));
      CREATE TABLE IF NOT EXISTS aprendizaje_exclusiones(factura TEXT NOT NULL, item INTEGER NOT NULL,
        PRIMARY KEY(factura,item));
      CREATE TABLE IF NOT EXISTS operaciones_locales(id TEXT PRIMARY KEY, nit TEXT NOT NULL, fecha TEXT NOT NULL,
        tipo TEXT NOT NULL, antes TEXT NOT NULL, despues TEXT NOT NULL, revertida INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS archivos_importados(id TEXT PRIMARY KEY, nit TEXT NOT NULL, nombre TEXT NOT NULL,
        hash TEXT NOT NULL, contenido BLOB NOT NULL, operacion TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS nominas(id TEXT PRIMARY KEY, nit TEXT NOT NULL, cune TEXT NOT NULL,
        contenido BLOB NOT NULL, datos TEXT NOT NULL, cuentas TEXT NOT NULL DEFAULT '{}', UNIQUE(nit,cune));
      CREATE TABLE IF NOT EXISTS resumenes_token(id TEXT PRIMARY KEY, nit TEXT NOT NULL, documento TEXT NOT NULL,
        cufe TEXT NOT NULL, datos TEXT NOT NULL, UNIQUE(nit,cufe));
      CREATE TABLE IF NOT EXISTS aprendizaje_historico(id TEXT PRIMARY KEY, nit TEXT NOT NULL, descripcion TEXT NOT NULL,
        cuenta TEXT NOT NULL, tercero TEXT NOT NULL, documento TEXT NOT NULL, operacion TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS factura_aprobaciones(id TEXT PRIMARY KEY, huella TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terceros_locales(nit_empresa TEXT NOT NULL,nit TEXT NOT NULL,datos TEXT NOT NULL,fecha TEXT NOT NULL,PRIMARY KEY(nit_empresa,nit));
      CREATE TABLE IF NOT EXISTS terceros_historial(id INTEGER PRIMARY KEY AUTOINCREMENT,nit_empresa TEXT NOT NULL,nit TEXT NOT NULL,fecha TEXT NOT NULL,antes TEXT NOT NULL,despues TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terceros_outbox(nit_empresa TEXT NOT NULL,nit TEXT NOT NULL,payload TEXT NOT NULL,fecha TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',PRIMARY KEY(nit_empresa,nit));
      CREATE TABLE IF NOT EXISTS dian_resoluciones(id TEXT PRIMARY KEY,nit_empresa TEXT NOT NULL,tipo TEXT NOT NULL,numero TEXT NOT NULL,desde TEXT NOT NULL,hasta TEXT,url TEXT NOT NULL,hash TEXT NOT NULL,UNIQUE(nit_empresa,tipo,numero,desde));
      CREATE TABLE IF NOT EXISTS dian_res_nits(resolucion TEXT NOT NULL,nit TEXT NOT NULL,PRIMARY KEY(resolucion,nit));
      CREATE INDEX IF NOT EXISTS dian_nit ON dian_res_nits(nit,resolucion);
    ''')
    return con


def process(db, files, config, reprocess_from=None):
    config = config_validated(config)
    files = list(files)
    if not files:
        raise ValueError('Selecciona al menos un archivo.')
    batch = dict(id=uuid.uuid4().hex, fecha=datetime.now(timezone.utc).isoformat(), nit=config['nit'],
                 empresa=config['empresa'], documentos=[], aceptados=0, duplicados=0, errores=0,
                 lineas=0, debitos='0.0000', creditos='0.0000', configuracion=config,
                 criterio_retenciones='Solo retenciones explícitas del XML. No se calculan retenciones ausentes.')
    rows = []
    con = connect(db)
    seen = set()
    try:
        con.execute('BEGIN IMMEDIATE')
        accounts = {r['cufe']: json.loads(r['cuentas']) for r in con.execute(
            'SELECT cufe,cuentas FROM facturas WHERE nit=?', (config['nit'],)) if all(json.loads(r['cuentas']))}
        adjustments = {r['cufe']: json.loads(r['ajustes']) for r in con.execute(
            'SELECT f.cufe,a.ajustes FROM facturas f JOIN factura_ajustes a ON a.id=f.id WHERE f.nit=?', (config['nit'],))}
        ancestors = set()
        ancestor = reprocess_from
        while ancestor:
            if ancestor in ancestors:
                raise ValueError('Historial de versiones inconsistente.')
            ancestors.add(ancestor)
            previous = con.execute('SELECT informe,nit FROM lotes WHERE id=?', (ancestor,)).fetchone()
            if not previous or previous['nit'] != config['nit']:
                raise ValueError('La empresa no coincide con el lote a reconvertir.')
            ancestor = json.loads(previous['informe']).get('reprocesa')
        if reprocess_from:
            batch['reprocesa'] = reprocess_from
        con.execute('INSERT OR REPLACE INTO empresas VALUES (?,?)', (config['nit'], json.dumps(config)))
        for filename, content, error in sources(files):
            result = dict(archivo=filename)
            try:
                if error:
                    raise ValueError(error)
                cufe = text(ubl_root(content), 'UUID')
                doc = document(content, config, accounts, adjustments.get(cufe))
                prior = con.execute('SELECT lote,huella FROM documentos WHERE nit=? AND cufe=?', (config['nit'], doc['cufe'])).fetchone()
                if prior and prior['huella'] != doc['huella']:
                    raise ValueError('CUFE ya registrado con datos fiscales diferentes.')
                if doc['cufe'] in seen:
                    result.update(estado='duplicado', documento=doc['documento'], lote_original=batch['id'], mensaje='Documento repetido dentro del mismo lote.')
                    batch['duplicados'] += 1
                    batch['documentos'].append(result)
                    continue
                if prior and prior['lote'] not in ancestors:
                    result.update(estado='duplicado', documento=doc['documento'], lote_original=prior['lote'], mensaje='Ya convertido. Descarga el lote original desde el historial.')
                    batch['duplicados'] += 1
                else:
                    doc['asiento'] = doc.pop('filas')
                    rows.extend(doc['asiento'])
                    if not prior:
                        con.execute('INSERT INTO documentos VALUES (?,?,?,?)', (config['nit'], doc['cufe'], batch['id'], doc['huella']))
                    else:
                        con.execute('UPDATE documentos SET lote=?,huella=? WHERE nit=? AND cufe=?',
                                    (batch['id'], doc['huella'], config['nit'], doc['cufe']))
                    result.update(doc, estado='convertido', mensaje='; '.join(['Asiento balanceado', *doc['advertencias']]))
                    batch['aceptados'] += 1
                    seen.add(doc['cufe'])
            except (ValueError, TypeError) as e:
                result.update(estado='error', mensaje=str(e))
                batch['errores'] += 1
            batch['documentos'].append(result)
        if not batch['documentos']:
            batch['documentos'].append(dict(archivo='Lote', estado='error', mensaje='No se encontraron XML dentro de los archivos.'))
            batch['errores'] += 1
        batch['lineas'] = len(rows)
        batch['debitos'] = str(sum((Decimal(r[8]) for r in rows if r[7] == '1'), ZERO))
        batch['creditos'] = str(sum((Decimal(r[8]) for r in rows if r[7] == '2'), ZERO))
        report = json.dumps(batch, ensure_ascii=False, indent=2)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            if rows:
                archive.writestr(f'CONT_AI_{config["nit"]}.txt', tsv(rows).encode('utf-8'))
            archive.writestr('informe.json', report)
            archive.writestr('configuracion.json', json.dumps(config, ensure_ascii=False, indent=2))
            csv_buffer = io.StringIO(newline='')
            fields = ['archivo','estado','documento','nit','proveedor','fecha','subtotal','iva','retenciones','total','neto','mensaje']
            writer = csv.DictWriter(csv_buffer, fieldnames=fields, extrasaction='ignore', delimiter=';')
            writer.writeheader()
            for doc in batch['documentos']:
                writer.writerow({k: ("'"+v if isinstance(v,str) and v.startswith(('=','+','-','@')) else v) for k,v in doc.items()})
            archive.writestr('documentos.csv', csv_buffer.getvalue().encode('utf-8-sig'))
            for i, (filename, content) in enumerate(files):
                archive.writestr(f'fuentes/{i+1}_{Path(filename.replace(chr(92), "/")).name}', content)
        con.execute('INSERT INTO lotes VALUES (?,?,?,?,?)', (batch['id'], batch['fecha'], batch['nit'], report, buffer.getvalue()))
        con.commit()
        return batch
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
