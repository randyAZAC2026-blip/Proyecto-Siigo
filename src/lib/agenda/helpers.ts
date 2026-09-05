import type {
  EstadoTarea,
  FrecuenciaObligacion,
  PrioridadTarea,
  Tarea,
} from "@/lib/supabase/database.types";

export const RESPONSABILIDADES_CATALOGO: { codigo: string; label: string }[] = [
  { codigo: "iva-bim", label: "IVA bimestral" },
  { codigo: "iva-cuat", label: "IVA cuatrimestral" },
  { codigo: "retefuente", label: "Retención en la fuente" },
  { codigo: "reteica-med", label: "ReteICA Medellín" },
  { codigo: "ica-med", label: "ICA Medellín" },
  { codigo: "renta-pj", label: "Renta PJ" },
  { codigo: "renta-pn", label: "Renta PN" },
  { codigo: "exogena-dian", label: "Info exógena DIAN" },
  { codigo: "exogena-med", label: "Info exógena Medellín" },
  { codigo: "activos-ext", label: "Activos en el exterior" },
  { codigo: "patrimonio", label: "Impuesto al patrimonio" },
  { codigo: "gmf", label: "GMF (agentes)" },
  { codigo: "nomina-elect", label: "Nómina electrónica" },
  { codigo: "fac-elect", label: "Factura electrónica" },
  { codigo: "seg-social", label: "Seguridad social (PILA)" },
];

export const FRECUENCIAS: { value: FrecuenciaObligacion; label: string; periodos: number }[] = [
  { value: "mensual", label: "Mensual", periodos: 12 },
  { value: "bimestral", label: "Bimestral", periodos: 6 },
  { value: "trimestral", label: "Trimestral", periodos: 4 },
  { value: "cuatrimestral", label: "Cuatrimestral", periodos: 3 },
  { value: "semestral", label: "Semestral", periodos: 2 },
  { value: "anual", label: "Anual", periodos: 1 },
  { value: "unica", label: "Única", periodos: 1 },
];

export const PRIORIDADES: { value: PrioridadTarea; label: string; badgeClass: string }[] = [
  { value: "baja", label: "Baja", badgeClass: "bg-[var(--color-muted)]/15 text-[var(--color-muted)]" },
  { value: "media", label: "Media", badgeClass: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" },
  { value: "alta", label: "Alta", badgeClass: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" },
  { value: "urgente", label: "Urgente", badgeClass: "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]" },
];

export const ESTADOS: { value: EstadoTarea; label: string; badgeClass: string }[] = [
  { value: "pendiente", label: "Pendiente", badgeClass: "bg-[var(--color-muted)]/15 text-[var(--color-muted)]" },
  { value: "en_proceso", label: "En proceso", badgeClass: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" },
  { value: "en_revision", label: "En revisión", badgeClass: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]" },
  { value: "entregada", label: "Entregada", badgeClass: "bg-[var(--color-success)]/15 text-[var(--color-success)]" },
  { value: "no_aplica", label: "No aplica", badgeClass: "bg-[var(--color-muted)]/10 text-[var(--color-muted)]" },
];

export function periodoLabel(frecuencia: FrecuenciaObligacion, numero: number | null): string {
  if (numero == null) return "—";
  switch (frecuencia) {
    case "mensual":
      return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][numero - 1] ?? String(numero);
    case "bimestral":
      return `Bim ${numero}`;
    case "trimestral":
      return `Trim ${numero}`;
    case "cuatrimestral":
      return `Cuat ${numero}`;
    case "semestral":
      return numero === 1 ? "1° sem" : "2° sem";
    default:
      return String(numero);
  }
}

export function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Días entre hoy y una fecha ISO (YYYY-MM-DD). Negativo si ya venció. */
export function diasHastaVencimiento(iso: string | null, today = new Date()): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24));
}

export function estadoEfectivo(tarea: Pick<Tarea, "estado" | "fecha_vencimiento">): {
  key: EstadoTarea | "vencida";
  label: string;
  badgeClass: string;
} {
  if (tarea.estado === "entregada" || tarea.estado === "no_aplica") {
    const cfg = ESTADOS.find((e) => e.value === tarea.estado)!;
    return { key: tarea.estado, label: cfg.label, badgeClass: cfg.badgeClass };
  }
  const dias = diasHastaVencimiento(tarea.fecha_vencimiento);
  if (dias !== null && dias < 0) {
    return { key: "vencida", label: "Vencida", badgeClass: "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]" };
  }
  const cfg = ESTADOS.find((e) => e.value === tarea.estado)!;
  return { key: tarea.estado, label: cfg.label, badgeClass: cfg.badgeClass };
}
