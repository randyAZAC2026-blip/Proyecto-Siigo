// explorar.js — CLI interactivo para consultar natillera.db
//
// Uso:
//   node explorar.js              → menú interactivo
//   node explorar.js resumen      → dispara la sección "resumen"
//   node explorar.js socio Nilson → historial del socio que coincide con "Nilson"
//   node explorar.js sql "SELECT * FROM socios LIMIT 5"  → SQL libre

import Database from "better-sqlite3";
import path from "node:path";
import readline from "node:readline";

const DB_PATH = path.resolve(process.env.NAT_DB || "natillera.db");

function abrirDB() {
  try {
    return new Database(DB_PATH, { readonly: true });
  } catch (err) {
    console.error(`❌ No pude abrir ${DB_PATH}`);
    console.error(`   ${err.message}`);
    console.error(`   Corre primero: node importador.js <ruta-al-xlsm>`);
    process.exit(1);
  }
}

// ---------------------- utilidades de formato ----------------------

const $ = (n) => "$" + Number(n || 0).toLocaleString("es-CO");
const pad = (s, n) => String(s ?? "").padEnd(n, " ").slice(0, n);
const padR = (s, n) => String(s ?? "").padStart(n, " ").slice(-n);

function tabla(rows, cols) {
  if (rows.length === 0) {
    console.log("   (sin resultados)");
    return;
  }
  const anchos = cols.map((c) => {
    const headerLen = c.header.length;
    const dataLen = Math.max(
      ...rows.map((r) => String(c.get(r) ?? "").length),
    );
    return Math.min(Math.max(headerLen, dataLen), c.max || 40);
  });
  const sep = "─".repeat(anchos.reduce((a, b) => a + b + 3, 1));
  console.log(sep);
  console.log(
    "│ " +
      cols.map((c, i) => (c.align === "r" ? padR(c.header, anchos[i]) : pad(c.header, anchos[i]))).join(" │ ") +
      " │",
  );
  console.log(sep);
  for (const r of rows) {
    console.log(
      "│ " +
        cols
          .map((c, i) =>
            c.align === "r"
              ? padR(c.get(r), anchos[i])
              : pad(c.get(r), anchos[i]),
          )
          .join(" │ ") +
        " │",
    );
  }
  console.log(sep);
  console.log(`   ${rows.length} filas`);
}

function seccion(titulo) {
  console.log("\n" + "═".repeat(72));
  console.log("  " + titulo);
  console.log("═".repeat(72));
}

// ---------------------- secciones ----------------------

function resumen(db) {
  seccion("RESUMEN GENERAL DE LA NATILLERA");
  const r = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM socios WHERE tipo='persona') AS activos,
        (SELECT COUNT(*) FROM socios WHERE tipo='cuenta_admin') AS admin,
        (SELECT COUNT(*) FROM transacciones) AS tx,
        (SELECT COUNT(*) FROM movimientos_banco) AS bancos,
        (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='AHORRO') AS ah,
        (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='ACTIVIDADES') AS ac,
        (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='RIFA_CHANCE') AS rf,
        (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='INTERESES_PRESTAMO') AS ip,
        (SELECT COALESCE(SUM(valor),0) FROM multas) AS mu,
        (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='PRESTAMO') AS pr,
        (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='ABONO_PRESTAMO') AS ab`,
    )
    .get();
  const pares = [
    ["Socios activos", r.activos],
    ["Cuentas administrativas", r.admin],
    ["Transacciones registradas", r.tx],
    ["Movimientos bancarios", r.bancos],
    ["Ahorros acumulados", $(r.ah)],
    ["Actividades", $(r.ac)],
    ["Rifa chance", $(r.rf)],
    ["Intereses ganados", $(r.ip)],
    ["Multas cobradas", $(r.mu)],
    ["Préstamos entregados", $(r.pr)],
    ["Abonos a préstamos", $(r.ab)],
    ["── Deuda bruta pendiente", $(r.pr - r.ab)],
    ["── Utilidad del ciclo", $(r.ip + r.mu + r.rf)],
  ];
  for (const [k, v] of pares) {
    console.log(`   ${pad(k, 30)}${padR(v, 20)}`);
  }
}

function topAportantes(db, limite = 15) {
  seccion(`TOP ${limite} SOCIOS POR APORTE TOTAL`);
  const rows = db
    .prepare(
      `SELECT nombre, total_aportado, ahorro, actividades, rifa_chance, saldo_prestamos
         FROM vw_saldo_por_socio
        WHERE tipo = 'persona'
        ORDER BY total_aportado DESC
        LIMIT ?`,
    )
    .all(limite);
  tabla(rows, [
    { header: "Socio", get: (r) => r.nombre, max: 28 },
    { header: "Aportado", get: (r) => $(r.total_aportado), align: "r" },
    { header: "Ahorro", get: (r) => $(r.ahorro), align: "r" },
    { header: "Actividad.", get: (r) => $(r.actividades), align: "r" },
    { header: "Rifa", get: (r) => $(r.rifa_chance), align: "r" },
    { header: "Deuda", get: (r) => $(r.saldo_prestamos), align: "r" },
  ]);
}

function deudores(db) {
  seccion("SOCIOS CON PRÉSTAMOS ACTIVOS");
  const rows = db
    .prepare(
      `SELECT s.nombre,
              p.monto_prestado,
              p.monto_prestado - COALESCE((SELECT SUM(capital_pagado)
                                          FROM abonos_prestamos WHERE prestamo_id = p.id), 0) AS saldo,
              COALESCE((SELECT SUM(intereses_pagados)
                        FROM abonos_prestamos WHERE prestamo_id = p.id), 0) AS int_pagados,
              p.fecha_desembolso
         FROM prestamos p
         JOIN socios s ON s.id = p.socio_id
        WHERE p.estado = 'activo' AND p.monto_prestado > 0
        ORDER BY saldo DESC`,
    )
    .all();
  tabla(rows, [
    { header: "Socio", get: (r) => r.nombre, max: 28 },
    { header: "Préstamo", get: (r) => $(r.monto_prestado), align: "r" },
    { header: "Saldo", get: (r) => $(r.saldo), align: "r" },
    { header: "Int. pag.", get: (r) => $(r.int_pagados), align: "r" },
    { header: "Fecha", get: (r) => r.fecha_desembolso || "—" },
  ]);
}

function porMes(db) {
  seccion("AHORROS RECAUDADOS MES A MES");
  const rows = db
    .prepare(
      `SELECT p.orden, p.nombre AS mes,
              COALESCE(SUM(t.valor), 0) AS ahorro,
              COUNT(t.id) AS n_pagos
         FROM periodos p
         LEFT JOIN transacciones t ON t.periodo_id = p.id AND t.concepto = 'AHORRO'
         GROUP BY p.id
         ORDER BY p.orden`,
    )
    .all();
  tabla(rows, [
    { header: "#", get: (r) => r.orden, align: "r" },
    { header: "Periodo", get: (r) => r.mes },
    { header: "Ahorro del mes", get: (r) => $(r.ahorro), align: "r" },
    { header: "# de pagos", get: (r) => r.n_pagos, align: "r" },
  ]);
}

function liquidacion(db) {
  seccion("LIQUIDACIÓN ESTIMADA AL DÍA DE HOY");
  console.log(
    "   (utilidad total = intereses + multas + rifas, repartida proporcional al ahorro)",
  );
  const rows = db
    .prepare(
      `SELECT nombre, ahorro_socio, proporcion, utilidad_estimada, neto_a_pagar_estimado
         FROM vw_liquidacion_anual
        WHERE ahorro_socio > 0
        ORDER BY neto_a_pagar_estimado DESC`,
    )
    .all();
  tabla(rows, [
    { header: "Socio", get: (r) => r.nombre, max: 28 },
    { header: "Ahorro", get: (r) => $(r.ahorro_socio), align: "r" },
    { header: "% del pot", get: (r) => (r.proporcion * 100).toFixed(2) + "%", align: "r" },
    { header: "Ganancia", get: (r) => $(r.utilidad_estimada), align: "r" },
    { header: "Neto a pagar", get: (r) => $(r.neto_a_pagar_estimado), align: "r" },
  ]);
}

function conciliacion(db) {
  seccion("CONCILIACIÓN BANCARIA");
  const rows = db
    .prepare(
      `SELECT banco, detalle_origen,
              COUNT(*) AS n,
              SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END) AS ingresos,
              SUM(CASE WHEN monto < 0 THEN -monto ELSE 0 END) AS egresos
         FROM movimientos_banco
         GROUP BY banco, detalle_origen
         ORDER BY banco, ingresos DESC`,
    )
    .all();
  tabla(rows, [
    { header: "Banco", get: (r) => r.banco },
    { header: "Origen", get: (r) => r.detalle_origen || "(sin marcar)" },
    { header: "# movs", get: (r) => r.n, align: "r" },
    { header: "Ingresos", get: (r) => $(r.ingresos), align: "r" },
    { header: "Egresos", get: (r) => $(r.egresos), align: "r" },
  ]);
}

function morosos(db) {
  seccion("SOCIOS SIN APORTE EN LOS ÚLTIMOS 60 DÍAS");
  const rows = db
    .prepare(
      `SELECT s.nombre, s.cuota_sostenimiento AS cuota,
              MAX(t.fecha_pago) AS ultimo
         FROM socios s
         LEFT JOIN transacciones t ON t.socio_id = s.id AND t.concepto = 'AHORRO'
         WHERE s.tipo = 'persona' AND s.estado = 'activo'
         GROUP BY s.id
         HAVING ultimo IS NULL OR ultimo < date('now', '-60 days')
         ORDER BY ultimo ASC NULLS FIRST`,
    )
    .all();
  tabla(rows, [
    { header: "Socio", get: (r) => r.nombre, max: 30 },
    { header: "Cuota", get: (r) => $(r.cuota), align: "r" },
    { header: "Último aporte", get: (r) => r.ultimo || "NUNCA" },
  ]);
}

function historialSocio(db, patron) {
  seccion(`HISTORIAL DE SOCIOS QUE COINCIDEN CON "${patron}"`);
  const socios = db
    .prepare(
      `SELECT id, nombre FROM socios WHERE nombre LIKE ? AND tipo='persona' ORDER BY nombre`,
    )
    .all(`%${patron}%`);
  if (socios.length === 0) {
    console.log(`   (ningún socio contiene "${patron}")`);
    return;
  }
  for (const s of socios) {
    console.log(`\n▸ ${s.nombre} (id ${s.id})`);
    const tx = db
      .prepare(
        `SELECT t.fecha_pago, p.nombre AS periodo, t.concepto, t.valor
           FROM transacciones t
           LEFT JOIN periodos p ON p.id = t.periodo_id
           WHERE t.socio_id = ?
           ORDER BY t.fecha_pago, t.id`,
      )
      .all(s.id);
    tabla(tx, [
      { header: "Fecha", get: (r) => r.fecha_pago || "—" },
      { header: "Periodo", get: (r) => r.periodo || "—" },
      { header: "Concepto", get: (r) => r.concepto },
      { header: "Valor", get: (r) => $(r.valor), align: "r" },
    ]);
    const total = db
      .prepare(
        `SELECT COALESCE(SUM(valor), 0) AS t FROM transacciones WHERE socio_id = ? AND tipo='ingreso'`,
      )
      .get(s.id).t;
    console.log(`   TOTAL APORTADO: ${$(total)}`);
  }
}

function sqlLibre(db, sql) {
  seccion("SQL LIBRE");
  console.log(`> ${sql}\n`);
  try {
    const rows = db.prepare(sql).all();
    if (rows.length === 0) {
      console.log("(0 filas)");
      return;
    }
    const cols = Object.keys(rows[0]).map((k) => ({
      header: k,
      get: (r) => r[k],
      align: typeof rows[0][k] === "number" ? "r" : "l",
    }));
    tabla(rows, cols);
  } catch (err) {
    console.error(`❌ ${err.message}`);
  }
}

// ---------------------- menú interactivo ----------------------

async function menu(db) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q) =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  EXPLORADOR DE LA NATILLERA");
  console.log(`  BD: ${DB_PATH}`);
  console.log("════════════════════════════════════════════════════════════════");

  const opciones = [
    ["1", "Resumen general", () => resumen(db)],
    ["2", "Top 15 aportantes", () => topAportantes(db)],
    ["3", "Deudores (préstamos activos)", () => deudores(db)],
    ["4", "Ahorros mes a mes", () => porMes(db)],
    ["5", "Liquidación estimada", () => liquidacion(db)],
    ["6", "Conciliación bancaria", () => conciliacion(db)],
    ["7", "Morosos (60 días sin pagar)", () => morosos(db)],
    ["8", "Historial de un socio", "socio"],
    ["9", "SQL libre", "sql"],
    ["0", "Salir", "salir"],
  ];

  while (true) {
    console.log("\n── Menú ──────────────────────────────");
    for (const [k, label] of opciones) console.log(`  ${k}. ${label}`);
    const op = await ask("\nOpción: ");
    const found = opciones.find(([k]) => k === op);
    if (!found) {
      console.log("Opción inválida.");
      continue;
    }
    const [, , accion] = found;
    if (accion === "salir") break;
    if (accion === "socio") {
      const patron = await ask("Nombre (o parte) del socio: ");
      historialSocio(db, patron);
    } else if (accion === "sql") {
      const sql = await ask("SQL: ");
      sqlLibre(db, sql);
    } else {
      accion();
    }
  }
  rl.close();
}

// ---------------------- entrypoint ----------------------

async function main() {
  const db = abrirDB();
  const [cmd, ...args] = process.argv.slice(2);
  try {
    switch (cmd) {
      case undefined:
        await menu(db);
        break;
      case "resumen":
        resumen(db);
        break;
      case "top":
        topAportantes(db, Number(args[0]) || 15);
        break;
      case "deudores":
        deudores(db);
        break;
      case "mes":
      case "meses":
        porMes(db);
        break;
      case "liquidacion":
        liquidacion(db);
        break;
      case "conciliacion":
        conciliacion(db);
        break;
      case "morosos":
        morosos(db);
        break;
      case "socio":
        historialSocio(db, args.join(" "));
        break;
      case "sql":
        sqlLibre(db, args.join(" "));
        break;
      default:
        console.log("Comandos: resumen, top [n], deudores, mes, liquidacion,");
        console.log("          conciliacion, morosos, socio <nombre>, sql <query>");
        console.log("O corre sin argumentos para el menú interactivo.");
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
