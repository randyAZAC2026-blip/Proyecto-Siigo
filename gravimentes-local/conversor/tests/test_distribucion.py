import importlib.util
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('preparar_traslado', ROOT/'preparar_traslado.py')
distribution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(distribution)


class DistributionTests(unittest.TestCase):
    def test_package_contains_consistent_database_and_runtime_only(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            db = folder/'source.sqlite3'
            con = sqlite3.connect(db)
            try:
                con.execute('PRAGMA journal_mode=WAL')
                con.execute('CREATE TABLE empresas(nit TEXT)')
                con.execute('INSERT INTO empresas VALUES (?)', ('901640988',))
                con.commit()
                target = distribution.package(ROOT, db, folder/'output'/'trabajo.zip')
                with zipfile.ZipFile(target) as archive:
                    self.assertIsNone(archive.testzip())
                    self.assertIn('compose.yaml', archive.namelist())
                    self.assertIn('conversor/facturas.js', archive.namelist())
                    self.assertIn('conversor/datos/gravimentes.sqlite3', archive.namelist())
                    self.assertNotIn('conversor/tests/test_motor.py', archive.namelist())
                    self.assertNotIn('gravimentes.html', archive.namelist())
                    snapshot = folder/'snapshot.sqlite3'
                    snapshot.write_bytes(archive.read('conversor/datos/gravimentes.sqlite3'))
                copied = sqlite3.connect(snapshot)
                try:
                    self.assertEqual(copied.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                    self.assertEqual(copied.execute('SELECT nit FROM empresas').fetchone()[0], '901640988')
                finally:
                    copied.close()
                con.execute('INSERT INTO empresas VALUES (?)', ('900111222',))
                con.commit()
                # Regenerar reemplaza el paquete únicamente al finalizar.
                distribution.package(ROOT, db, target)
                self.assertEqual(con.execute('SELECT count(*) FROM empresas').fetchone()[0], 2)
            finally:
                con.close()

    def test_missing_database_does_not_replace_previous_package(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            target = folder/'previous.zip'
            target.write_bytes(b'previous-backup')
            with self.assertRaises(ValueError):
                distribution.package(ROOT, folder/'missing.sqlite3', target)
            self.assertEqual(target.read_bytes(), b'previous-backup')

    def test_server_accepts_container_host_option(self):
        result = subprocess.run([sys.executable, '-B', '-X', 'utf8', str(ROOT/'conversor'/'servidor.py'),
                                 '--host', '0.0.0.0', '--help'], capture_output=True, text=True, encoding='utf-8', errors='replace')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--host', result.stdout)

    def test_server_starts_with_container_binding_and_persistent_path(self):
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder)/'data'/'gravimentes.sqlite3'
            server = subprocess.Popen([sys.executable, '-B', str(ROOT/'conversor'/'servidor.py'),
                                       '--host', '0.0.0.0', '--puerto', '0', '--sin-abrir', '--db', str(db)],
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                line = server.stdout.readline()
                self.assertIn('Gravimentes listo:', line)
                url = line.strip().split()[-1]
                with urllib.request.urlopen(url+'/api/inicio', timeout=5) as response:
                    self.assertEqual(response.status, 200)
                self.assertTrue(db.is_file())
            finally:
                server.terminate()
                server.communicate(timeout=10)


if __name__ == '__main__':
    unittest.main()
