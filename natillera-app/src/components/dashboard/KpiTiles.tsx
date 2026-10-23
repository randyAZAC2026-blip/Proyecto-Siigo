import { Wallet, Users, TrendingUp, AlertCircle, PiggyBank, Inbox } from "lucide-react";
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
  const pendientes = resumen.pendientes_conciliar;
  const items: Item[] = [
    {
      label: "Pendiente por conciliar",
      value: `${pendientes}`,
      sub: pendientes > 0 ? "clic para abrir Banco" : "¡al día!",
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
      label: "Utilidad del ciclo",
      value: formatCOP(resumen.utilidad_ciclo),
      sub: "intereses + multas + rifas",
      color: "var(--color-success)",
      Icon: TrendingUp,
      destino: "liquidacion",
    },
    {
      label: "Deuda pendiente",
      value: formatCOP(resumen.deuda_pendiente),
      sub: `de ${formatCOP(resumen.prestamos_desembolsados)} desembolsados`,
      color: "var(--color-warning)",
      Icon: AlertCircle,
      destino: "prestamos",
    },
    {
      label: "Ahorros acumulados",
      value: formatCOP(resumen.ahorros),
      sub: "del ciclo actual",
      color: "var(--color-primary)",
      Icon: Wallet,
      destino: "matriz",
    },
    {
      label: "Socios activos",
      value: `${resumen.socios_activos}`,
      sub: `${resumen.n_transacciones} transacciones`,
      color: "var(--color-text)",
      Icon: Users,
      destino: "socios",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => {
        const clickable = Boolean(it.destino && onIr);
        const tarjeta = (
          <Card
            className={`rounded-[var(--radius-card)] border transition-colors ${
              it.alerta
                ? "border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5"
                : "border-[var(--color-border)]"
            } ${clickable ? "cursor-pointer hover:border-[var(--color-primary)]/50" : ""}`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)]">
                <it.Icon className="size-3.5" style={{ color: it.color }} />
                {it.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold tabular-nums" style={{ color: it.color }}>
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
  );
}
