import { AlertTriangle, CheckCircle2, CircleDashed, CircleDot } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EstadoExtracto, PanelConciliacion } from "@/lib/dashboard/api";
import { formatCOP, formatCOPCompacto } from "@/lib/natillera/format";
import { AccionLink, PanelCard } from "@/components/panel/PanelCard";

// Estados con color de estado + ícono + texto (nunca solo color).
const ESTADOS: { key: EstadoExtracto; label: string; color: string; Icon: LucideIcon }[] = [
  { key: "conciliado", label: "Conciliado", color: "var(--status-good)", Icon: CheckCircle2 },
  { key: "parcial", label: "Parcial", color: "var(--status-warning)", Icon: CircleDot },
  { key: "excedido", label: "Excedido", color: "var(--status-critical)", Icon: AlertTriangle },
  { key: "pendiente", label: "Pendiente", color: "var(--status-neutral)", Icon: CircleDashed },
];

function Fila({ titulo, filas }: { titulo: string; filas: PanelConciliacion[] }) {
  const de = (k: EstadoExtracto) => filas.find((f) => f.estado === k);
  const partes = ESTADOS.map((e) => ({ ...e, monto: de(e.key)?.monto ?? 0, n: de(e.key)?.n ?? 0 }));
  const total = partes.reduce((s, p) => s + p.monto, 0);
  const conciliado = (de("conciliado")?.monto ?? 0) + ((de("parcial")?.monto ?? 0) - (de("parcial")?.pendiente ?? 0));
  const pct = total > 0 ? Math.round((conciliado / total) * 100) : 0;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--color-text)]">{titulo}</span>
        <span className="text-xs text-[var(--color-muted)]">
          <strong className="font-semibold text-[var(--color-text)]">{pct}%</strong> conciliado de {formatCOPCompacto(total)}
        </span>
      </div>
      <div
        className="flex h-2 w-full gap-[2px]"
        role="img"
        aria-label={partes.map((p) => `${p.label}: ${formatCOP(p.monto)}`).join(" · ")}
      >
        {partes
          .filter((p) => p.monto > 0)
          .map((p) => (
            <div
              key={p.key}
              className="h-full rounded-full"
              style={{ width: `${(p.monto / total) * 100}%`, background: p.color, minWidth: 4 }}
              title={`${p.label}: ${formatCOP(p.monto)} · ${p.n} movimientos`}
            />
          ))}
      </div>
    </div>
  );
}

/** Avance de la conciliación bancaria (Bancolombia), sin contar lo personal. */
export function ConciliacionCard({
  filas,
  onIr,
}: {
  filas: PanelConciliacion[];
  onIr: () => void;
}) {
  const ingresos = filas.filter((f) => f.tipo === "ingreso" && f.estado !== "personal");
  const egresos = filas.filter((f) => f.tipo === "egreso" && f.estado !== "personal");
  const resumen = ESTADOS.map((e) => {
    const fs = filas.filter((f) => f.estado === e.key);
    return { ...e, n: fs.reduce((s, f) => s + f.n, 0), monto: fs.reduce((s, f) => s + f.monto, 0) };
  });
  const personal = filas.filter((f) => f.estado === "personal").reduce((s, f) => s + f.n, 0);

  return (
    <PanelCard
      titulo="Conciliación bancaria"
      subtitulo="Bancolombia · movimientos de la natillera"
      accion={<AccionLink onClick={onIr}>Conciliar →</AccionLink>}
      className="h-full"
    >
      {filas.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Disponible con la base de datos en la nube.</p>
      ) : (
        <div className="space-y-4">
          <Fila titulo="Ingresos" filas={ingresos} />
          <Fila titulo="Egresos" filas={egresos} />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-3">
            {resumen.map(({ key, label, color, Icon, n, monto }) => (
              <li key={key} className="flex items-center gap-2 text-xs">
                <Icon className="size-3.5 shrink-0" style={{ color: key === "pendiente" ? "var(--chart-tinta-muted)" : color }} aria-hidden />
                <span className="text-[var(--color-muted)]">{label}</span>
                <span className="ml-auto text-right tabular-nums">
                  <span className="font-medium text-[var(--color-text)]">{n}</span>
                  <span className="block text-[10px] text-[var(--color-muted)]">{formatCOPCompacto(monto)}</span>
                </span>
              </li>
            ))}
          </ul>
          {personal > 0 && (
            <p className="text-[11px] text-[var(--color-muted)]">
              No se cuentan {personal} movimientos marcados como personales.
            </p>
          )}
        </div>
      )}
    </PanelCard>
  );
}
