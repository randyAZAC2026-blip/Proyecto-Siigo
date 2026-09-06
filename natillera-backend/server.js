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

// ---------------- Liquidación real ----------------
// Cada socio recibe lo que aportó (ahorro + actividades + rifa +
// intereses pagados) menos sus deudas pendientes (saldo préstamo + multas
// + mora de intereses calculada dinámicamente por socio).
app.get("/api/liquidacion", (_req, res) => {
  const base = query(`
    SELECT id, nombre, cuota_sostenimiento,
           ahorro, actividades, rifa_chance, intereses_pagados, total_aportes,
           deducc_prestamo, deducc_multas, neto_a_recibir
      FROM vw_liquidacion_anual
  `);
  // Sumamos la mora pendiente por socio (préstamos + ahorros).
  const moraInt = calcularMoraPrestamos(db);
  const idxInt = new Map();
  for (const m of moraInt) {
    idxInt.set(m.socio_id, (idxInt.get(m.socio_id) || 0) + m.mora_pendiente);
  }
  const moraAho = calcularMoraAhorros(db);
  const idxAho = new Map();
  for (const m of moraAho) idxAho.set(m.socio_id, m.mora_pendiente);

  const enriquecido = base.map((r) => {
    const mInt = idxInt.get(r.id) || 0;
    const mAho = idxAho.get(r.id) || 0;
    return {
      ...r,
      deducc_mora_intereses: mInt,
      deducc_mora_ahorro: mAho,
      neto_a_recibir: r.neto_a_recibir - mInt - mAho,
    };
  });
  enriquecido.sort((a, b) => b.neto_a_recibir - a.neto_a_recibir);
  res.json(enriquecido);
});

// ---------------- Mora por intereses de préstamo ----------------
// Regla de negocio:
//   Cada préstamo tiene un aniversario mensual = mismo día del mes que su
//   fecha_desembolso. Ej: préstamo 17-ago genera vencimientos el 17-sep,
//   17-oct, 17-nov… Si el interés se paga después del vencimiento, se
//   cobra $500 por cada día de atraso. Si aún no se ha pagado, la mora
//   crece día a día hasta el momento del cálculo.
//
// Se hace matching FIFO: el pago #1 de intereses cubre el vencimiento #1,
// el pago #2 cubre el vencimiento #2, y así sucesivamente. La fecha del
// pago vs la fecha del vencimiento determina la mora de esa cuota.
const MORA_POR_DIA = 500;

function calcularMoraPrestamos(db, hoyISO) {
  const hoy = new Date((hoyISO || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const prestamos = db
    .prepare(
      `SELECT p.id, p.socio_id, p.fecha_desembolso, p.monto_prestado,
              s.nombre AS socio
         FROM prestamos p
         JOIN socios s ON s.id = p.socio_id
        WHERE p.estado = 'activo'
          AND p.monto_prestado > 0
          AND p.fecha_desembolso IS NOT NULL`,
    )
    .all();

  const resultado = [];
  for (const p of prestamos) {
    const desembolso = new Date(p.fecha_desembolso + "T00:00:00");
    if (Number.isNaN(desembolso.getTime())) continue;

    // Genera todos los vencimientos mensuales (mismo día) hasta hoy.
    const vencimientos = [];
    const cursor = new Date(desembolso);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= hoy) {
      vencimientos.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Pagos de intereses ordenados por fecha (FIFO).
    const pagos = db
      .prepare(
        `SELECT fecha_abono, intereses_pagados
           FROM abonos_prestamos
          WHERE prestamo_id = ? AND intereses_pagados > 0
          ORDER BY fecha_abono, id`,
      )
      .all(p.id);

    let moraPagada = 0;
    let moraPendiente = 0;
    let sinPagar = 0;
    let pagadosATiempo = 0;
    let pagadosTarde = 0;
    const detalle = [];

    for (let i = 0; i < vencimientos.length; i++) {
      const venc = vencimientos[i];
      const vencISO = venc.toISOString().slice(0, 10);
      const pago = pagos[i];
      if (pago && pago.fecha_abono) {
        const fechaPago = new Date(pago.fecha_abono + "T00:00:00");
        const dias = Math.max(
          0,
          Math.round((fechaPago - venc) / 86400000),
        );
        const mora = dias * MORA_POR_DIA;
        moraPagada += mora;
        if (dias > 0) pagadosTarde++;
        else pagadosATiempo++;
        detalle.push({
          vencimiento: vencISO,
          fecha_pago: pago.fecha_abono,
          dias_atraso: dias,
          mora,
          estado: dias > 0 ? "pagado_tarde" : "pagado_a_tiempo",
        });
      } else {
        const dias = Math.max(0, Math.round((hoy - venc) / 86400000));
        const mora = dias * MORA_POR_DIA;
        moraPendiente += mora;
        sinPagar++;
        detalle.push({
          vencimiento: vencISO,
          fecha_pago: null,
          dias_atraso: dias,
          mora,
          estado: "sin_pagar",
        });
      }
    }

    resultado.push({
      socio_id: p.socio_id,
      socio: p.socio,
      prestamo_id: p.id,
      fecha_desembolso: p.fecha_desembolso,
      monto_prestado: p.monto_prestado,
      total_vencimientos: vencimientos.length,
      pagados_a_tiempo: pagadosATiempo,
      pagados_tarde: pagadosTarde,
      sin_pagar: sinPagar,
      mora_pagada: moraPagada,
      mora_pendiente: moraPendiente,
      mora_total: moraPagada + moraPendiente,
      detalle,
    });
  }
  return resultado;
}

// ---------------- Mora por ahorro tardío ----------------
// Regla:
//   Cada periodo tiene fecha_corte_ahorro (viene de la hoja "Datos" del
//   Excel). Si el socio paga después de esa fecha, o si aún no ha pagado
//   y ya pasó, se cobra $500 por cada día de atraso.
//
// Solo se consideran periodos cuya fecha de corte ya llegó, para no cobrar
// mora por meses futuros.
function calcularMoraAhorros(db, hoyISO) {
  const hoy = new Date((hoyISO || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const periodos = db
    .prepare(
      `SELECT id, nombre, orden, fecha_corte_ahorro
         FROM periodos
        WHERE fecha_corte_ahorro IS NOT NULL
        ORDER BY orden`,
    )
    .all()
    .filter((p) => new Date(p.fecha_corte_ahorro + "T00:00:00") <= hoy);

  const socios = db
    .prepare(
      `SELECT id, nombre, cuota_sostenimiento FROM socios
         WHERE tipo = 'persona' AND estado = 'activo'`,
    )
    .all();

  // Un pago por socio+periodo (si hay varios, tomamos el primero por fecha)
  const pagos = db
    .prepare(
      `SELECT socio_id, periodo_id, MIN(fecha_pago) AS primer_pago
         FROM transacciones
        WHERE concepto = 'AHORRO' AND periodo_id IS NOT NULL
        GROUP BY socio_id, periodo_id`,
    )
    .all();
  const idxPagos = new Map();
  for (const p of pagos) idxPagos.set(`${p.socio_id}:${p.periodo_id}`, p.primer_pago);

  const resultado = [];
  for (const s of socios) {
    let moraPagada = 0;
    let moraPendiente = 0;
    let sinPagar = 0;
    let pagadosATiempo = 0;
    let pagadosTarde = 0;
    const detalle = [];

    for (const p of periodos) {
      const corte = new Date(p.fecha_corte_ahorro + "T00:00:00");
      const pago = idxPagos.get(`${s.id}:${p.id}`);
      if (pago) {
        const fechaPago = new Date(pago + "T00:00:00");
        const dias = Math.max(0, Math.round((fechaPago - corte) / 86400000));
        const mora = dias * MORA_POR_DIA;
        moraPagada += mora;
        if (dias > 0) pagadosTarde++;
        else pagadosATiempo++;
        detalle.push({
          periodo: p.nombre,
          fecha_corte: p.fecha_corte_ahorro,
          fecha_pago: pago,
          dias_atraso: dias,
          mora,
          estado: dias > 0 ? "pagado_tarde" : "pagado_a_tiempo",
        });
      } else {
        const dias = Math.max(0, Math.round((hoy - corte) / 86400000));
        const mora = dias * MORA_POR_DIA;
        moraPendiente += mora;
        sinPagar++;
        detalle.push({
          periodo: p.nombre,
          fecha_corte: p.fecha_corte_ahorro,
          fecha_pago: null,
          dias_atraso: dias,
          mora,
          estado: "sin_pagar",
        });
      }
    }

    resultado.push({
      socio_id: s.id,
      socio: s.nombre,
      cuota_sostenimiento: s.cuota_sostenimiento,
      total_periodos: periodos.length,
      pagados_a_tiempo: pagadosATiempo,
      pagados_tarde: pagadosTarde,
      sin_pagar: sinPagar,
      mora_pagada: moraPagada,
      mora_pendiente: moraPendiente,
      mora_total: moraPagada + moraPendiente,
      detalle,
    });
  }
  return resultado;
}

app.get("/api/mora-ahorros", (req, res) => {
  const rows = calcularMoraAhorros(db, req.query.hoy);
  const totales = rows.reduce(
    (a, r) => ({
      mora_pagada: a.mora_pagada + r.mora_pagada,
      mora_pendiente: a.mora_pendiente + r.mora_pendiente,
      mora_total: a.mora_total + r.mora_total,
      sin_pagar: a.sin_pagar + r.sin_pagar,
    }),
    { mora_pagada: 0, mora_pendiente: 0, mora_total: 0, sin_pagar: 0 },
  );
  const conDetalle = req.query.detalle === "true";
  res.json({
    hoy: req.query.hoy || new Date().toISOString().slice(0, 10),
    regla: {
      mora_por_dia: MORA_POR_DIA,
      criterio: "días desde la fecha_corte_ahorro del periodo",
    },
    totales,
    socios: rows
      .filter((r) => r.mora_total > 0 || r.sin_pagar > 0)
      .sort((a, b) => b.mora_pendiente - a.mora_pendiente)
      .map((r) => (conDetalle ? r : { ...r, detalle: undefined })),
  });
});

app.get("/api/mora-intereses", (req, res) => {
  const rows = calcularMoraPrestamos(db, req.query.hoy);
  const totales = rows.reduce(
    (a, r) => ({
      mora_pagada: a.mora_pagada + r.mora_pagada,
      mora_pendiente: a.mora_pendiente + r.mora_pendiente,
      mora_total: a.mora_total + r.mora_total,
      sin_pagar: a.sin_pagar + r.sin_pagar,
    }),
    { mora_pagada: 0, mora_pendiente: 0, mora_total: 0, sin_pagar: 0 },
  );
  // Sin `?detalle=true` no devolvemos el detalle por vencimiento para
  // mantener el payload liviano en la lista.
  const conDetalle = req.query.detalle === "true";
  res.json({
    hoy: (req.query.hoy || new Date().toISOString().slice(0, 10)),
    regla: { mora_por_dia: MORA_POR_DIA, aniversario: "día del mes = día del desembolso" },
    totales,
    prestamos: rows
      .sort((a, b) => b.mora_pendiente - a.mora_pendiente)
      .map((r) => (conDetalle ? r : { ...r, detalle: undefined })),
  });
});

// ---------------- Matriz de préstamos ----------------
app.get("/api/matriz-prestamos", (_req, res) => {
  const filas = query(`
    SELECT socio_id, nombre, periodo, orden_periodo, abono, intereses, total
      FROM vw_matriz_prestamos
      ORDER BY nombre, orden_periodo
  `);
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
        totalAbono: 0,
        totalIntereses: 0,
        total: 0,
      });
    }
    const row = porSocio.get(f.socio_id);
    row.celdas[f.periodo] = {
      abono: f.abono,
      intereses: f.intereses,
      total: f.total,
    };
    row.totalAbono += f.abono;
    row.totalIntereses += f.intereses;
    row.total += f.total;
  }
  meses.sort((a, b) => a.orden - b.orden);
  // Solo socios con al menos un movimiento de préstamo
  const socios = [...porSocio.values()].filter((s) => s.total > 0);
  res.json({ meses, socios });
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

// ---------------- Registrar desglose de un pago bancario ----------------
// Un movimiento bancario puede corresponder a varios conceptos.
// Ejemplo: $205 recibidos → 100 AHORRO + 50 ABONO_PRESTAMO + 20 INTERESES + 30 ACTIVIDADES + 5 RIFA.
// Todas las líneas se crean en una sola transacción SQL; si algo falla,
// no queda nada persistido. El extracto se vincula a la primera línea.
app.post("/api/transacciones/desglose", (req, res) => {
  const { socio_id, extracto_id, fecha_pago, periodo_id, notas, lineas } =
    req.body ?? {};

  if (!Number.isInteger(socio_id))
    return res.status(400).json({ error: "socio_id debe ser entero" });
  if (!Array.isArray(lineas) || lineas.length === 0)
    return res.status(400).json({ error: "lineas debe ser un array con al menos un ítem" });
  if (extracto_id != null && !Number.isInteger(extracto_id))
    return res.status(400).json({ error: "extracto_id debe ser entero o null" });
  if (periodo_id != null && !Number.isInteger(periodo_id))
    return res.status(400).json({ error: "periodo_id debe ser entero o null" });
  if (fecha_pago && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_pago))
    return res.status(400).json({ error: "fecha_pago debe ser YYYY-MM-DD" });

  const socio = queryOne(`SELECT id FROM socios WHERE id = ?`, [socio_id]);
  if (!socio) return res.status(400).json({ error: "socio_id no existe" });
  if (periodo_id != null) {
    const p = queryOne(`SELECT id FROM periodos WHERE id = ?`, [periodo_id]);
    if (!p) return res.status(400).json({ error: "periodo_id no existe" });
  }
  if (extracto_id != null) {
    const e = queryOne(`SELECT id FROM movimientos_banco WHERE id = ?`, [extracto_id]);
    if (!e) return res.status(400).json({ error: "extracto_id no existe" });
  }

  // Validar cada línea
  const preparadas = [];
  for (const [i, l] of lineas.entries()) {
    if (!CONCEPTOS_VALIDOS.has(l?.concepto))
      return res.status(400).json({
        error: `Línea ${i + 1}: concepto inválido "${l?.concepto}"`,
      });
    const valor = Math.abs(Math.round(Number(l.valor) || 0));
    if (valor <= 0)
      return res.status(400).json({ error: `Línea ${i + 1}: valor debe ser > 0` });
    preparadas.push({
      concepto: l.concepto,
      tipo: TIPO_POR_CONCEPTO[l.concepto],
      valor,
      notas: l.notas ?? null,
    });
  }

  db.exec("BEGIN");
  try {
    const insTx = db.prepare(`
      INSERT INTO transacciones (
        socio_id, periodo_id, concepto, tipo, valor, fecha_pago, notas, fila_origen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insMov = db.prepare(`
      INSERT INTO movimientos (socio_id, transaccion_id, tipo, concepto, valor, fecha, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const ids = [];
    // fila_origen negativo (Date.now() con offset por línea para que sean únicos)
    const baseFila = -Date.now();
    for (const [i, l] of preparadas.entries()) {
      const info = insTx.run(
        socio_id,
        periodo_id ?? null,
        l.concepto,
        l.tipo,
        l.valor,
        fecha_pago || null,
        l.notas || notas || null,
        baseFila - i,
      );
      const txId = Number(info.lastInsertRowid);
      ids.push(txId);
      insMov.run(
        socio_id,
        txId,
        l.tipo,
        l.concepto,
        l.valor,
        fecha_pago || null,
        JSON.stringify({
          origen: "manual",
          desglose: true,
          extracto_id: extracto_id ?? null,
        }),
      );
    }

    // Vincular el extracto a la primera transacción del desglose.
    if (extracto_id != null && ids.length > 0) {
      db.prepare(
        `UPDATE movimientos_banco SET transaccion_id = ? WHERE id = ?`,
      ).run(ids[0], extracto_id);
    }

    db.exec("COMMIT");
    res.json({
      ids,
      extracto_id: extracto_id ?? null,
      total: preparadas.reduce((a, l) => a + l.valor, 0),
    });
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

// ---------------- Crear movimiento bancario manual ----------------
// Sirve para agregar movimientos recientes sin re-migrar el Excel.
// Detecta duplicados por (banco, fecha, monto, descripcion) y devuelve
// { creado: true } o { creado: false, id_existente }.
const BANCOS_VALIDOS = new Set(["Bancolombia", "Nequi"]);
const ORIGEN_VALIDO = new Set(["NATILLERA", "PERSONAL", "N/A"]);

function crearMovimientoBanco(datos, opts = {}) {
  const banco = String(datos.banco || "").trim();
  if (!BANCOS_VALIDOS.has(banco))
    throw new Error(`banco inválido — usa: ${[...BANCOS_VALIDOS].join(", ")}`);
  if (!datos.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha))
    throw new Error("fecha debe ser YYYY-MM-DD");
  if (typeof datos.monto !== "number" && Number.isNaN(Number(datos.monto)))
    throw new Error("monto debe ser numérico (positivo o negativo)");
  const monto = Math.round(Number(datos.monto));
  const descripcion = String(datos.descripcion ?? "").trim() || null;
  const saldo = datos.saldo_cuenta != null ? Math.round(Number(datos.saldo_cuenta)) : null;
  const detalle = datos.detalle_origen ?? null;
  if (detalle != null && !ORIGEN_VALIDO.has(detalle))
    throw new Error(`detalle_origen inválido — usa: ${[...ORIGEN_VALIDO].join(", ")} o null`);
  const socioId = datos.socio_id != null ? Number(datos.socio_id) : null;

  if (!opts.omitirDedupe) {
    const dup = db
      .prepare(
        `SELECT id FROM movimientos_banco
          WHERE banco = ? AND fecha = ? AND monto = ?
            AND COALESCE(descripcion,'') = COALESCE(?, '')
          LIMIT 1`,
      )
      .get(banco, datos.fecha, monto, descripcion);
    if (dup) return { creado: false, id_existente: dup.id };
  }

  const info = db
    .prepare(
      `INSERT INTO movimientos_banco (
        banco, fecha, descripcion, monto, saldo_cuenta,
        detalle_origen, socio_id, fila_origen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      banco,
      datos.fecha,
      descripcion,
      monto,
      saldo,
      detalle,
      socioId,
      -Date.now() - Math.floor(Math.random() * 1000),
    );
  return { creado: true, id: Number(info.lastInsertRowid) };
}

app.post("/api/extractos", (req, res) => {
  try {
    const r = crearMovimientoBanco(req.body ?? {});
    res.json(r);
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

// ---------------- Importar movimientos bancarios en batch ----------------
// Body: { banco, movimientos: [{fecha, descripcion, monto, saldo?, detalle?}] }
// Reporta cuántos entraron nuevos y cuántos se omitieron por duplicado.
app.post("/api/extractos/importar", (req, res) => {
  const { banco, movimientos } = req.body ?? {};
  if (!BANCOS_VALIDOS.has(banco))
    return res.status(400).json({
      error: `banco inválido — usa: ${[...BANCOS_VALIDOS].join(", ")}`,
    });
  if (!Array.isArray(movimientos) || movimientos.length === 0)
    return res.status(400).json({ error: "movimientos debe ser un array no vacío" });

  const resultado = { insertados: 0, duplicados: 0, errores: [] };
  db.exec("BEGIN");
  try {
    for (const [i, m] of movimientos.entries()) {
      try {
        const r = crearMovimientoBanco({
          banco,
          fecha: m.fecha,
          descripcion: m.descripcion,
          monto: m.monto,
          saldo_cuenta: m.saldo_cuenta ?? m.saldo ?? null,
          detalle_origen: m.detalle_origen ?? m.detalle ?? null,
          socio_id: m.socio_id ?? null,
        });
        if (r.creado) resultado.insertados++;
        else resultado.duplicados++;
      } catch (err) {
        resultado.errores.push({ fila: i + 1, motivo: err.message || String(err) });
      }
    }
    db.exec("COMMIT");
    res.json(resultado);
  } catch (err) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: err.message || String(err) });
  }
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
      "  /api/matriz-prestamos\n" +
      "  /api/liquidacion\n" +
      "  /api/bancos\n" +
      "  /api/ahorros-por-periodo\n" +
      "  /api/deudores\n" +
      "  /api/mora-intereses[?detalle=true&hoy=YYYY-MM-DD]\n" +
      "  /api/mora-ahorros[?detalle=true&hoy=YYYY-MM-DD]\n" +
      "  /api/morosos[?dias=60]\n" +
      "  /api/periodos\n" +
      "  /api/extractos[?banco&origen&conciliado&desde&hasta&q&socio_id&limit&offset]\n" +
      "  /api/transacciones[?socio_id&concepto&desde&hasta&limit]\n\n" +
      "POST:\n" +
      "  /api/transacciones            {socio_id,concepto,valor,fecha_pago,periodo_id,notas,extracto_id?}\n" +
      "  /api/transacciones/desglose   {socio_id,fecha_pago,periodo_id,extracto_id?,lineas:[{concepto,valor,notas?}]}\n" +
      "  /api/extractos                {banco,fecha,descripcion,monto,saldo_cuenta?,detalle_origen?}\n" +
      "  /api/extractos/importar       {banco,movimientos:[{fecha,descripcion,monto,saldo?,detalle?}]}\n" +
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
