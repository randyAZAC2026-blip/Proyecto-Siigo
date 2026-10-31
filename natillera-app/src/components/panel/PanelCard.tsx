import type { ReactNode } from "react";

/** Tarjeta base del panel: título, subtítulo opcional y acción a la derecha. */
export function PanelCard({
  titulo,
  subtitulo,
  accion,
  children,
  className = "",
}: {
  titulo?: string;
  subtitulo?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] ${className}`}
    >
      {(titulo || accion) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h2 className="text-sm font-semibold text-[var(--color-text)]">{titulo}</h2>}
            {subtitulo && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{subtitulo}</p>}
          </div>
          {accion && <div className="shrink-0">{accion}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Botón de texto para "ver más" dentro de una tarjeta. */
export function AccionLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/8 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
    >
      {children}
    </button>
  );
}
