const formatterCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCOP(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return formatterCOP.format(value);
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
