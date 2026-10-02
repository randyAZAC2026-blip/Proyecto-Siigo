"""Maestro local, resoluciones importadas y outbox opcional hacia Supabase."""
import hashlib
import json
import os
import re
import uuid
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

from motor import connect, nit

TYPES={'gran_contribuyente','autoretenedor','simple'}


def capture(con, company, party, origin):
    identifier=nit(party.get('nit',''))
    if not identifier or identifier==company:return
    before=con.execute('SELECT datos FROM terceros_locales WHERE nit_empresa=? AND nit=?',(company,identifier)).fetchone()
    old=json.loads(before['datos']) if before else {}
    data={**old,**{k:v for k,v in party.items() if v not in ('',None)},'nit':identifier}
    data['origenes']=sorted(set(old.get('origenes',[]))|{origin})
    if data==old:return
    now=datetime.now(timezone.utc).isoformat();encoded=json.dumps(data,ensure_ascii=False)
    con.execute('INSERT INTO terceros_locales VALUES (?,?,?,?) ON CONFLICT(nit_empresa,nit) DO UPDATE SET datos=excluded.datos,fecha=excluded.fecha',(company,identifier,encoded,now))
    con.execute('INSERT INTO terceros_historial(nit_empresa,nit,fecha,antes,despues) VALUES (?,?,?,?,?)',(company,identifier,now,json.dumps(old),encoded))
    payload=json.dumps(dict(nit_empresa=company,nit=identifier,datos=data,actualizado=now),ensure_ascii=False)
    con.execute("INSERT INTO terceros_outbox(nit_empresa,nit,payload,fecha) VALUES (?,?,?,?) ON CONFLICT(nit_empresa,nit) DO UPDATE SET payload=excluded.payload,fecha=excluded.fecha,error=''",(company,identifier,payload,now))


def flags(con, company, identifier, day):
    result={}
    for row in con.execute('SELECT * FROM dian_resoluciones WHERE nit_empresa=? AND desde<=? AND (hasta IS NULL OR hasta>=?) ORDER BY desde',(company,day,day)):
        listed=bool(con.execute('SELECT 1 FROM dian_res_nits WHERE resolucion=? AND nit=?',(row['id'],identifier)).fetchone())
        result[row['tipo']]=dict(aplica=listed,numero=row['numero'],desde=row['desde'],hasta=row['hasta'],url=row['url'])
    return result


def alerts(con, company, data):
    current=flags(con,company,data['nit_proveedor'],data['fecha']);messages=[]
    if not current:return messages
    has_fte=any('fuente' in r.get('nombre','').lower() and float(r.get('valor','0'))>0 for r in data.get('retenciones',[]))
    for key in ('simple','autoretenedor'):
        record=current.get(key)
        if record and record['aplica'] and has_fte:
            messages.append(f"El listado DIAN {record['numero']} identifica al tercero como {key}; el XML informa ReteFuente. Revisa el alcance y vigencia antes de aprobar. Fuente: {record['url']}")
    return messages


def listing(db, company):
    con=connect(db)
    try:
        rows=[]
        for row in con.execute('SELECT * FROM terceros_locales WHERE nit_empresa=? ORDER BY nit',(company,)):
            rows.append(dict(**json.loads(row['datos']),actualizado=row['fecha'],dian=flags(con,company,row['nit'],date.today().isoformat())))
        return rows
    finally:con.close()


def import_resolution(db, company, meta, content, filename):
    import importador
    kind=meta.get('tipo');number=str(meta.get('numero','')).strip();start=str(meta.get('desde',''));end=meta.get('hasta') or None;url=str(meta.get('url',''))
    if kind not in TYPES or not number:raise ValueError('Indica tipo y número de resolución.')
    date.fromisoformat(start)
    if end and date.fromisoformat(end)<date.fromisoformat(start):raise ValueError('Vigencia final anterior al inicio.')
    host=(urlparse(url).hostname or '').lower()
    if urlparse(url).scheme!='https' or not (host=='dian.gov.co' or host.endswith('.dian.gov.co')):raise ValueError('Indica la URL HTTPS oficial de DIAN que respalda el listado.')
    identifiers=set()
    for _,rows in importador.table_rows(content,'.'+filename.rsplit('.',1)[-1].lower()):
        header=next((i for i,r in enumerate(rows[:15]) if any(importador.norm(c) in ('nit','numerodeidentificacion','numerodocumento') for c in r)),None)
        if header is None:raise ValueError('El listado requiere una columna NIT.')
        col=next(i for i,c in enumerate(rows[header]) if importador.norm(c) in ('nit','numerodeidentificacion','numerodocumento'))
        for row in rows[header+1:]:
            if len(row)<=col or not str(row[col]).strip():continue
            identifier=nit(row[col])
            if not re.fullmatch(r'\d{5,15}',identifier):raise ValueError('NIT inválido en listado: '+str(row[col]))
            identifiers.add(identifier)
    if not identifiers:raise ValueError('Listado vacío; no se reemplaza una resolución con un archivo sin NITs.')
    digest=hashlib.sha256(content).hexdigest();identity=uuid.uuid4().hex;con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            prior=con.execute('SELECT * FROM dian_resoluciones WHERE nit_empresa=? AND tipo=? AND numero=? AND desde=?',(company,kind,number,start)).fetchone()
            if prior:
                if prior['hash']==digest and prior['url']==url and prior['hasta']==end:return dict(id=prior['id'],nits=len(identifiers),duplicada=True)
                raise ValueError('La resolución ya existe con otro contenido o vigencia.')
            latest=con.execute('SELECT * FROM dian_resoluciones WHERE nit_empresa=? AND tipo=? ORDER BY desde DESC LIMIT 1',(company,kind)).fetchone()
            if latest and latest['desde']>=start:raise ValueError('Carga las resoluciones en orden de vigencia, sin solapamientos.')
            if latest and (latest['hasta'] is None or latest['hasta']>=start):
                con.execute('UPDATE dian_resoluciones SET hasta=? WHERE id=?',((date.fromisoformat(start)-timedelta(days=1)).isoformat(),latest['id']))
            con.execute('INSERT INTO dian_resoluciones VALUES (?,?,?,?,?,?,?,?,?)',(identity,company,kind,number,start,end,url,digest))
            con.executemany('INSERT INTO dian_res_nits VALUES (?,?)',[(identity,n) for n in sorted(identifiers)])
            con.execute('INSERT INTO archivos_importados VALUES (?,?,?,?,?,?)',(uuid.uuid4().hex,company,filename,digest,content,identity))
            for row in list(con.execute('SELECT datos FROM terceros_locales WHERE nit_empresa=?',(company,))):
                data=json.loads(row['datos']);data['resoluciones_dian']=flags(con,company,data['nit'],date.today().isoformat());capture(con,company,data,'Resolución DIAN')
        return dict(id=identity,nits=len(identifiers),duplicada=False)
    finally:con.close()


def sync_status(db, company):
    con=connect(db)
    try:
        pending=con.execute('SELECT COUNT(*) FROM terceros_outbox WHERE nit_empresa=?',(company,)).fetchone()[0]
        error=con.execute("SELECT error FROM terceros_outbox WHERE nit_empresa=? AND error<>'' LIMIT 1",(company,)).fetchone()
        return dict(configurado=bool(os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_SERVICE_ROLE_KEY')),pendientes=pending,error=error['error'] if error else '')
    finally:con.close()


def sync_once(db, company=None, transport=None):
    url=os.getenv('SUPABASE_URL','').rstrip('/');key=os.getenv('SUPABASE_SERVICE_ROLE_KEY','')
    if not url or not key:return dict(enviados=0,omitido=True)
    if urlparse(url).scheme!='https' and not (transport and urlparse(url).hostname in ('127.0.0.1','localhost')):
        raise ValueError('SUPABASE_URL requiere HTTPS.')
    con=connect(db)
    try:
        query='SELECT * FROM terceros_outbox'+(' WHERE nit_empresa=?' if company else '')+' ORDER BY fecha LIMIT 100'
        rows=con.execute(query,(company,) if company else ()).fetchall()
        if not rows:return dict(enviados=0)
        request=urllib.request.Request(url+'/rest/v1/gv_terceros_conocidos?on_conflict=nit_empresa,nit',data=json.dumps([json.loads(r['payload']) for r in rows]).encode(),method='POST',headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'})
        try:
            with (transport or urllib.request.urlopen)(request,timeout=15) as response:
                if not 200<=response.status<300:raise ValueError('Respuesta remota no exitosa.')
            with con:
                con.executemany('DELETE FROM terceros_outbox WHERE nit_empresa=? AND nit=? AND fecha=?',[(r['nit_empresa'],r['nit'],r['fecha']) for r in rows])
            return dict(enviados=len(rows))
        except (urllib.error.URLError,OSError,ValueError) as error:
            message='No se pudo sincronizar. Se conserva la cola local. '+('HTTP '+str(error.code) if isinstance(error,urllib.error.HTTPError) else 'Revisa conexión y configuración del servicio.')
            with con:
                con.executemany('UPDATE terceros_outbox SET error=? WHERE nit_empresa=? AND nit=? AND fecha=?',[(message,r['nit_empresa'],r['nit'],r['fecha']) for r in rows])
            return dict(enviados=0,error=message)
    finally:con.close()
