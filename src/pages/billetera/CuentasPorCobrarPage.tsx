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
  useCrearCxC,
  useCrearMovimiento,
  useCuentas,
  useCxC,
  useEliminarCxC,
  useFuentesIngreso,
} from "@/lib/billetera/hooks";
import { formatCOP, formatDate } from "@/lib/billetera/format";
import type { CuentaPorCobrar } from "@/lib/supabase/database.types";

export function CuentasPorCobrarPage() {
  const cxc = useCxC();
  const cuentas = useCuentas();
  const categorias = useCategorias();
  const fuentesIngreso = useFuentesIngreso();
  const crear = useCrearCxC();
  const crearMov = useCrearMovimiento();
  const eliminar = useEliminarCxC();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [cobrando, setCobrando] = useState<CuentaPorCobrar | null>(null);

  function estado(c: CuentaPorCobrar): "pendiente" | "parcial" | "cobrada" {
    const cobrado = Number(c.monto_cobrado);
    const total = Number(c.monto_total);
    if (cobrado === 0) return "pendiente";
    if (cobrado >= total) return "cobrada";
    return "parcial";
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Cuentas por cobrar</h1>
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
              <DialogTitle>Registrar nueva cuenta por cobrar</DialogTitle>
            </DialogHeader>
            <CarteraForm
              variante="por_cobrar"
              onSubmit={async (v) => {
                await crear.mutateAsync({
                  deudor: v.parte,
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

      {cxc.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      ) : cxc.data && cxc.data.length > 0 ? (
        <div className="space-y-3">
          {cxc.data.map((c) => {
            const e = estado(c);
            const pendiente = Number(c.monto_total) - Number(c.monto_cobrado);
            return (
              <Card
                key={c.id}
                className="rounded-[var(--radius-card)] border-[var(--color-border)]"
              >
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">{c.deudor}</CardTitle>
                    <p className="truncate text-xs text-[var(--color-muted)]">{c.concepto}</p>
                  </div>
                  <Badge
                    variant={e === "cobrada" ? "secondary" : e === "parcial" ? "default" : "destructive"}
                  >
                    {e === "cobrada" ? "Cobrada" : e === "parcial" ? "Parcial" : "Pendiente"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Total</p>
                      <p className="tabular-nums font-medium">{formatCOP(Number(c.monto_total))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Cobrado</p>
                      <p className="tabular-nums font-medium">{formatCOP(Number(c.monto_cobrado))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Pendiente</p>
                      <p className="tabular-nums font-medium text-[var(--color-success)]">
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
                    {e !== "cobrada" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCobrando(c)}
                        disabled={!cuentas.data?.some((cu) => !cu.archivada)}
                      >
                        <CheckCircle2 className="size-4" />
                        Registrar cobro
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("¿Eliminar esta cuenta por cobrar?")) eliminar.mutate(c.id);
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
          title="No tienes cuentas por cobrar"
          description="Registra lo que te deben. Al marcar el cobro se crea el ingreso automáticamente."
        />
      )}

      <Dialog open={!!cobrando} onOpenChange={(o) => !o && setCobrando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar cobro a {cobrando?.deudor}</DialogTitle>
          </DialogHeader>
          {cobrando && cuentas.data && (
            <MovimientoForm
              cuentas={cuentas.data}
              categorias={categorias.data ?? []}
              fuentesIngreso={fuentesIngreso.data ?? []}
              defaultTipo="ingreso"
              cxcId={cobrando.id}
              defaultMonto={Number(cobrando.monto_total) - Number(cobrando.monto_cobrado)}
              defaultContraparte={cobrando.deudor}
              defaultDescripcion={cobrando.concepto}
              submitLabel="Registrar cobro"
              onSubmit={async (input) => {
                await crearMov.mutateAsync(input);
                setCobrando(null);
              }}
              onCancel={() => setCobrando(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
