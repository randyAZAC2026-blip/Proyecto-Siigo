import { Wallet, Users, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCOP } from "@/lib/natillera/format";
import type { Miembro, Pago } from "@/lib/natillera/types";

type Props = {
  miembros: Miembro[];
  pagos: Pago[];
  anio: number;
  cuotaBase: number;
};

function calcularCuotaEsperadaAnual(m: Miembro, cuotaBase: number): number {
  const cuota = m.cuotaMensual > 0 ? m.cuotaMensual : cuotaBase;
  return cuota * 12;
}

export function ResumenNatillera({ miembros, pagos, anio, cuotaBase }: Props) {
  const activos = miembros.filter((m) => m.activo);
  const pagosDelAnio = pagos.filter((p) => p.anio === anio);

  const totalRecaudado = pagosDelAnio.reduce((acc, p) => acc + p.monto, 0);
  const totalEsperado = activos.reduce((acc, m) => acc + calcularCuotaEsperadaAnual(m, cuotaBase), 0);
  const pendiente = Math.max(0, totalEsperado - totalRecaudado);

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  const mesReferencia = anio === anioActual ? mesActual : 12;

  const morosos = activos.filter((m) => {
    const cuotaEsperadaHastaHoy = (m.cuotaMensual > 0 ? m.cuotaMensual : cuotaBase) * mesReferencia;
    const pagadoPorMiembro = pagosDelAnio
      .filter((p) => p.miembroId === m.id)
      .reduce((acc, p) => acc + p.monto, 0);
    return pagadoPorMiembro < cuotaEsperadaHastaHoy;
  }).length;

  const alDia = activos.length - morosos;

  const items = [
    {
      label: "Recaudado",
      value: formatCOP(totalRecaudado),
      icon: Wallet,
      color: "var(--color-primary)",
    },
    {
      label: "Esperado (año)",
      value: formatCOP(totalEsperado),
      icon: Wallet,
      color: "var(--color-muted)",
    },
    {
      label: "Pendiente",
      value: formatCOP(pendiente),
      icon: AlertCircle,
      color: "var(--color-warning)",
    },
    {
      label: `Miembros activos`,
      value: `${activos.length}`,
      icon: Users,
      color: "var(--color-text)",
    },
    {
      label: "Al día",
      value: `${alDia}`,
      icon: CheckCircle2,
      color: "var(--color-success)",
    },
    {
      label: "Con mora",
      value: `${morosos}`,
      icon: AlertCircle,
      color: "var(--color-destructive)",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label} className="rounded-[var(--radius-card)] border-[var(--color-border)]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)]">
                <Icon className="size-3.5" style={{ color: it.color }} />
                {it.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className="text-lg font-semibold tabular-nums"
                style={{ color: it.color }}
              >
                {it.value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
