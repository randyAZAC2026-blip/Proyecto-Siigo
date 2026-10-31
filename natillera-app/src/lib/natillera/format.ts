const formatterCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCOP(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return formatterCOP.format(value);
}

/** Monto corto para tarjetas y ejes: $47,6 M · $850 mil · $12.000. */
export function formatCOPCompacto(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  const signo = value < 0 ? "−" : "";
  const v = Math.abs(value);
  if (v >= 1_000_000) {
    return `${signo}$${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  }
  if (v >= 10_000) {
    return `${signo}$${Math.round(v / 1_000).toLocaleString("es-CO")} mil`;
  }
  return `${signo}$${Math.round(v).toLocaleString("es-CO")}`;
}

/** "6 sep 2026" */
export function formatFechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

export function parseCOP(input: string): number {
  const cleaned = input.replace(/[^\d]/g, "");
  if (!cleaned) return 0;
  return Number(cleaned);
}

const NOMBRES_CONCEPTO: Record<string, string> = {
  AHORRO: "Ahorro",
  ACTIVIDADES: "Actividades",
  RIFA_CHANCE: "Rifa / chance",
  PRESTAMO: "Préstamo recibido",
  ABONO_PRESTAMO: "Abono a préstamo",
  INTERESES_PRESTAMO: "Intereses de préstamo",
  MULTA: "Multa",
};

/** Nombre legible de un concepto de la natillera (AHORRO → "Ahorro"). */
export function nombreConcepto(concepto: string): string {
  return NOMBRES_CONCEPTO[concepto] ?? concepto.replace(/_/g, " ");
}
