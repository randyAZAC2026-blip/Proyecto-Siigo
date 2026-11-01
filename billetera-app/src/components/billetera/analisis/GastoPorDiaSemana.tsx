import type { GastoDiaSemana } from "@/lib/billetera/analisis";
import { formatCOP } from "@/lib/billetera/format";
import { COLOR_GASTO } from "./colores";

/** ¿Qué día gastas más? Promedio por día de la semana; el día más alto lleva su etiqueta. */
export function GastoPorDiaSemana({ datos, periodo }: { datos: GastoDiaSemana[]; periodo: string }) {
  const maximo = Math.max(...datos.map((d) => d.promedio), 1);
  const top = datos.reduce((a, b) => (b.promedio > a.promedio ? b : a), datos[0]);
  return (
    <div>
      {top && top.promedio > 0 && (
        <p className="mb-3 text-sm text-[var(--color-text)]">
          Los <strong>{top.dia.toLowerCase()}</strong> gastas en promedio <strong className="tabular-nums">{formatCOP(top.promedio)}</strong>, más que cualquier otro día.
        </p>
      )}
      <ul className="space-y-1.5" aria-label={`Gasto promedio por día de la semana (${periodo})`}>
        {datos.map((d) => (
          <li key={d.dia} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm" title={`${d.dia}: ${formatCOP(d.total)} en total, ${formatCOP(d.promedio)} en promedio`}>
            <span className={d === top ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-muted)]"}>{d.dia}</span>
            <span className="h-2 rounded-full bg-[var(--color-border)]/50" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${Math.max((d.promedio / maximo) * 100, d.promedio ? 1.5 : 0)}%`, background: COLOR_GASTO, opacity: d === top ? 1 : 0.55 }} />
            </span>
            <span className="tabular-nums text-xs text-[var(--color-text)]">{formatCOP(d.promedio)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-[var(--color-muted)]">Promedio por día, con los gastos de {periodo}.</p>
    </div>
  );
}
