import type { Deudor } from "@/lib/dashboard/api";
import { formatCOP, formatCOPCompacto, formatFechaCorta } from "@/lib/natillera/format";
import { AccionLink, PanelCard } from "@/components/panel/PanelCard";

/** Préstamos activos con mayor saldo: cuánto deben y cuánto llevan pagado. */
export function CarteraCard({
  deudores,
  cartera,
  onIr,
}: {
  deudores: Deudor[];
  cartera: number;
  onIr: () => void;
}) {
  const top = deudores.filter((d) => d.saldo > 0).slice(0, 6);
  const activos = deudores.filter((d) => d.saldo > 0).length;

  return (
    <PanelCard
      titulo="Cartera de préstamos"
      subtitulo={`${activos} préstamos activos · ${formatCOPCompacto(cartera)} por cobrar`}
      accion={<AccionLink onClick={onIr}>Ver todos →</AccionLink>}
      className="h-full"
    >
      {top.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No hay préstamos activos.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              <th className="pb-2 font-medium">Socio</th>
              <th className="pb-2 font-medium">Pagado</th>
              <th className="pb-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {top.map((d) => {
              const pagado = d.monto_prestado > 0 ? 1 - d.saldo / d.monto_prestado : 0;
              const pct = Math.round(Math.min(Math.max(pagado, 0), 1) * 100);
              return (
                <tr key={d.prestamo_id} className="border-t border-[var(--color-border)]">
                  <td className="py-2 pr-3">
                    <div className="max-w-[11rem] truncate font-medium text-[var(--color-text)]" title={d.nombre}>
                      {d.nombre}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {formatCOPCompacto(d.monto_prestado)} · {formatFechaCorta(d.fecha_desembolso)}
                    </div>
                  </td>
                  <td className="w-[30%] py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-[var(--chart-1-suave)]/40" aria-hidden>
                        <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-[11px] tabular-nums text-[var(--color-muted)]">{pct}%</span>
                    </div>
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums text-[var(--color-text)]" title={formatCOP(d.saldo)}>
                    {formatCOPCompacto(d.saldo)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </PanelCard>
  );
}
