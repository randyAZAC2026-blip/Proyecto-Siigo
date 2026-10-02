"""Servidor local y CLI del conversor. Python 3.10+, sin pip."""
import argparse
import base64
import binascii
import io
import json
import logging
import sqlite3
import threading
import webbrowser
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from motor import DEFAULTS, connect, config_validated, process
from revision import archived_source, inspect_xml
import facturas
import importador
import nomina
import clasificacion

ROOT = Path(__file__).resolve().parent
VERSION = 'CMD-2026.09.28-P3'


def application(db):
    class Handler(BaseHTTPRequestHandler):
        def send(self, status, body, mime='application/json; charset=utf-8', filename=None):
            if isinstance(body, (dict, list)):
                body = json.dumps(body, ensure_ascii=False).encode()
            if isinstance(body, str):
                body = body.encode()
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            if filename:
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urlparse(self.path).path
            try:
                if path == '/':
                    return self.send(200, (ROOT/'interfaz.html').read_bytes(), 'text/html; charset=utf-8')
                if path == '/api/version':
                    return self.send(200, dict(aplicacion='Gravimentes local', version=VERSION))
                if path == '/revision.js':
                    return self.send(200, (ROOT/'revision.js').read_bytes(), 'text/javascript; charset=utf-8')
                if path in ('/facturas.js', '/facturas.css', '/flujo.js', '/oficina.js'):
                    return self.send(200, (ROOT/path[1:]).read_bytes(), 'text/javascript; charset=utf-8' if path.endswith('.js') else 'text/css; charset=utf-8')
                if path == '/api/facturas':
                    return self.send(200, facturas.listing(db, parse_qs(urlparse(self.path).query).get('nit', [''])[0]))
                if path in ('/api/cambios', '/api/revision-tabular'):
                    company = parse_qs(urlparse(self.path).query).get('nit', [''])[0]
                    if path=='/api/cambios':
                        items=facturas.change_history(db,company)+[dict(id=r['id'],factura=None,documento=r['tipo'],fecha=r['fecha'],tipo='operacion',revertido=r['revertida']) for r in importador.operations(db,company)]
                        return self.send(200,sorted(items,key=lambda r:r['fecha'],reverse=True)[:20])
                    return self.send(200, facturas.tabular(db, company))
                if path in ('/api/oficina','/api/nominas'):
                    company=parse_qs(urlparse(self.path).query).get('nit',[''])[0]
                    return self.send(200, importador.overview(db,company) if path=='/api/oficina' else nomina.listing(db,company))
                if path == '/api/aprendizaje':
                    params = parse_qs(urlparse(self.path).query)
                    try:
                        result = facturas.learning_dashboard(db, params.get('nit',[''])[0], params.get('q',[''])[0], int(params.get('pagina',['0'])[0]))
                    except ValueError as error:
                        return self.send(400, {'error':str(error)})
                    return self.send(200, result)
                invoice_parts = path.strip('/').split('/')
                if len(invoice_parts) == 4 and invoice_parts[:2] == ['api','facturas'] and invoice_parts[3] == 'sugerencias':
                    return self.send(200, facturas.suggestions(db, invoice_parts[2]))
                if len(invoice_parts) == 3 and invoice_parts[:2] == ['api', 'facturas']:
                    invoice = facturas.detail(db, invoice_parts[2])
                    return self.send(200, invoice) if invoice else self.send(404, {'error':'Factura no encontrada.'})
                con = connect(db)
                try:
                    if path == '/api/inicio':
                        configs = [json.loads(r['config']) for r in con.execute('SELECT config FROM empresas ORDER BY nit')]
                        lots = [json.loads(r['informe']) for r in con.execute('SELECT informe FROM lotes ORDER BY fecha DESC LIMIT 100')]
                        lots = [{k:v for k,v in lot.items() if k not in ('documentos','configuracion')} for lot in lots]
                        return self.send(200, dict(empresas=configs, defaults=DEFAULTS, lotes=lots))
                    parts = path.strip('/').split('/')
                    if len(parts) in (3,4,5,6) and parts[:2] == ['api','lotes']:
                        row = con.execute('SELECT informe,paquete FROM lotes WHERE id=?', (parts[2],)).fetchone()
                        if row:
                            if len(parts) in (5,6) and parts[3] == 'revision' and parts[4].isdigit():
                                report = json.loads(row['informe'])
                                index = int(parts[4])
                                if index >= len(report['documentos']):
                                    return self.send(404, {'error':'Documento no encontrado en el lote.'})
                                name, content, error = archived_source(row['paquete'], index)
                                if len(parts) == 6:
                                    if parts[5] == 'xml' and content is not None:
                                        return self.send(200, content, 'application/xml', f'documento_{index+1}.xml')
                                    return self.send(404, {'error':'Este registro no tiene un XML descargable.'})
                                inspection = inspect_xml(content, report['configuracion'], error)
                                inspection.update(archivo=report['documentos'][index].get('archivo',name),
                                                  indice=index, lote=parts[2], resultado_guardado=report['documentos'][index])
                                return self.send(200, inspection)
                            if len(parts) == 3:
                                return self.send(200, json.loads(row['informe']))
                            if parts[3] == 'zip':
                                return self.send(200, row['paquete'], 'application/zip', f'lote_{parts[2][:12]}.zip')
                            if parts[3] == 'txt':
                                with zipfile.ZipFile(io.BytesIO(row['paquete'])) as z:
                                    name = next((n for n in z.namelist() if n.endswith('.txt')), None)
                                    if name:
                                        return self.send(200, z.read(name), 'text/plain; charset=utf-8', name)
                    return self.send(404, {'error':'No se encontró el recurso.'})
                finally:
                    con.close()
            except Exception:
                logging.exception('Error de lectura')
                self.send(500, {'error':'No se pudo leer el archivo o la base de datos.'})

        def do_POST(self):
            origin = self.headers.get('Origin')
            expected = f'http://{self.headers.get("Host")}'
            if origin and origin != expected:
                return self.send(403, {'error':'Origen no permitido.'})
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.send(415, {'error':'Se requiere JSON.'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if size < 1 or size > 48 * 1024 * 1024:
                    return self.send(413, {'error':'Lote demasiado grande; máximo 30 MB de archivos.'})
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict):
                    raise ValueError('Petición inválida.')
                if self.path == '/api/empresas':
                    expected=payload.pop('_anterior',None)
                    return self.send(200, importador.save_config(db,payload,expected))
                if self.path in ('/api/procesar', '/api/facturas/importar', '/api/importar'):
                    files = payload.get('archivos', [])
                    if not isinstance(files, list) or not 1 <= len(files) <= 200:
                        raise ValueError('Selecciona entre 1 y 200 archivos.')
                    decoded = [(str(f['nombre']), base64.b64decode(f['contenido'], validate=True)) for f in files]
                    if sum(len(data) for _,data in decoded) > 30 * 1024 * 1024:
                        raise ValueError('El lote supera los 30 MB.')
                    action = importador.upload if self.path=='/api/importar' else facturas.upload if self.path == '/api/facturas/importar' else process
                    return self.send(200, action(db, decoded, payload.get('configuracion', {})))
                parts = self.path.strip('/').split('/')
                if self.path == '/api/cambios/deshacer':
                    identity=payload.get('id');company=payload.get('nit')
                    if identity is None:
                        con=connect(db)
                        try:
                            candidates=[dict(r) for r in con.execute("SELECT 'op:'||id id,fecha FROM operaciones_locales WHERE nit=? AND revertida=0 UNION ALL SELECT id,fecha FROM factura_cambios WHERE nit=? AND revertido=0 ORDER BY fecha DESC LIMIT 1",(company,company))]
                            if candidates:identity=candidates[0]['id']
                        finally:con.close()
                    if isinstance(identity,str) and identity.startswith('op:'):
                        return self.send(200,importador.undo(db,company,identity[3:]))
                    return self.send(200, facturas.undo_change(db, company, identity))
                if self.path=='/api/nominas/cuentas':
                    return self.send(200,importador.save_payroll(db,payload.get('nit'),payload.get('id'),payload.get('cuentas'),payload.get('recordar',False)))
                if self.path=='/api/nominas/preview':
                    con=connect(db)
                    try:
                        row=con.execute('SELECT * FROM nominas WHERE id=? AND nit=?',(payload.get('id'),payload.get('nit'))).fetchone()
                        if not row:raise ValueError('Nómina no encontrada.')
                        config=facturas.company_config(con,payload.get('nit'))
                        return self.send(200,dict(filas=nomina.rows_for(row,config,payload.get('cuentas'))))
                    finally:con.close()
                if self.path=='/api/nominas/generar':
                    return self.send(200,nomina.export(db,payload.get('nit'),payload.get('ids')))
                if self.path == '/api/aprendizaje/exclusion':
                    return self.send(200, facturas.set_learning_exclusion(db, payload.get('nit'), payload.get('factura'), payload.get('item'), payload.get('excluido'), payload.get('anterior')))
                if self.path == '/api/revision-tabular/xlsx':
                    rows = facturas.tabular(db, payload.get('nit'))
                    ids = payload.get('ids')
                    if not isinstance(ids, list) or any(not isinstance(i, str) for i in ids):
                        raise ValueError('Selecciona las facturas que deseas exportar.')
                    wanted = set(ids)
                    return self.send(200, facturas.tabular_xlsx([r for r in rows if r['id'] in wanted]),
                                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Revision_facturas.xlsx')
                if len(parts) == 4 and parts[:2] == ['api','facturas'] and parts[3] == 'preview':
                    return self.send(200, facturas.preview(db, parts[2], payload.get('cuentas'), payload.get('ajustes')))
                if len(parts) == 4 and parts[:2] == ['api','facturas'] and parts[3] == 'cuenta-tercero':
                    return self.send(200, facturas.save_supplier_account(db, parts[2], payload.get('cuenta'), payload.get('anterior')))
                if len(parts) == 4 and parts[:2] == ['api','facturas'] and parts[3] == 'cuentas':
                    return self.send(200, facturas.save_accounts(db, parts[2], payload.get('cuentas'), payload.get('ajustes'), payload.get('anterior')))
                if self.path == '/api/facturas/generar':
                    return self.send(200, facturas.generate(db, payload.get('ids'), payload.get('configuracion', {})))
                if self.path == '/api/facturas/aprobar':
                    return self.send(200,facturas.approve(db,payload.get('nit'),payload.get('firmas')))
                if self.path == '/api/facturas/reclasificar':
                    return self.send(200,clasificacion.reclassify(db,payload.get('nit'),payload.get('ids')))
                if self.path == '/api/facturas/aceptar-sugerencias':
                    return self.send(200,facturas.accept_suggestions(db,payload.get('nit'),payload.get('id'),payload.get('firma')))
                if self.path == '/api/facturas/preview-lote':
                    return self.send(200, facturas.preview_batch(db, payload.get('nit'), payload.get('ids')))
                if len(parts) == 4 and parts[:2] == ['api','lotes'] and parts[3] == 'regenerar':
                    con = connect(db)
                    try:
                        old = con.execute('SELECT paquete FROM lotes WHERE id=?', (parts[2],)).fetchone()
                    finally:
                        con.close()
                    if not old:
                        return self.send(404, {'error':'Lote no encontrado.'})
                    with zipfile.ZipFile(io.BytesIO(old['paquete'])) as archive:
                        original = [(n.split('/',1)[1], archive.read(n)) for n in archive.namelist() if n.startswith('fuentes/')]
                    return self.send(200, process(db, original, payload, reprocess_from=parts[2]))
                if self.path == '/api/lotes':
                    return self.send(200,importador.clear_history(db,payload.get('nit')))
                self.send(404, {'error':'Ruta no encontrada.'})
            except (ValueError, KeyError, TypeError, binascii.Error) as e:
                self.send(400, {'error':str(e)})
            except Exception:
                logging.exception('Error de procesamiento')
                self.send(500, {'error':'No se pudo guardar el lote. Revisa la consola y vuelve a intentarlo.'})

        def log_message(self, fmt, *args):
            logging.info(fmt, *args)
    return Handler


def main():
    parser = argparse.ArgumentParser(description='Gravimentes - Conversor local XML/ZIP a Contai')
    parser.add_argument('--puerto', type=int, default=8765)
    parser.add_argument('--host', default='127.0.0.1', help='Dirección de escucha; en Docker usar 0.0.0.0')
    parser.add_argument('--sin-abrir', action='store_true')
    parser.add_argument('--db', type=Path, default=ROOT/'datos'/'gravimentes.sqlite3')
    parser.add_argument('--entrada', type=Path, help='Procesar carpeta sin navegador (incluye subcarpetas)')
    parser.add_argument('--config', type=Path, help='Configuración JSON de empresa para modo carpeta')
    parser.add_argument('--salida', type=Path, help='Carpeta destino de paquetes en modo carpeta')
    args = parser.parse_args()
    args.db.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
    if args.entrada:
        if not args.config or not args.salida or not args.entrada.is_dir():
            parser.error('--entrada requiere carpeta válida, --config y --salida')
        if args.salida.resolve().is_relative_to(args.entrada.resolve()):
            parser.error('La salida debe quedar fuera de la carpeta de entrada para evitar reprocesar paquetes.')
        files = [(str(p.relative_to(args.entrada)), p.read_bytes()) for p in sorted(args.entrada.rglob('*')) if p.suffix.lower() in ('.xml','.zip') and p.is_file()]
        result = process(args.db, files, json.loads(args.config.read_text(encoding='utf-8-sig')))
        args.salida.mkdir(parents=True, exist_ok=True)
        con = connect(args.db)
        try:
            package = con.execute('SELECT paquete FROM lotes WHERE id=?', (result['id'],)).fetchone()[0]
        finally:
            con.close()
        target = args.salida / f'lote_{result["id"]}.zip'
        target.write_bytes(package)
        print(json.dumps({'paquete':str(target), 'convertidos':result['aceptados'], 'errores':result['errores'], 'duplicados':result['duplicados']}, ensure_ascii=False))
        return 2 if result['errores'] else 0
    connect(args.db).close()
    try:
        server = ThreadingHTTPServer((args.host, args.puerto), application(args.db))
    except OSError as e:
        parser.exit(1, f'No se pudo iniciar en el puerto {args.puerto}: {e}\n')
    server.daemon_threads = True
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'Gravimentes listo: {url}\nVersion: {VERSION}\nCodigo: {ROOT}\nBase de datos: {args.db}\nCtrl+C para detener.', flush=True)
    if not args.sin_abrir:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
