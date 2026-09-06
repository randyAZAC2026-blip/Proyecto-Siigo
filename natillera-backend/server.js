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
  db = new DatabaseSync(DB_PATH, { readOnly: true });
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

app.get("/", (_req, res) => {
  res.type("text/plain").send(
    "Natillera API\n\n" +
      "Endpoints:\n" +
      "  GET /api/health\n" +
      "  GET /api/resumen\n" +
      "  GET /api/socios[?tipo=todos]\n" +
      "  GET /api/socios/:id\n" +
      "  GET /api/matriz-ahorro\n" +
      "  GET /api/matriz-actividades\n" +
      "  GET /api/liquidacion\n" +
      "  GET /api/bancos\n" +
      "  GET /api/ahorros-por-periodo\n" +
      "  GET /api/deudores\n" +
      "  GET /api/morosos[?dias=60]\n",
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
