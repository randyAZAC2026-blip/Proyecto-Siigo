import { api, type PrestamoDetallado } from "@/lib/dashboard/api";
import { exportarExcel, type Celda, type HojaExcel } from "@/lib/informes/excel";

/**
 * Detallado de préstamos en Excel: un préstamo por fila con lo pagado y el
 * saldo, el historial de abonos e intereses y, si es de todos los socios,
 * un resumen por socio. Marca préstamos posiblemente duplicados (mismo socio,
 * fecha y monto) para revisarlos.
 */

const fecha = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";

const ESTADOS: Record<string, string> = { activo: "Activo", pagado: "Pagado" };

function observaciones(lista: PrestamoDetallado[]): Map<number, string> {
  const grupos = new Map<string, PrestamoDetallado[]>();
  for (const p of lista) {
    const k = `${p.socio_id}|${p.fecha_desembolso}|${p.monto_prestado}`;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  const obs = new Map<number, string>();
  for (const p of lista) {
    const notas: string[] = [];
    const iguales = grupos.get(`${p.socio_id}|${p.fecha_desembolso}|${p.monto_prestado}`)!.filter(
      (o) => o.prestamo_id !== p.prestamo_id,
    );
    if (iguales.length) {
      notas.push(`Posible duplicado de #${iguales.map((o) => o.prestamo_id).join(", #")} (misma fecha y monto)`);
    }
    if (!p.banco) notas.push("Sin salida del banco unida");
    obs.set(p.prestamo_id, notas.join(" · "));
  }
  return obs;
}

export function hojasDetalladoPrestamos(lista: PrestamoDetallado[], todos: boolean): HojaExcel[] {
  const obs = observaciones(lista);
  const pagado = (p: PrestamoDetallado) => ({
    intereses: p.abonos.reduce((s, a) => s + a.intereses, 0),
    capital: p.abonos.reduce((s, a) => s + a.capital, 0),
  });
  const suma = (f: (p: PrestamoDetallado) => number) => lista.reduce((s, p) => s + f(p), 0);

  const prestamos: HojaExcel = {
    nombre: "Préstamos",
    columnas: [
      { titulo: "Préstamo #", tipo: "numero", ancho: 10 },
      ...(todos ? [{ titulo: "Socio", ancho: 26 }] : []),
      { titulo: "Recomendado por", ancho: 20 },
      { titulo: "Desembolso", tipo: "fecha", ancho: 11 },
      { titulo: "Monto prestado", tipo: "moneda" },
      { titulo: "Tasa mensual", ancho: 10 },
      { titulo: "Intereses pagados", tipo: "moneda" },
      { titulo: "Capital abonado", tipo: "moneda" },
      { titulo: "Saldo", tipo: "moneda" },
      { titulo: "Estado", ancho: 9 },
      { titulo: "Salida del banco", tipo: "fecha", ancho: 11 },
      { titulo: "Descripción en el banco", ancho: 30 },
      { titulo: "Valor salido del banco", tipo: "moneda" },
      { titulo: "Observación", ancho: 50 },
    ],
    filas: lista.map((p) => {
      const pg = pagado(p);
      return [
        p.prestamo_id,
        ...(todos ? [p.socio] : []),
        p.responsable ?? "",
        fecha(p.fecha_desembolso),
        p.monto_prestado,
        p.tasa != null ? `${Math.round(p.tasa * 1000) / 10}%` : "",
        pg.intereses,
        pg.capital,
        p.saldo,
        ESTADOS[p.estado] ?? p.estado,
        fecha(p.banco?.fecha),
        p.banco?.descripcion ?? "",
        p.banco ? Math.abs(p.banco.monto) : null,
        obs.get(p.prestamo_id) ?? "",
      ] as Celda[];
    }),
    totales: [
      `Total (${lista.length})`,
      ...(todos ? [""] : []),
      "",
      "",
      suma((p) => p.monto_prestado),
      "",
      suma((p) => pagado(p).intereses),
      suma((p) => pagado(p).capital),
      suma((p) => p.saldo),
      "",
      "",
      "",
      suma((p) => (p.banco ? Math.abs(p.banco.monto) : 0)),
      "",
    ],
  };

  const movimientos = lista.flatMap((p) => p.abonos.map((a) => ({ p, a })));
  const abonos: HojaExcel = {
    nombre: "Abonos e intereses",
    columnas: [
      ...(todos ? [{ titulo: "Socio", ancho: 26 }] : []),
      { titulo: "Préstamo #", tipo: "numero", ancho: 10 },
      { titulo: "Fecha", tipo: "fecha", ancho: 11 },
      { titulo: "Intereses", tipo: "moneda" },
      { titulo: "Abono a capital", tipo: "moneda" },
      { titulo: "Total pagado", tipo: "moneda" },
    ],
    filas: movimientos.map(({ p, a }) => [
      ...(todos ? [p.socio] : []),
      p.prestamo_id,
      fecha(a.fecha),
      a.intereses,
      a.capital,
      a.intereses + a.capital,
    ]),
    totales: [
      ...(todos ? ["Total"] : []),
      todos ? "" : "Total",
      "",
      movimientos.reduce((s, m) => s + m.a.intereses, 0),
      movimientos.reduce((s, m) => s + m.a.capital, 0),
      movimientos.reduce((s, m) => s + m.a.intereses + m.a.capital, 0),
    ],
  };

  const hojas = [prestamos, abonos];
  if (todos) {
    const porSocio = new Map<string, PrestamoDetallado[]>();
    for (const p of lista) porSocio.set(p.socio, [...(porSocio.get(p.socio) ?? []), p]);
    const filas = [...porSocio.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([socio, ps]) => [
        socio,
        ps.length,
        ps.reduce((s, p) => s + p.monto_prestado, 0),
        ps.reduce((s, p) => s + pagado(p).intereses, 0),
        ps.reduce((s, p) => s + pagado(p).capital, 0),
        ps.reduce((s, p) => s + p.saldo, 0),
      ]);
    hojas.unshift({
      nombre: "Resumen por socio",
      columnas: [
        { titulo: "Socio", ancho: 28 },
        { titulo: "Préstamos", tipo: "numero", ancho: 10 },
        { titulo: "Monto prestado", tipo: "moneda" },
        { titulo: "Intereses pagados", tipo: "moneda" },
        { titulo: "Capital abonado", tipo: "moneda" },
        { titulo: "Saldo", tipo: "moneda" },
      ],
      filas,
      totales: [
        `Total (${filas.length} socios)`,
        lista.length,
        suma((p) => p.monto_prestado),
        suma((p) => pagado(p).intereses),
        suma((p) => pagado(p).capital),
        suma((p) => p.saldo),
      ],
    });
  }
  return hojas;
}

/** Descarga el detallado de un socio (o de todos, sin socio). */
export async function descargarDetalladoPrestamos(socio?: { id: number; nombre: string }): Promise<number> {
  const lista = await api.detalladoPrestamos(socio?.id ?? null);
  if (lista.length === 0) throw new Error("No hay préstamos para exportar.");
  const corte = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  await exportarExcel(
    socio ? `Préstamos ${socio.nombre}` : "Detallado de préstamos",
    corte,
    hojasDetalladoPrestamos(lista, !socio),
  );
  return lista.length;
}
