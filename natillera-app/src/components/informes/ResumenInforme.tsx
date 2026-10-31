import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface ItemResumen {
  label: string;
  valor: string;
  detalle?: string;
  /** Estado del número: se marca con ícono + color, nunca solo color. */
  tono?: "normal" | "bueno" | "alerta";
}

/** Franja de totales que encabeza cada informe (también sale al imprimir). */
export function ResumenInforme({ items }: { items: ItemResumen[] }) {
  return (
    // Las líneas entre celdas son el fondo del contenedor asomándose por el gap de 1px.
    <dl
      className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-border)] shadow-[var(--shadow-card)] lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none"
      data-print="resumen"
    >
      {items.map((it) => (
        <div key={it.label} className="min-w-0 bg-[var(--color-surface)] px-4 py-3">
          <dt className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
            {it.tono === "alerta" && <AlertTriangle className="size-3 text-[var(--color-warning)]" aria-label="Atención" />}
            {it.tono === "bueno" && <CheckCircle2 className="size-3 text-[var(--status-good)]" aria-label="Bien" />}
            {it.label}
          </dt>
          <dd className="mt-1 truncate text-xl font-semibold tracking-tight text-[var(--color-text)]" title={it.valor}>
            {it.valor}
          </dd>
          {it.detalle && <dd className="truncate text-[11px] text-[var(--color-muted)]">{it.detalle}</dd>}
        </div>
      ))}
    </dl>
  );
}
