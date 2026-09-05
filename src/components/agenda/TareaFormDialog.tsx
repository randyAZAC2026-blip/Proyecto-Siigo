import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Info } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { insertInto, updateWhere } from "@/lib/supabase/mutations";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Cliente,
  EstadoTarea,
  ObligacionDian,
  ObligacionVencimiento,
  PrioridadTarea,
  Tarea,
} from "@/lib/supabase/database.types";
import { ESTADOS, FRECUENCIAS, PRIORIDADES, periodoLabel } from "@/lib/agenda/helpers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea?: Tarea;
}

const YEAR_ACTUAL = new Date().getFullYear();

export function TareaFormDialog({ open, onOpenChange, tarea }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!tarea;

  const [clienteId, setClienteId] = useState<string>(tarea?.cliente_id ?? "");
  const [obligacionId, setObligacionId] = useState<string>(tarea?.obligacion_id ?? "");
  const [titulo, setTitulo] = useState(tarea?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? "");
  const [periodoYear, setPeriodoYear] = useState<string>(String(tarea?.periodo_year ?? YEAR_ACTUAL));
  const [periodoNumero, setPeriodoNumero] = useState<string>(
    tarea?.periodo_numero != null ? String(tarea.periodo_numero) : "",
  );
  const [fechaVencimiento, setFechaVencimiento] = useState(tarea?.fecha_vencimiento ?? "");
  const [fechaEntregaInterna, setFechaEntregaInterna] = useState(tarea?.fecha_entrega_interna ?? "");
  const [prioridad, setPrioridad] = useState<PrioridadTarea>(tarea?.prioridad ?? "media");
  const [estado, setEstado] = useState<EstadoTarea>(tarea?.estado ?? "pendiente");
  const [notas, setNotas] = useState(tarea?.notas ?? "");
  const [vencimientoAuto, setVencimientoAuto] = useState<string | null>(null);

  const { data: clientes } = useQuery({
    queryKey: ["clientes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("razon_social");
      if (error) throw error;
      return data as Cliente[];
    },
    enabled: !!user,
  });

  const { data: obligaciones } = useQuery({
    queryKey: ["obligaciones_dian", "activas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obligaciones_dian")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data as ObligacionDian[];
    },
  });

  const obligacionSel = obligaciones?.find((o) => o.id === obligacionId);
  const clienteSel = clientes?.find((c) => c.id === clienteId);
  const frecuencia = obligacionSel?.frecuencia ?? "mensual";
  const periodosCfg = FRECUENCIAS.find((f) => f.value === frecuencia)!.periodos;

  // Auto-cálculo del vencimiento consultando obligaciones_vencimientos
  useEffect(() => {
    async function fetchVencimiento() {
      setVencimientoAuto(null);
      if (!obligacionId || !periodoYear) return;
      const digito = clienteSel?.ultimo_digito_nit ?? -1;
      const periodo = periodoNumero === "" ? null : Number(periodoNumero);

      let q = supabase
        .from("obligaciones_vencimientos")
        .select("fecha_vencimiento,ultimo_digito")
        .eq("obligacion_id", obligacionId)
        .eq("year", Number(periodoYear))
        .in("ultimo_digito", [digito, -1]);
      if (periodo != null) q = q.eq("periodo", periodo);
      const { data } = await q;
      const rows = (data ?? []) as Pick<ObligacionVencimiento, "fecha_vencimiento" | "ultimo_digito">[];
      if (rows.length === 0) return;
      // Prioriza el que matchea el dígito exacto sobre -1
      const match = rows.find((r) => r.ultimo_digito === digito) ?? rows[0];
      setVencimientoAuto(match.fecha_vencimiento);
    }
    fetchVencimiento();
  }, [obligacionId, periodoYear, periodoNumero, clienteSel?.ultimo_digito_nit]);

  // Título por defecto según obligación + cliente + periodo
  useEffect(() => {
    if (isEdit || titulo) return;
    if (!obligacionSel) return;
    const parts = [obligacionSel.nombre];
    if (periodoNumero) parts.push(periodoLabel(frecuencia, Number(periodoNumero)));
    if (periodoYear) parts.push(periodoYear);
    if (clienteSel) parts.push(`— ${clienteSel.razon_social}`);
    setTitulo(parts.join(" "));

  }, [obligacionId, periodoNumero, periodoYear, clienteId]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sin sesión");
      const payload = {
        owner_id: user.id,
        cliente_id: clienteId || null,
        obligacion_id: obligacionId || null,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        periodo_year: periodoYear ? Number(periodoYear) : null,
        periodo_numero: periodoNumero ? Number(periodoNumero) : null,
        fecha_vencimiento: fechaVencimiento || vencimientoAuto || null,
        fecha_entrega_interna: fechaEntregaInterna || null,
        prioridad,
        estado,
        notas: notas.trim() || null,
        completada_at:
          estado === "entregada"
            ? tarea?.completada_at ?? new Date().toISOString()
            : null,
      };
      if (isEdit) {
        await updateWhere("tareas", tarea!.id, payload);
      } else {
        await insertInto("tareas", payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      onOpenChange(false);
    },
  });

  const fechaEfectiva = fechaVencimiento || vencimientoAuto || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
          <DialogDescription>
            Vincula la tarea a un cliente y a una obligación para calcular el vencimiento automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.razon_social}
                      {c.ultimo_digito_nit != null && ` · díg ${c.ultimo_digito_nit}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Obligación</Label>
              <Select value={obligacionId} onValueChange={setObligacionId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona obligación" />
                </SelectTrigger>
                <SelectContent>
                  {obligaciones?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="year">Año</Label>
              <Input
                id="year"
                type="number"
                value={periodoYear}
                onChange={(e) => setPeriodoYear(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Periodo</Label>
              <Select value={periodoNumero} onValueChange={setPeriodoNumero}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona periodo" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: periodosCfg }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {periodoLabel(frecuencia, n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="venc">Fecha de vencimiento</Label>
              <Input
                id="venc"
                type="date"
                value={fechaEfectiva}
                onChange={(e) => setFechaVencimiento(e.target.value)}
              />
              {vencimientoAuto && !fechaVencimiento && (
                <p className="text-xs text-[var(--color-primary)] flex items-center gap-1">
                  <CalendarClock className="size-3" />
                  Fecha DIAN cargada automáticamente
                </p>
              )}
              {!vencimientoAuto && obligacionId && (
                <p className="text-xs text-[var(--color-muted)] flex items-center gap-1">
                  <Info className="size-3" />
                  Sin vencimiento configurado, ingrésalo a mano
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interna">Fecha interna</Label>
              <Input
                id="interna"
                type="date"
                value={fechaEntregaInterna}
                onChange={(e) => setFechaEntregaInterna(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as PrioridadTarea)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v) => setEstado(v as EstadoTarea)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Descripción</Label>
            <Textarea
              id="desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Detalles, adjuntos pendientes, subtareas..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas internas</Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !titulo.trim()}>
            {mut.isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear tarea"}
          </Button>
        </DialogFooter>
        {mut.error instanceof Error && (
          <p className="text-sm text-[var(--color-destructive)]">{mut.error.message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
