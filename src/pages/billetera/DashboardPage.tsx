import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Wallet, ArrowUpCircle, ArrowDownCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SaldoResumen } from "@/components/billetera/SaldoResumen";
import { IngresosMesCard } from "@/components/billetera/IngresosMesCard";
import { MovimientoRow } from "@/components/billetera/MovimientoRow";
import { EmptyState } from "@/components/billetera/EmptyState";
import {
  useSaldos,
  useMovimientos,
  useCxP,
  useCxC,
  useCategorias,
  useSembrarCategoriasPorDefecto,
  useFuentesIngreso,
  useIngresosDelMes,
} from "@/lib/billetera/hooks";
import { formatCOP } from "@/lib/billetera/format";

export function DashboardPage() {
  const saldos = useSaldos();
  const ultimos = useMovimientos({ limit: 5 });
  const cxp = useCxP();
  const cxc = useCxC();
  const categorias = useCategorias();
  const sembrar = useSembrarCategoriasPorDefecto();
  const fuentes = useFuentesIngreso();
  const hoy = new Date();
  const ingresos = useIngresosDelMes(hoy.getFullYear(), hoy.getMonth() + 1);

  // Primera vez: si el usuario no tiene categorías, sembramos un conjunto básico.
  useEffect(() => {
    if (categorias.data && categorias.data.length === 0 && !sembrar.isPending && !sembrar.isSuccess) {
      sembrar.mutate();
    }
  }, [categorias.data, sembrar]);

  const pendientePagar = (cxp.data ?? [])
    .filter((c) => Number(c.monto_pagado) < Number(c.monto_total))
    .reduce((acc, c) => acc + (Number(c.monto_total) - Number(c.monto_pagado)), 0);
  const pendienteCobrar = (cxc.data ?? [])
    .filter((c) => Number(c.monto_cobrado) < Number(c.monto_total))
    .reduce((acc, c) => acc + (Number(c.monto_total) - Number(c.monto_cobrado)), 0);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Mi billetera</h1>
        <Link to="/movimientos/nuevo">
          <Button
            size="sm"
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
          >
            <Plus className="size-4" />
            Registrar
          </Button>
        </Link>
      </header>

      <IngresosMesCard
        fuentes={fuentes.data}
        ingresos={ingresos.data}
        loading={fuentes.isLoading || ingresos.isLoading}
      />

      {saldos.isLoading ? (
        <Skeleton className="h-32 w-full rounded-[var(--radius-card)]" />
      ) : saldos.data && saldos.data.length > 0 ? (
        <SaldoResumen saldos={saldos.data} />
      ) : (
        <EmptyState
          icon={<Wallet className="size-10" />}
          title="Empieza creando una cuenta"
          description="Por ejemplo, 'Efectivo' con el saldo que tienes hoy. Después registras tus ingresos y egresos."
          action={
            <Link to="/cuentas">
              <Button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]">
                <Plus className="size-4" />
                Crear primera cuenta
              </Button>
            </Link>
          }
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to="/por-pagar">
          <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]">
                <ArrowUpCircle className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--color-muted)]">Pendiente por pagar</p>
                <p className="tabular-nums text-lg font-semibold text-[var(--color-text)]">
                  {formatCOP(pendientePagar)}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/por-cobrar">
          <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)]">
                <ArrowDownCircle className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--color-muted)]">Pendiente por cobrar</p>
                <p className="tabular-nums text-lg font-semibold text-[var(--color-text)]">
                  {formatCOP(pendienteCobrar)}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Últimos movimientos</CardTitle>
          <Link to="/movimientos" className="text-xs text-[var(--color-primary)] hover:underline">
            Ver todos
          </Link>
        </CardHeader>
        <CardContent>
          {ultimos.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : ultimos.data && ultimos.data.length > 0 ? (
            ultimos.data.map((m) => <MovimientoRow key={m.id} mov={m} />)
          ) : (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              Aún no hay movimientos. Cada peso que anotas es un peso que entiendes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
