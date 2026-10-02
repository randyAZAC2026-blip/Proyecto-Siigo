"""Entrada única local. Clasifica contenidos y conserva sus originales y cambios."""
import base64
import csv
import hashlib
import io
import json
import posixpath
import re
import unicodedata
import uuid
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from xml.etree import ElementTree as ET

import facturas
import nomina
from motor import LIMIT, config_validated, connect, money, nit, parse_xml, ubl_root, fiscal_parties


def norm(value):
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in unicodedata.normalize('NFKD',str(value).lower()) if not unicodedata.combining(c)))


def value(row, *names, default=''):
    return next((row[norm(n)] for n in names if norm(n) in row and row[norm(n)] not in ('',None)),default)


def decimal_value(raw):
    raw=str(raw).strip().replace('$','').replace(' ','')
    if ',' in raw and '.' in raw:
        raw=raw.replace('.','').replace(',','.') if raw.rfind(',')>raw.rfind('.') else raw.replace(',','')
    elif ',' in raw:
        raw=raw.replace(',','.')
    return money(raw or '0')


def date_value(raw):
    raw=str(raw).strip()
    if re.fullmatch(r'\d+(\.\d+)?',raw) and 20000<float(raw)<80000:
        return (date(1899,12,30)+timedelta(days=int(float(raw)))).isoformat()
    for pattern in ('%Y-%m-%d','%d/%m/%Y','%d-%m-%Y','%Y/%m/%d'):
        try:return datetime.strptime(raw[:10],pattern).date().isoformat()
        except ValueError:pass
    raise ValueError('Fecha inválida: '+raw)


def xlsx_tables(content):
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if sum(e.file_size for e in archive.infolist())>LIMIT or len(archive.infolist())>2000:
            raise ValueError('Libro demasiado grande (máximo 64 MB expandido).')
        shared=[]
        styles=[];formats={}
        if 'xl/styles.xml' in archive.namelist():
            style_root=ET.fromstring(archive.read('xl/styles.xml'))
            formats={int(n.get('numFmtId')):n.get('formatCode','') for n in style_root.findall('{*}numFmts/{*}numFmt')}
            styles=[int(n.get('numFmtId','0')) for n in style_root.findall('{*}cellXfs/{*}xf')]
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared=[''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('{*}si')]
        book=ET.fromstring(archive.read('xl/workbook.xml'))
        rels={r.get('Id'):r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        total=0
        for sheet in book.findall('{*}sheets/{*}sheet'):
            rid=next((v for k,v in sheet.attrib.items() if k.endswith('}id')),None)
            target=rels.get(rid,'')
            path=target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/'+target)
            if not path.startswith('xl/') or path not in archive.namelist():
                raise ValueError('Referencia de hoja inválida.')
            rows=[]
            for row in ET.fromstring(archive.read(path)).findall('{*}sheetData/{*}row'):
                data=[]
                for cell in row.findall('{*}c'):
                    total+=1
                    if total>300000:raise ValueError('El libro supera 300000 celdas.')
                    ref=cell.get('r','');letters=re.match(r'[A-Z]+',ref)
                    index=0
                    if letters:
                        for char in letters[0]:index=index*26+ord(char)-64
                        index-=1
                    else:index=len(data)
                    if index>200:raise ValueError('El libro supera 200 columnas.')
                    while len(data)<=index:data.append('')
                    raw=cell.findtext('{*}v','')
                    if cell.get('t')=='s':raw=shared[int(raw)]
                    elif cell.get('t')=='inlineStr':raw=''.join(cell.find('{*}is').itertext())
                    elif cell.find('{*}f') is not None and not raw:raise ValueError('Fórmula sin valor calculado: guarda el libro desde Excel.')
                    if cell.get('t','n')=='n' and raw:
                        number=Decimal(raw)
                        if not number.is_finite():raise ValueError('Celda numérica no finita.')
                        raw=format(number,'f')
                        if number==number.to_integral_value():raw=str(int(number))
                        style=int(cell.get('s','0'))
                        pattern=formats.get(styles[style],'') if style<len(styles) else ''
                        if re.fullmatch('0+',pattern) and number==number.to_integral_value():raw=raw.zfill(len(pattern))
                    data[index]=raw
                rows.append(data)
            yield sheet.get('name','Hoja'),rows


def table_rows(content, extension):
    if extension=='.xlsx':yield from xlsx_tables(content);return
    try:text=content.decode('utf-8-sig')
    except UnicodeDecodeError:text=content.decode('cp1252')
    try:dialect=csv.Sniffer().sniff(text[:8192],delimiters='\t;,')
    except csv.Error:dialect=csv.excel_tab
    yield 'Datos',list(csv.reader(io.StringIO(text),dialect))


def classify_table(rows):
    for index, raw in enumerate(rows[:15]):
        headers=[norm(c) for c in raw]
        kind=None
        if 'cuenta' in headers and ('documento' in headers or 'documentoref' in headers):kind='historico'
        elif ('cuenta' in headers or 'codigo' in headers) and any(h in headers for h in ('nombre','nombrecuenta','descripcion')):kind='maestro'
        elif any(h in headers for h in ('cufecude','cufe','cude')) and any(h in headers for h in ('total','valortotal')):kind='token'
        if kind:
            return kind,[{h:r[c] if c<len(r) else '' for c,h in enumerate(headers) if h} for r in rows[index+1:] if any(str(v).strip() for v in r)]
    raise ValueError('No se reconocen columnas de maestro, histórico Contai ni reporte DIAN.')


def bool_value(raw):
    s=norm(raw)
    if s in ('s','si','true','1','activo'):return True
    if s in ('n','no','false','0','inactivo'):return False
    raise ValueError('Indicador de cuenta inválido: '+str(raw))


def apply_master(rows, config):
    master={}
    for r in rows:
        account=re.sub(r'[.\s-]','',str(value(r,'Cuenta','Codigo')))
        if not re.fullmatch(r'\d{1,12}',account):raise ValueError('Código de cuenta inválido: '+account)
        item=dict(nombre=str(value(r,'Nombre','Nombre Cuenta','Descripcion')),activa=bool_value(value(r,'Activa',default='S')),
                  recibe=bool_value(value(r,'Recibe','Recibe Movimiento','Recibe Movimientos',default='S')))
        if account in master and master[account]!=item:raise ValueError('Cuenta duplicada con propiedades diferentes: '+account)
        master[account]=item
    if not master:raise ValueError('Maestro vacío.')
    config['maestro']=master
    return dict(cuentas=len(master))


def apply_history(con, rows, config, operation):
    votes=defaultdict(Counter); supplier=defaultdict(Counter); groups=defaultdict(list); examples=[]
    for r in rows:
        account=re.sub(r'[.\s-]','',str(value(r,'Cuenta')))
        if not re.fullmatch(r'\d{4,12}',account):raise ValueError('Cuenta inválida en histórico: '+account)
        number=str(value(r,'Documento','Documento Ref.'));party=nit(value(r,'NIT'));comp=str(value(r,'Comprobante'));center=str(value(r,'Centro de Costo','Centro de Costos','CC'))
        side=str(value(r,'Tipo'));amount=decimal_value(value(r,'Valor'))
        if not amount:
            debit,credit=decimal_value(value(r,'Valor Debito','Debito')),decimal_value(value(r,'Valor Credito','Credito'))
            if debit and credit:raise ValueError('Una línea histórica no puede ser débito y crédito simultáneamente.')
            amount,side=(debit,'1') if debit else (credit,'2')
        if not number or side not in ('1','2') or amount<0:raise ValueError('Documento, tipo o valor inválido en histórico.')
        if not amount:continue
        # Comprobante+fecha evita mezclar documentos de períodos distintos.
        groups[(comp,number,str(value(r,'Fecha','Fecha(yyyy-mm-dd)')))].append((side,amount))
        if center:votes['centro'][center]+=1
        description=str(value(r,'Detalle','Descripcion','Nombre'))
        if side=='1' and account.startswith(('5','6','14')):
            votes['gasto'][account]+=1
            if party:supplier[party][account]+=1
            examples.append((description,account,party,number))
        elif side=='2' and account.startswith(('22','2335')):votes['proveedor'][account]+=1
        elif side=='1' and account.startswith('2408'):
            base=decimal_value(value(r,'Base','Valor Base'))
            if base and abs(amount/base*100-5)<Decimal('.1'):votes['iva5'][account]+=1
            elif base and abs(amount/base*100-19)<Decimal('.1'):votes['iva19'][account]+=1
        elif side=='2':
            for prefix,key in [('2365','retefte'),('2367','reteiva'),('2368','reteica')]:
                if account.startswith(prefix):votes[key][account]+=1
        if comp:
            key='comprobante_nc' if number.upper().startswith(('NC','NOTC')) else 'comprobante_ds' if number.upper().startswith('DS') else 'comprobante'
            votes[key][comp]+=1
    if not groups:raise ValueError('Histórico sin movimientos.')
    if any(abs(sum((v if side=='1' else -v for side,v in group),Decimal(0)))>Decimal('.01') for group in groups.values()):
        raise ValueError('Hay asientos descuadrados en el histórico; no se aplica aprendizaje.')
    learned={}; warnings=[]
    def winner(counts):
        top=counts.most_common(2)
        return top[0][0] if top and (len(top)==1 or top[0][1]>top[1][1]) else None
    for key,counts in votes.items():
        choice=winner(counts)
        if choice:config[key]=choice;learned[key]=choice
        else:warnings.append('Sin predominio claro para '+key+'; se conserva la configuración.')
    config_validated(config)
    for party,counts in supplier.items():
        choice=winner(counts)
        if choice:con.execute('INSERT INTO tercero_cuentas VALUES (?,?,?) ON CONFLICT(nit_empresa,nit_tercero) DO UPDATE SET cuenta=excluded.cuenta',(config['nit'],party,choice))
    for description,account,party,number in examples:
        con.execute('INSERT INTO aprendizaje_historico VALUES (?,?,?,?,?,?,?)',(uuid.uuid4().hex,config['nit'],description,account,party,number,operation))
    return dict(asientos=len(groups),ejemplos=len(examples),aprendido=learned,avisos=warnings)


def token_rows(content):
    bundle=json.loads(content)
    if isinstance(bundle,list):return [{norm(k):v for k,v in r.items()} for r in bundle]
    if not isinstance(bundle,dict):raise ValueError('Token JSON inválido.')
    rows=bundle.get('documentos',bundle.get('ventas',bundle.get('compras')))
    if not isinstance(rows,list):raise ValueError('El JSON debe contener documentos, ventas o compras.')
    company=bundle.get('token',{}).get('empresa',bundle.get('empresa',{}))
    result=[]
    for row in rows:
        if not isinstance(row,dict):raise ValueError('Fila de token inválida.')
        item={norm(k):v for k,v in row.items()}
        if 'cliente' in item:
            item.update(nitemisor=company.get('nit',''),nombreemisor=company.get('razon_social',''),nitreceptor=item['cliente'].get('nit',''),nombrereceptor=item['cliente'].get('razon_social',''))
        if 'proveedor' in item:
            item.update(nitreceptor=company.get('nit',''),nombrereceptor=company.get('razon_social',''),nitemisor=item['proveedor'].get('nit',''),nombreemisor=item['proveedor'].get('razon_social',''))
        result.append(item)
    return result


def apply_token(con, rows, company):
    count=0;duplicates=0
    for r in rows:
        emitter=nit(value(r,'NIT Emisor'));receiver=nit(value(r,'NIT Receptor'))
        if company not in (emitter,receiver):raise ValueError('Documento del token ajeno a la empresa activa.')
        number=str(value(r,'Documento','Doc','Numero','Folio'));pref=str(value(r,'Prefijo'))
        if pref and not number.startswith(pref):number=pref+number
        cufe=str(value(r,'CUFE','CUFE/CUDE','CUDE'))
        if not cufe or not number:raise ValueError('El token requiere número e identificador electrónico para conciliar.')
        issued=date_value(value(r,'Fecha Emision','Fecha'));total=decimal_value(value(r,'Total','Valor Total'))
        if total<0:raise ValueError('Total negativo en token.')
        data=dict(documento=number,cufe=cufe,fecha=issued,total=str(total),emisor=emitter,receptor=receiver,
                  nombre_emisor=str(value(r,'Nombre Emisor','Nombre del Emisor')),nombre_receptor=str(value(r,'Nombre Receptor','Nombre del Receptor')),original=r)
        prior=con.execute('SELECT datos FROM resumenes_token WHERE nit=? AND cufe=?',(company,cufe)).fetchone()
        if prior:
            if json.loads(prior['datos'])!=data:raise ValueError('Token repetido con datos diferentes: '+number)
            duplicates+=1;continue
        con.execute('INSERT INTO resumenes_token VALUES (?,?,?,?,?)',(uuid.uuid4().hex,company,number,cufe,json.dumps(data)))
        count+=1
    return dict(resumenes=count,duplicados=duplicates,avisos=['Resumen DIAN conservado para conciliación. Se vincula por identificador con los XML, sin inventar líneas ni impuestos ausentes.'])


def sources(files):
    budget={'bytes':0,'entries':0}
    def walk(name,content,depth=0):
        budget['bytes']+=len(content);budget['entries']+=1
        if depth>6 or budget['bytes']>LIMIT or budget['entries']>2000:raise ValueError('Límite de lote: 64 MB expandidos, 2000 entradas, 6 niveles.')
        if name.lower().endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                for info in archive.infolist():
                    if info.is_dir():continue
                    if info.file_size>LIMIT-budget['bytes']:raise ValueError('Archivo expandido demasiado grande.')
                    yield from walk(name+' / '+info.filename,archive.read(info),depth+1)
        else:yield name,content
    for name,content in files:
        try:
            for item_name,item_content in walk(name,content):yield item_name,item_content,None
        except (ValueError,zipfile.BadZipFile,RuntimeError) as error:
            yield name,None,str(error)


def encode_rows(rows):
    return [{k:({'bytes':base64.b64encode(v).decode()} if isinstance(v,bytes) else v) for k,v in dict(row).items()} for row in rows]


def snapshot(con, company, include_invoices=False):
    cfg=con.execute('SELECT config FROM empresas WHERE nit=?',(company,)).fetchone()
    result={'config':json.loads(cfg['config']) if cfg else None,'terceros':[dict(r) for r in con.execute('SELECT * FROM tercero_cuentas WHERE nit_empresa=? ORDER BY nit_tercero',(company,))]}
    for table in ('facturas','nominas','resumenes_token','aprendizaje_historico'):
        if table=='facturas':
            result[table]=[dict(r) for r in con.execute("SELECT f.id,f.cuentas,f.hash,COALESCE(a.ajustes,'{}') ajustes FROM facturas f LEFT JOIN factura_ajustes a ON a.id=f.id WHERE f.nit=? ORDER BY f.id",(company,))]
            continue
        fields='*' if table not in ('facturas','nominas') else ('id,cuentas,hash' if table=='facturas' else 'id,cuentas,cune')
        result[table]=[dict(r) for r in con.execute('SELECT '+fields+' FROM '+table+' WHERE nit=? ORDER BY id',(company,))]
    return result


def upload(db, files, config):
    config=config_validated(config);company=config['nit'];operation=uuid.uuid4().hex
    con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE');before=snapshot(con,company)
            con.execute('INSERT INTO empresas VALUES (?,?) ON CONFLICT(nit) DO UPDATE SET config=excluded.config',(company,json.dumps(config)))
            result=dict(id=operation,nuevas=0,duplicadas=0,nominas=0,resumenes=0,maestros=0,historicos=0,errores=[],detalles=[])
            for name,content,source_error in sources(files):
                if source_error:result['errores'].append(name+': '+source_error);continue
                saved_config=json.loads(json.dumps(config))
                saved_counts={k:v for k,v in result.items() if isinstance(v,int)}
                con.execute('SAVEPOINT archivo')
                try:
                    extension='.'+name.rsplit('.',1)[-1].lower()
                    digest=hashlib.sha256(content).hexdigest()
                    if con.execute('SELECT 1 FROM archivos_importados WHERE nit=? AND hash=?',(company,digest)).fetchone():result['duplicadas']+=1;con.execute('RELEASE archivo');continue
                    detail={}
                    if extension=='.xml':
                        root=ubl_root(content)
                        if root.tag.startswith('Nomina'):
                            kind='nomina';identity=nomina.ingest(con,company,name,content,config);result['nominas']+=bool(identity);result['duplicadas']+=not bool(identity)
                        else:
                            if config['empresa']==('Empresa '+company):
                                parties=fiscal_parties(root,company)
                                own=parties['supplier'] if parties['supplier']['nit']==company else parties['customer']
                                if own['nit']==company and own['nombre']:config['empresa']=own['nombre']
                            kind='facturas';detail=facturas.ingest(con,[(name,content)],config)
                            if detail['errores']:raise ValueError('; '.join(detail['errores']))
                            result['nuevas']+=detail['nuevas'];result['duplicadas']+=detail['duplicadas']
                    elif extension=='.json':kind='token';detail=apply_token(con,token_rows(content),company);result['resumenes']+=detail['resumenes'];result['duplicadas']+=detail['duplicados']
                    elif extension in ('.xlsx','.csv','.tsv','.txt'):
                        sheets=[]
                        for title,raw in table_rows(content,extension):
                            if not any(any(str(v).strip() for v in row) for row in raw):continue
                            kind,rows=classify_table(raw)
                            if kind=='maestro':info=apply_master(rows,config);result['maestros']+=1
                            elif kind=='historico':info=apply_history(con,rows,config,operation);result['historicos']+=1
                            else:info=apply_token(con,rows,company);result['resumenes']+=info['resumenes'];result['duplicadas']+=info['duplicados']
                            sheets.append(dict(hoja=title,tipo=kind,**info))
                        kind='hojas';detail={'hojas':sheets}
                    else:raise ValueError('Formato no admitido: '+extension)
                    con.execute('INSERT INTO archivos_importados VALUES (?,?,?,?,?,?)',(uuid.uuid4().hex,company,name,digest,content,operation))
                    result['detalles'].append(dict(archivo=name,tipo=kind,**detail))
                    con.execute('RELEASE archivo')
                except (ValueError,KeyError,TypeError,IndexError,zipfile.BadZipFile,ET.ParseError) as error:
                    con.execute('ROLLBACK TO archivo');con.execute('RELEASE archivo');config=saved_config
                    result.update(saved_counts)
                    result['errores'].append(name+': '+str(error))
            con.execute('UPDATE empresas SET config=? WHERE nit=?',(json.dumps(config),company))
            after=snapshot(con,company)
            con.execute('INSERT INTO operaciones_locales VALUES (?,?,?,?,?,?,0)',(operation,company,datetime.now(timezone.utc).isoformat(),'Importación y aprendizaje',json.dumps(before),json.dumps(after)))
        return result
    finally:con.close()


def operations(db, company):
    con=connect(db)
    try:return [dict(id='op:'+r['id'],fecha=r['fecha'],tipo=r['tipo'],revertida=bool(r['revertida'])) for r in con.execute('SELECT id,fecha,tipo,revertida FROM operaciones_locales WHERE nit=? ORDER BY fecha DESC LIMIT 20',(company,))]
    finally:con.close()


def undo(db, company, identity):
    con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            action=con.execute('SELECT * FROM operaciones_locales WHERE id=? AND nit=? AND revertida=0',(identity,company)).fetchone()
            if not action:raise ValueError('Operación no encontrada o ya revertida.')
            if action['tipo']=='Reclasificación fiscal':
                import clasificacion
                clasificacion.undo(con,company,json.loads(action['antes']),json.loads(action['despues']))
                con.execute('UPDATE operaciones_locales SET revertida=1 WHERE id=?',(identity,))
                return dict(id=None,operacion=identity)
            if action['tipo']=='Retirar historial':
                saved=json.loads(action['antes'])
                for r in saved['lotes']:
                    if con.execute('SELECT 1 FROM lotes WHERE id=?',(r['id'],)).fetchone():raise ValueError('El lote ya existe; no se sobrescribe.')
                for r in saved['documentos']:
                    if con.execute('SELECT 1 FROM documentos WHERE nit=? AND cufe=?',(r['nit'],r['cufe'])).fetchone():raise ValueError('Hay un plano posterior para estos documentos; revierte primero ese historial.')
                for table in ('lotes','documentos','facturas_migradas'):
                    for r in saved[table]:
                        columns=list(r);vals=[base64.b64decode(v['bytes']) if isinstance(v,dict) and set(v)=={'bytes'} else v for v in r.values()]
                        con.execute('INSERT INTO '+table+' ('+','.join(columns)+') VALUES ('+','.join('?' for _ in columns)+')',vals)
                con.execute('UPDATE operaciones_locales SET revertida=1 WHERE id=?',(identity,))
                return dict(id=None,operacion=identity)
            before,after=json.loads(action['antes']),json.loads(action['despues']);current=snapshot(con,company)
            if before['config'] is None and any(current[t]!=after[t] for t in ('facturas','nominas','resumenes_token','aprendizaje_historico')):
                raise ValueError('La empresa tiene documentos posteriores; revierte primero esas operaciones.')
            # Configuración y reglas solo se restauran cuando esta operación las cambió.
            for key in ('config','terceros'):
                if before[key]!=after[key] and current[key]!=after[key]:raise ValueError('Hay cambios posteriores en '+key+'; revierte primero esos cambios.')
            for table in ('facturas','nominas','resumenes_token','aprendizaje_historico'):
                old={r['id'] for r in before[table]};created=[r for r in after[table] if r['id'] not in old]
                now={r['id']:r for r in current[table]}
                if table=='nominas':
                    old_rows={r['id']:r for r in before[table]}
                    for row in after[table]:
                        if row['id'] in old_rows and row!=old_rows[row['id']]:
                            if now.get(row['id'])!=row:raise ValueError('La nómina tiene cambios posteriores.')
                            con.execute('UPDATE nominas SET cuentas=? WHERE id=?',(old_rows[row['id']]['cuentas'],row['id']))
                for row in created:
                    if now.get(row['id'])!=row:raise ValueError('Un documento importado cambió después; revierte primero sus cambios.')
                    if table=='facturas':
                        linked=con.execute('SELECT 1 FROM documentos d JOIN facturas f ON f.nit=d.nit AND f.cufe=d.cufe WHERE f.id=?',(row['id'],)).fetchone()
                        if linked:raise ValueError('La factura tiene un plano generado. Conserva su trazabilidad antes de revertir la importación.')
                    if table=='nominas' and any(any(d.get('nomina_id')==row['id'] for d in json.loads(l['informe'])['documentos']) for l in con.execute('SELECT informe FROM lotes WHERE nit=?',(company,))):
                        raise ValueError('La nómina tiene un plano generado; revierte primero esa exportación.')
                    con.execute('DELETE FROM '+table+' WHERE id=? AND nit=?',(row['id'],company))
                    if table=='facturas':
                        for related,field in [('factura_ajustes','id'),('factura_cambios','factura'),('aprendizaje_exclusiones','factura')]:con.execute('DELETE FROM '+related+' WHERE '+field+'=?',(row['id'],))
            if before['config']!=after['config']:
                if before['config'] is None:con.execute('DELETE FROM empresas WHERE nit=?',(company,))
                else:con.execute('UPDATE empresas SET config=? WHERE nit=?',(json.dumps(before['config']),company))
            if before['terceros']!=after['terceros']:
                con.execute('DELETE FROM tercero_cuentas WHERE nit_empresa=?',(company,))
                con.executemany('INSERT INTO tercero_cuentas VALUES (?,?,?)',[(r['nit_empresa'],r['nit_tercero'],r['cuenta']) for r in before['terceros']])
            con.execute('DELETE FROM archivos_importados WHERE operacion=?',(identity,))
            con.execute('UPDATE operaciones_locales SET revertida=1 WHERE id=?',(identity,))
        return dict(id=None,operacion=identity)
    finally:con.close()


def overview(db, company):
    con=connect(db)
    try:
        tokens=[]
        for r in con.execute('SELECT * FROM resumenes_token WHERE nit=?',(company,)):
            data=json.loads(r['datos']);match=con.execute('SELECT id,datos FROM facturas WHERE nit=? AND cufe=?',(company,r['cufe'])).fetchone()
            data['id']=r['id'];data['factura_id']=match['id'] if match else None
            data['estado']='Vinculado a XML' if match else 'Pendiente de XML'
            if match and money(json.loads(match['datos'])['total'])!=money(data['total']):data['estado']='Diferencia de total'
            tokens.append(data)
        cfg=con.execute('SELECT config FROM empresas WHERE nit=?',(company,)).fetchone()
        return dict(tokens=tokens,configuracion=json.loads(cfg['config']) if cfg else {})
    finally:con.close()


def save_config(db, config, expected=None):
    config=config_validated(config);con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE');before=snapshot(con,config['nit'])
            if expected is not None and before['config']!=expected:
                raise ValueError('La configuración cambió en otra ventana. Actualiza antes de guardar.')
            con.execute('INSERT INTO empresas VALUES (?,?) ON CONFLICT(nit) DO UPDATE SET config=excluded.config',(config['nit'],json.dumps(config)))
            after=snapshot(con,config['nit'])
            if before!=after:
                con.execute('INSERT INTO operaciones_locales VALUES (?,?,?,?,?,?,0)',(uuid.uuid4().hex,config['nit'],datetime.now(timezone.utc).isoformat(),'Configuración de empresa',json.dumps(before),json.dumps(after)))
        return config
    finally:con.close()


def save_payroll(db, company, identity, accounts, remember=False):
    con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            row=con.execute('SELECT * FROM nominas WHERE id=? AND nit=?',(identity,company)).fetchone()
            if not row:raise ValueError('Nómina no encontrada.')
            if not isinstance(accounts,dict) or any(not isinstance(a,str) or (a and not re.fullmatch(r'\d{4,12}',a)) for a in accounts.values()):raise ValueError('Cuentas de nómina inválidas.')
            if set(accounts)!={c['clave'] for c in json.loads(row['datos'])['conceptos']}:raise ValueError('Conceptos de nómina no coinciden.')
            before=snapshot(con,company)
            con.execute('UPDATE nominas SET cuentas=? WHERE id=?',(json.dumps(accounts),identity))
            if remember:
                cfg=before['config'];cfg=json.loads(json.dumps(cfg));cfg.setdefault('nomina_cuentas',{}).update(accounts)
                con.execute('UPDATE empresas SET config=? WHERE nit=?',(json.dumps(cfg),company))
            after=snapshot(con,company)
            con.execute('INSERT INTO operaciones_locales VALUES (?,?,?,?,?,?,0)',(uuid.uuid4().hex,company,datetime.now(timezone.utc).isoformat(),'Cuentas de nómina',json.dumps(before),json.dumps(after)))
        return dict(ok=True)
    finally:con.close()


def clear_history(db, company=None):
    con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            companies=[company] if company else [r['nit'] for r in con.execute('SELECT DISTINCT nit FROM lotes')]
            count=0
            for current in companies:
                lots=con.execute('SELECT * FROM lotes WHERE nit=?',(current,)).fetchall()
                if not lots:continue
                ids={r['id'] for r in lots}
                saved=dict(lotes=encode_rows(lots),documentos=encode_rows(con.execute('SELECT * FROM documentos WHERE nit=?',(current,))),
                           facturas_migradas=[dict(r) for r in con.execute('SELECT * FROM facturas_migradas') if r['lote'] in ids])
                con.execute('INSERT INTO operaciones_locales VALUES (?,?,?,?,?,?,0)',(uuid.uuid4().hex,current,datetime.now(timezone.utc).isoformat(),'Retirar historial',json.dumps(saved),'{}'))
                con.execute('DELETE FROM documentos WHERE nit=?',(current,))
                con.executemany('DELETE FROM facturas_migradas WHERE lote=?',[(i,) for i in ids])
                con.execute('DELETE FROM lotes WHERE nit=?',(current,));count+=len(lots)
        return dict(ok=True,retirados=count)
    finally:con.close()
