import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Sparkles } from "lucide-react";
import type { CambioCategoria, GastoCategoria, Proyeccion } from "@/lib/billetera/analisis";
import { formatCOP } from "@/lib/billetera/format";

interface Props {
  cambios: CambioCategoria[];
  top: GastoCategoria | undefined;
  proyeccion: Proyeccion;
  gastoAnterior: number;
  mesAnterior: string;
}

/** Lo que vale la pena saber del mes, en frases cortas. */
export function Hallazgos({ cambios, top, proyeccion, gastoAnterior, mesAnterior }: Props) {
  const frases: { icono: typeof Sparkles; texto: ReactNode }[] = [];
  if (top) frases.push({ icono: Sparkles, texto: <>Tu mayor gasto es <strong>{top.nombre}</strong>: {top.porcentaje.toFixed(0)} % de todo lo que gastaste.</> });
  if (proyeccion.proyeccion !== null && proyeccion.promedioDiario > 0) {
    const pasa = gastoAnterior > 0 && proyeccion.proyeccion > gastoAnterior;
    frases.push({
      icono: pasa ? TrendingUp : TrendingDown,
      texto: <>A este ritmo ({formatCOP(proyeccion.promedioDiario)} al día) cerrarías el mes en <strong className="tabular-nums">{formatCOP(proyeccion.proyeccion)}</strong>
        {gastoAnterior > 0 ? <>, {pasa ? "más" : "menos"} que en {mesAnterior} ({formatCOP(gastoAnterior)}).</> : "."}</>,
    });
  }
  for (const c of cambios) {
    const sube = c.diferencia > 0;
    frases.push({
      icono: sube ? TrendingUp : TrendingDown,
      texto: <><strong>{c.nombre}</strong> {sube ? "subió" : "bajó"} {formatCOP(Math.abs(c.diferencia))}
        {c.variacion !== null ? ` (${sube ? "+" : ""}${c.variacion.toFixed(0)} %)` : c.anterior === 0 ? " (en " + mesAnterior + " no hubo)" : ""} frente a {mesAnterior}.</>,
    });
  }
  if (!frases.length) return <p className="text-sm text-[var(--color-muted)]">Registra más movimientos para ver hallazgos.</p>;
  return (
    <ul className="space-y-2">
      {frases.map((f, i) => {
        const Icono = f.icono;
        return <li key={i} className="flex gap-2 text-sm text-[var(--color-text)]"><Icono className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" aria-hidden /><span>{f.texto}</span></li>;
      })}
    </ul>
  );
}
