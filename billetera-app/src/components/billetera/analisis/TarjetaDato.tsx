import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface Props {
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  /** Variación % frente al mes anterior. `subirEsMalo`: en gastos, subir es una alerta. */
  variacion?: number | null;
  subirEsMalo?: boolean;
}

/** Cifra principal con su comparación (con flecha y palabra, nunca solo color). */
export function TarjetaDato({ titulo, valor, detalle, variacion, subirEsMalo }: Props) {
  const hay = variacion !== undefined && variacion !== null && Number.isFinite(variacion);
  const sube = hay && variacion! > 0;
  const malo = hay && (subirEsMalo ? sube : !sube) && Math.abs(variacion!) >= 5;   // cambios pequeños no son alerta
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs text-[var(--color-muted)]">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--color-text)]">{valor}</p>
      {hay && (
        <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${malo ? "text-[var(--color-destructive)]" : "text-[var(--color-muted)]"}`}>
          {sube ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
          {sube ? "Subió" : "Bajó"} {Math.abs(variacion!).toFixed(0)} % vs. mes anterior
        </p>
      )}
      {detalle && <p className="mt-1 text-xs text-[var(--color-muted)]">{detalle}</p>}
    </div>
  );
}
