import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Archive, ArchiveRestore, Trash2, Anchor, Shuffle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FuenteIngresoForm } from "@/components/billetera/FuenteIngresoForm";
import { EmptyState } from "@/components/billetera/EmptyState";
import {
  useActualizarFuenteIngreso,
  useCrearFuenteIngreso,
  useEliminarFuenteIngreso,
  useFuentesIngreso,
} from "@/lib/billetera/hooks";
import { formatCOP } from "@/lib/billetera/format";
import type { FuenteIngreso } from "@/lib/supabase/database.types";

export function FuentesIngresoPage() {
  const fuentes = useFuentesIngreso();
  const crear = useCrearFuenteIngreso();
  const actualizar = useActualizarFuenteIngreso();
  const eliminar = useEliminarFuenteIngreso();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [editando, setEditando] = useState<FuenteIngreso | null>(null);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Fuentes de ingreso</h1>
        <div className="flex items-center gap-2">
          <Link to="/cuentas">
            <Button variant="outline" size="sm">
              <Wallet className="size-4" />
              Cuentas
            </Button>
          </Link>
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
                <DialogTitle>Nueva fuente de ingreso</DialogTitle>
              </DialogHeader>
              <FuenteIngresoForm
                onSubmit={async (v) => {
                  await crear.mutateAsync(v);
                  setNuevoAbierto(false);
                }}
                onCancel={() => setNuevoAbierto(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <p className="text-sm text-[var(--color-muted)]">
        Clasifica de dónde viene tu dinero. Los ingresos <strong>fijos</strong> (salario, arriendos
        recibidos) te permiten comparar lo esperado contra lo recibido cada mes. Los{" "}
        <strong>variables</strong> (ventas, comisiones, freelance) se agregan a medida que entren.
      </p>

      {fuentes.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      ) : fuentes.data && fuentes.data.length > 0 ? (
        <div className="space-y-3">
          {fuentes.data.map((f) => (
            <Card
              key={f.id}
              className="rounded-[var(--radius-card)] border-[var(--color-border)]"
            >
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex items-center gap-2 truncate text-base">
                    {f.frecuencia === "fijo" ? (
                      <Anchor className="size-4 text-[var(--color-primary)]" />
                    ) : (
                      <Shuffle className="size-4 text-[var(--color-warning)]" />
                    )}
                    {f.nombre}
                    {!f.activa && (
                      <span className="text-xs text-[var(--color-muted)]">(archivada)</span>
                    )}
                  </CardTitle>
                  {f.nota && (
                    <p className="mt-1 truncate text-xs text-[var(--color-muted)]">{f.nota}</p>
                  )}
                </div>
                <Badge variant={f.frecuencia === "fijo" ? "default" : "secondary"}>
                  {f.frecuencia === "fijo" ? "Fijo" : "Variable"}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="text-xs text-[var(--color-muted)]">Esperado mensual</p>
                  <p className="tabular-nums font-medium">
                    {f.monto_esperado_mensual != null
                      ? formatCOP(Number(f.monto_esperado_mensual))
                      : "—"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditando(f)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      actualizar.mutate({ id: f.id, patch: { activa: !f.activa } })
                    }
                  >
                    {f.activa ? (
                      <>
                        <Archive className="size-4" />
                        Archivar
                      </>
                    ) : (
                      <>
                        <ArchiveRestore className="size-4" />
                        Reactivar
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
                          "¿Eliminar esta fuente? Los ingresos asociados perderán la referencia pero no se borran.",
                        )
                      ) {
                        eliminar.mutate(f.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Anchor className="size-10" />}
          title="Aún no tienes fuentes de ingreso"
          description="Agrega al menos tus ingresos fijos (salario, arriendo recibido, pensión). Los variables los agregas cuando los tengas."
          action={
            <Button
              onClick={() => setNuevoAbierto(true)}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
            >
              <Plus className="size-4" />
              Agregar primera fuente
            </Button>
          }
        />
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar fuente</DialogTitle>
          </DialogHeader>
          {editando && (
            <FuenteIngresoForm
              fuente={editando}
              onSubmit={async (v) => {
                await actualizar.mutateAsync({
                  id: editando.id,
                  patch: {
                    nombre: v.nombre,
                    frecuencia: v.frecuencia,
                    monto_esperado_mensual: v.monto_esperado_mensual,
                    nota: v.nota,
                  },
                });
                setEditando(null);
              }}
              onCancel={() => setEditando(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
