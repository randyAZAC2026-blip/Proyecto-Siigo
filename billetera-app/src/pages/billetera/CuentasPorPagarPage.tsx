import { useState } from "react";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CarteraForm } from "@/components/billetera/CarteraForm";
import { MovimientoForm } from "@/components/billetera/MovimientoForm";
import { EmptyState } from "@/components/billetera/EmptyState";
import {
  useCategorias,
  useCrearCxP,
  useCrearMovimiento,
  useCuentas,
  useCxP,
  useEliminarCxP,
} from "@/lib/billetera/hooks";
import { formatCOP, formatDate } from "@/lib/billetera/format";
import type { CuentaPorPagar } from "@/lib/supabase/database.types";

export function CuentasPorPagarPage() {
  const cxp = useCxP();
  const cuentas = useCuentas();
  const categorias = useCategorias();
  const crear = useCrearCxP();
  const crearMov = useCrearMovimiento();
  const eliminar = useEliminarCxP();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [pagando, setPagando] = useState<CuentaPorPagar | null>(null);

  function estado(c: CuentaPorPagar): "pendiente" | "parcial" | "pagada" {
    const pagado = Number(c.monto_pagado);
    const total = Number(c.monto_total);
    if (pagado === 0) return "pendiente";
    if (pagado >= total) return "pagada";
    return "parcial";
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Cuentas por pagar</h1>
        <Dialog open={nuevoAbierto} onOpenChange={setNuevoAbierto}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
            >
              <Plus className="size-4" />
              Nueva
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar nueva cuenta por pagar</DialogTitle>
            </DialogHeader>
            <CarteraForm
              variante="por_pagar"
              onSubmit={async (v) => {
                await crear.mutateAsync({
                  acreedor: v.parte,
                  concepto: v.concepto,
                  monto_total: v.monto_total,
                  fecha_registro: v.fecha_registro,
                  fecha_vencimiento: v.fecha_vencimiento,
                  nota: v.nota,
                });
                setNuevoAbierto(false);
              }}
              onCancel={() => setNuevoAbierto(false)}
            />
          </DialogContent>
        </Dialog>
      </header>

      {cxp.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      ) : cxp.data && cxp.data.length > 0 ? (
        <div className="space-y-3">
          {cxp.data.map((c) => {
            const e = estado(c);
            const pendiente = Number(c.monto_total) - Number(c.monto_pagado);
            return (
              <Card
                key={c.id}
                className="rounded-[var(--radius-card)] border-[var(--color-border)]"
              >
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">{c.acreedor}</CardTitle>
                    <p className="truncate text-xs text-[var(--color-muted)]">{c.concepto}</p>
                  </div>
                  <Badge
                    variant={e === "pagada" ? "secondary" : e === "parcial" ? "default" : "destructive"}
                  >
                    {e === "pagada" ? "Pagada" : e === "parcial" ? "Parcial" : "Pendiente"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Total</p>
                      <p className="tabular-nums font-medium">{formatCOP(Number(c.monto_total))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Pagado</p>
                      <p className="tabular-nums font-medium">{formatCOP(Number(c.monto_pagado))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Pendiente</p>
                      <p className="tabular-nums font-medium text-[var(--color-destructive)]">
                        {formatCOP(pendiente)}
                      </p>
                    </div>
                  </div>
                  {c.fecha_vencimiento && (
                    <p className="text-xs text-[var(--color-muted)]">
                      Vence el {formatDate(c.fecha_vencimiento)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {e !== "pagada" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPagando(c)}
                        disabled={!cuentas.data?.some((cu) => !cu.archivada)}
                      >
                        <CheckCircle2 className="size-4" />
                        Registrar pago
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("¿Eliminar esta cuenta por pagar?")) eliminar.mutate(c.id);
                      }}
                      className="text-[var(--color-destructive)]"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No tienes cuentas por pagar"
          description="Registra lo que debes para no olvidarlo. Al marcar un pago se crea el egreso automáticamente."
        />
      )}

      <Dialog open={!!pagando} onOpenChange={(o) => !o && setPagando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago a {pagando?.acreedor}</DialogTitle>
          </DialogHeader>
          {pagando && cuentas.data && (
            <MovimientoForm
              cuentas={cuentas.data}
              categorias={categorias.data ?? []}
              defaultTipo="egreso"
              cxpId={pagando.id}
              defaultMonto={Number(pagando.monto_total) - Number(pagando.monto_pagado)}
              defaultContraparte={pagando.acreedor}
              defaultDescripcion={pagando.concepto}
              submitLabel="Registrar pago"
              onSubmit={async (input) => {
                await crearMov.mutateAsync(input);
                setPagando(null);
              }}
              onCancel={() => setPagando(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
