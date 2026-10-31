import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type ActividadResumen, type ActividadPatch } from "@/lib/dashboard/api";

interface Props {
  actividad: ActividadResumen;
  onGuardado: () => void;
}

export function EditarActividadModal({ actividad, onGuardado }: Props) {
  const [open, setOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const premios = (actividad.premios ?? {}) as Record<string, unknown>;
  const premioMayor = typeof premios.mayor === "number" ? String(premios.mayor) : "";
  const premioSegundo = typeof premios.segundo === "number" ? String(premios.segundo) : "";

  const [nombre, setNombre] = useState(actividad.nombre);
  const [tipo, setTipo] = useState(actividad.tipo);
  const [descripcion, setDescripcion] = useState(actividad.descripcion ?? "");
  const [fechaEvento, setFechaEvento] = useState(actividad.fecha_evento ?? "");
  const [valorBoleta, setValorBoleta] = useState(String(actividad.valor_boleta));
  const [estado, setEstado] = useState(actividad.estado);
  const [notas, setNotas] = useState(actividad.notas ?? "");
  const [mayor, setMayor] = useState(premioMayor);
  const [segundo, setSegundo] = useState(premioSegundo);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const nuevosPremios: Record<string, number> = {};
      if (mayor.trim() !== "") nuevosPremios.mayor = Number(mayor);
      if (segundo.trim() !== "") nuevosPremios.segundo = Number(segundo);
      const patch: ActividadPatch = {
        nombre: nombre.trim(),
        tipo,
        descripcion: descripcion.trim() || null,
        fecha_evento: fechaEvento || null,
        valor_boleta: Number(valorBoleta) || 0,
        estado,
        notas: notas.trim() || null,
        premios: nuevosPremios,
      };
      await api.actualizarActividad(actividad.id, patch);
      setOpen(false);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" />
        Editar
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar actividad</DialogTitle>
          <DialogDescription>
            Cambia el nombre, premios y demás datos. Las boletas y pagos no se tocan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ActividadResumen["tipo"])}
              >
                <option value="rifa">Rifa</option>
                <option value="bazar">Bazar</option>
                <option value="otra">Otra</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado</Label>
              <select
                id="estado"
                className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                value={estado}
                onChange={(e) => setEstado(e.target.value as ActividadResumen["estado"])}
              >
                <option value="activa">Activa</option>
                <option value="cerrada">Cerrada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fecha_evento">Fecha del evento</Label>
              <Input id="fecha_evento" type="date" value={fechaEvento} onChange={(e) => setFechaEvento(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valor_boleta">Valor boleta</Label>
              <Input id="valor_boleta" type="number" min="0" value={valorBoleta} onChange={(e) => setValorBoleta(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="premio_mayor">Premio mayor</Label>
              <Input id="premio_mayor" type="number" min="0" placeholder="opcional" value={mayor} onChange={(e) => setMayor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="premio_segundo">Segundo premio</Label>
              <Input id="premio_segundo" type="number" min="0" placeholder="opcional" value={segundo} onChange={(e) => setSegundo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <textarea
              id="descripcion"
              rows={2}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <textarea
              id="notas"
              rows={2}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
