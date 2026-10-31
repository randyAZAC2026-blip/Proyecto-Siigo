import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

/** Indicador: etiqueta · valor · detalle. Si tiene destino, toda la tarjeta es un botón. */
export function StatTile({
  label,
  valor,
  detalle,
  Icon,
  onClick,
}: {
  label: string;
  valor: string;
  detalle?: string;
  Icon: LucideIcon;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
        <span className="grid size-7 place-items-center rounded-lg bg-[var(--color-primary)]/8 text-[var(--color-primary)]">
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>
      <div className="mt-2 text-[1.6rem] font-semibold leading-tight tracking-tight text-[var(--color-text)]">
        {valor}
      </div>
      {detalle && (
        <div className="mt-1 flex items-center gap-1 text-xs text-[var(--color-muted)]">
          <span className="truncate">{detalle}</span>
          {onClick && <ChevronRight className="ml-auto size-3.5 shrink-0 opacity-60" aria-hidden />}
        </div>
      )}
    </>
  );
  const clase =
    "block w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-card)]";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${clase} transition-colors hover:border-[var(--color-primary)]/40 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]`}
    >
      {contenido}
    </button>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}
