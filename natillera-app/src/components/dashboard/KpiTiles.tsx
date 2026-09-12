import { Wallet, Users, TrendingUp, AlertCircle, PiggyBank, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCOP } from "@/lib/natillera/format";
import type { Resumen } from "@/lib/dashboard/api";

type Item = {
  label: string;
  value: string;
  color: string;
  Icon: typeof Wallet;
  sub?: string;
};

export function KpiTiles({ resumen }: { resumen: Resumen }) {
  const items: Item[] = [
    {
      label: "Total en caja",
      value: formatCOP(resumen.total_aportado - resumen.prestamos_desembolsados + resumen.abonos_prestamos),
      sub: "aportes − préstamos + abonos",
      color: "var(--color-primary)",
      Icon: PiggyBank,
    },
    {
      label: "Ahorros acumulados",
      value: formatCOP(resumen.ahorros),
      color: "var(--color-primary)",
      Icon: Wallet,
    },
    {
      label: "Utilidad del ciclo",
      value: formatCOP(resumen.utilidad_ciclo),
      sub: "intereses + multas + rifas",
      color: "var(--color-success)",
      Icon: TrendingUp,
    },
    {
      label: "Deuda pendiente",
      value: formatCOP(resumen.deuda_pendiente),
      sub: `de ${formatCOP(resumen.prestamos_desembolsados)} desembolsados`,
      color: "var(--color-warning)",
      Icon: AlertCircle,
    },
    {
      label: "Socios activos",
      value: `${resumen.socios_activos}`,
      sub: `${resumen.n_transacciones} transacciones`,
      color: "var(--color-text)",
      Icon: Users,
    },
    {
      label: "Movimientos banco",
      value: `${resumen.n_bancos}`,
      sub: "Bancolombia + Nequi",
      color: "var(--color-muted)",
      Icon: Landmark,
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card key={it.label} className="rounded-[var(--radius-card)] border-[var(--color-border)]">
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
            {it.sub && <p className="text-[10px] text-[var(--color-muted)] mt-1">{it.sub}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
