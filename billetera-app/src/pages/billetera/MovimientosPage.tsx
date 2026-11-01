import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MovimientoRow } from "@/components/billetera/MovimientoRow";
import { EmptyState } from "@/components/billetera/EmptyState";
import {
  useCuentas,
  useMovimientos,
  useEliminarMovimiento,
} from "@/lib/billetera/hooks";
import type { MovimientoTipo } from "@/lib/supabase/database.types";

export function MovimientosPage() {
  const cuentas = useCuentas();
  const [cuentaId, setCuentaId] = useState<string>("todas");
  const [tipo, setTipo] = useState<MovimientoTipo | "todos">("todos");

  const opts = useMemo(
    () => ({
      cuentaId: cuentaId === "todas" ? undefined : cuentaId,
      tipo: tipo === "todos" ? undefined : tipo,
    }),
    [cuentaId, tipo],
  );

  const movimientos = useMovimientos(opts);
  const eliminar = useEliminarMovimiento();

  function handleDelete(id: string) {
    if (confirm("¿Eliminar este movimiento? Si estaba ligado a una cuenta por pagar/cobrar, se devolverá el saldo.")) {
      eliminar.mutate(id);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Movimientos</h1>
        <Link to="/movimientos/nuevo">
          <Button
            size="sm"
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
          >
            <Plus className="size-4" />
            Nuevo
          </Button>
        </Link>
      </header>

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="size-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-muted)]">Cuenta</label>
            <Select value={cuentaId} onValueChange={setCuentaId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {(cuentas.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-muted)]">Tipo</label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ingreso">Ingresos</SelectItem>
                <SelectItem value="egreso">Egresos</SelectItem>
                <SelectItem value="transferencia">Transferencias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardContent className="py-2">
          {movimientos.isLoading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : movimientos.data && movimientos.data.length > 0 ? (
            movimientos.data.map((m) => (
              <MovimientoRow key={m.id} mov={m} onDelete={handleDelete} />
            ))
          ) : (
            <EmptyState
              title="Sin movimientos con esos filtros"
              description="Ajusta los filtros o registra un nuevo movimiento."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
