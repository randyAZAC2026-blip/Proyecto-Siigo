import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Archive, ArchiveRestore, Trash2, Tags, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CuentaForm } from "@/components/billetera/CuentaForm";
import { EmptyState } from "@/components/billetera/EmptyState";
import {
  useActualizarCuenta,
  useCrearCuenta,
  useCuentas,
  useEliminarCuenta,
  useSaldos,
} from "@/lib/billetera/hooks";
import { formatCOP } from "@/lib/billetera/format";

export function CuentasPage() {
  const cuentas = useCuentas();
  const saldos = useSaldos();
  const crear = useCrearCuenta();
  const actualizar = useActualizarCuenta();
  const eliminar = useEliminarCuenta();
  const [abierto, setAbierto] = useState(false);

  const saldoPorCuenta = new Map(saldos.data?.map((s) => [s.cuenta_id, Number(s.saldo_actual)]) ?? []);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Mis cuentas</h1>
        <div className="flex items-center gap-2">
          <Link to="/ingresos">
            <Button variant="outline" size="sm">
              <Anchor className="size-4" />
              Fuentes
            </Button>
          </Link>
          <Link to="/categorias">
            <Button variant="outline" size="sm">
              <Tags className="size-4" />
              Categorías
            </Button>
          </Link>
          <Dialog open={abierto} onOpenChange={setAbierto}>
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
              <DialogTitle>Crear cuenta</DialogTitle>
            </DialogHeader>
            <CuentaForm
              onSubmit={async (input) => {
                await crear.mutateAsync(input);
                setAbierto(false);
              }}
              onCancel={() => setAbierto(false)}
            />
          </DialogContent>
        </Dialog>
        </div>
      </header>

      {cuentas.isLoading ? (
        <Skeleton className="h-32 w-full rounded-[var(--radius-card)]" />
      ) : cuentas.data && cuentas.data.length > 0 ? (
        <div className="space-y-3">
          {cuentas.data.map((c) => (
            <Card
              key={c.id}
              className="rounded-[var(--radius-card)] border-[var(--color-border)]"
              data-archivada={c.archivada}
            >
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-base">
                    {c.nombre} {c.archivada && <span className="text-xs text-[var(--color-muted)]">(archivada)</span>}
                  </CardTitle>
                  <p className="text-xs capitalize text-[var(--color-muted)]">
                    {c.tipo.replace("_", " ")}
                  </p>
                </div>
                <p className="tabular-nums font-semibold">
                  {formatCOP(saldoPorCuenta.get(c.id) ?? Number(c.saldo_inicial))}
                </p>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    actualizar.mutate({ id: c.id, patch: { archivada: !c.archivada } })
                  }
                >
                  {c.archivada ? (
                    <>
                      <ArchiveRestore className="size-4" />
                      Reactivar
                    </>
                  ) : (
                    <>
                      <Archive className="size-4" />
                      Archivar
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--color-destructive)]"
                  onClick={() => {
                    if (
                      confirm(
                        "¿Eliminar la cuenta? Sólo se puede si no tiene movimientos. Si tiene, archívala.",
                      )
                    ) {
                      eliminar.mutate(c.id, {
                        onError: (err) =>
                          alert(
                            err instanceof Error ? err.message : "No se pudo eliminar — probablemente tiene movimientos.",
                          ),
                      });
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Aún no has creado cuentas"
          description="Crea tu primera cuenta (Efectivo, Nequi, Bancolombia…) para empezar."
        />
      )}
    </div>
  );
}
