// natillera-backend/server.js
// API HTTP local sobre natillera.db.
//
// Uso:
//   pnpm dev          → arranca en http://localhost:4000 con --watch
//   pnpm start        → arranca sin auto-reload
//
// Variables de entorno:
//   NAT_DB   → ruta al archivo natillera.db
//              (default: ../scripts/natillera-migracion/natillera.db)
//   NAT_PORT → puerto (default 4000)
//
// Solo escucha en localhost — no expone la BD a la red.

// Silenciar el ExperimentalWarning de node:sqlite antes de importar el módulo.
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
  console.warn(`(node) ${w.name}: ${w.message}`);
});
const { DatabaseSync } = await import("node:sqlite");

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.resolve(
  process.env.NAT_DB ||
    path.join(__dirname, "..", "scripts", "natillera-migracion", "natillera.db"),
);
const PORT = Number(process.env.NAT_PORT) || 4000;

let db;
try {
  // Modo lectura+escritura: los endpoints POST/PATCH permiten registrar
  // pagos nuevos y conciliar movimientos bancarios sin volver al Excel.
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON");
} catch (err) {
  console.error(`❌ No se pudo abrir la BD en ${DB_PATH}`);
  console.error(`   ${err.message}`);
  console.error("   Corre primero el importador:");
  console.error("     cd scripts/natillera-migracion");
  console.error('     node importador.js "ruta\\a\\tu\\excel.xlsm"');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }));
app.use(express.json());

// Middleware chico que envuelve `db.prepare(...).all()` en try/catch para
// devolver 500 con JSON en vez de romper el servidor.
function query(sql, params = []) {
  return db.prepare(sql).all(...(Array.isArray(params) ? params : [params]));
}
function queryOne(sql, params = []) {
  return db.prepare(sql).get(...(Array.isArray(params) ? params : [params]));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: DB_PATH });
});

// ---------------- Resumen del dashboard ----------------
app.get("/api/resumen", (_req, res) => {
  const r = queryOne(`
    SELECT
      (SELECT COUNT(*) FROM socios WHERE tipo='persona') AS socios_activos,
      (SELECT COUNT(*) FROM socios WHERE tipo='cuenta_admin') AS cuentas_admin,
      (SELECT COUNT(*) FROM transacciones) AS n_transacciones,
      (SELECT COUNT(*) FROM movimientos_banco) AS n_bancos,
      COALESCE((SELECT SUM(valor) FROM transacciones WHERE concepto='AHORRO'), 0) AS ahorros,
      COALESCE((SELECT SUM(valor) FROM transacciones WHERE concepto='ACTIVIDADES'), 0) AS actividades,
      COALESCE((SELECT SUM(valor) FROM transacciones WHERE concepto='RIFA_CHANCE'), 0) AS rifa,
      COALESCE((SELECT SUM(valor) FROM transacciones WHERE concepto='INTERESES_PRESTAMO'), 0) AS intereses,
      COALESCE((SELECT SUM(valor) FROM transacciones WHERE concepto='PRESTAMO'), 0) AS prestamos_desembolsados,
      COALESCE((SELECT SUM(valor) FROM transacciones WHERE concepto='ABONO_PRESTAMO'), 0) AS abonos_prestamos,
      COALESCE((SELECT SUM(valor) FROM multas), 0) AS multas
  `);
  res.json({
    ...r,
    deuda_pendiente: r.prestamos_desembolsados - r.abonos_prestamos,
    utilidad_ciclo: r.intereses + r.multas + r.rifa,
    total_aportado: r.ahorros + r.actividades + r.rifa + r.intereses + r.abonos_prestamos,
  });
});

// ---------------- Saldo por socio ----------------
app.get("/api/socios", (req, res) => {
  const soloPersona = req.query.tipo !== "todos";
  const filtro = soloPersona ? "WHERE tipo = 'persona'" : "";
  res.json(
    query(`
      SELECT id, nombre, tipo, estado, cuota_sostenimiento,
             ahorro, actividades, rifa_chance, intereses_pagados,
             abonado_a_prestamos, prestamos_recibidos, multas_pagadas,
             total_aportado, saldo_prestamos
        FROM vw_saldo_por_socio
        ${filtro}
        ORDER BY total_aportado DESC
    `),
  );
});

app.get("/api/socios/:id", (req, res) => {
  const id = Number(req.params.id);
  const socio = queryOne(
    `SELECT * FROM vw_saldo_por_socio WHERE id = ?`,
    [id],
  );
  if (!socio) return res.status(404).json({ error: "Socio no encontrado" });
  const historial = query(
    `SELECT t.id, t.fecha_pago, t.concepto, t.tipo, t.valor,
            p.nombre AS periodo
       FROM transacciones t
       LEFT JOIN periodos p ON p.id = t.periodo_id
       WHERE t.socio_id = ?
       ORDER BY t.fecha_pago, t.id`,
    [id],
  );
  res.json({ socio, historial });
});

// ---------------- Matrices socio × mes ----------------
app.get("/api/matriz-ahorro", (_req, res) => {
  const filas = query(`
    SELECT socio_id, nombre, periodo, orden_periodo, valor
      FROM vw_matriz_ahorro
      ORDER BY nombre, orden_periodo
  `);
  res.json(pivot(filas));
});

app.get("/api/matriz-actividades", (_req, res) => {
  const filas = query(`
    SELECT socio_id, nombre, periodo, orden_periodo, valor
      FROM vw_matriz_actividades
      ORDER BY nombre, orden_periodo
  `);
  res.json(pivot(filas));
});

function pivot(filas) {
  const meses = [];
  const porSocio = new Map();
  for (const f of filas) {
    if (!meses.find((m) => m.nombre === f.periodo)) {
      meses.push({ nombre: f.periodo, orden: f.orden_periodo });
    }
    if (!porSocio.has(f.socio_id)) {
      porSocio.set(f.socio_id, {
        socio_id: f.socio_id,
        nombre: f.nombre,
        celdas: {},
        total: 0,
      });
    }
    const row = porSocio.get(f.socio_id);
    row.celdas[f.periodo] = f.valor;
    row.total += f.valor;
  }
  meses.sort((a, b) => a.orden - b.orden);
  return { meses, socios: [...porSocio.values()] };
}

// ---------------- Liquidación estimada ----------------
app.get("/api/liquidacion", (_req, res) => {
  res.json(
    query(`
      SELECT id, nombre, cuota_sostenimiento, ahorro_socio,
             proporcion, utilidad_estimada, neto_a_pagar_estimado
        FROM vw_liquidacion_anual
        ORDER BY neto_a_pagar_estimado DESC
    `),
  );
});

// ---------------- Conciliación bancaria ----------------
app.get("/api/bancos", (_req, res) => {
  const resumen = query(`
    SELECT banco,
           COUNT(*) AS n_movs,
           COALESCE(SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END), 0) AS ingresos,
           COALESCE(SUM(CASE WHEN monto < 0 THEN -monto ELSE 0 END), 0) AS egresos,
           COALESCE(SUM(CASE WHEN monto > 0 AND detalle_origen != 'PERSONAL'
                             THEN monto ELSE 0 END), 0) AS ingresos_natillera
      FROM movimientos_banco
      GROUP BY banco
      ORDER BY banco
  `);
  res.json(resumen);
});

// ---------------- Ahorros por periodo ----------------
app.get("/api/ahorros-por-periodo", (_req, res) => {
  res.json(
    query(`
      SELECT p.id, p.nombre, p.orden, p.fecha_corte_ahorro,
             COALESCE(SUM(t.valor), 0) AS ahorro,
             COUNT(t.id) AS n_pagos
        FROM periodos p
        LEFT JOIN transacciones t ON t.periodo_id = p.id AND t.concepto = 'AHORRO'
        GROUP BY p.id
        ORDER BY p.orden
    `),
  );
});

// ---------------- Deudores (préstamos activos) ----------------
app.get("/api/deudores", (_req, res) => {
  res.json(
    query(`
      SELECT s.id, s.nombre,
             p.id AS prestamo_id,
             p.monto_prestado,
             p.monto_prestado - COALESCE((
               SELECT SUM(capital_pagado) FROM abonos_prestamos WHERE prestamo_id = p.id
             ), 0) AS saldo,
             COALESCE((SELECT SUM(intereses_pagados)
                       FROM abonos_prestamos WHERE prestamo_id = p.id), 0) AS intereses_pagados,
             p.fecha_desembolso
        FROM prestamos p
        JOIN socios s ON s.id = p.socio_id
        WHERE p.estado = 'activo' AND p.monto_prestado > 0
        ORDER BY saldo DESC
    `),
  );
});

// ---------------- Morosos ----------------
app.get("/api/morosos", (req, res) => {
  const dias = Number(req.query.dias) || 60;
  res.json(
    query(
      `SELECT s.id, s.nombre, s.cuota_sostenimiento, MAX(t.fecha_pago) AS ultimo_aporte
         FROM socios s
         LEFT JOIN transacciones t ON t.socio_id = s.id AND t.concepto = 'AHORRO'
         WHERE s.tipo = 'persona' AND s.estado = 'activo'
         GROUP BY s.id
         HAVING ultimo_aporte IS NULL OR ultimo_aporte < date('now', '-' || ? || ' days')
         ORDER BY ultimo_aporte ASC NULLS FIRST`,
      [dias],
    ),
  );
});

// ---------------- Catálogo de periodos (para selects) ----------------
app.get("/api/periodos", (_req, res) => {
  res.json(
    query(`
      SELECT id, nombre, orden, fecha_corte_ahorro, fecha_corte_actividad, estado
        FROM periodos
        ORDER BY orden
    `),
  );
});

// ---------------- Extracto bancario detallado ----------------
// Filtros: banco, conciliado (true/false), origen (NATILLERA/PERSONAL/...),
// desde, hasta, q (búsqueda libre en descripción/nombre), limit, offset.
app.get("/api/extractos", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.banco) {
    where.push("mb.banco = ?");
    params.push(String(req.query.banco));
  }
  if (req.query.origen) {
    where.push("mb.detalle_origen = ?");
    params.push(String(req.query.origen));
  }
  if (req.query.conciliado === "true") {
    where.push("mb.transaccion_id IS NOT NULL");
  } else if (req.query.conciliado === "false") {
    where.push("mb.transaccion_id IS NULL");
  }
  if (req.query.desde) {
    where.push("mb.fecha >= ?");
    params.push(String(req.query.desde));
  }
  if (req.query.hasta) {
    where.push("mb.fecha <= ?");
    params.push(String(req.query.hasta));
  }
  if (req.query.q) {
    where.push("(mb.descripcion LIKE ? OR s.nombre LIKE ?)");
    const like = `%${req.query.q}%`;
    params.push(like, like);
  }
  if (req.query.socio_id) {
    where.push("mb.socio_id = ?");
    params.push(Number(req.query.socio_id));
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const offset = Number(req.query.offset) || 0;

  const total = queryOne(
    `SELECT COUNT(*) AS n
       FROM movimientos_banco mb
       LEFT JOIN socios s ON s.id = mb.socio_id
       ${whereSql}`,
    params,
  ).n;

  const filas = query(
    `SELECT mb.id, mb.banco, mb.fecha, mb.descripcion, mb.monto, mb.saldo_cuenta,
            mb.detalle_origen, mb.socio_id, s.nombre AS socio_nombre,
            mb.transaccion_id
       FROM movimientos_banco mb
       LEFT JOIN socios s ON s.id = mb.socio_id
       ${whereSql}
       ORDER BY mb.fecha DESC, mb.id DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  res.json({ total, limit, offset, filas });
});

// ---------------- Vincular movimiento bancario con transacción ----------------
app.post("/api/extractos/:id/vincular", (req, res) => {
  const id = Number(req.params.id);
  const { transaccion_id } = req.body ?? {};
  if (transaccion_id !== null && !Number.isInteger(transaccion_id)) {
    return res.status(400).json({ error: "transaccion_id debe ser entero o null" });
  }
  const info = db
    .prepare(`UPDATE movimientos_banco SET transaccion_id = ? WHERE id = ?`)
    .run(transaccion_id, id);
  if (info.changes === 0) {
    return res.status(404).json({ error: "Movimiento no encontrado" });
  }
  res.json({ ok: true });
});

// ---------------- Marcar origen de un movimiento (NATILLERA/PERSONAL) ----------------
app.post("/api/extractos/:id/origen", (req, res) => {
  const id = Number(req.params.id);
  const { detalle_origen } = req.body ?? {};
  const validos = ["NATILLERA", "PERSONAL", "N/A", null];
  if (!validos.includes(detalle_origen)) {
    return res.status(400).json({
      error: `detalle_origen debe ser uno de: ${validos.filter(Boolean).join(", ")} o null`,
    });
  }
  const info = db
    .prepare(`UPDATE movimientos_banco SET detalle_origen = ? WHERE id = ?`)
    .run(detalle_origen, id);
  if (info.changes === 0) return res.status(404).json({ error: "Movimiento no encontrado" });
  res.json({ ok: true });
});

// ---------------- Registrar pago manual ----------------
// Crea una fila en `transacciones` + entrada en `movimientos` (log auditoría).
// Opcionalmente, vincula un movimiento bancario existente (extracto_id).
const CONCEPTOS_VALIDOS = new Set([
  "AHORRO",
  "ACTIVIDADES",
  "RIFA_CHANCE",
  "PRESTAMO",
  "ABONO_PRESTAMO",
  "INTERESES_PRESTAMO",
  "MULTA",
]);
const TIPO_POR_CONCEPTO = {
  AHORRO: "ingreso",
  ACTIVIDADES: "ingreso",
  RIFA_CHANCE: "ingreso",
  PRESTAMO: "egreso",
  ABONO_PRESTAMO: "ingreso",
  INTERESES_PRESTAMO: "ingreso",
  MULTA: "ingreso",
};

app.post("/api/transacciones", (req, res) => {
  const { socio_id, concepto, valor, fecha_pago, periodo_id, notas, extracto_id } =
    req.body ?? {};

  if (!Number.isInteger(socio_id))
    return res.status(400).json({ error: "socio_id debe ser entero" });
  if (!CONCEPTOS_VALIDOS.has(concepto))
    return res.status(400).json({
      error: `concepto inválido — usa: ${[...CONCEPTOS_VALIDOS].join(", ")}`,
    });
  const montoLimpio = Math.abs(Math.round(Number(valor) || 0));
  if (montoLimpio <= 0)
    return res.status(400).json({ error: "valor debe ser mayor que 0" });
  if (fecha_pago && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_pago))
    return res.status(400).json({ error: "fecha_pago debe ser YYYY-MM-DD" });
  if (periodo_id != null && !Number.isInteger(periodo_id))
    return res.status(400).json({ error: "periodo_id debe ser entero o null" });

  const socio = queryOne(`SELECT id FROM socios WHERE id = ?`, [socio_id]);
  if (!socio) return res.status(400).json({ error: "socio_id no existe" });
  if (periodo_id != null) {
    const p = queryOne(`SELECT id FROM periodos WHERE id = ?`, [periodo_id]);
    if (!p) return res.status(400).json({ error: "periodo_id no existe" });
  }

  const tipo = TIPO_POR_CONCEPTO[concepto];
  // fila_origen negativo = registro manual (Excel es positivo).
  const filaOrigen = -Date.now();

  db.exec("BEGIN");
  try {
    const insTx = db.prepare(`
      INSERT INTO transacciones (
        socio_id, periodo_id, concepto, tipo, valor, fecha_pago, notas, fila_origen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insTx.run(
      socio_id,
      periodo_id ?? null,
      concepto,
      tipo,
      montoLimpio,
      fecha_pago || null,
      notas || null,
      filaOrigen,
    );
    const txId = Number(info.lastInsertRowid);

    db.prepare(
      `INSERT INTO movimientos (socio_id, transaccion_id, tipo, concepto, valor, fecha, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      socio_id,
      txId,
      tipo,
      concepto,
      montoLimpio,
      fecha_pago || null,
      JSON.stringify({ origen: "manual", ip: req.ip }),
    );

    // Si viene con extracto_id, vinculamos el movimiento bancario.
    if (extracto_id != null) {
      const upd = db
        .prepare(`UPDATE movimientos_banco SET transaccion_id = ? WHERE id = ?`)
        .run(txId, extracto_id);
      if (upd.changes === 0) {
        db.exec("ROLLBACK");
        return res.status(400).json({ error: "extracto_id no existe" });
      }
    }

    db.exec("COMMIT");
    res.json({ id: txId, socio_id, concepto, tipo, valor: montoLimpio });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ---------------- Eliminar transacción manual ----------------
// Solo permite eliminar transacciones creadas manualmente (fila_origen < 0).
// Las importadas del Excel quedan protegidas (idempotencia con el archivo).
app.delete("/api/transacciones/:id", (req, res) => {
  const id = Number(req.params.id);
  const tx = queryOne(
    `SELECT id, fila_origen FROM transacciones WHERE id = ?`,
    [id],
  );
  if (!tx) return res.status(404).json({ error: "No existe" });
  if (tx.fila_origen >= 0) {
    return res.status(400).json({
      error:
        "No se puede borrar una transacción importada del Excel. Re-migra el archivo si quieres cambiarla.",
    });
  }
  db.exec("BEGIN");
  try {
    db.prepare(`UPDATE movimientos_banco SET transaccion_id = NULL WHERE transaccion_id = ?`).run(id);
    // El trigger de inmutabilidad de `movimientos` bloquea el DELETE.
    // Como es un log de auditoría, dejamos la fila y solo borramos la
    // transacción — la fila del log queda como registro histórico de que
    // hubo ese movimiento (con FK ahora NULL por ON DELETE SET NULL).
    db.prepare(`DELETE FROM transacciones WHERE id = ?`).run(id);
    db.exec("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ---------------- Búsqueda de transacciones para vincular ----------------
app.get("/api/transacciones", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.socio_id) {
    where.push("t.socio_id = ?");
    params.push(Number(req.query.socio_id));
  }
  if (req.query.concepto) {
    where.push("t.concepto = ?");
    params.push(String(req.query.concepto));
  }
  if (req.query.desde) {
    where.push("t.fecha_pago >= ?");
    params.push(String(req.query.desde));
  }
  if (req.query.hasta) {
    where.push("t.fecha_pago <= ?");
    params.push(String(req.query.hasta));
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(
    query(
      `SELECT t.id, t.socio_id, s.nombre AS socio, t.concepto, t.tipo, t.valor,
              t.fecha_pago, p.nombre AS periodo,
              CASE WHEN t.fila_origen < 0 THEN 'manual' ELSE 'excel' END AS origen
         FROM transacciones t
         JOIN socios s ON s.id = t.socio_id
         LEFT JOIN periodos p ON p.id = t.periodo_id
         ${whereSql}
         ORDER BY t.fecha_pago DESC, t.id DESC
         LIMIT ?`,
      [...params, limit],
    ),
  );
});

app.get("/", (_req, res) => {
  res.type("text/plain").send(
    "Natillera API\n\n" +
      "GET:\n" +
      "  /api/health\n" +
      "  /api/resumen\n" +
      "  /api/socios[?tipo=todos]\n" +
      "  /api/socios/:id\n" +
      "  /api/matriz-ahorro\n" +
      "  /api/matriz-actividades\n" +
      "  /api/liquidacion\n" +
      "  /api/bancos\n" +
      "  /api/ahorros-por-periodo\n" +
      "  /api/deudores\n" +
      "  /api/morosos[?dias=60]\n" +
      "  /api/periodos\n" +
      "  /api/extractos[?banco&origen&conciliado&desde&hasta&q&socio_id&limit&offset]\n" +
      "  /api/transacciones[?socio_id&concepto&desde&hasta&limit]\n\n" +
      "POST:\n" +
      "  /api/transacciones            {socio_id,concepto,valor,fecha_pago,periodo_id,notas,extracto_id?}\n" +
      "  /api/extractos/:id/vincular   {transaccion_id}\n" +
      "  /api/extractos/:id/origen     {detalle_origen:'NATILLERA'|'PERSONAL'|'N/A'|null}\n\n" +
      "DELETE:\n" +
      "  /api/transacciones/:id  (solo manuales)\n",
  );
});

// Manejo de errores general
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || String(err) });
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Natillera API en http://localhost:${PORT}`);
  console.log(`💾 BD: ${DB_PATH}`);
});

process.on("SIGINT", () => {
  console.log("\n👋 Cerrando…");
  server.close(() => {
    try {
      db.close();
    } catch {}
    process.exit(0);
  });
});
