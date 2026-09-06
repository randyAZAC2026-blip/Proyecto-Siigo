import { useEffect, useState } from "react";
import { CircleCheck, AlertCircle } from "lucide-react";
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
import { api } from "@/lib/dashboard/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onGuardado?: () => void;
}

export function AgregarMovimientoModal({ open, onClose, onGuardado }: Props) {
  const [banco, setBanco] = useState<"Bancolombia" | "Nequi">("Bancolombia");
  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [tipoMonto, setTipoMonto] = useState<"ingreso" | "egreso">("ingreso");
  const [saldo, setSaldo] = useState("");
  const [origen, setOrigen] = useState<string>("NATILLERA");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFecha(new Date().toISOString().slice(0, 10));
    setDescripcion("");
    setMonto("");
    setSaldo("");
    setTipoMonto("ingreso");
    setOrigen("NATILLERA");
    setError(null);
    setOk(null);
  }, [open]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const monteNum = Math.abs(Math.round(Number(monto.replace(/[^\d.-]/g, "")) || 0));
    if (monteNum <= 0) return setError("El monto debe ser mayor a 0");
    const signo = tipoMonto === "egreso" ? -1 : 1;
    setEnviando(true);
    try {
      const r = await api.crearMovimientoBanco({
        banco,
        fecha,
        descripcion: descripcion || undefined,
        monto: monteNum * signo,
        saldo_cuenta: saldo ? Number(saldo.replace(/[^\d.-]/g, "")) : null,
        detalle_origen: origen || null,
      });
      if (r.creado) {
        setOk(`Guardado #${r.id}`);
        onGuardado?.();
        setTimeout(() => onClose(), 800);
      } else {
        setError(`Ya existe un movimiento igual (#${r.id_existente})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar movimiento bancario</DialogTitle>
          <DialogDescription>
            Se guarda en la BD SQLite y aparece en el extracto. Detecta duplicados por
            (banco, fecha, monto, descripción).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={guardar} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Banco *</Label>
              <select
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                value={banco}
                onChange={(e) => setBanco(e.target.value as "Bancolombia" | "Nequi")}
              >
                <option value="Bancolombia">Bancolombia</option>
                <option value="Nequi">Nequi</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Transferencia de Randy Hernández"
              maxLength={200}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <div className="flex gap-1">
                {(["ingreso", "egreso"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipoMonto(t)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors capitalize ${
                      tipoMonto === t
                        ? t === "ingreso"
                          ? "border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]"
                          : "border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)]"
                    }`}
                  >
                    {t === "ingreso" ? "+ Ingreso" : "− Egreso"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Monto *</Label>
              <Input
                inputMode="numeric"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="50000"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Saldo cuenta</Label>
              <Input
                inputMode="numeric"
                value={saldo}
                onChange={(e) => setSaldo(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Origen</Label>
            <select
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
            >
              <option value="NATILLERA">NATILLERA</option>
              <option value="PERSONAL">PERSONAL</option>
              <option value="N/A">N/A</option>
            </select>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
              <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--color-destructive)]">{error}</p>
            </div>
          )}
          {ok && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3">
              <CircleCheck className="size-4 text-[var(--color-success)]" />
              <p className="text-sm text-[var(--color-success)]">{ok}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={enviando}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
            >
              {enviando ? "Guardando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
