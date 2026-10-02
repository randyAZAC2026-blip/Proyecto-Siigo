"""Nómina electrónica local: originales, conceptos explícitos y plano balanceado."""
import hashlib
import io
import json
import re
import uuid
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal

from motor import connect, money, nit, tsv, ubl_root


def attr(root, tag, name):
    node = root.find('.//'+tag)
    return next((v for k,v in node.attrib.items() if k.split('}')[-1]==name), '') if node is not None else ''


def parse(content, company):
    root = ubl_root(content)
    if root.tag not in ('NominaIndividual','NominaIndividualDeAjuste'):
        raise ValueError('El XML no es una nómina electrónica reconocida.')
    employer = nit(attr(root, 'Empleador','NIT'))
    if employer != company:
        raise ValueError('La nómina pertenece a un empleador distinto a la empresa activa.')
    cune = attr(root,'InformacionGeneral','CUNE')
    number = attr(root,'NumeroSecuenciaXML','Numero') or (attr(root,'NumeroSecuenciaXML','Prefijo')+attr(root,'NumeroSecuenciaXML','Consecutivo'))
    issued = attr(root,'InformacionGeneral','FechaGen')
    worker = nit(attr(root,'Trabajador','NumeroDocumento'))
    if not cune or not number or not re.fullmatch(r'\d{5,15}',worker):
        raise ValueError('Nómina sin número, identificador electrónico o documento del trabajador.')
    date.fromisoformat(issued)
    name = ' '.join(filter(None,(attr(root,'Trabajador',k) for k in ('PrimerNombre','OtrosNombres','PrimerApellido','SegundoApellido'))))
    def total(tag):
        node = root.find('.//'+tag)
        raw = node.text if node is not None and node.text else attr(root,'ComprobanteTotal',tag)
        if not raw:
            raise ValueError('Falta '+tag+' en la nómina.')
        return money(raw)
    gross, deductions, net = total('DevengadosTotal'), total('DeduccionesTotal'), total('ComprobanteTotal')
    if min(gross,deductions,net)<0 or abs(gross-deductions-net)>Decimal('0.0001'):
        raise ValueError('Devengados, deducciones y neto de nómina no cuadran.')
    concepts = []
    for section, side, expected in [('Devengados','1',gross),('Deducciones','2',deductions)]:
        node = root.find('.//'+section)
        known = {'SueldoTrabajado','AuxilioTransporte','ViaticoManuAlojS','ViaticoManuAlojNS','Pago','BonificacionS','BonificacionNS','PagoIntereses','PagoNS','AuxilioS','AuxilioNS','ConceptoS','ConceptoNS','Deduccion','DeduccionSP','DeduccionSub','SancionPublic','SancionPriv','RetencionFuente','Anticipo','OtraDeduccion','Comision'}
        values = {}
        if node is not None:
            for element in node.iter():
                for key,value in element.attrib.items():
                    local = key.split('}')[-1]
                    if local in known:
                        amount = money(value)
                        if amount < 0:
                            raise ValueError('Concepto de nómina con importe negativo.')
                        label = element.tag+'/'+local
                        values[label] = values.get(label,Decimal(0))+amount
                if element.tag in ('RetencionFuente','Anticipo','OtraDeduccion','PagoTercero','Comision') and element.text and element.text.strip():
                    label = element.tag
                    values[label] = values.get(label,Decimal(0))+money(element.text)
        subtotal = sum(values.values(),Decimal(0))
        if subtotal > expected:
            raise ValueError('El desglose de '+section+' supera su total.')
        if subtotal < expected:
            values['Otros '+section+' no desglosados'] = expected-subtotal
        concepts.extend(dict(clave=section+'/'+key,nombre=key,valor=str(value),tipo=side) for key,value in values.items() if value)
    concepts.append(dict(clave='Neto',nombre='Salarios por pagar',valor=str(net),tipo='2'))
    errors = ['La nota de ajuste requiere vincular y revisar la nómina sustituida antes de contabilizar.'] if root.tag!='NominaIndividual' else []
    return dict(documento=number,cune=cune,fecha=issued,periodo=(attr(root,'Periodo','FechaLiquidacionInicio') or issued)[:7],
                empleado=name,nit_empleado=worker,devengado=str(gross),deducido=str(deductions),neto=str(net),conceptos=concepts,errores=errors)


def ingest(con, company, name, content, config):
    data = parse(content,company)
    prior = con.execute('SELECT id,contenido FROM nominas WHERE nit=? AND cune=?',(company,data['cune'])).fetchone()
    if prior:
        if prior['contenido'] != content:
            raise ValueError('Identificador de nómina repetido con contenido diferente.')
        return None
    identity = uuid.uuid4().hex
    learned = config.get('nomina_cuentas',{})
    accounts = {c['clave']:learned.get(c['clave'],'') for c in data['conceptos']}
    con.execute('INSERT INTO nominas(id,nit,cune,contenido,datos,cuentas) VALUES (?,?,?,?,?,?)',(identity,company,data['cune'],content,json.dumps(data),json.dumps(accounts)))
    return identity


def listing(db, company):
    con = connect(db)
    try:
        result = []
        for row in con.execute('SELECT * FROM nominas WHERE nit=? ORDER BY id',(company,)):
            data = json.loads(row['datos']); accounts = json.loads(row['cuentas'])
            data.update(id=row['id'],cuentas=accounts,revision='error' if data['errores'] else 'lista' if all(accounts.values()) else 'revisar')
            result.append(data)
        return result
    finally:
        con.close()


def rows_for(row, config, accounts=None):
    data = json.loads(row['datos']); accounts = json.loads(row['cuentas']) if accounts is None else accounts
    if data['errores']:
        raise ValueError('; '.join(data['errores']))
    if not isinstance(accounts,dict) or set(accounts) != {c['clave'] for c in data['conceptos']} or any(not re.fullmatch(r'\d{4,12}',str(a)) for a in accounts.values()):
        raise ValueError('Asigna una cuenta a cada concepto de nómina.')
    comp = str(config.get('comprobante_nomina','00004'))
    if not comp.isdigit():
        raise ValueError('Comprobante de nómina inválido.')
    rows = [[accounts[c['clave']],comp,data['fecha'],data['documento'],data['documento'],data['nit_empleado'],c['nombre'],c['tipo'],f'{money(c["valor"]):.4f}','0.0000',config['centro'],'','0'] for c in data['conceptos'] if money(c['valor'])]
    maestro = config.get('maestro',{})
    if maestro and any(not maestro.get(r[0],{}).get('activa') or not maestro.get(r[0],{}).get('recibe') for r in rows):
        raise ValueError('Cuenta de nómina ausente o inactiva en el maestro.')
    if sum((money(r[8]) if r[7]=='1' else -money(r[8]) for r in rows),Decimal(0)):
        raise ValueError('Asiento de nómina descuadrado.')
    return rows


def export(db, company, ids):
    if not isinstance(ids,list) or not 1<=len(ids)<=200 or any(not isinstance(i,str) for i in ids):
        raise ValueError('Selecciona de 1 a 200 nóminas.')
    con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            cfg=con.execute('SELECT config FROM empresas WHERE nit=?',(company,)).fetchone()
            if not cfg: raise ValueError('Empresa no encontrada.')
            config=json.loads(cfg['config']); all_rows=[]; docs=[]; originals=[]
            for identity in dict.fromkeys(ids):
                row=con.execute('SELECT * FROM nominas WHERE id=? AND nit=?',(identity,company)).fetchone()
                if not row: raise ValueError('Nómina no encontrada para esta empresa.')
                detail=json.loads(row['datos']); rows=rows_for(row,config); all_rows.extend(rows)
                docs.append(dict(nomina_id=identity,cune=detail['cune'],documento=detail['documento'],estado='convertido',asiento=rows))
                originals.append((identity+'.xml',row['contenido']))
            identifier=uuid.uuid4().hex
            report=dict(id=identifier,nit=company,empresa=config['empresa'],fecha=datetime.now(timezone.utc).isoformat(),tipo='nomina',aceptados=len(docs),errores=0,lineas=len(all_rows),documentos=docs,configuracion=config)
            report['debitos']=str(sum((money(r[8]) for r in all_rows if r[7]=='1'),Decimal(0)));report['creditos']=report['debitos']
            output=io.BytesIO()
            with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
                archive.writestr('NOMINA_'+company+'.txt',tsv(all_rows))
                archive.writestr('informe.json',json.dumps(report,ensure_ascii=False))
                for filename,content in originals:archive.writestr('fuentes/'+filename,content)
            con.execute('INSERT INTO lotes VALUES (?,?,?,?,?)',(identifier,report['fecha'],company,json.dumps(report),output.getvalue()))
        return dict(lotes=[report])
    finally:
        con.close()
