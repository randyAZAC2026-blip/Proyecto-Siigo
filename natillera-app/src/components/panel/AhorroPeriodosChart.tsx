import { useMemo, useState } from "react";
import type { PanelAhorroPeriodo } from "@/lib/dashboard/api";
import { formatCOP, formatCOPCompacto } from "@/lib/natillera/format";
import { useAncho } from "@/lib/useAncho";
import { PanelCard } from "@/components/panel/PanelCard";

const ALTO = 220;
const M = { top: 22, right: 8, bottom: 26, left: 52 };

const corto = (nombre: string) => nombre.charAt(0) + nombre.slice(1, 3).toLowerCase();
const largo = (nombre: string) => nombre.charAt(0) + nombre.slice(1).toLowerCase();

/** Redondea el máximo del eje a un número limpio (1, 2, 2.5, 5 × 10^n). */
function techo(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Ahorro recaudado por periodo del ciclo: columnas de una sola serie. El
 * periodo en curso va en un tono más claro (aún está recibiendo pagos).
 * Hover / foco muestra el detalle; la tabla está debajo.
 */
export function AhorroPeriodosChart({ periodos }: { periodos: PanelAhorroPeriodo[] }) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);

  const hoy = new Date().toISOString().slice(0, 10);
  const idxActual = useMemo(() => {
    const i = periodos.findIndex((p) => p.fecha_corte_ahorro != null && p.fecha_corte_ahorro >= hoy);
    return i === -1 ? periodos.length - 1 : i;
  }, [periodos, hoy]);

  const max = techo(Math.max(...periodos.map((p) => p.ahorro), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const iw = Math.max(ancho - M.left - M.right, 10);
  const ih = ALTO - M.top - M.bottom;
  const banda = iw / Math.max(periodos.length, 1);
  const barra = Math.min(24, banda * 0.6);
  const y = (v: number) => M.top + ih - (v / max) * ih;

  const actual = periodos[idxActual];
  const anteriores = periodos.slice(0, idxActual).filter((p) => p.ahorro > 0);
  const promedio = anteriores.length
    ? anteriores.reduce((s, p) => s + p.ahorro, 0) / anteriores.length
    : 0;

  const tip = activo != null ? periodos[activo] : null;
  const tipX = activo != null ? M.left + banda * activo + banda / 2 : 0;

  return (
    <PanelCard
      titulo="Ahorro recaudado por mes"
      subtitulo={
        actual
          ? `${largo(actual.nombre)} va en ${formatCOPCompacto(actual.ahorro)} · promedio de meses cerrados ${formatCOPCompacto(promedio)}`
          : undefined
      }
    >
      <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => setActivo(null)}>
        <svg width={ancho} height={ALTO} className="block max-w-full" role="img" aria-label="Ahorro recaudado por periodo del ciclo">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={M.left + iw}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"}
                strokeWidth={1}
              />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--chart-tinta-muted)" className="tabular-nums">
                {t === 0 ? "$0" : formatCOPCompacto(t)}
              </text>
            </g>
          ))}

          {periodos.map((p, i) => {
            const cx = M.left + banda * i + banda / 2;
            const h = Math.max(((p.ahorro / max) * ih), p.ahorro > 0 ? 1 : 0);
            const top = M.top + ih - h;
            const r = Math.min(4, h);
            const enCurso = i === idxActual;
            const futuro = i > idxActual;
            const x0 = cx - barra / 2;
            // Columna con extremo redondeado (4px) y base recta sobre el eje.
            const d = h > 0
              ? `M${x0},${M.top + ih} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barra - r} Q${x0 + barra},${top} ${x0 + barra},${top + r} V${M.top + ih} Z`
              : "";
            return (
              <g key={p.id}>
                {d && (
                  <path
                    d={d}
                    fill={enCurso ? "var(--chart-1-suave)" : "var(--chart-1)"}
                    opacity={activo != null && activo !== i ? 0.55 : 1}
                  />
                )}
                <text
                  x={cx}
                  y={ALTO - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={futuro ? "var(--chart-axis)" : "var(--chart-tinta-muted)"}
                  fontWeight={enCurso ? 600 : 400}
                >
                  {corto(p.nombre)}
                </text>
                {enCurso && p.ahorro > 0 && (
                  <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-text)">
                    {formatCOPCompacto(p.ahorro)}
                  </text>
                )}
                {/* Zona de hover/foco más grande que la columna. */}
                <rect
                  x={M.left + banda * i}
                  y={M.top}
                  width={banda}
                  height={ih}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${largo(p.nombre)}: ${formatCOP(p.ahorro)}, ${p.socios_pagaron} socios`}
                  onMouseEnter={() => setActivo(i)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>

        {tip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(tipX, 80), ancho - 80), top: 0 }}
          >
            <div className="font-semibold text-[var(--color-text)]">
              {largo(tip.nombre)}
              {activo === idxActual && <span className="ml-1 font-normal text-[var(--color-muted)]">· en curso</span>}
            </div>
            <div className="mt-0.5 tabular-nums text-[var(--color-text)]">{formatCOP(tip.ahorro)}</div>
            <div className="text-[var(--color-muted)]">{tip.socios_pagaron} socios pagaron</div>
          </div>
        )}
      </div>

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer select-none text-[var(--color-muted)] hover:text-[var(--color-text)]">
          Ver como tabla
        </summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-[var(--color-muted)]">
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">Ahorro</th>
              <th className="py-1 text-right font-medium">Socios</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {periodos.map((p) => (
              <tr key={p.id} className="border-t border-[var(--color-border)]">
                <td className="py-1">{largo(p.nombre)}</td>
                <td className="py-1 text-right">{formatCOP(p.ahorro)}</td>
                <td className="py-1 text-right">{p.socios_pagaron}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </PanelCard>
  );
}
