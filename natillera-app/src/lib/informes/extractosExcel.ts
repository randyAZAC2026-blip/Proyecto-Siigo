import { api, NOMBRE_CATEGORIA, type ExtractoDescarga } from "@/lib/dashboard/api";
import { exportarExcel, type Celda, type HojaExcel } from "@/lib/informes/excel";

/**
 * Extractos del banco en Excel: un resumen mes a mes y una hoja por cuenta
 * (Bancolombia, Nequi…) con cada movimiento, su socio y su estado de
 * conciliación.
 */

const ESTADO: Record<string, string> = {
  conciliado: "Conciliado",
  parcial: "Parcial",
  excedido: "Excedido",
  pendiente: "Pendiente",
  personal: "Personal",
  banco: "Del banco",
};

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

function clasificacion(m: ExtractoDescarga): string {
  if (m.categoria) return NOMBRE_CATEGORIA[m.categoria] ?? m.categoria;
  return m.detalle_origen ?? "";
}

function hojaCuenta(banco: string, movs: ExtractoDescarga[]): HojaExcel {
  const ingresos = movs.reduce((s, m) => s + (m.monto > 0 ? m.monto : 0), 0);
  const egresos = movs.reduce((s, m) => s + (m.monto < 0 ? -m.monto : 0), 0);
  return {
    nombre: banco,
    columnas: [
      { titulo: "Fecha", tipo: "fecha", ancho: 11 },
      { titulo: "Descripción", ancho: 34 },
      { titulo: "Cuenta origen/destino", ancho: 18 },
      { titulo: "Socio", ancho: 26 },
      { titulo: "Ingreso", tipo: "moneda" },
      { titulo: "Egreso", tipo: "moneda" },
      { titulo: "Saldo de la cuenta", tipo: "moneda", ancho: 16 },
      { titulo: "Clasificación", ancho: 18 },
      { titulo: "Estado", ancho: 11 },
      { titulo: "Pendiente por conciliar", tipo: "moneda", ancho: 16 },
    ],
    filas: movs.map((m) => [
      fecha(m.fecha),
      m.descripcion ?? "",
      m.dependencia ?? "",
      m.socio_nombre ?? "",
      m.monto > 0 ? m.monto : null,
      m.monto < 0 ? -m.monto : null,
      m.saldo_cuenta,
      clasificacion(m),
      ESTADO[m.estado] ?? m.estado,
      ["pendiente", "parcial"].includes(m.estado) ? m.valor_pendiente : null,
    ] as Celda[]),
    totales: [`Total (${movs.length})`, "", "", "", ingresos, egresos, null, "", "", null],
  };
}

function hojaResumen(movs: ExtractoDescarga[]): HojaExcel {
  const grupos = new Map<string, ExtractoDescarga[]>();
  for (const m of movs) {
    const k = `${m.banco}|${(m.fecha ?? "").slice(0, 7)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  const filas = [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, ms]) => {
      const [banco, ym] = k.split("|");
      const ing = ms.reduce((s, m) => s + (m.monto > 0 ? m.monto : 0), 0);
      const egr = ms.reduce((s, m) => s + (m.monto < 0 ? -m.monto : 0), 0);
      return [
        banco,
        ym ? `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : "Sin fecha",
        ms.length,
        ing,
        egr,
        ing - egr,
        ms.filter((m) => m.estado === "pendiente" || m.estado === "parcial").length,
      ] as Celda[];
    });
  const ing = movs.reduce((s, m) => s + (m.monto > 0 ? m.monto : 0), 0);
  const egr = movs.reduce((s, m) => s + (m.monto < 0 ? -m.monto : 0), 0);
  return {
    nombre: "Resumen por mes",
    columnas: [
      { titulo: "Cuenta", ancho: 14 },
      { titulo: "Mes", ancho: 16 },
      { titulo: "Movimientos", tipo: "numero", ancho: 12 },
      { titulo: "Ingresos", tipo: "moneda" },
      { titulo: "Egresos", tipo: "moneda" },
      { titulo: "Neto", tipo: "moneda" },
      { titulo: "Por conciliar", tipo: "numero", ancho: 13 },
    ],
    filas,
    totales: [
      "Total",
      "",
      movs.length,
      ing,
      egr,
      ing - egr,
      movs.filter((m) => m.estado === "pendiente" || m.estado === "parcial").length,
    ],
  };
}

/** Descarga los extractos entre dos fechas (YYYY-MM-DD). Devuelve cuántos movimientos salieron. */
export async function descargarExtractos(desde: string, hasta: string): Promise<number> {
  const movs = await api.extractosRango(desde, hasta);
  if (movs.length === 0) throw new Error("No hay movimientos del banco en esas fechas.");
  const porCuenta = new Map<string, ExtractoDescarga[]>();
  for (const m of movs) porCuenta.set(m.banco, [...(porCuenta.get(m.banco) ?? []), m]);
  const anioCompleto = desde.endsWith("-01-01") && hasta.endsWith("-12-31") && desde.slice(0, 4) === hasta.slice(0, 4);
  const titulo = anioCompleto ? `Extractos ${desde.slice(0, 4)}` : `Extractos ${desde} a ${hasta}`;
  await exportarExcel(titulo, anioCompleto ? `año ${desde.slice(0, 4)}` : `${fecha(desde)} a ${fecha(hasta)}`, [
    hojaResumen(movs),
    ...[...porCuenta.entries()].map(([banco, ms]) => hojaCuenta(banco, ms)),
  ]);
  return movs.length;
}
