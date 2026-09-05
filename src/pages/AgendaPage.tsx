import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { deleteWhere, updateWhere } from "@/lib/supabase/mutations";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TareaFormDialog } from "@/components/agenda/TareaFormDialog";
import type {
  Cliente,
  ObligacionDian,
  Tarea,
} from "@/lib/supabase/database.types";
import {
  ESTADOS,
  PRIORIDADES,
  diasHastaVencimiento,
  estadoEfectivo,
  formatFecha,
} from "@/lib/agenda/helpers";

type Filtros = {
  q: string;
  cliente: string;
  obligacion: string;
  estado: string;
  prioridad: string;
  desde: string;
  hasta: string;
};

const FILTROS_INIT: Filtros = {
  q: "",
  cliente: "todos",
  obligacion: "todas",
  estado: "activas",
  prioridad: "todas",
  desde: "",
  hasta: "",
};

export function AgendaPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Tarea | null>(null);
  const [creating, setCreating] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INIT);

  const { data: tareas, isLoading } = useQuery({
    queryKey: ["tareas", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tareas")
        .select("*")
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Tarea[];
    },
    enabled: !!user,
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id,razon_social").order("razon_social");
      if (error) throw error;
      return data as Pick<Cliente, "id" | "razon_social">[];
    },
    enabled: !!user,
  });

  const { data: obligaciones } = useQuery({
    queryKey: ["obligaciones_dian", "activas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obligaciones_dian")
        .select("id,nombre,frecuencia")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data as Pick<ObligacionDian, "id" | "nombre" | "frecuencia">[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWhere("tareas", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tareas"] }),
  });

  const marcarEntregada = useMutation({
    mutationFn: (t: Tarea) =>
      updateWhere("tareas", t.id, {
        estado: "entregada",
        completada_at: new Date().toISOString(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tareas"] }),
  });

  const clienteMap = useMemo(
    () => new Map(clientes?.map((c) => [c.id, c.razon_social])),
    [clientes],
  );
  const obligacionMap = useMemo(
    () => new Map(obligaciones?.map((o) => [o.id, o.nombre])),
    [obligaciones],
  );

  const tareasFiltradas = useMemo(() => {
    if (!tareas) return [];
    return tareas.filter((t) => {
      if (filtros.q) {
        const q = filtros.q.toLowerCase();
        const hay = t.titulo.toLowerCase().includes(q) || (t.descripcion?.toLowerCase().includes(q) ?? false);
        if (!hay) return false;
      }
      if (filtros.cliente !== "todos" && t.cliente_id !== filtros.cliente) return false;
      if (filtros.obligacion !== "todas" && t.obligacion_id !== filtros.obligacion) return false;
      if (filtros.prioridad !== "todas" && t.prioridad !== filtros.prioridad) return false;

      const efectivo = estadoEfectivo(t).key;
      if (filtros.estado === "activas" && (t.estado === "entregada" || t.estado === "no_aplica")) return false;
      if (filtros.estado === "vencidas" && efectivo !== "vencida") return false;
      if (filtros.estado === "hoy") {
        const d = diasHastaVencimiento(t.fecha_vencimiento);
        if (d !== 0) return false;
      }
      if (filtros.estado === "semana") {
        const d = diasHastaVencimiento(t.fecha_vencimiento);
        if (d === null || d < 0 || d > 7) return false;
      }
      if (
        filtros.estado !== "activas" &&
        filtros.estado !== "vencidas" &&
        filtros.estado !== "hoy" &&
        filtros.estado !== "semana" &&
        filtros.estado !== "todas" &&
        t.estado !== filtros.estado
      )
        return false;

      if (filtros.desde && t.fecha_vencimiento && t.fecha_vencimiento < filtros.desde) return false;
      if (filtros.hasta && t.fecha_vencimiento && t.fecha_vencimiento > filtros.hasta) return false;
      return true;
    });
  }, [tareas, filtros]);

  const resumen = useMemo(() => {
    if (!tareas) return { hoy: 0, semana: 0, vencidas: 0, activas: 0 };
    let hoy = 0,
      semana = 0,
      vencidas = 0,
      activas = 0;
    for (const t of tareas) {
      if (t.estado === "entregada" || t.estado === "no_aplica") continue;
      activas++;
      const d = diasHastaVencimiento(t.fecha_vencimiento);
      if (d === null) continue;
      if (d < 0) vencidas++;
      else if (d === 0) hoy++;
      else if (d <= 7) semana++;
    }
    return { hoy, semana, vencidas, activas };
  }, [tareas]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Vencidas" value={resumen.vencidas} icon={<AlertCircle className="size-4" />} tone="destructive" />
        <StatCard label="Hoy" value={resumen.hoy} icon={<Clock className="size-4" />} tone="warning" />
        <StatCard label="Próx. 7 días" value={resumen.semana} icon={<Clock className="size-4" />} tone="primary" />
        <StatCard label="Activas" value={resumen.activas} icon={<CheckCircle2 className="size-4" />} tone="muted" />
      </div>

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>Tareas tributarias</CardTitle>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nueva tarea
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Input
              placeholder="Buscar por título o descripción..."
              value={filtros.q}
              onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
            />
            <Select value={filtros.cliente} onValueChange={(v) => setFiltros({ ...filtros, cliente: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los clientes</SelectItem>
                {clientes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.razon_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtros.obligacion} onValueChange={(v) => setFiltros({ ...filtros, obligacion: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Obligación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las obligaciones</SelectItem>
                {obligaciones?.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtros.estado} onValueChange={(v) => setFiltros({ ...filtros, estado: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activas">Activas</SelectItem>
                <SelectItem value="hoy">Vencen hoy</SelectItem>
                <SelectItem value="semana">Próximos 7 días</SelectItem>
                <SelectItem value="vencidas">Vencidas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
                {ESTADOS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtros.prioridad} onValueChange={(v) => setFiltros({ ...filtros, prioridad: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda prioridad</SelectItem>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filtros.desde}
              onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
              placeholder="Desde"
            />
            <Input
              type="date"
              value={filtros.hasta}
              onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
              placeholder="Hasta"
            />
            <Button variant="ghost" onClick={() => setFiltros(FILTROS_INIT)}>
              Limpiar filtros
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : tareasFiltradas.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] py-8 text-center">
              No hay tareas con los filtros actuales.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Obligación</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tareasFiltradas.map((t) => (
                    <FilaTarea
                      key={t.id}
                      tarea={t}
                      cliente={t.cliente_id ? clienteMap.get(t.cliente_id) : undefined}
                      obligacion={t.obligacion_id ? obligacionMap.get(t.obligacion_id) : undefined}
                      onEdit={() => setEditing(t)}
                      onDelete={() => {
                        if (confirm("¿Eliminar tarea?")) deleteMut.mutate(t.id);
                      }}
                      onEntregar={() => marcarEntregada.mutate(t)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && <TareaFormDialog open onOpenChange={setCreating} />}
      {editing && (
        <TareaFormDialog open onOpenChange={(v) => !v && setEditing(null)} tarea={editing} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "destructive" | "warning" | "primary" | "muted";
}) {
  const toneClass = {
    destructive: "text-[var(--color-destructive)]",
    warning: "text-[var(--color-warning)]",
    primary: "text-[var(--color-primary)]",
    muted: "text-[var(--color-muted)]",
  }[tone];
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardContent className="py-4">
        <div className={`flex items-center gap-1.5 text-xs ${toneClass}`}>
          {icon}
          {label}
        </div>
        <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function FilaTarea({
  tarea,
  cliente,
  obligacion,
  onEdit,
  onDelete,
  onEntregar,
}: {
  tarea: Tarea;
  cliente?: string;
  obligacion?: string;
  onEdit: () => void;
  onDelete: () => void;
  onEntregar: () => void;
}) {
  const efectivo = estadoEfectivo(tarea);
  const prioridadCfg = PRIORIDADES.find((p) => p.value === tarea.prioridad)!;
  const dias = diasHastaVencimiento(tarea.fecha_vencimiento);

  let sub = "";
  if (dias === null) sub = "Sin fecha";
  else if (dias < 0) sub = `Hace ${Math.abs(dias)} d`;
  else if (dias === 0) sub = "Hoy";
  else sub = `En ${dias} d`;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium tabular-nums">{formatFecha(tarea.fecha_vencimiento)}</div>
        <div className={`text-xs ${dias !== null && dias < 0 ? "text-[var(--color-destructive)]" : "text-[var(--color-muted)]"}`}>
          {sub}
        </div>
      </TableCell>
      <TableCell className="max-w-[300px]">
        <div className="font-medium truncate">{tarea.titulo}</div>
        {tarea.descripcion && (
          <div className="text-xs text-[var(--color-muted)] truncate">{tarea.descripcion}</div>
        )}
      </TableCell>
      <TableCell className="text-sm">{cliente ?? "—"}</TableCell>
      <TableCell className="text-sm">{obligacion ?? "—"}</TableCell>
      <TableCell>
        <Badge className={efectivo.badgeClass}>{efectivo.label}</Badge>
      </TableCell>
      <TableCell>
        <Badge className={prioridadCfg.badgeClass}>{prioridadCfg.label}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {tarea.estado !== "entregada" && (
            <Button size="icon-sm" variant="ghost" onClick={onEntregar} title="Marcar como entregada">
              <CheckCircle2 className="size-4 text-[var(--color-success)]" />
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="size-4 text-[var(--color-destructive)]" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

