"""Reparación fiscal local, auditable y reversible; nunca reescribe XML ni planos."""
import json
import re
import uuid
from collections import Counter
from datetime import datetime, timezone

import facturas
from motor import connect, fiscal_parties, nit, ubl_root


def resolved_data(content, config, previous):
    """Recalcula tipo/tratamiento; sin identificación conserva una contraparte válida previa."""
    fresh=facturas.describe(content,config)
    party=fresh['clasificacion']['contraparte']
    kept=False
    if not re.fullmatch(r'\d{5,15}',party['nit']):
        identifier=nit(previous.get('nit_proveedor'))
        if re.fullmatch(r'\d{5,15}',identifier) and identifier!=nit(config['nit']):
            party={'nit':identifier,'nombre':previous.get('proveedor','')}
            fresh['nit_proveedor']=identifier
            fresh['proveedor']=party['nombre']
            fresh['clasificacion']['contraparte']=party
            kept=True
        else:
            party={'nit':'','nombre':''}
            fresh['nit_proveedor']='';fresh['proveedor']=''
            fresh['clasificacion']['contraparte']=party
    data={**previous,**fresh}
    operation=fresh['clasificacion']['tipo_operacion']
    if party['nit'] and not party.get('nombre'):
        party['nombre']=('Proveedor ' if operation=='compra' else 'Cliente ' if operation=='venta' else 'Tercero ')+party['nit']
        data['proveedor']=party['nombre']
        data['clasificacion']['contraparte']=party
    data['tipo']=operation
    data['trat']={'compra':'gasto','venta':'ingreso'}.get(operation,'')
    data['tercero_conservado']=kept
    if previous.get('tipo_operacion',previous.get('tipo')) in ('compra','venta') and previous.get('tipo_operacion',previous.get('tipo'))!=operation:
        data['revisar_cuentas_por_cambio_tipo']=True
    return data


def invoice_snapshot(con, identity):
    row=con.execute('''SELECT f.id,f.datos,f.cuentas,f.exportadas,COALESCE(a.ajustes,'{}') ajustes,
                       COALESCE(a.exportados,'{}') ajustes_exportados,p.huella aprobacion,d.lote
                       FROM facturas f LEFT JOIN factura_ajustes a ON a.id=f.id
                       LEFT JOIN factura_aprobaciones p ON p.id=f.id
                       LEFT JOIN documentos d ON d.nit=f.nit AND d.cufe=f.cufe WHERE f.id=?''',(identity,)).fetchone()
    return dict(row) if row else None


def party_snapshot(con, company, identifiers):
    result={}
    for identifier in sorted(identifiers):
        item={}
        for table in ('terceros_locales','terceros_outbox','tercero_cuentas'):
            column='nit_tercero' if table=='tercero_cuentas' else 'nit'
            row=con.execute('SELECT * FROM '+table+' WHERE nit_empresa=? AND '+column+'=?',(company,identifier)).fetchone()
            item[table]=dict(row) if row else None
        result[identifier]=item
    return result


def references(con, company, config):
    result={}
    for row in con.execute('SELECT id,datos,contenido FROM facturas WHERE nit=?',(company,)):
        data=json.loads(row['datos'])
        try:
            party=fiscal_parties(ubl_root(row['contenido']),company)
            identifier=party['contraparte']['nit'] or nit(data.get('nit_proveedor'))
            if not party['vinculada'] or not identifier or identifier==company:
                continue
            entry=result.setdefault(identifier,{'ids':[],'esCli':False,'esProv':False})
            entry['ids'].append(row['id'])
            entry['esCli']|=party['tipo_operacion']=='venta'
            entry['esProv']|=party['tipo_operacion']=='compra'
        except (ValueError,TypeError):
            # Un original inválido no se utiliza para deducir banderas.
            continue
    for entry in result.values():entry['ids'].sort()
    return result


def reclassify(db, company, ids):
    company=nit(company)
    if not isinstance(ids,list) or not 1<=len(ids)<=2000 or any(not isinstance(i,str) for i in ids):
        raise ValueError('Selecciona de 1 a 2000 documentos para revisar su clasificación.')
    ids=list(dict.fromkeys(ids));con=connect(db)
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            config=facturas.company_config(con,company)
            drafts=[];counts=Counter();incidents=[];profiles={};touched=set()
            for identity in ids:
                row=con.execute('SELECT datos,contenido FROM facturas WHERE id=? AND nit=?',(identity,company)).fetchone()
                if not row:raise ValueError('Documento no encontrado para esta empresa.')
                old=json.loads(row['datos'])
                try:new=resolved_data(row['contenido'],config,old)
                except (ValueError,TypeError) as error:
                    incidents.append(dict(id=identity,motivo=str(error)));counts['original_no_procesable']+=1;continue
                party=new['clasificacion'];counts[party['fuente']]+=1
                if new['tercero_conservado']:
                    incidents.append(dict(id=identity,motivo='Falta identificación en el XML; se conserva el tercero previo sin inventar datos.'))
                identifier=new['nit_proveedor']
                previous_identifier=nit(old.get('nit_proveedor'))
                if party['vinculada'] and re.fullmatch(r'\d{5,15}',previous_identifier):touched.add(previous_identifier)
                if re.fullmatch(r'\d{5,15}',identifier) and identifier!=company and party['vinculada']:
                    touched.add(identifier)
                    actual=party['supplier'] if party['supplier']['nit']==identifier else party['customer'] if party['customer']['nit']==identifier else party['contraparte']
                    profiles[identifier]=dict(actual)
                if new!=old:drafts.append((identity,new))
            touched.discard('');touched.discard(company)
            # Detectar aliases declarados con DV antes de tocar ningún maestro.
            existing=[dict(r) for r in con.execute('SELECT * FROM terceros_locales WHERE nit_empresa=?',(company,))]
            aliases={r['nit']:nit(r['nit']) for r in existing if nit(r['nit']) in touched}
            for r in con.execute('SELECT nit_tercero FROM tercero_cuentas WHERE nit_empresa=?',(company,)):
                if nit(r['nit_tercero']) in touched:aliases[r['nit_tercero']]=nit(r['nit_tercero'])
            tracked=touched|set(aliases)
            before={'facturas':{i:invoice_snapshot(con,i) for i,_ in drafts},'terceros':party_snapshot(con,company,tracked)}
            history_ids=[]
            for identity,data in drafts:
                con.execute('UPDATE facturas SET datos=? WHERE id=?',(json.dumps(data),identity))
                con.execute('DELETE FROM factura_aprobaciones WHERE id=?',(identity,))
            refs=references(con,company,config)
            created=[];previous_flags={}
            for identifier in sorted(touched):
                group=[r for r in existing if aliases.get(r['nit'])==identifier]
                canonical=next((r for r in group if r['nit']==identifier),None)
                # Una regla de cuenta contradictoria requiere intervención; no elegir al azar.
                keys={identifier}|{key for key,target in aliases.items() if target==identifier}
                account_rows=[before['terceros'][key]['tercero_cuentas'] for key in keys if key in before['terceros'] and before['terceros'][key]['tercero_cuentas']]
                accounts={r['cuenta'] for r in account_rows}
                if len(accounts)>1:raise ValueError('Hay cuentas distintas para aliases del NIT '+identifier+'. Resuelve esa diferencia antes de reclasificar.')
                if identifier not in profiles and not group:continue
                data={}
                for row in sorted(group,key=lambda r:(r['nit']==identifier,r['fecha'])):data.update(json.loads(row['datos']))
                previous_flags[identifier]={k:data.get(k) for k in ('esCli','esProv')}
                data.update({k:v for k,v in profiles.get(identifier,{}).items() if v not in ('',None)})
                relation=refs.get(identifier,{'ids':[],'esCli':False,'esProv':False})
                data.update(nit=identifier,esCli=relation['esCli'],esProv=relation['esProv'])
                generic={'','Cliente','Proveedor','Cliente '+identifier,'Proveedor '+identifier}
                if data.get('nombre','') in generic:
                    data['nombre']=('Proveedor ' if relation['esProv'] else 'Cliente ' if relation['esCli'] else 'Tercero ')+identifier
                if not data.get('id'):data['id']=uuid.uuid4().hex
                # No recrear ni fechar de nuevo perfiles que ya son equivalentes.
                if canonical and json.loads(canonical['datos'])==data and keys=={identifier}:continue
                previous=json.loads(canonical['datos']) if canonical else {}
                now=datetime.now(timezone.utc).isoformat();encoded=json.dumps(data,ensure_ascii=False)
                for key in keys-{identifier}:
                    for table,column in (('terceros_locales','nit'),('terceros_outbox','nit'),('tercero_cuentas','nit_tercero')):
                        con.execute('DELETE FROM '+table+' WHERE nit_empresa=? AND '+column+'=?',(company,key))
                if accounts:
                    con.execute('INSERT INTO tercero_cuentas VALUES (?,?,?) ON CONFLICT(nit_empresa,nit_tercero) DO UPDATE SET cuenta=excluded.cuenta',(company,identifier,next(iter(accounts))))
                con.execute('INSERT INTO terceros_locales VALUES (?,?,?,?) ON CONFLICT(nit_empresa,nit) DO UPDATE SET datos=excluded.datos,fecha=excluded.fecha',(company,identifier,encoded,now))
                record=con.execute('INSERT INTO terceros_historial(nit_empresa,nit,fecha,antes,despues) VALUES (?,?,?,?,?)',(company,identifier,now,json.dumps(previous),encoded))
                history_ids.append(record.lastrowid)
                payload=json.dumps(dict(nit_empresa=company,nit=identifier,datos=data,actualizado=now),ensure_ascii=False)
                con.execute("INSERT INTO terceros_outbox VALUES (?,?,?,?,'') ON CONFLICT(nit_empresa,nit) DO UPDATE SET payload=excluded.payload,fecha=excluded.fecha,error=''",(company,identifier,payload,now))
                if not group:created.append(data['id'])
            after={'facturas':{i:invoice_snapshot(con,i) for i,_ in drafts},'terceros':party_snapshot(con,company,tracked),
                   'referencias':{i:refs.get(i,{'ids':[]})['ids'] for i in touched},'historial_ids':history_ids}
            diagnostic=dict(por_fuente=dict(counts),nuevosTercerosIds=created,flagsPrevias=previous_flags,incidencias=incidents)
            operation=None
            if drafts or before['terceros']!=after['terceros']:
                operation=uuid.uuid4().hex
                after['diagnostico']=diagnostic
                con.execute('INSERT INTO operaciones_locales VALUES (?,?,?,?,?,?,0)',(operation,company,datetime.now(timezone.utc).isoformat(),'Reclasificación fiscal',json.dumps(before),json.dumps(after)))
        return dict(id=operation,revisadas=len(ids),actualizadas=len(drafts),diagnostico=diagnostic)
    finally:con.close()


def undo(con, company, before, after):
    for identity,expected in after['facturas'].items():
        if invoice_snapshot(con,identity)!=expected:
            raise ValueError('La factura cambió después de la reclasificación. Revierte primero esos cambios.')
    if party_snapshot(con,company,set(after['terceros']))!=after['terceros']:
        raise ValueError('El tercero, su cuenta o su sincronización cambió después; no se sobrescribe trabajo nuevo.')
    refs=references(con,company,facturas.company_config(con,company))
    for identifier,expected in after['referencias'].items():
        if refs.get(identifier,{'ids':[]})['ids']!=expected:
            raise ValueError('El tercero tiene relaciones posteriores; no se elimina ni se sobrescribe.')
    for identity,snapshot in before['facturas'].items():
        con.execute('UPDATE facturas SET datos=? WHERE id=?',(snapshot['datos'],identity))
        if snapshot['aprobacion'] is None:con.execute('DELETE FROM factura_aprobaciones WHERE id=?',(identity,))
        else:con.execute('INSERT INTO factura_aprobaciones VALUES (?,?) ON CONFLICT(id) DO UPDATE SET huella=excluded.huella',(identity,snapshot['aprobacion']))
    for identifier,tables in before['terceros'].items():
        for table,row in tables.items():
            column='nit_tercero' if table=='tercero_cuentas' else 'nit'
            con.execute('DELETE FROM '+table+' WHERE nit_empresa=? AND '+column+'=?',(company,identifier))
            if row:
                con.execute('INSERT INTO '+table+' ('+','.join(row)+') VALUES ('+','.join('?' for _ in row)+')',list(row.values()))
    # Conservar la auditoría y añadir el evento inverso, incluso para terceros retirados.
    now=datetime.now(timezone.utc).isoformat()
    for identifier,tables in before['terceros'].items():
        old=after['terceros'][identifier]['terceros_locales'];restored=tables['terceros_locales']
        if old!=restored:
            con.execute('INSERT INTO terceros_historial(nit_empresa,nit,fecha,antes,despues) VALUES (?,?,?,?,?)',(company,identifier,now,old['datos'] if old else '{}',restored['datos'] if restored else '{}'))
