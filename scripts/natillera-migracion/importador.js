// importador.js — ETL Excel → SQLite estandarizado.
//
// Lee las hojas útiles del libro de la natillera:
//   - "BD"            → maestra de socios (id, nombre, cuota)
//   - "Datos"         → catálogo de periodos del ciclo anual
//   - "BASE DE DATOS" → libro diario de transacciones (fuente de verdad)
//   - "Bancolombia"   → extracto bancario (para conciliación)
//   - "Nequi"         → extracto Nequi (para conciliación)
//
// Todo se inserta en una transacción atómica. La validación al centavo se
// ejecuta ANTES del COMMIT — si no cuadra, ROLLBACK automático.
//
// Uso:
//   node importador.js <ruta-al-xlsm> [--db=natillera.db] [--dry-run]

import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";
import { inicializarDB, cerrarDB } from "./database.js";

const HOJA_MAESTRA = "BD";
const HOJA_PERIODOS = "Datos";
const HOJA_TRANSACCIONES = "BASE DE DATOS";
const HOJAS_BANCARIAS = ["Bancolombia", "Nequi"];

// Cuentas contables (no son personas reales); se marcan tipo=cuenta_admin
// y quedan excluidas de las matrices socios × mes y del conteo de "activos".
const CUENTAS_ADMIN = new Set([
  "Liquidados",
  "Gastos Bancarios",
  "Varios",
]);

// Meses del ciclo (orden por defecto DICIEMBRE → NOVIEMBRE, como en la hoja Datos).
const ORDEN_MESES_DEFAULT = [
  "DICIEMBRE",
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
];

// ------------------------------------------------------------
// Utilidades de limpieza (edge cases del prompt)
// ------------------------------------------------------------

function toMoney(raw) {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "object" && "error" in raw) return 0;
  if (typeof raw === "number") return Math.abs(Math.round(raw));
  const cleaned = String(raw).replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : 0;
}

function toMoneySigned(raw) {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "object" && "error" in raw) return 0;
  if (typeof raw === "number") return Math.round(raw);
  const cleaned = String(raw).replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toSocioId(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "object" && "error" in raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && Number.isInteger(n)) return String(n);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s;
}

function toISODate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function limpiarTexto(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && "error" in raw) return null;
  const s = String(raw).trim();
  return s || null;
}

function cellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  const v = cell.value;
  if (typeof v === "object") {
    if ("result" in v) return v.result;
    if ("text" in v && !("richText" in v)) return v.text;
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("error" in v) return v;
  }
  return v;
}

// Concepto Excel → concepto normalizado del schema
const MAPEO_CONCEPTO = {
  AHORRO: "AHORRO",
  ACTIVIDADES: "ACTIVIDADES",
  "RIFA CHANCE": "RIFA_CHANCE",
  PRESTAMO: "PRESTAMO",
  "ABONO PRESTAMO": "ABONO_PRESTAMO",
  "INTERESES PRESTAMO": "INTERESES_PRESTAMO",
};

// Cada concepto va a ingreso/egreso desde la perspectiva de la caja de la natillera
const TIPO_POR_CONCEPTO = {
  AHORRO: "ingreso",
  ACTIVIDADES: "ingreso",
  RIFA_CHANCE: "ingreso",
  PRESTAMO: "egreso",
  ABONO_PRESTAMO: "ingreso",
  INTERESES_PRESTAMO: "ingreso",
  MULTA: "ingreso",
};

// ------------------------------------------------------------
// Procesamiento del Excel
// ------------------------------------------------------------

export async function procesarExcel(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  // --- 1) Maestra de socios (hoja BD) ---
  const wsMaestra = wb.getWorksheet(HOJA_MAESTRA);
  if (!wsMaestra) throw new Error(`No se encontró la hoja "${HOJA_MAESTRA}"`);
  /** @type {Map<string,{id:string,nombre:string,cuota:number,tipo:string}>} */
  const sociosPorId = new Map();
  wsMaestra.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = toSocioId(cellValue(row.getCell(1)));
    const nombre = limpiarTexto(cellValue(row.getCell(2)));
    const cuota = toMoney(cellValue(row.getCell(3)));
    if (!id || !nombre) return;
    const tipo = CUENTAS_ADMIN.has(nombre) ? "cuenta_admin" : "persona";
    if (!sociosPorId.has(id)) {
      sociosPorId.set(id, { id, nombre, cuota, tipo });
    }
  });

  // --- 2) Periodos (hoja Datos) ---
  const wsDatos = wb.getWorksheet(HOJA_PERIODOS);
  const periodos = [];
  const periodosSet = new Set();
  if (wsDatos) {
    wsDatos.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const mes = limpiarTexto(cellValue(row.getCell(2)));
      const corteAhorro = toISODate(cellValue(row.getCell(3)));
      const corteActividad = toISODate(cellValue(row.getCell(5)));
      if (!mes) return;
      if (!ORDEN_MESES_DEFAULT.includes(mes.toUpperCase())) return; // filtra "ACUMULADO" y ruido
      const nombre = mes.toUpperCase();
      if (periodosSet.has(nombre)) return;
      periodosSet.add(nombre);
      periodos.push({
        nombre,
        orden: ORDEN_MESES_DEFAULT.indexOf(nombre) + 1,
        fecha_corte_ahorro: corteAhorro,
        fecha_corte_actividad: corteActividad,
      });
    });
  }
  // Si la hoja Datos no cubre todos los meses, completamos con defaults.
  for (const nombre of ORDEN_MESES_DEFAULT) {
    if (!periodosSet.has(nombre)) {
      periodos.push({
        nombre,
        orden: ORDEN_MESES_DEFAULT.indexOf(nombre) + 1,
        fecha_corte_ahorro: null,
        fecha_corte_actividad: null,
      });
    }
  }
  periodos.sort((a, b) => a.orden - b.orden);

  // --- 3) Transacciones (hoja BASE DE DATOS) ---
  const wsTx = wb.getWorksheet(HOJA_TRANSACCIONES);
  if (!wsTx) throw new Error(`No se encontró la hoja "${HOJA_TRANSACCIONES}"`);
  const transacciones = [];
  const errores = [];
  wsTx.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = toSocioId(cellValue(row.getCell(2)));
    const nombre = limpiarTexto(cellValue(row.getCell(3)));
    const conceptoRaw = limpiarTexto(cellValue(row.getCell(4)));
    const valor = toMoney(cellValue(row.getCell(7)));
    const fecha = toISODate(cellValue(row.getCell(9)));
    const mes = limpiarTexto(cellValue(row.getCell(10)));
    const moraAhorro = toMoney(cellValue(row.getCell(12)));
    const moraInt = toMoney(cellValue(row.getCell(13)));
    const diasMora = cellValue(row.getCell(14));

    if (!id || !nombre || !conceptoRaw) return;
    const concepto = MAPEO_CONCEPTO[conceptoRaw.toUpperCase()];
    if (!concepto) {
      errores.push({ fila: rowNumber, motivo: `Concepto desconocido: ${conceptoRaw}` });
      return;
    }
    if (!sociosPorId.has(id)) {
      const tipo = CUENTAS_ADMIN.has(nombre) ? "cuenta_admin" : "persona";
      sociosPorId.set(id, { id, nombre, cuota: 0, tipo });
    }
    const periodoNombre = mes ? mes.toUpperCase() : null;

    transacciones.push({
      fila: rowNumber,
      socio_id: id,
      concepto,
      tipo: TIPO_POR_CONCEPTO[concepto],
      valor,
      fecha_pago: fecha,
      periodo_nombre: periodoNombre,
      mora_ahorro: moraAhorro,
      mora_intereses: moraInt,
      dias_atraso: typeof diasMora === "number" ? Math.round(diasMora) : null,
    });
  });

  // --- 4) Extractos bancarios ---
  const movimientosBanco = [];
  for (const nombreHoja of HOJAS_BANCARIAS) {
    const ws = wb.getWorksheet(nombreHoja);
    if (!ws) continue;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const fecha = toISODate(cellValue(row.getCell(1)));
      const descripcion = limpiarTexto(cellValue(row.getCell(2)));
      const monto = toMoneySigned(cellValue(row.getCell(3)));
      const saldo = toMoneySigned(cellValue(row.getCell(4)));
      const detalle = limpiarTexto(cellValue(row.getCell(5)));
      const socioId = toSocioId(cellValue(row.getCell(6)));
      const socioNombre = limpiarTexto(cellValue(row.getCell(7)));

      if (!fecha && monto === 0) return; // fila vacía o solo texto
      if (socioId && socioNombre && !sociosPorId.has(socioId)) {
        const tipo = CUENTAS_ADMIN.has(socioNombre) ? "cuenta_admin" : "persona";
        sociosPorId.set(socioId, { id: socioId, nombre: socioNombre, cuota: 0, tipo });
      }
      movimientosBanco.push({
        banco: nombreHoja,
        fila: rowNumber,
        fecha,
        descripcion,
        monto,
        saldo_cuenta: saldo || null,
        detalle_origen: detalle,
        socio_id: socioId,
      });
    });
  }

  return {
    socios: [...sociosPorId.values()],
    periodos,
    transacciones,
    movimientos_banco: movimientosBanco,
    errores,
  };
}

// ------------------------------------------------------------
// Inserción por lotes dentro de transacción
// ------------------------------------------------------------

export function migrar(db, plan) {
  const insSocio = db.prepare(`
    INSERT INTO socios (id, nombre, cuota_sostenimiento, tipo, estado)
    VALUES (@id, @nombre, @cuota, @tipo, 'activo')
    ON CONFLICT(id) DO UPDATE SET
      nombre              = excluded.nombre,
      cuota_sostenimiento = excluded.cuota_sostenimiento,
      tipo                = excluded.tipo
  `);

  const insPeriodo = db.prepare(`
    INSERT INTO periodos (nombre, orden, fecha_corte_ahorro, fecha_corte_actividad)
    VALUES (@nombre, @orden, @fecha_corte_ahorro, @fecha_corte_actividad)
    ON CONFLICT(nombre) DO UPDATE SET
      orden                 = excluded.orden,
      fecha_corte_ahorro    = excluded.fecha_corte_ahorro,
      fecha_corte_actividad = excluded.fecha_corte_actividad
  `);

  const insTx = db.prepare(`
    INSERT INTO transacciones (
      socio_id, periodo_id, concepto, tipo, valor, fecha_pago, notas, fila_origen
    ) VALUES (@socio_id, @periodo_id, @concepto, @tipo, @valor, @fecha, @notas, @fila)
  `);

  const insPrestamo = db.prepare(`
    INSERT INTO prestamos (
      socio_id, transaccion_id, monto_prestado, tasa_interes,
      saldo_pendiente, fecha_desembolso, estado
    ) VALUES (@socio_id, @tx_id, @monto, 0.03, @monto, @fecha, 'activo')
  `);

  const insAbono = db.prepare(`
    INSERT INTO abonos_prestamos (
      prestamo_id, transaccion_id, socio_id, monto_abono,
      intereses_pagados, capital_pagado, fecha_abono
    ) VALUES (@prestamo_id, @tx_id, @socio_id, @monto, @intereses, @capital, @fecha)
  `);

  const insMulta = db.prepare(`
    INSERT INTO multas (
      socio_id, transaccion_id, periodo_id, tipo, valor, dias_atraso, estado
    ) VALUES (@socio_id, @tx_id, @periodo_id, @tipo, @valor, @dias, 'pendiente')
  `);

  const insMov = db.prepare(`
    INSERT INTO movimientos (
      socio_id, transaccion_id, tipo, concepto, valor, fecha, metadata
    ) VALUES (@socio_id, @tx_id, @tipo, @concepto, @valor, @fecha, @metadata)
  `);

  const insBanco = db.prepare(`
    INSERT INTO movimientos_banco (
      banco, fecha, descripcion, monto, saldo_cuenta, detalle_origen,
      socio_id, fila_origen
    ) VALUES (@banco, @fecha, @descripcion, @monto, @saldo_cuenta, @detalle_origen,
              @socio_id, @fila)
  `);

  const findPrestamoActivo = db.prepare(`
    SELECT id FROM prestamos
    WHERE socio_id = ? AND estado = 'activo'
    ORDER BY id DESC LIMIT 1
  `);

  const findPeriodoId = db.prepare(`SELECT id FROM periodos WHERE nombre = ?`);

  const ejecutar = () => {
    // 1) socios
    for (const s of plan.socios) {
      insSocio.run({
        id: Number(s.id),
        nombre: s.nombre,
        cuota: s.cuota,
        tipo: s.tipo,
      });
    }
    // 2) periodos
    for (const p of plan.periodos) insPeriodo.run(p);

    // 3) transacciones
    for (const t of plan.transacciones) {
      const socioId = Number(t.socio_id);
      const periodoRow = t.periodo_nombre ? findPeriodoId.get(t.periodo_nombre) : null;
      const periodoId = periodoRow?.id ?? null;
      const meta = JSON.stringify({ fila: t.fila });

      const txInfo = insTx.run({
        socio_id: socioId,
        periodo_id: periodoId,
        concepto: t.concepto,
        tipo: t.tipo,
        valor: t.valor,
        fecha: t.fecha_pago,
        notas: null,
        fila: t.fila,
      });
      const txId = Number(txInfo.lastInsertRowid);

      // Log de auditoría
      insMov.run({
        socio_id: socioId,
        tx_id: txId,
        tipo: t.tipo,
        concepto: t.concepto,
        valor: t.valor,
        fecha: t.fecha_pago,
        metadata: meta,
      });

      // Subtabla específica
      switch (t.concepto) {
        case "PRESTAMO": {
          insPrestamo.run({
            socio_id: socioId,
            tx_id: txId,
            monto: t.valor,
            fecha: t.fecha_pago,
          });
          break;
        }
        case "ABONO_PRESTAMO": {
          let row = findPrestamoActivo.get(socioId);
          if (!row?.id) {
            // Préstamo sombra: la natillera ya venía con deuda antes del rango del Excel
            const info = insPrestamo.run({
              socio_id: socioId,
              tx_id: null,
              monto: 0,
              fecha: t.fecha_pago,
            });
            row = { id: Number(info.lastInsertRowid) };
          }
          insAbono.run({
            prestamo_id: row.id,
            tx_id: txId,
            socio_id: socioId,
            monto: t.valor,
            intereses: 0,
            capital: t.valor,
            fecha: t.fecha_pago,
          });
          break;
        }
        case "INTERESES_PRESTAMO": {
          const row = findPrestamoActivo.get(socioId);
          if (row?.id) {
            insAbono.run({
              prestamo_id: row.id,
              tx_id: txId,
              socio_id: socioId,
              monto: t.valor,
              intereses: t.valor,
              capital: 0,
              fecha: t.fecha_pago,
            });
          }
          break;
        }
      }

      // Multas derivadas de las columnas L/M/N
      if (t.mora_ahorro > 0) {
        insMulta.run({
          socio_id: socioId,
          tx_id: txId,
          periodo_id: periodoId,
          tipo: "MORA_AHORRO",
          valor: t.mora_ahorro,
          dias: t.dias_atraso,
        });
      }
      if (t.mora_intereses > 0) {
        insMulta.run({
          socio_id: socioId,
          tx_id: txId,
          periodo_id: periodoId,
          tipo: "MORA_INTERESES",
          valor: t.mora_intereses,
          dias: t.dias_atraso,
        });
      }
    }

    // 4) extractos bancarios
    for (const m of plan.movimientos_banco) {
      insBanco.run({
        banco: m.banco,
        fecha: m.fecha,
        descripcion: m.descripcion,
        monto: m.monto,
        saldo_cuenta: m.saldo_cuenta,
        detalle_origen: m.detalle_origen,
        socio_id: m.socio_id ? Number(m.socio_id) : null,
        fila: m.fila,
      });
    }

    // 5) validación al centavo ANTES del COMMIT
    const val = validarSaldos(db, plan);
    if (!val.ok) throw new ErrorValidacion(val);
  };

  // Transacción manual (node:sqlite no tiene db.transaction(fn)).
  db.exec("BEGIN");
  try {
    ejecutar();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ------------------------------------------------------------
// Validación exacta post-migración
// ------------------------------------------------------------

export function validarSaldos(db, plan) {
  const conceptosDeAporte = new Set([
    "AHORRO",
    "ACTIVIDADES",
    "ABONO_PRESTAMO",
    "INTERESES_PRESTAMO",
    "RIFA_CHANCE",
  ]);
  const esperado = plan.transacciones.reduce(
    (acc, t) => (conceptosDeAporte.has(t.concepto) ? acc + t.valor : acc),
    0,
  );
  const obtenido = db
    .prepare(
      `SELECT COALESCE(SUM(valor),0) AS total
         FROM transacciones
        WHERE concepto IN ('AHORRO','ACTIVIDADES','ABONO_PRESTAMO','INTERESES_PRESTAMO','RIFA_CHANCE')`,
    )
    .get().total;
  const diferencia = obtenido - esperado;
  if (diferencia !== 0) return { ok: false, diferencia, esperado, obtenido };
  return { ok: true, esperado, obtenido };
}

export class ErrorValidacion extends Error {
  constructor({ esperado, obtenido, diferencia }) {
    super(
      `Descuadre: Excel=${esperado.toLocaleString("es-CO")} SQLite=${obtenido.toLocaleString("es-CO")} diff=${diferencia.toLocaleString("es-CO")}`,
    );
    this.name = "ErrorValidacion";
    this.esperado = esperado;
    this.obtenido = obtenido;
    this.diferencia = diferencia;
  }
}

// ------------------------------------------------------------
// Reporte de reconciliación multi-nivel
// ------------------------------------------------------------

export function imprimirReporte(db, plan) {
  const fmt = (n) => "$" + Number(n || 0).toLocaleString("es-CO");
  console.log("\n" + "═".repeat(72));
  console.log("  RECONCILIACIÓN Y CONSOLIDADO");
  console.log("═".repeat(72));

  const socios = db
    .prepare(
      "SELECT tipo, COUNT(*) as n FROM socios GROUP BY tipo",
    )
    .all();
  console.log("\n▸ SOCIOS");
  for (const r of socios) console.log(`    ${r.tipo.padEnd(15)} ${r.n}`);

  console.log("\n▸ TOTALES POR CONCEPTO (transacciones)");
  const totales = db
    .prepare(
      `SELECT concepto, tipo, COUNT(*) as n, SUM(valor) as total
         FROM transacciones
         GROUP BY concepto, tipo
         ORDER BY total DESC`,
    )
    .all();
  for (const r of totales) {
    console.log(
      `    ${r.concepto.padEnd(22)} ${r.tipo.padEnd(10)} ${String(r.n).padStart(5)} ${fmt(r.total).padStart(16)}`,
    );
  }

  console.log("\n▸ AHORRO POR PERIODO");
  const porPeriodo = db
    .prepare(
      `SELECT p.nombre, p.orden,
              COALESCE(SUM(CASE WHEN t.concepto='AHORRO' THEN t.valor END),0) AS ahorro,
              COUNT(t.id) AS n_tx
         FROM periodos p
         LEFT JOIN transacciones t ON t.periodo_id = p.id
         GROUP BY p.id
         ORDER BY p.orden`,
    )
    .all();
  for (const r of porPeriodo) {
    console.log(
      `    ${String(r.orden).padStart(2)}. ${r.nombre.padEnd(12)} ${fmt(r.ahorro).padStart(16)}   (${r.n_tx} tx)`,
    );
  }

  console.log("\n▸ EXTRACTOS BANCARIOS");
  const bancos = db
    .prepare(
      `SELECT banco,
              COUNT(*) AS n_movs,
              SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END) AS ingresos,
              SUM(CASE WHEN monto < 0 THEN -monto ELSE 0 END) AS egresos,
              SUM(CASE WHEN monto > 0 AND (detalle_origen IS NULL OR detalle_origen != 'PERSONAL') THEN monto ELSE 0 END) AS ingresos_natillera
         FROM movimientos_banco
         GROUP BY banco`,
    )
    .all();
  for (const b of bancos) {
    console.log(
      `    ${b.banco.padEnd(12)} ${String(b.n_movs).padStart(5)} movs   ingresos ${fmt(b.ingresos).padStart(15)}   natillera ${fmt(b.ingresos_natillera).padStart(15)}`,
    );
  }

  console.log("\n▸ TOP 10 SOCIOS POR TOTAL APORTADO");
  const top = db
    .prepare(
      `SELECT nombre, total_aportado, ahorro, saldo_prestamos
         FROM vw_saldo_por_socio
        WHERE tipo = 'persona'
        ORDER BY total_aportado DESC
        LIMIT 10`,
    )
    .all();
  for (const s of top) {
    console.log(
      `    ${s.nombre.padEnd(28)} aportado ${fmt(s.total_aportado).padStart(14)}   ahorro ${fmt(s.ahorro).padStart(14)}   deuda ${fmt(s.saldo_prestamos).padStart(12)}`,
    );
  }

  const liq = db
    .prepare(
      `SELECT COALESCE(SUM(valor),0) as util FROM transacciones
        WHERE concepto IN ('INTERESES_PRESTAMO','MULTA','RIFA_CHANCE')`,
    )
    .get();
  console.log(
    `\n▸ UTILIDAD DEL CICLO (intereses + multas + rifas): ${fmt(liq.util)}`,
  );

  console.log("═".repeat(72));
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

function parseArgs(argv) {
  const args = { file: null, db: "natillera.db", dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--db=")) args.db = a.slice(5);
    else if (!a.startsWith("--")) args.file = a;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error(
      "Uso: node importador.js <ruta-al-xlsm> [--db=natillera.db] [--dry-run]",
    );
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  console.log(`📖 Leyendo ${filePath}…`);
  const plan = await procesarExcel(filePath);
  console.log(
    `   Socios: ${plan.socios.length}   Periodos: ${plan.periodos.length}   ` +
      `Transacciones: ${plan.transacciones.length}   Movs banco: ${plan.movimientos_banco.length}   ` +
      `Errores: ${plan.errores.length}`,
  );
  if (plan.errores.length > 0) {
    console.warn("⚠️  Filas con problemas:");
    for (const e of plan.errores.slice(0, 10)) console.warn(`   ${JSON.stringify(e)}`);
    if (plan.errores.length > 10) console.warn(`   … +${plan.errores.length - 10} más`);
  }

  if (args.dryRun) {
    console.log("💡 Dry-run: no se toca la base de datos.");
    return;
  }

  const dbPath = path.resolve(args.db);
  const db = inicializarDB(dbPath);
  console.log(`💾 SQLite: ${dbPath}`);

  try {
    migrar(db, plan);
    const val = validarSaldos(db, plan);
    console.log(
      `\n✅ Migración validada al centavo. Total ingresos (aportes): ${val.obtenido.toLocaleString("es-CO")}`,
    );
    imprimirReporte(db, plan);
  } catch (err) {
    if (err instanceof ErrorValidacion) {
      console.error("\n❌ VALIDACIÓN FALLIDA — se ejecutó ROLLBACK completo.");
      console.error(`   ${err.message}`);
    } else if (err && String(err.message).includes("UNIQUE constraint failed")) {
      console.error("\n❌ La base de datos ya contiene esta migración.");
      console.error("   Corre `npm run reset` para borrar natillera.db y volver a importar.");
    } else {
      console.error(err instanceof Error ? err.stack || err.message : String(err));
    }
    process.exitCode = 2;
  } finally {
    cerrarDB(db);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
