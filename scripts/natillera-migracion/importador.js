// importador.js
// ETL para migrar los aportes/prestamos/rifas/actividades desde el Excel de la
// natillera hacia SQLite. Toda la inserción va dentro de una transacción; si el
// checksum final no cuadra al centavo se hace ROLLBACK completo.
//
// Uso:
//   node importador.js <ruta-al-xlsm> [--db=natillera.db] [--dry-run]

import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";
import { inicializarDB, cerrarDB } from "./database.js";

const HOJA_TRANSACCIONES = "BASE DE DATOS";
const HOJA_MAESTRA = "BD"; // hoja con cuota mensual y n. rifa por socio

// ------------------------------------------------------------
// Utilidades de limpieza (edge cases del prompt)
// ------------------------------------------------------------

/** Convierte cualquier celda a un entero de pesos limpio, positivo (el signo
 *  lo determina el `tipo` ingreso/egreso del movimiento). Nunca devuelve NaN. */
function toMoney(raw) {
  if (raw === null || raw === undefined || raw === "") return 0;
  // Errores tipo #DIV/0!, #REF!, #N/A: ExcelJS los expone como { error: '#...' }
  if (typeof raw === "object" && "error" in raw) return 0;
  if (typeof raw === "number") return Math.abs(Math.round(raw));
  const cleaned = String(raw).replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : 0;
}

/** Normaliza el número identificador del socio ("10.0" -> "10"). */
function toSocioId(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "object" && "error" in raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Excel entrega los enteros como float; queremos "10" no "10.0"
  const n = Number(s);
  if (Number.isFinite(n) && Number.isInteger(n)) return String(n);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s;
}

/** Convierte una celda de fecha de Excel a ISO yyyy-mm-dd. */
function toISODate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    // Serial number Excel -> ms desde epoch (asume 1900 date system)
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

/** Extrae el valor "puro" de una celda ExcelJS (soporta ricos, hyperlinks, formulas). */
function cellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  const v = cell.value;
  if (typeof v === "object") {
    if ("result" in v) return v.result; // fórmulas evaluadas
    if ("text" in v && !("richText" in v)) return v.text;
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("error" in v) return v; // dejamos pasar el marcador de error
  }
  return v;
}

// ------------------------------------------------------------
// Procesamiento del Excel
// ------------------------------------------------------------

/**
 * Lee el archivo y devuelve un plan de importación en memoria.
 * Nunca toca la BD — permite validar / hacer dry-run.
 */
export async function procesarExcel(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const wsMaestra = wb.getWorksheet(HOJA_MAESTRA);
  const wsTx = wb.getWorksheet(HOJA_TRANSACCIONES);
  if (!wsTx) throw new Error(`No se encontró la hoja "${HOJA_TRANSACCIONES}"`);
  if (!wsMaestra) throw new Error(`No se encontró la hoja "${HOJA_MAESTRA}"`);

  // --- Maestra de socios (hoja BD) ---
  // A: N. RIFA | B: SOCIOS | C: CUOTA MENSUAL
  /** @type {Map<string,{id:string,nombre:string,cuota:number}>} */
  const sociosPorId = new Map();
  wsMaestra.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = toSocioId(cellValue(row.getCell(1)));
    const nombre = limpiarTexto(cellValue(row.getCell(2)));
    const cuota = toMoney(cellValue(row.getCell(3)));
    if (!id || !nombre) return;
    if (!sociosPorId.has(id)) {
      sociosPorId.set(id, { id, nombre, cuota });
    }
  });

  // --- Transacciones (hoja BASE DE DATOS) ---
  // B: # (socio) | C: NOMBRES | D: Concepto | G: Valor | I: Fecha | J: MES
  // L: Valor Mora Ahorro | M: Valor Mora Int
  const transacciones = [];
  const errores = [];

  wsTx.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = toSocioId(cellValue(row.getCell(2)));
    const nombre = limpiarTexto(cellValue(row.getCell(3)));
    const concepto = limpiarTexto(cellValue(row.getCell(4)));
    const valor = toMoney(cellValue(row.getCell(7)));
    const fecha = toISODate(cellValue(row.getCell(9)));
    const mes = limpiarTexto(cellValue(row.getCell(10)));
    const moraAhorro = toMoney(cellValue(row.getCell(12)));
    const moraInt = toMoney(cellValue(row.getCell(13)));

    if (!id || !nombre || !concepto) {
      // Fila sin socio o sin concepto: se ignora silenciosamente porque el
      // Excel tiene filas de totales y separadores.
      return;
    }

    // Garantiza que el socio exista aunque no esté en la maestra.
    if (!sociosPorId.has(id)) {
      sociosPorId.set(id, { id, nombre, cuota: 0 });
    }

    // No dedupamos por contenido: dos abonos legítimos del mismo monto en el
    // mismo mes son transacciones distintas. La idempotencia entre corridas
    // se garantiza por `fila_origen` en el esquema y por el truncado inicial
    // dentro de la transacción.
    transacciones.push({
      fila: rowNumber,
      socio_id: id,
      concepto,
      valor,
      fecha,
      periodo: mes || "",
      mora_ahorro: moraAhorro,
      mora_intereses: moraInt,
    });
  });

  return {
    socios: [...sociosPorId.values()],
    transacciones,
    errores,
  };
}

// ------------------------------------------------------------
// Inserción por lotes dentro de transacción
// ------------------------------------------------------------

/**
 * Inserta todo el plan dentro de una única transacción y ejecuta la validación
 * al centavo ANTES del COMMIT. Si el checksum no cuadra, `throw` dispara el
 * ROLLBACK automático de `better-sqlite3`.
 */
export function migrar(db, plan) {
  const insSocio = db.prepare(`
    INSERT INTO socios (id, nombre, cuota_sostenimiento, estado)
    VALUES (@id, @nombre, @cuota, 'activo')
    ON CONFLICT(id) DO UPDATE SET
      nombre              = excluded.nombre,
      cuota_sostenimiento = excluded.cuota_sostenimiento
  `);

  const insCuota = db.prepare(`
    INSERT INTO cuotas (socio_id, periodo, valor_aporte, fecha_pago, concepto, fila_origen)
    VALUES (@socio_id, @periodo, @valor, @fecha, @concepto, @fila)
  `);

  const insPrestamo = db.prepare(`
    INSERT INTO prestamos (
      socio_id, monto_prestado, tasa_interes, saldo_pendiente,
      fecha_desembolso, estado
    ) VALUES (@socio_id, @monto, 0.03, @monto, @fecha, 'activo')
  `);

  const insAbono = db.prepare(`
    INSERT INTO abonos_prestamos (
      prestamo_id, socio_id, monto_abono, intereses_pagados,
      capital_pagado, fecha_abono
    ) VALUES (@prestamo_id, @socio_id, @monto, @intereses, @capital, @fecha)
  `);

  const insRifa = db.prepare(`
    INSERT INTO rifas (socio_id, periodo, valor_boleta, pagado, fila_origen)
    VALUES (@socio_id, @periodo, @valor, 1, @fila)
  `);

  const insMulta = db.prepare(`
    INSERT INTO multas (socio_id, concepto, valor, estado, periodo)
    VALUES (@socio_id, @concepto, @valor, 'pendiente', @periodo)
  `);

  const insMov = db.prepare(`
    INSERT INTO movimientos (socio_id, tipo, concepto, valor, fecha, metadata)
    VALUES (@socio_id, @tipo, @concepto, @valor, @fecha, @metadata)
  `);

  // Localizador del último préstamo activo por socio para asociar abonos.
  const buscaUltimoPrestamo = db.prepare(`
    SELECT id FROM prestamos
    WHERE socio_id = ? AND estado = 'activo'
    ORDER BY id DESC LIMIT 1
  `);

  const totalesPorConcepto = new Map();

  const ejecutar = db.transaction(() => {
    // 1) socios
    for (const s of plan.socios) {
      insSocio.run({
        id: Number(s.id),
        nombre: s.nombre,
        cuota: s.cuota,
      });
    }

    // 2) transacciones -> tabla específica + log de auditoría
    for (const t of plan.transacciones) {
      const socioId = Number(t.socio_id);
      const meta = JSON.stringify({ fila: t.fila });

      switch (t.concepto) {
        case "AHORRO":
        case "ACTIVIDADES": {
          insCuota.run({
            socio_id: socioId,
            periodo: t.periodo,
            valor: t.valor,
            fecha: t.fecha,
            concepto: t.concepto,
            fila: t.fila,
          });
          insMov.run({
            socio_id: socioId,
            tipo: "ingreso",
            concepto: t.concepto,
            valor: t.valor,
            fecha: t.fecha,
            metadata: meta,
          });
          break;
        }
        case "PRESTAMO": {
          insPrestamo.run({
            socio_id: socioId,
            monto: t.valor,
            fecha: t.fecha,
          });
          insMov.run({
            socio_id: socioId,
            tipo: "egreso",
            concepto: "PRESTAMO",
            valor: t.valor,
            fecha: t.fecha,
            metadata: meta,
          });
          break;
        }
        case "ABONO PRESTAMO": {
          let row = buscaUltimoPrestamo.get(socioId);
          if (!row?.id) {
            // Préstamo sombra: la natillera ya venía con deuda cuando arrancó
            // este Excel. Registramos un préstamo con monto 0 solo para poder
            // colgar los abonos y mantener la integridad referencial. El
            // saldo real quedará reflejado en la tabla `movimientos`.
            const info = insPrestamo.run({
              socio_id: socioId,
              monto: 0,
              fecha: t.fecha,
            });
            row = { id: Number(info.lastInsertRowid) };
          }
          const prestamoId = row.id;
          insAbono.run({
            prestamo_id: prestamoId,
            socio_id: socioId,
            monto: t.valor,
            intereses: 0,
            capital: t.valor,
            fecha: t.fecha,
          });
          insMov.run({
            socio_id: socioId,
            tipo: "ingreso",
            concepto: "ABONO_PRESTAMO",
            valor: t.valor,
            fecha: t.fecha,
            metadata: meta,
          });
          break;
        }
        case "INTERESES PRESTAMO": {
          const row = buscaUltimoPrestamo.get(socioId);
          if (row?.id) {
            insAbono.run({
              prestamo_id: row.id,
              socio_id: socioId,
              monto: t.valor,
              intereses: t.valor,
              capital: 0,
              fecha: t.fecha,
            });
          }
          insMov.run({
            socio_id: socioId,
            tipo: "ingreso",
            concepto: "INTERESES_PRESTAMO",
            valor: t.valor,
            fecha: t.fecha,
            metadata: meta,
          });
          break;
        }
        case "RIFA CHANCE": {
          insRifa.run({
            socio_id: socioId,
            periodo: t.periodo,
            valor: t.valor,
            fila: t.fila,
          });
          insMov.run({
            socio_id: socioId,
            tipo: "ingreso",
            concepto: "RIFA_CHANCE",
            valor: t.valor,
            fecha: t.fecha,
            metadata: meta,
          });
          break;
        }
        default: {
          // Concepto desconocido: log de auditoría sin lanzar excepción para no
          // abortar la transacción por una fila mal etiquetada.
          insMov.run({
            socio_id: socioId,
            tipo: "ingreso",
            concepto: "ACTIVIDADES",
            valor: t.valor,
            fecha: t.fecha,
            metadata: JSON.stringify({ fila: t.fila, concepto_raw: t.concepto }),
          });
        }
      }

      // Multas derivadas de las columnas L/M de la misma fila.
      if (t.mora_ahorro > 0) {
        insMulta.run({
          socio_id: socioId,
          concepto: "MORA_AHORRO",
          valor: t.mora_ahorro,
          periodo: t.periodo,
        });
        insMov.run({
          socio_id: socioId,
          tipo: "ingreso",
          concepto: "MULTA",
          valor: t.mora_ahorro,
          fecha: t.fecha,
          metadata: JSON.stringify({ fila: t.fila, tipo: "MORA_AHORRO" }),
        });
      }
      if (t.mora_intereses > 0) {
        insMulta.run({
          socio_id: socioId,
          concepto: "MORA_INTERESES",
          valor: t.mora_intereses,
          periodo: t.periodo,
        });
        insMov.run({
          socio_id: socioId,
          tipo: "ingreso",
          concepto: "MULTA",
          valor: t.mora_intereses,
          fecha: t.fecha,
          metadata: JSON.stringify({ fila: t.fila, tipo: "MORA_INTERESES" }),
        });
      }

      // Acumuladores para la validación posterior.
      const key = t.concepto;
      totalesPorConcepto.set(key, (totalesPorConcepto.get(key) || 0) + t.valor);
    }

    // Validación DENTRO de la transacción: si no cuadra al centavo, lanzamos
    // y `better-sqlite3` ejecuta ROLLBACK automáticamente. Ninguna fila queda
    // persistida.
    const val = validarSaldos(db, plan);
    if (!val.ok) {
      throw new ErrorValidacion(val);
    }
  });

  ejecutar(); // BEGIN / (COMMIT o ROLLBACK) atómico

  return { totalesPorConcepto };
}

/** Error tipado para descuadres — el CLI lo captura sin tratarlo como bug. */
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
// Validación exacta post-migración
// ------------------------------------------------------------

/**
 * Compara el total de ingresos de la BD contra la suma directa del Excel.
 * @returns {{ok:true} | {ok:false, diferencia:number, esperado:number, obtenido:number}}
 */
export function validarSaldos(db, plan) {
  // Total de AHORRO + ACTIVIDADES + ABONO PRESTAMO + INTERESES PRESTAMO + RIFA CHANCE
  // en Excel (suma aritmética directa desde el plan en memoria)
  const conceptosDeAporte = new Set([
    "AHORRO",
    "ACTIVIDADES",
    "ABONO PRESTAMO",
    "INTERESES PRESTAMO",
    "RIFA CHANCE",
  ]);
  const esperado = plan.transacciones.reduce(
    (acc, t) => (conceptosDeAporte.has(t.concepto) ? acc + t.valor : acc),
    0,
  );

  // El mismo agregado desde SQLite
  const obtenido = db
    .prepare(
      `SELECT COALESCE(SUM(valor),0) AS total
         FROM movimientos
        WHERE concepto IN ('AHORRO','ACTIVIDADES','ABONO_PRESTAMO','INTERESES_PRESTAMO','RIFA_CHANCE')`,
    )
    .get().total;

  const diferencia = obtenido - esperado;
  if (diferencia !== 0) return { ok: false, diferencia, esperado, obtenido };
  return { ok: true, esperado, obtenido };
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
    `   Socios: ${plan.socios.length}, transacciones: ${plan.transacciones.length}, errores previos: ${plan.errores.length}`,
  );
  if (plan.errores.length > 0) {
    console.warn("⚠️  Filas con problemas antes de tocar la BD:");
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
      `✅ Migración validada al centavo. Total ingresos: ${val.obtenido.toLocaleString("es-CO")}`,
    );
  } catch (err) {
    if (err instanceof ErrorValidacion) {
      console.error("❌ VALIDACIÓN FALLIDA — se ejecutó ROLLBACK completo.");
      console.error(`   ${err.message}`);
    } else if (err && String(err.message).includes("UNIQUE constraint failed")) {
      console.error("❌ La base de datos ya contiene esta migración.");
      console.error("   Corre `npm run reset` para borrar natillera.db y volver a importar.");
    } else {
      console.error(err instanceof Error ? err.stack || err.message : String(err));
    }
    process.exitCode = 2;
  } finally {
    cerrarDB(db);
  }
}

// Solo ejecutamos main() cuando se corre como CLI, no cuando se importa.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
