// database.js
// Conexión a SQLite y definición del esquema de la natillera.
//
// Elegimos `better-sqlite3` porque es sincrónico y permite envolver toda la
// migración en una única transacción (`BEGIN / COMMIT / ROLLBACK`), lo cual es
// clave para el requisito de integridad "100% exact match" del prompt.

import Database from "better-sqlite3";
import path from "node:path";

/**
 * Abre (o crea) la base de datos y garantiza el esquema completo.
 * @param {string} dbPath Ruta al archivo .db
 * @returns {import("better-sqlite3").Database}
 */
export function inicializarDB(dbPath) {
  const abs = path.resolve(dbPath);
  const db = new Database(abs);

  // FKs deshabilitadas por defecto en SQLite: hay que activarlas por conexión.
  db.pragma("foreign_keys = ON");
  // WAL mejora concurrencia lecturas + una sola escritura; útil si más adelante
  // el backend Express lee mientras el importador reescribe.
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS socios (
      id                  INTEGER PRIMARY KEY,
      nombre              TEXT NOT NULL,
      identificacion      TEXT,
      correo              TEXT,
      telefono            TEXT,
      estado              TEXT NOT NULL DEFAULT 'activo'
                            CHECK (estado IN ('activo','inactivo')),
      cuota_sostenimiento INTEGER NOT NULL DEFAULT 0
                            CHECK (cuota_sostenimiento >= 0)
    );

    CREATE TABLE IF NOT EXISTS cuotas (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id      INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      periodo       TEXT    NOT NULL,   -- ej: 'DICIEMBRE', 'ENERO'
      valor_aporte  INTEGER NOT NULL CHECK (valor_aporte >= 0),
      fecha_pago    TEXT,               -- ISO yyyy-mm-dd
      concepto      TEXT NOT NULL DEFAULT 'AHORRO'
                      CHECK (concepto IN ('AHORRO','ACTIVIDADES')),
      fila_origen   INTEGER NOT NULL,
      -- La unicidad se basa en la fila del Excel: re-correr el importador no
      -- duplica registros históricos, pero permite múltiples aportes legítimos
      -- del mismo socio/periodo/monto (distintas filas).
      UNIQUE (fila_origen, concepto)
    );

    CREATE TABLE IF NOT EXISTS prestamos (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id         INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      monto_prestado   INTEGER NOT NULL CHECK (monto_prestado >= 0),
      tasa_interes     REAL    NOT NULL DEFAULT 0.03 CHECK (tasa_interes >= 0),
      saldo_pendiente  INTEGER NOT NULL CHECK (saldo_pendiente >= 0),
      fecha_desembolso TEXT,
      estado           TEXT NOT NULL DEFAULT 'activo'
                         CHECK (estado IN ('activo','pagado'))
    );

    CREATE TABLE IF NOT EXISTS abonos_prestamos (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      prestamo_id        INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
      socio_id           INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      monto_abono        INTEGER NOT NULL CHECK (monto_abono >= 0),
      intereses_pagados  INTEGER NOT NULL DEFAULT 0 CHECK (intereses_pagados >= 0),
      capital_pagado     INTEGER NOT NULL DEFAULT 0 CHECK (capital_pagado >= 0),
      fecha_abono        TEXT
    );

    CREATE TABLE IF NOT EXISTS rifas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id     INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      periodo      TEXT NOT NULL,
      valor_boleta INTEGER NOT NULL CHECK (valor_boleta >= 0),
      pagado       INTEGER NOT NULL DEFAULT 1 CHECK (pagado IN (0,1)),
      fila_origen  INTEGER NOT NULL,
      UNIQUE (fila_origen)
    );

    CREATE TABLE IF NOT EXISTS multas (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      concepto TEXT    NOT NULL,          -- 'MORA_AHORRO' | 'MORA_INTERESES'
      valor    INTEGER NOT NULL CHECK (valor >= 0),
      estado   TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','pagada')),
      periodo  TEXT
    );

    -- Log de auditoría inmutable. Cada AHORRO, ABONO, MULTA, etc. deja huella
    -- aquí. Se prohíben updates/deletes por trigger.
    CREATE TABLE IF NOT EXISTS movimientos (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id  INTEGER NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
      tipo      TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
      concepto  TEXT NOT NULL CHECK (
                  concepto IN (
                    'AHORRO','ABONO_PRESTAMO','INTERESES_PRESTAMO',
                    'MULTA','RIFA_CHANCE','ACTIVIDADES','PRESTAMO'
                  )
                ),
      valor     INTEGER NOT NULL CHECK (valor >= 0),
      fecha     TEXT,
      metadata  TEXT   -- JSON serializado con contexto de origen (fila Excel, etc.)
    );

    CREATE INDEX IF NOT EXISTS idx_cuotas_socio    ON cuotas(socio_id);
    CREATE INDEX IF NOT EXISTS idx_prestamos_socio ON prestamos(socio_id);
    CREATE INDEX IF NOT EXISTS idx_abonos_socio    ON abonos_prestamos(socio_id);
    CREATE INDEX IF NOT EXISTS idx_movs_socio      ON movimientos(socio_id);
    CREATE INDEX IF NOT EXISTS idx_movs_concepto   ON movimientos(concepto);

    -- Triggers de inmutabilidad del log (audit-friendly).
    CREATE TRIGGER IF NOT EXISTS movs_no_update
      BEFORE UPDATE ON movimientos
      BEGIN
        SELECT RAISE(ABORT, 'movimientos es un log inmutable: UPDATE no permitido');
      END;

    CREATE TRIGGER IF NOT EXISTS movs_no_delete
      BEFORE DELETE ON movimientos
      BEGIN
        SELECT RAISE(ABORT, 'movimientos es un log inmutable: DELETE no permitido');
      END;
  `);

  return db;
}

/**
 * Cierra la conexión de forma segura.
 * @param {import("better-sqlite3").Database} db
 */
export function cerrarDB(db) {
  if (db && db.open) db.close();
}
