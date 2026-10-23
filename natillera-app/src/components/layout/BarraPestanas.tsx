import { useState } from "react";
import { LogOut, MoreHorizontal, X } from "lucide-react";
import type { Modulo, Vista } from "@/lib/navegacion";

interface Props {
  pestanas: Modulo[];
  /** Módulos que no caben en la barra; si hay, aparece la pestaña "Más". */
  mas?: Modulo[];
  vista: Vista;
  onIr: (v: Vista) => void;
  onSalir?: () => void;
}

// Navegación del celular: barra fija abajo, como una app. En pantallas grandes manda el menú lateral.
export function BarraPestanas({ pestanas, mas = [], vista, onIr, onSalir }: Props) {
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const enMas = mas.some((m) => m.key === vista);
  const ir = (v: Vista) => {
    setHojaAbierta(false);
    onIr(v);
  };
  const clase = (activa: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors ${
      activa ? "text-[var(--color-primary)] font-semibold" : "text-[var(--color-muted)]"
    }`;

  return (
    <>
      {hojaAbierta && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-label="Más opciones">
          <div className="absolute inset-0 bg-black/30" onClick={() => setHojaAbierta(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-[var(--color-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-text)]">Más</span>
              <button type="button" onClick={() => setHojaAbierta(false)} aria-label="Cerrar" className="p-1 text-[var(--color-muted)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mas.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => ir(key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${
                    vista === key
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-text)]"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </button>
              ))}
              {onSalir && (
                <button
                  type="button"
                  onClick={onSalir}
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-left text-sm text-[var(--color-destructive)]"
                >
                  <LogOut className="size-4 shrink-0" />
                  Salir
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {pestanas.map(({ key, label, corto, Icon }) => (
          <button key={key} type="button" onClick={() => ir(key)} className={clase(vista === key)} aria-current={vista === key ? "page" : undefined}>
            <Icon className="size-5" />
            {corto ?? label}
          </button>
        ))}
        {mas.length > 0 && (
          <button type="button" onClick={() => setHojaAbierta(true)} className={clase(enMas)}>
            <MoreHorizontal className="size-5" />
            Más
          </button>
        )}
      </nav>
    </>
  );
}
