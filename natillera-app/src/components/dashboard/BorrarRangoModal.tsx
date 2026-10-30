import { useEffect, useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
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
  banco: string;
  onClose: () => void;
  onBorrado: (borrados: number) => void;
}

export function BorrarRangoModal({ open, banco, onClose, onBorrado }: Props) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [conteo, setConteo] = useState<{ total: number; con_transaccion: number } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDesde("");
      setHasta("");
      setConteo(null);
      setError(null);
    }
  }, [open]);

  // Al cambiar fechas, consultar la vista previa automática del conteo.
  useEffect(() => {
    if (!open || !desde || !hasta) {
      setConteo(null);
      return;
    }
    let abortado = false;
    setCargando(true);
    setError(null);
    api
      .contarExtractosRango(desde, hasta, banco)
      .then((r) => {
        if (!abortado) setConteo(r);
      })
      .catch((e) => {
        if (!abortado) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!abortado) setCargando(false);
      });
    return () => {
      abortado = true;
    };
  }, [open, desde, hasta, banco]);

  async function confirmarBorrado() {
    if (!desde || !hasta) return;
    const texto =
      conteo && conteo.con_transaccion > 0
        ? `Vas a borrar ${conteo.total} movimientos, ${conteo.con_transaccion} de ellos tienen una transacción ligada. ¿Confirmas?`
        : `Vas a borrar ${conteo?.total ?? "?"} movimientos. ¿Confirmas?`;
    if (!window.confirm(texto)) return;
    setCargando(true);
    setError(null);
    try {
      const r = await api.borrarExtractosRango(desde, hasta, banco);
      onBorrado(r.borrados);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-destructive)]">
            <Trash2 className="size-5" />
            Borrar movimientos por fecha
          </DialogTitle>
          <DialogDescription>
            Elimina de forma permanente los movimientos de {banco} en el rango de fechas seleccionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="desde">Desde</Label>
              <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hasta">Hasta</Label>
              <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          {desde && hasta && (
            <div className="rounded-md border border-[var(--color-border)] p-3 text-sm space-y-1">
              {cargando && !conteo ? (
                <p className="text-[var(--color-muted)]">Contando…</p>
              ) : conteo ? (
                <>
                  <p>
                    Se encontraron <strong>{conteo.total}</strong> movimientos en ese rango.
                  </p>
                  {conteo.con_transaccion > 0 && (
                    <p className="flex items-start gap-2 text-[var(--color-warning)]">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                      <span>
                        <strong>{conteo.con_transaccion}</strong> tienen transacción ligada. Al borrar
                        el movimiento la transacción queda sin referencia bancaria pero no se elimina.
                      </span>
                    </p>
                  )}
                </>
              ) : null}
            </div>
          )}

          {error && (
            <p className="text-sm text-[var(--color-destructive)]">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={cargando}>
            Cancelar
          </Button>
          <Button
            onClick={confirmarBorrado}
            disabled={!desde || !hasta || cargando || !conteo || conteo.total === 0}
            className="bg-[var(--color-destructive)] text-white hover:bg-[var(--color-destructive)]/90"
          >
            <Trash2 className="size-4" />
            {cargando ? "Borrando…" : "Borrar rango"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
