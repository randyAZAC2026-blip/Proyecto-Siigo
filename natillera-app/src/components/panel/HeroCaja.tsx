import { Info, Landmark } from "lucide-react";
import type { PanelFinanciero } from "@/lib/dashboard/api";
import { formatCOP, formatCOPCompacto, formatFechaCorta } from "@/lib/natillera/format";
import { PanelCard } from "@/components/panel/PanelCard";

interface Parte {
  nombre: string;
  valor: number;
  color: string;
}

/**
 * Cifra principal del panel: la caja según libros (ingresos − egresos), su
 * comparación con el último saldo del extracto y de dónde vienen los ingresos
 * (barra segmentada alta, con la tabla de montos debajo).
 */
export function HeroCaja({ f }: { f: PanelFinanciero }) {
  const partes: Parte[] = [
    { nombre: "Ahorro de socios", valor: f.ahorro, color: "var(--chart-1)" },
    { nombre: "Actividades y rifas", valor: f.actividades + f.rifa, color: "var(--chart-2)" },
    { nombre: "Intereses y multas", valor: f.intereses + f.multas, color: "var(--chart-3)" },
    { nombre: "Abonos a préstamos", valor: f.abonos_prestamos, color: "var(--chart-4)" },
  ];
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const diferencia = f.saldo_banco != null ? f.caja_libros - f.saldo_banco : null;

  return (
    <PanelCard className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
            Caja de la natillera
          </p>
          <p className="mt-1 text-[3rem] font-semibold leading-none tracking-tight text-[var(--color-text)]">
            {formatCOPCompacto(f.caja_libros)}
          </p>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {formatCOP(f.caja_libros)} según libros
          </p>
        </div>

        {f.saldo_banco != null && (
          <div className="min-w-[13rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <Landmark className="size-3.5" aria-hidden />
              Saldo Bancolombia · {formatFechaCorta(f.fecha_saldo_banco)}
            </div>
            <div className="mt-1 text-lg font-semibold text-[var(--color-text)]">
              {formatCOPCompacto(f.saldo_banco)}
            </div>
            {diferencia != null && diferencia !== 0 && (
              <div
                className="mt-1 flex items-start gap-1 text-xs text-[var(--color-muted)]"
                title="Diferencia entre lo registrado en libros y el último saldo del extracto. Suele venir de movimientos sin conciliar, pagos en efectivo o un extracto desactualizado."
              >
                <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  {diferencia > 0 ? "Libros por encima" : "Banco por encima"} en{" "}
                  <strong className="font-semibold text-[var(--color-text)]">
                    {formatCOPCompacto(Math.abs(diferencia))}
                  </strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">De dónde vienen los ingresos</p>
        {total > 0 ? (
          <>
            <div
              className="flex h-7 w-full gap-[2px]"
              role="img"
              aria-label={partes
                .map((p) => `${p.nombre}: ${formatCOP(p.valor)} (${Math.round((p.valor / total) * 100)}%)`)
                .join(" · ")}
            >
              {partes
                .filter((p) => p.valor > 0)
                .map((p) => {
                  const share = p.valor / total;
                  return (
                    <div
                      key={p.nombre}
                      className="flex h-full min-w-0 items-center rounded-[4px] px-2"
                      style={{ width: `${share * 100}%`, background: p.color }}
                      title={`${p.nombre}: ${formatCOP(p.valor)} (${Math.round(share * 100)}%)`}
                    >
                      {/* Solo se rotula si cabe holgado; el monto siempre está en la tabla de abajo. */}
                      {share >= 0.15 && (
                        <span className="text-[11px] font-semibold text-white">{Math.round(share * 100)}%</span>
                      )}
                    </div>
                  );
                })}
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {partes.map((p) => (
                <div key={p.nombre} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} aria-hidden />
                  <dt className="text-[var(--color-muted)]">{p.nombre}</dt>
                  <dd className="ml-auto font-medium tabular-nums text-[var(--color-text)]">{formatCOP(p.valor)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Aún no hay ingresos registrados.</p>
        )}
      </div>

      {/* Cómo se llega a la caja: entra − sale = queda. */}
      <dl className="mt-6 grid grid-cols-3 divide-x divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
        {[
          { label: "Entró", valor: f.ingresos, detalle: "aportes y abonos" },
          { label: "Salió", valor: -f.egresos, detalle: "préstamos entregados" },
          { label: "Queda", valor: f.caja_libros, detalle: "en caja" },
        ].map((x) => (
          <div key={x.label} className="min-w-0 px-3 py-2.5 sm:px-4">
            <dt className="text-[11px] text-[var(--color-muted)]">{x.label}</dt>
            <dd className="truncate text-sm font-semibold tabular-nums text-[var(--color-text)] sm:text-base" title={formatCOP(x.valor)}>
              {formatCOPCompacto(x.valor)}
            </dd>
            <dd className="hidden truncate text-[11px] text-[var(--color-muted)] sm:block">{x.detalle}</dd>
          </div>
        ))}
      </dl>
    </PanelCard>
  );
}
