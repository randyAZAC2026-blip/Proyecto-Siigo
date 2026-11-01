import type { GastoCategoria } from "@/lib/billetera/analisis";
import { formatCOP } from "@/lib/billetera/format";
import { COLOR_GASTO } from "./colores";

interface Props {
  datos: GastoCategoria[];
  seleccionada: string | null;
  onSeleccionar: (nombre: string | null) => void;
}

/**
 * ¿En qué se va la plata? Barras horizontales de mayor a menor, una serie (naranja = gasto), con el valor y el %
 * escritos. Cada fila es un botón: al tocarla se abre el detalle de esa categoría y las demás se atenúan.
 */
export function GastosPorCategoria({ datos, seleccionada, onSeleccionar }: Props) {
  const maximo = Math.max(...datos.map((d) => d.total), 1);
  return (
    <ul className="space-y-1" aria-label="Gastos del mes por categoría">
      {datos.map((d) => {
        const activa = seleccionada === d.nombre;
        const atenuada = seleccionada !== null && !activa;
        return (
          <li key={d.nombre}>
            <button
              type="button"
              onClick={() => onSeleccionar(activa ? null : d.nombre)}
              aria-pressed={activa}
              title={`${d.nombre}: ${formatCOP(d.total)} en ${d.n} gasto${d.n === 1 ? "" : "s"} (${d.porcentaje.toFixed(1)} % del mes)`}
              className={`group w-full rounded-lg px-2 py-1.5 text-left transition-opacity hover:bg-[var(--color-primary)]/5 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ${atenuada ? "opacity-40" : ""} ${activa ? "bg-[var(--color-primary)]/5" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium text-[var(--color-text)]">{d.nombre}</span>
                <span className="shrink-0 tabular-nums text-[var(--color-text)]">
                  {formatCOP(d.total)} <span className="text-xs text-[var(--color-muted)]">· {d.porcentaje.toFixed(0)} %</span>
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-[var(--color-border)]/50" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.max((d.total / maximo) * 100, 1.5)}%`, background: COLOR_GASTO }} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
