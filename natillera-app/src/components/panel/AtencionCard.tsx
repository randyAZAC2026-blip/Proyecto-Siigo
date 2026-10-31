import { AlertTriangle, CalendarClock, ChevronRight, HandCoins, Inbox, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Moroso, Resumen } from "@/lib/dashboard/api";
import { PanelCard } from "@/components/panel/PanelCard";

interface Item {
  Icon: LucideIcon;
  titulo: string;
  detalle: string;
  nivel: "ok" | "aviso" | "critico";
  destino: string;
}

const COLOR = {
  ok: "var(--status-good)",
  aviso: "var(--color-warning)",
  critico: "var(--status-critical)",
} as const;
const NIVEL = { ok: "Al día", aviso: "Revisar", critico: "Urgente" } as const;

/** Cumplimiento del mes (medidor) y lista de cosas que piden atención. */
export function AtencionCard({
  resumen,
  morosos,
  onIr,
}: {
  resumen: Resumen;
  morosos: Moroso[];
  onIr: (vista: string) => void;
}) {
  const { al_dia, total } = resumen.al_dia_mes;
  const pct = total > 0 ? Math.round((al_dia / total) * 100) : 0;
  const hoy = new Date();
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const meta = Math.round((hoy.getDate() / diasMes) * 100);
  const colorMedidor =
    pct >= meta ? "var(--status-good)" : pct >= meta - 15 ? "var(--status-warning)" : "var(--status-critical)";

  const items: Item[] = [];
  if (morosos.length > 0)
    items.push({
      Icon: CalendarClock,
      titulo: `${morosos.length} socios sin ahorrar hace 60+ días`,
      detalle: morosos.slice(0, 3).map((m) => m.nombre.split(" ")[0]).join(", ") + (morosos.length > 3 ? "…" : ""),
      nivel: morosos.length > 5 ? "critico" : "aviso",
      destino: "matriz",
    });
  if (resumen.prestamos_sin_abono_reciente > 0)
    items.push({
      Icon: HandCoins,
      titulo: `${resumen.prestamos_sin_abono_reciente} préstamos sin abono en 30 días`,
      detalle: "Revisar intereses y cuotas pendientes",
      nivel: "aviso",
      destino: "prestamos",
    });
  if (resumen.pendientes_conciliar > 0)
    items.push({
      Icon: Inbox,
      titulo: `${resumen.pendientes_conciliar} movimientos sin clasificar`,
      detalle: "Sin socio ni origen en el extracto",
      nivel: resumen.pendientes_conciliar > 50 ? "critico" : "aviso",
      destino: "banco",
    });
  if (resumen.actividad_activa)
    items.push({
      Icon: Sparkles,
      titulo: resumen.actividad_activa.nombre,
      detalle:
        resumen.actividad_activa.total > 0
          ? `${resumen.actividad_activa.pagadas} de ${resumen.actividad_activa.total} boletas pagadas`
          : "Sin boletas asignadas",
      nivel:
        resumen.actividad_activa.total > 0 && resumen.actividad_activa.pagadas >= resumen.actividad_activa.total
          ? "ok"
          : "aviso",
      destino: "actividades",
    });

  return (
    <PanelCard titulo="Requiere atención" className="h-full">
      <button
        type="button"
        onClick={() => onIr("matriz")}
        className="w-full rounded-xl bg-[var(--color-background)] p-3 text-left hover:bg-[var(--color-primary)]/5"
      >
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-[var(--color-text)]">Ahorro de este mes</span>
          <span className="text-[var(--color-muted)]">
            <strong className="font-semibold text-[var(--color-text)]">{al_dia}</strong> de {total} socios
          </span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-[var(--status-neutral)]/50" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorMedidor }} />
          {/* Marca de dónde "debería" ir a esta altura del mes */}
          <div className="absolute -top-1 h-4 w-[2px] rounded bg-[var(--color-text)]/60" style={{ left: `${meta}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-[var(--color-muted)]">
          <span>{pct}% al día</span>
          <span>meta a hoy {meta}%</span>
        </div>
      </button>

      <ul className="mt-3 divide-y divide-[var(--color-border)]">
        {items.length === 0 && (
          <li className="py-3 text-sm text-[var(--color-muted)]">Todo en orden por ahora.</li>
        )}
        {items.map((it) => (
          <li key={it.titulo}>
            <button
              type="button"
              onClick={() => onIr(it.destino)}
              className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-[var(--color-primary)]/[0.03]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-background)]">
                <it.Icon className="size-4 text-[var(--color-text)]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug text-[var(--color-text)]">{it.titulo}</span>
                <span className="block truncate text-xs text-[var(--color-muted)]">{it.detalle}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--color-muted)]">
                {it.nivel !== "ok" && <AlertTriangle className="size-3" style={{ color: COLOR[it.nivel] }} aria-hidden />}
                {NIVEL[it.nivel]}
                <ChevronRight className="size-3.5 opacity-60" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
