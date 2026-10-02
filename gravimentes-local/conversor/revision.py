"""Inspección de fuentes archivadas, incluso documentos que no generaron asiento."""
import io
import re
import zipfile
from datetime import date
from xml.etree import ElementTree as ET

from motor import DEFAULTS, document, fiscal_parties, money, parse_xml, sources, text, ubl_root


def xml_text(content):
    if content.startswith((b'\xff\xfe', b'\xfe\xff')):
        return content.decode('utf-16', errors='replace')
    if content.startswith(b'<\x00'):
        return content.decode('utf-16-le', errors='replace')
    encoding = re.search(br'<\?xml[^>]*encoding=[\'"]([^\'"]+)', content[:300])
    try:
        return content.decode(encoding.group(1).decode('ascii') if encoding else 'utf-8-sig', errors='replace')
    except (LookupError, UnicodeError):
        return content.decode('utf-8', errors='replace')


def flatten(root):
    fields = []
    def visit(node, path):
        fields.append(dict(ruta=path, nombre=node.tag.rsplit('}', 1)[-1],
                           namespace=node.tag.split('}')[0][1:] if node.tag.startswith('{') else '',
                           valor=(node.text or '').strip(), atributos=dict(node.attrib)))
        counts = {}
        for child in node:
            name = child.tag.rsplit('}', 1)[-1]
            counts[name] = counts.get(name, 0) + 1
            visit(child, f'{path}/{name}[{counts[name]}]')
            if (child.tail or '').strip():
                fields.append(dict(ruta=f'{path}/{name}[{counts[name]}]/following-text()', nombre='texto', namespace='', valor=child.tail, atributos={}))
    visit(root, '/' + root.tag.rsplit('}', 1)[-1])
    return fields


def inspect_xml(content, config, source_error=None):
    config = {**DEFAULTS, **config}
    result = dict(xml_original=xml_text(content) if content else '', xml_ubl='', campos=[],
                  campos_contenedor=[], controles=[], resumen={}, asiento=[], apto=False)
    def check(field, value, ok, explanation):
        result['controles'].append(dict(campo=field, valor=value, estado='ok' if ok else 'error', detalle=explanation))
    if source_error or content is None:
        check('Archivo de origen', '', False, source_error or 'El archivo no contiene XML.')
        return result
    try:
        parsed = parse_xml(content)  # Incluye protección DTD antes de parsear con namespaces.
        raw_root = ET.fromstring(content)
        if parsed.tag == 'AttachedDocument':
            result['campos_contenedor'] = flatten(raw_root)
            embedded = text(parsed, 'Attachment/ExternalReference/Description')
            result['xml_ubl'] = embedded
            parse_xml(embedded.encode('utf-8'))
            raw_root = ET.fromstring(embedded)
        else:
            result['xml_ubl'] = result['xml_original']
        result['campos'] = flatten(raw_root)
        root = ubl_root(content)
        check('Estructura XML', root.tag, True, 'XML legible. Esto no valida firma digital ni aceptación ante DIAN.')
    except (ValueError, ET.ParseError) as e:
        check('Estructura XML', '', False, str(e))
        return result
    parties = fiscal_parties(root, config['nit'])
    totals = root.find('LegalMonetaryTotal')
    if totals is None:
        totals = root.find('RequestedMonetaryTotal')
    result['resumen'] = dict(documento=text(root, 'ID'), cufe=text(root, 'UUID'), fecha=text(root, 'IssueDate'),
                            moneda=text(root, 'DocumentCurrencyCode'), clasificacion=parties,
                            totales={child.tag: (child.text or '').strip() for child in totals} if totals is not None else {})
    check('Tipo de documento', root.tag, root.tag in ('Invoice','CreditNote','DebitNote'), 'Se admiten facturas, notas crédito y notas débito UBL.')
    check('Código DIAN / clasificación', parties['codigo'], not parties['soporte'] or (parties['codigo']=='05' and root.tag=='Invoice') or (parties['codigo']=='95' and root.tag=='CreditNote'), parties['explicacion'])
    for field in ('ID','UUID'):
        check(field, text(root, field), bool(text(root, field)), 'Identificador obligatorio para trazabilidad y control de duplicados.')
    issued = text(root, 'IssueDate')
    try:
        valid_date = date.fromisoformat(issued).isoformat() == issued
    except ValueError:
        valid_date = False
    check('IssueDate', issued, valid_date, 'Fecha válida en formato AAAA-MM-DD.')
    check('DocumentCurrencyCode', text(root,'DocumentCurrencyCode'), text(root,'DocumentCurrencyCode')=='COP', 'El plano admite importes en COP.')
    check('Empresa / partes XML', config['nit'], parties['vinculada'], f'Empresa en {parties["rol_empresa"]}. {parties["explicacion"]}')
    provider = parties['contraparte']
    check('Proveedor contable', provider['nit'], bool(re.fullmatch(r'\d{5,15}', provider['nit'])) and bool(provider['nombre']) and provider['nit'] != config['nit'], 'La contraparte debe tener NIT y razón social y ser distinta de la empresa.')
    for field in result['campos']:
        if field['nombre'].endswith('Amount'):
            try:
                money(field['valor'])
            except ValueError as e:
                check(field['ruta'], field['valor'], False, str(e))
    try:
        doc = document(content, config)
        result['asiento'] = doc['filas']
        check('Totales, impuestos y asiento', f'DB {doc["debitos"]} / CR {doc["creditos"]}', True,
              ' '.join(['Validaciones del motor aprobadas con la configuración de este lote.', *doc['advertencias']]))
    except (ValueError, TypeError) as e:
        check('Totales, impuestos y asiento', '', False, str(e))
    result['apto'] = all(c['estado']=='ok' for c in result['controles'])
    return result


def archived_source(package, index):
    """El orden se corresponde con documentos[] del informe, incluso errores ZIP."""
    with zipfile.ZipFile(io.BytesIO(package)) as archive:
        originals = [(n.split('/',1)[1], archive.read(n)) for n in archive.namelist() if n.startswith('fuentes/')]
    for position, item in enumerate(sources(originals)):
        if position == index:
            return item
    return ('Lote', None, 'No se encontraron XML dentro de las fuentes archivadas.')
