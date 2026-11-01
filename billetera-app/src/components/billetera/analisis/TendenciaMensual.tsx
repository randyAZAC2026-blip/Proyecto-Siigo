import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { PuntoMensual } from "@/lib/billetera/analisis";
import { formatCOP } from "@/lib/billetera/format";
import { COLOR_EJE, COLOR_GASTO, COLOR_INGRESO, COLOR_REJILLA } from "./colores";

const compacto = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });

function Detalle({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const v = (k: string) => Number(payload.find((p) => p.dataKey === k)?.value ?? 0);
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold capitalize text-[var(--color-text)]">{label}</p>
      <p className="flex items-center gap-2"><span className="inline-block size-2.5 rounded-sm" style={{ background: COLOR_INGRESO }} />Ingresos: <strong className="tabular-nums">{formatCOP(v("ingresos"))}</strong></p>
      <p className="flex items-center gap-2"><span className="inline-block size-2.5 rounded-sm" style={{ background: COLOR_GASTO }} />Gastos: <strong className="tabular-nums">{formatCOP(v("gastos"))}</strong></p>
      <p className="mt-1 border-t border-[var(--color-border)] pt-1">{v("ingresos") - v("gastos") >= 0 ? "Ahorro" : "Déficit"}: <strong className="tabular-nums">{formatCOP(Math.abs(v("ingresos") - v("gastos")))}</strong></p>
    </div>
  );
}

/** Ingresos (azul) y gastos (naranja) de los últimos seis meses, con su tabla. Un solo eje en pesos. */
export function TendenciaMensual({ datos, onMes }: { datos: PuntoMensual[]; onMes: (mes: string) => void }) {
  const [tabla, setTabla] = useState(false);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
        <div className="flex gap-4" aria-hidden>
          <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: COLOR_INGRESO }} />Ingresos</span>
          <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: COLOR_GASTO }} />Gastos</span>
        </div>
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setTabla((t) => !t)}>{tabla ? "Ver gráfico" : "Ver como tabla"}</button>
      </div>
      {tabla ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-[var(--color-muted)]"><th className="py-1 font-medium">Mes</th><th className="py-1 text-right font-medium">Ingresos</th><th className="py-1 text-right font-medium">Gastos</th><th className="py-1 text-right font-medium">Balance</th></tr></thead>
          <tbody>{datos.map((d) => (
            <tr key={d.mes} className="border-t border-[var(--color-border)]">
              <td className="py-1.5 capitalize">{d.etiqueta}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCOP(d.ingresos)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCOP(d.gastos)}</td>
              <td className={`py-1.5 text-right tabular-nums ${d.ingresos - d.gastos < 0 ? "text-[var(--color-destructive)]" : ""}`}>{formatCOP(d.ingresos - d.gastos)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : (
        <div className="h-56" role="img" aria-label="Ingresos y gastos de los últimos seis meses">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%"
              onClick={(e) => { const i = e?.activeTooltipIndex; if (i != null && datos[Number(i)]) onMes(datos[Number(i)].mes); }}>
              <CartesianGrid vertical={false} stroke={COLOR_REJILLA} />
              <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fill: COLOR_EJE, fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: COLOR_EJE, fontSize: 11 }} width={44} tickFormatter={(v: number) => compacto.format(v)} />
              <Tooltip content={(p) => <Detalle {...(p as TooltipContentProps<number, string>)} />} cursor={{ fill: "rgba(107,122,112,0.08)" }} />
              <Bar dataKey="ingresos" fill={COLOR_INGRESO} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} style={{ cursor: "pointer" }} />
              <Bar dataKey="gastos" fill={COLOR_GASTO} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} style={{ cursor: "pointer" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-xs text-[var(--color-muted)]">Toca un mes para analizarlo.</p>
    </div>
  );
}
