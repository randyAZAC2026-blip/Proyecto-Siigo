import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { PuntoRitmo } from "@/lib/billetera/analisis";
import { formatCOP } from "@/lib/billetera/format";
import { COLOR_EJE, COLOR_GASTO, COLOR_REFERENCIA, COLOR_REJILLA } from "./colores";

const compacto = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });

function Detalle({ active, payload, label, etiquetas }: TooltipContentProps<number, string> & { etiquetas: [string, string] }) {
  if (!active || !payload?.length) return null;
  const valor = (k: string) => { const v = payload.find((p) => p.dataKey === k)?.value; return v == null ? null : Number(v); };
  const actual = valor("actual"); const anterior = valor("anterior");
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-[var(--color-text)]">Día {label}</p>
      {actual != null && <p className="flex items-center gap-2"><span className="inline-block h-0.5 w-3" style={{ background: COLOR_GASTO }} />{etiquetas[0]}: <strong className="tabular-nums">{formatCOP(actual)}</strong></p>}
      {anterior != null && <p className="flex items-center gap-2"><span className="inline-block h-0.5 w-3 border-t border-dashed" style={{ borderColor: COLOR_REFERENCIA }} />{etiquetas[1]}: <span className="tabular-nums">{formatCOP(anterior)}</span></p>}
    </div>
  );
}

/** Gasto acumulado día a día: este mes (naranja) contra el anterior (gris punteado). Muestra si vas más rápido. */
export function RitmoDelMes({ datos, etiquetas }: { datos: PuntoRitmo[]; etiquetas: [string, string] }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-[var(--color-muted)]" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: COLOR_GASTO }} />{etiquetas[0]}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: COLOR_REFERENCIA }} />{etiquetas[1]}</span>
      </div>
      <div className="h-56" role="img" aria-label={`Gasto acumulado por día de ${etiquetas[0]} comparado con ${etiquetas[1]}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={COLOR_REJILLA} />
            <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fill: COLOR_EJE, fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: COLOR_EJE, fontSize: 11 }} width={44} tickFormatter={(v: number) => compacto.format(v)} />
            <Tooltip content={(p) => <Detalle {...(p as TooltipContentProps<number, string>)} etiquetas={etiquetas} />} cursor={{ stroke: COLOR_EJE, strokeWidth: 1 }} />
            <Line type="monotone" dataKey="anterior" stroke={COLOR_REFERENCIA} strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="actual" stroke={COLOR_GASTO} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
