import {
  Wallet,
  PiggyBank,
  Inbox,
  AlertCircle,
  CalendarCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCOP } from "@/lib/natillera/format";
import type { Resumen } from "@/lib/dashboard/api";

type Item = {
  label: string;
  value: string;
  color: string;
  Icon: typeof Wallet;
  sub?: string;
  destino?: string;
  alerta?: boolean;
};

export function KpiTiles({
  resumen,
  onIr,
}: {
  resumen: Resumen;
  onIr?: (vista: string) => void;
}) {
  const leading = buildLeading(resumen);
  const lagging = buildLagging(resumen);

  return (
    <div className="space-y-5">
      <Seccion titulo="Anticipar" items={leading} onIr={onIr} />
      <Seccion titulo="Resumen" items={lagging} onIr={onIr} />
    </div>
  );
}

function buildLeading(resumen: Resumen): Item[] {
  // 1) Al día este mes
  const { al_dia, total } = resumen.al_dia_mes;
  const porcentaje = total > 0 ? Math.round((al_dia / total) * 100) : 0;
  const hoy = new Date();
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const esperado = Math.round((hoy.getDate() / diasMes) * 100);
  const colorAlDia =
    porcentaje >= esperado
      ? "var(--color-success)"
      : porcentaje >= esperado - 15
        ? "var(--color-warning)"
        : "var(--color-destructive)";

  const alDia: Item = {
    label: "Al día este mes",
    value: `${al_dia}/${total}`,
    sub: `${porcentaje}% · meta hoy ${esperado}%`,
    color: colorAlDia,
    Icon: CalendarCheck,
    destino: "mora-ahorros",
    alerta: porcentaje < esperado - 15,
  };

  // 2) Actividad activa
  const act = resumen.actividad_activa;
  const actividad: Item = act
    ? {
        label: act.nombre,
        value: act.total > 0 ? `${act.pagadas}/${act.total}` : "—",
        sub:
          act.total > 0
            ? `${Math.round((act.pagadas / act.total) * 100)}% vendidas`
            : "sin boletas asignadas",
        color: "var(--color-primary)",
        Icon: Sparkles,
        destino: "actividades",
      }
    : {
        label: "Actividad activa",
        value: "—",
        sub: "sin ninguna abierta",
        color: "var(--color-muted)",
        Icon: Sparkles,
        destino: "actividades",
      };

  // 3) Préstamos sin abono reciente
  const sinAbono = resumen.prestamos_sin_abono_reciente;
  const prestamosLead: Item = {
    label: "Sin abono reciente",
    value: `${sinAbono}`,
    sub: sinAbono > 0 ? "no abonaron en 30 días" : "¡todos al corriente!",
    color: sinAbono > 0 ? "var(--color-destructive)" : "var(--color-success)",
    Icon: Timer,
    destino: "prestamos",
    alerta: sinAbono > 0,
  };

  return [alDia, actividad, prestamosLead];
}

function buildLagging(resumen: Resumen): Item[] {
  const pendientes = resumen.pendientes_conciliar;
  return [
    {
      label: "Sin clasificar",
      value: `${pendientes}`,
      sub: pendientes > 0 ? "sin socio ni origen" : "¡al día!",
      color: pendientes > 0 ? "var(--color-destructive)" : "var(--color-success)",
      Icon: Inbox,
      destino: "banco",
      alerta: pendientes > 0,
    },
    {
      label: "Total en caja",
      value: formatCOP(
        resumen.total_aportado - resumen.prestamos_desembolsados + resumen.abonos_prestamos,
      ),
      sub: "aportes − préstamos + abonos",
      color: "var(--color-primary)",
      Icon: PiggyBank,
    },
    {
      label: "Deuda pendiente",
      value: formatCOP(resumen.deuda_pendiente),
      sub: `de ${formatCOP(resumen.prestamos_desembolsados)} desembolsados`,
      color: "var(--color-warning)",
      Icon: AlertCircle,
      destino: "prestamos",
    },
  ];
}

function Seccion({
  titulo,
  items,
  onIr,
}: {
  titulo: string;
  items: Item[];
  onIr?: (vista: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold">
        {titulo}
      </h3>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        {items.map((it) => {
          const clickable = Boolean(it.destino && onIr);
          const tarjeta = (
            <Card
              className={`rounded-[var(--radius-card)] border transition-colors h-full ${
                it.alerta
                  ? "border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5"
                  : "border-[var(--color-border)]"
              } ${clickable ? "cursor-pointer hover:border-[var(--color-primary)]/50" : ""}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)]">
                  <it.Icon className="size-3.5" style={{ color: it.color }} />
                  <span className="truncate" title={it.label}>
                    {it.label}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: it.color }}
                >
                  {it.value}
                </p>
                {it.sub && (
                  <p className="text-[10px] text-[var(--color-muted)] mt-1">{it.sub}</p>
                )}
              </CardContent>
            </Card>
          );
          return clickable ? (
            <button
              key={it.label}
              type="button"
              onClick={() => onIr!(it.destino!)}
              className="text-left"
            >
              {tarjeta}
            </button>
          ) : (
            <div key={it.label}>{tarjeta}</div>
          );
        })}
      </div>
    </section>
  );
}
