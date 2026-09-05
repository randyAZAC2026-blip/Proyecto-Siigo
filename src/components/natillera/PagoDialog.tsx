import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseCOP } from "@/lib/natillera/format";
import { MESES_LARGOS, type Miembro, type Pago } from "@/lib/natillera/types";

type Props = {
  open: boolean;
  onClose: () => void;
  miembro: Miembro | null;
  mes: number | null;
  anio: number;
  pagoExistente: Pago | undefined;
  cuotaSugerida: number;
  onSave: (input: { monto: number; fechaPago: string; notas?: string }) => void;
  onDelete: () => void;
};

export function PagoDialog({
  open,
  onClose,
  miembro,
  mes,
  anio,
  pagoExistente,
  cuotaSugerida,
  onSave,
  onDelete,
}: Props) {
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    if (!open) return;
    setMonto(String(pagoExistente?.monto ?? cuotaSugerida));
    setFecha(pagoExistente?.fechaPago ?? new Date().toISOString().slice(0, 10));
    setNotas(pagoExistente?.notas ?? "");
  }, [open, pagoExistente, cuotaSugerida]);

  if (!miembro || mes === null) return null;

  function handleSave() {
    onSave({
      monto: parseCOP(monto),
      fechaPago: fecha,
      notas: notas.trim() || undefined,
    });
    onClose();
  }

  function handleDelete() {
    if (confirm("¿Eliminar este pago?")) {
      onDelete();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pagoExistente ? "Editar pago" : "Registrar pago"} — {miembro.nombre}
          </DialogTitle>
          <DialogDescription>
            {MESES_LARGOS[mes - 1]} de {anio}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pago-monto">Monto pagado</Label>
            <Input
              id="pago-monto"
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            <p className="text-xs text-[var(--color-muted)]">
              Cuota esperada: {cuotaSugerida.toLocaleString("es-CO")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pago-fecha">Fecha de pago</Label>
            <Input
              id="pago-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pago-notas">Notas (opcional)</Label>
            <Textarea
              id="pago-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Ej: Pagó en efectivo / abono parcial / etc."
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {pagoExistente ? (
            <Button
              variant="ghost"
              onClick={handleDelete}
              className="text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
            >
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
            >
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
