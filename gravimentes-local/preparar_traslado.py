"""Empaqueta código Docker y un respaldo SQLite consistente, incluso en uso."""
import argparse
import sqlite3
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUNTIME = ['motor.py', 'servidor.py', 'revision.py', 'facturas.py', 'interfaz.html',
           'facturas.js', 'flujo.js', 'oficina.js', 'importador.py', 'nomina.py', 'clasificacion.py', 'facturas.css', 'revision.js']
FILES = ['Dockerfile', 'compose.yaml', '.dockerignore', '.env.example', 'README_DOCKER.md',
         'Iniciar Docker.cmd', 'Detener Docker.cmd', 'Preparar traslado.cmd', 'preparar_traslado.py']


def package(root, database, target):
    root, database, target = Path(root), Path(database), Path(target)
    paths = [root/name for name in FILES] + [root/'conversor'/name for name in RUNTIME]
    if (root/'.env').is_file():
        paths.append(root/'.env')
    for path in paths:
        if not path.is_file():
            raise ValueError(f'Falta un archivo de la aplicación: {path}')
    if not database.is_file():
        raise ValueError(f'No se encontró la base de datos: {database}')
    target.parent.mkdir(parents=True, exist_ok=True)
    # Crear en el mismo disco permite reemplazar el ZIP solo cuando está completo.
    with tempfile.TemporaryDirectory(prefix='gravimentes-', dir=target.parent) as temporary:
        snapshot = Path(temporary)/'gravimentes.sqlite3'
        source = sqlite3.connect(database.resolve().as_uri()+'?mode=ro', uri=True, timeout=30)
        destination = sqlite3.connect(snapshot)
        try:
            source.backup(destination)
            if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('La copia SQLite no supera la verificación de integridad.')
        finally:
            destination.close()
            source.close()
        archive_path = Path(temporary)/'traslado.zip'
        with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in paths:
                archive.write(path, path.relative_to(root).as_posix())
            archive.write(snapshot, 'conversor/datos/gravimentes.sqlite3')
        archive_path.replace(target)
    return target


def main():
    parser = argparse.ArgumentParser(description='Preparar Gravimentes para llevar al trabajo con sus datos.')
    parser.add_argument('--db', type=Path, default=ROOT/'conversor'/'datos'/'gravimentes.sqlite3')
    parser.add_argument('--salida', type=Path, default=ROOT/'distribucion'/'Gravimentes-trabajo.zip')
    args = parser.parse_args()
    try:
        target = package(ROOT, args.db, args.salida)
    except (ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'No se pudo preparar el traslado: {error}\n')
    print(f'Paquete listo: {target}\nIncluye la aplicacion y una copia verificada de empresas, facturas, cuentas e historial.')
    print('Extrae el ZIP en el equipo destino y ejecuta Iniciar Docker.cmd con Docker Desktop abierto.')


if __name__ == '__main__':
    main()
