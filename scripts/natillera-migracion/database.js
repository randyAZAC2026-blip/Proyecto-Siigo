// database.js
// Conexión a SQLite y definición del esquema estandarizado de la natillera.
//
// Esquema v2: consolida las 11 hojas del Excel en un solo modelo relacional
// con vistas SQL que reemplazan las hojas rotas del Excel (BD, Liquidacion,
// Resumen liquidacion, Estado Socios).
//
// Diseño:
//   - `transacciones` es la ÚNICA fuente de verdad de flujos monetarios.
//   - `movimientos` es un log de auditoría inmutable (triggers de rechazo).
//   - `movimientos_banco` guarda los extractos crudos para conciliación.
//   - Las hojas BD/Estado Socios/Liquidacion se reemplazan por VIEWs
//     calculadas al vuelo, así nunca hay dos "versiones" del mismo total.

// Silencia el "ExperimentalWarning" de node:sqlite — el módulo es estable
// para nuestros usos y ya está incluido en Node 22+.
// Se usa import dinámico para que el filtro esté activo antes de cargar el módulo.
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
  console.warn(`(node) ${w.name}: ${w.message}`);
});

const { DatabaseSync } = await import("node:sqlite");
import path from "node:path";

/**
 * Abre (o crea) la base de datos y garantiza el esquema completo.
 * @param {string} dbPath Ruta al archivo .db
 * @returns {DatabaseSync}
 */
export function inicializarDB(dbPath) {
  const abs = path.resolve(dbPath);
  const db = new DatabaseSync(abs);

  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    -- ============================================================
    -- CATÁLOGOS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS socios (
      id                  INTEGER PRIMARY KEY,
      nombre              TEXT NOT NULL,
      identificacion      TEXT,
      correo              TEXT,
      telefono            TEXT,
      tipo                TEXT NOT NULL DEFAULT 'persona'
                            CHECK (tipo IN ('persona','cuenta_admin')),
      estado              TEXT NOT NULL DEFAULT 'activo'
                            CHECK (estado IN ('activo','inactivo')),
      cuota_sostenimiento INTEGER NOT NULL DEFAULT 0
                            CHECK (cuota_sostenimiento >= 0)
    );

    -- Ciclo anual de la natillera (Dic 2025 → Nov 2026, por ejemplo).
    -- Se carga desde la hoja "Datos" del Excel.
    CREATE TABLE IF NOT EXISTS periodos (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre                TEXT NOT NULL UNIQUE,   -- 'DICIEMBRE','ENERO'...
      orden                 INTEGER NOT NULL,       -- 1..12
      fecha_corte_ahorro    TEXT,                    -- yyyy-mm-dd
      fecha_corte_actividad TEXT,
      estado                TEXT NOT NULL DEFAULT 'abierto'
                              CHECK (estado IN ('abierto','cerrado'))
    );

    -- ============================================================
    -- LIBRO DIARIO (fuente de verdad)
    -- ============================================================

    CREATE TABLE IF NOT EXISTS transacciones (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id     INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      periodo_id   INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
      concepto     TEXT NOT NULL CHECK (
                     concepto IN ('AHORRO','ACTIVIDADES','RIFA_CHANCE',
                                  'PRESTAMO','ABONO_PRESTAMO',
                                  'INTERESES_PRESTAMO','MULTA')
                   ),
      tipo         TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
      valor        INTEGER NOT NULL CHECK (valor >= 0),
      fecha_pago   TEXT,
      notas        TEXT,
      fila_origen  INTEGER NOT NULL,   -- fila del Excel, para idempotencia
      UNIQUE (fila_origen, concepto)
    );

    -- ============================================================
    -- SUBTABLAS ESPECÍFICAS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS prestamos (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id         INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      transaccion_id   INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
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
      transaccion_id     INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
      socio_id           INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      monto_abono        INTEGER NOT NULL CHECK (monto_abono >= 0),
      intereses_pagados  INTEGER NOT NULL DEFAULT 0 CHECK (intereses_pagados >= 0),
      capital_pagado     INTEGER NOT NULL DEFAULT 0 CHECK (capital_pagado >= 0),
      fecha_abono        TEXT
    );

    CREATE TABLE IF NOT EXISTS multas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id        INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
      transaccion_id  INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
      periodo_id      INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
      tipo            TEXT NOT NULL
                        CHECK (tipo IN ('MORA_AHORRO','MORA_INTERESES')),
      valor           INTEGER NOT NULL CHECK (valor >= 0),
      dias_atraso     INTEGER,
      estado          TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','pagada'))
    );

    -- ============================================================
    -- EXTRACTOS BANCARIOS (para conciliación)
    -- ============================================================

    CREATE TABLE IF NOT EXISTS movimientos_banco (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      banco           TEXT NOT NULL CHECK (banco IN ('Bancolombia','Nequi')),
      fecha           TEXT,
      descripcion     TEXT,
      monto           INTEGER NOT NULL,        -- signo preservado (+ ingreso, - egreso)
      saldo_cuenta    INTEGER,                 -- saldo tras el movimiento
      detalle_origen  TEXT,                    -- PERSONAL | NATILLERA | ...
      socio_id        INTEGER REFERENCES socios(id) ON DELETE SET NULL,
      transaccion_id  INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
      fila_origen     INTEGER NOT NULL,
      UNIQUE (banco, fila_origen)
    );

    -- ============================================================
    -- LOG DE AUDITORÍA INMUTABLE
    -- ============================================================

    CREATE TABLE IF NOT EXISTS movimientos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      socio_id       INTEGER NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
      transaccion_id INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
      tipo           TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
      concepto       TEXT NOT NULL,
      valor          INTEGER NOT NULL CHECK (valor >= 0),
      fecha          TEXT,
      metadata       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tx_socio        ON transacciones(socio_id);
    CREATE INDEX IF NOT EXISTS idx_tx_periodo      ON transacciones(periodo_id);
    CREATE INDEX IF NOT EXISTS idx_tx_concepto     ON transacciones(concepto);
    CREATE INDEX IF NOT EXISTS idx_prest_socio     ON prestamos(socio_id);
    CREATE INDEX IF NOT EXISTS idx_abonos_socio    ON abonos_prestamos(socio_id);
    CREATE INDEX IF NOT EXISTS idx_multas_socio    ON multas(socio_id);
    CREATE INDEX IF NOT EXISTS idx_banco_fecha     ON movimientos_banco(fecha);
    CREATE INDEX IF NOT EXISTS idx_banco_socio     ON movimientos_banco(socio_id);
    CREATE INDEX IF NOT EXISTS idx_movs_socio      ON movimientos(socio_id);

    -- Auditoría inmutable
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

    -- ============================================================
    -- VISTAS: reemplazan las hojas rotas del Excel
    -- ============================================================

    DROP VIEW IF EXISTS vw_saldo_por_socio;
    CREATE VIEW vw_saldo_por_socio AS
    SELECT
      s.id,
      s.nombre,
      s.tipo,
      s.estado,
      s.cuota_sostenimiento,
      COALESCE(SUM(CASE WHEN t.concepto = 'AHORRO'             THEN t.valor END), 0) AS ahorro,
      COALESCE(SUM(CASE WHEN t.concepto = 'ACTIVIDADES'        THEN t.valor END), 0) AS actividades,
      COALESCE(SUM(CASE WHEN t.concepto = 'RIFA_CHANCE'        THEN t.valor END), 0) AS rifa_chance,
      COALESCE(SUM(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0) AS intereses_pagados,
      COALESCE(SUM(CASE WHEN t.concepto = 'ABONO_PRESTAMO'     THEN t.valor END), 0) AS abonado_a_prestamos,
      COALESCE(SUM(CASE WHEN t.concepto = 'PRESTAMO'           THEN t.valor END), 0) AS prestamos_recibidos,
      COALESCE(SUM(CASE WHEN t.concepto = 'MULTA'              THEN t.valor END), 0) AS multas_pagadas,
      -- Total aportado a la caja de la natillera
      COALESCE(SUM(CASE WHEN t.tipo = 'ingreso' THEN t.valor END), 0) AS total_aportado,
      -- Saldo de préstamos vigentes (monto original - capital pagado)
      COALESCE((
        SELECT SUM(monto_prestado - (
          SELECT COALESCE(SUM(capital_pagado),0) FROM abonos_prestamos WHERE prestamo_id = p.id
        ))
        FROM prestamos p WHERE p.socio_id = s.id AND p.estado = 'activo'
      ), 0) AS saldo_prestamos
    FROM socios s
    LEFT JOIN transacciones t ON t.socio_id = s.id
    GROUP BY s.id;

    DROP VIEW IF EXISTS vw_matriz_ahorro;
    CREATE VIEW vw_matriz_ahorro AS
    SELECT
      s.id AS socio_id,
      s.nombre,
      p.nombre AS periodo,
      p.orden  AS orden_periodo,
      COALESCE(SUM(t.valor), 0) AS valor
    FROM socios s
    CROSS JOIN periodos p
    LEFT JOIN transacciones t
      ON t.socio_id = s.id
     AND t.periodo_id = p.id
     AND t.concepto = 'AHORRO'
    WHERE s.tipo = 'persona'
    GROUP BY s.id, p.id;

    DROP VIEW IF EXISTS vw_matriz_actividades;
    CREATE VIEW vw_matriz_actividades AS
    SELECT
      s.id AS socio_id,
      s.nombre,
      p.nombre AS periodo,
      p.orden  AS orden_periodo,
      COALESCE(SUM(t.valor), 0) AS valor
    FROM socios s
    CROSS JOIN periodos p
    LEFT JOIN transacciones t
      ON t.socio_id = s.id
     AND t.periodo_id = p.id
     AND t.concepto = 'ACTIVIDADES'
    WHERE s.tipo = 'persona'
    GROUP BY s.id, p.id;

    -- Totales globales por concepto (dashboard).
    DROP VIEW IF EXISTS vw_totales_globales;
    CREATE VIEW vw_totales_globales AS
    SELECT
      concepto,
      tipo,
      COUNT(*)     AS n_transacciones,
      SUM(valor)   AS total,
      MIN(fecha_pago) AS primera_fecha,
      MAX(fecha_pago) AS ultima_fecha
    FROM transacciones
    GROUP BY concepto, tipo;

    -- Liquidación REAL por socio (no estimada / proporcional).
    -- Cada socio recibe lo suyo:
    --   (+) ahorro individual
    --   (+) actividades individual
    --   (+) rifa chance individual
    --   (+) intereses que él pagó a la caja (aportó)
    --   (−) saldo pendiente de sus préstamos vigentes
    --   (−) multas que se le cobraron
    DROP VIEW IF EXISTS vw_liquidacion_anual;
    CREATE VIEW vw_liquidacion_anual AS
    SELECT
      s.id,
      s.nombre,
      s.cuota_sostenimiento,
      COALESCE(SUM(CASE WHEN t.concepto = 'AHORRO' THEN t.valor END), 0)             AS ahorro,
      COALESCE(SUM(CASE WHEN t.concepto = 'ACTIVIDADES' THEN t.valor END), 0)         AS actividades,
      COALESCE(SUM(CASE WHEN t.concepto = 'RIFA_CHANCE' THEN t.valor END), 0)         AS rifa_chance,
      COALESCE(SUM(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0)  AS intereses_pagados,
      -- Suma de aportes individuales
      COALESCE(SUM(CASE WHEN t.concepto IN ('AHORRO','ACTIVIDADES','RIFA_CHANCE','INTERESES_PRESTAMO')
                        THEN t.valor END), 0) AS total_aportes,
      -- Deducciones
      COALESCE((
        SELECT SUM(monto_prestado - (
          SELECT COALESCE(SUM(capital_pagado), 0)
          FROM abonos_prestamos WHERE prestamo_id = p.id
        ))
        FROM prestamos p WHERE p.socio_id = s.id AND p.estado = 'activo'
      ), 0) AS deducc_prestamo,
      COALESCE((SELECT SUM(m.valor) FROM multas m
                WHERE m.socio_id = s.id AND m.estado = 'pendiente'), 0) AS deducc_multas,
      -- Neto a recibir = aportes − deducciones
      (
        COALESCE(SUM(CASE WHEN t.concepto IN ('AHORRO','ACTIVIDADES','RIFA_CHANCE','INTERESES_PRESTAMO')
                          THEN t.valor END), 0)
        - COALESCE((
            SELECT SUM(monto_prestado - (
              SELECT COALESCE(SUM(capital_pagado), 0)
              FROM abonos_prestamos WHERE prestamo_id = p.id
            ))
            FROM prestamos p WHERE p.socio_id = s.id AND p.estado = 'activo'
          ), 0)
        - COALESCE((SELECT SUM(m.valor) FROM multas m
                    WHERE m.socio_id = s.id AND m.estado = 'pendiente'), 0)
      ) AS neto_a_recibir
    FROM socios s
    LEFT JOIN transacciones t ON t.socio_id = s.id
    WHERE s.tipo = 'persona'
    GROUP BY s.id;

    -- Matriz de préstamos socios × mes.
    -- Suma abonos y intereses pagados por cada socio en cada mes.
    DROP VIEW IF EXISTS vw_matriz_prestamos;
    CREATE VIEW vw_matriz_prestamos AS
    SELECT
      s.id AS socio_id,
      s.nombre,
      p.nombre AS periodo,
      p.orden  AS orden_periodo,
      COALESCE(SUM(CASE WHEN t.concepto = 'ABONO_PRESTAMO'     THEN t.valor END), 0) AS abono,
      COALESCE(SUM(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0) AS intereses,
      COALESCE(SUM(CASE WHEN t.concepto IN ('ABONO_PRESTAMO','INTERESES_PRESTAMO')
                        THEN t.valor END), 0) AS total
    FROM socios s
    CROSS JOIN periodos p
    LEFT JOIN transacciones t
      ON t.socio_id = s.id
     AND t.periodo_id = p.id
     AND t.concepto IN ('ABONO_PRESTAMO', 'INTERESES_PRESTAMO')
    WHERE s.tipo = 'persona'
    GROUP BY s.id, p.id;

    -- Conciliación bancaria: ingresos NATILLERA en el banco vs transacciones.
    DROP VIEW IF EXISTS vw_conciliacion_bancaria;
    CREATE VIEW vw_conciliacion_bancaria AS
    SELECT
      banco,
      COUNT(*) AS n_movs,
      SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END)   AS ingresos_totales,
      SUM(CASE WHEN monto < 0 THEN -monto ELSE 0 END)  AS egresos_totales,
      SUM(CASE WHEN monto > 0 AND (detalle_origen IS NULL OR detalle_origen != 'PERSONAL')
               THEN monto ELSE 0 END) AS ingresos_natillera,
      SUM(CASE WHEN transaccion_id IS NOT NULL THEN monto ELSE 0 END) AS monto_conciliado
    FROM movimientos_banco
    GROUP BY banco;
  `);

  return db;
}

/**
 * Cierra la conexión de forma segura.
 * @param {DatabaseSync} db
 */
export function cerrarDB(db) {
  try {
    if (db) db.close();
  } catch {
    // ya cerrada
  }
}
