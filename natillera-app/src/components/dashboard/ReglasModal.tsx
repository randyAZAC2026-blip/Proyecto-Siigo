import { useEffect, useState, type FormEvent } from "react";
import { ListChecks, Play, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, NOMBRE_CATEGORIA, type CategoriaBanco, type ReglaBanco } from "@/lib/dashboard/api";

const TIPOS: Record<ReglaBanco["tipo"], string> = {
  ingreso: "Entradas",
  egreso: "Salidas",
  ambos: "Entradas y salidas",
};
const SELECT =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm";

/**
 * Reglas que clasifican solas los movimientos que no son pagos de socios
 * (intereses de la cuenta, 4x1000, cuota de manejo, compras personales…).
 * Se aplican al importar y con el botón "Aplicar a pendientes".
 */
export function ReglasModal({
  open,
  onClose,
  onCambio,
}: {
  open: boolean;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [reglas, setReglas] = useState<ReglaBanco[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nueva, setNueva] = useState({
    nombre: "",
    patron: "",
    tipo: "egreso" as ReglaBanco["tipo"],
    categoria: "personal" as CategoriaBanco,
  });

  const cargar = () =>
    api
      .reglasBanco()
      .then(setReglas)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAviso(null);
    void cargar();
  }, [open]);

  async function correr(fn: () => Promise<unknown>) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    if (nueva.patron.trim().length < 3) return setError("El texto a buscar debe tener al menos 3 letras.");
    void correr(async () => {
      await api.guardarRegla({ ...nueva, nombre: nueva.nombre.trim() || nueva.patron.trim() });
      setNueva({ ...nueva, nombre: "", patron: "" });
      await cargar();
    });
  };

  const aplicar = () =>
    correr(async () => {
      const n = await api.aplicarReglas();
      setAviso(n > 0 ? `${n} movimientos pendientes quedaron clasificados.` : "Ningún movimiento pendiente coincide con las reglas.");
      onCambio();
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="size-5 text-[var(--color-primary)]" />
            Reglas de clasificación
          </DialogTitle>
          <DialogDescription>
            Si la descripción del movimiento contiene el texto, se clasifica sola y deja de contar como pendiente.
            Nunca toca movimientos que ya tienen pagos unidos.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--color-surface)] shadow-[0_1px_0_var(--color-border)]">
              <tr className="text-left text-[var(--color-muted)]">
                <th className="p-2 font-medium">Regla</th>
                <th className="p-2 font-medium">Contiene</th>
                <th className="p-2 font-medium">Aplica a</th>
                <th className="p-2 font-medium">Clasifica como</th>
                <th className="p-2 text-center font-medium">Activa</th>
              </tr>
            </thead>
            <tbody>
              {reglas.map((r) => (
                <tr key={r.id} className={`border-t border-[var(--color-border)] ${r.activa ? "" : "opacity-50"}`}>
                  <td className="p-2 font-medium">{r.nombre}</td>
                  <td className="p-2 font-mono text-[11px]">{r.patron}</td>
                  <td className="p-2">{TIPOS[r.tipo]}</td>
                  <td className="p-2">{NOMBRE_CATEGORIA[r.categoria]}</td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Activar regla ${r.nombre}`}
                      checked={r.activa}
                      disabled={ocupado}
                      onChange={() =>
                        correr(async () => {
                          await api.cambiarRegla(r.id, { activa: !r.activa });
                          await cargar();
                        })
                      }
                      className="accent-[var(--color-primary)]"
                    />
                  </td>
                </tr>
              ))}
              {reglas.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-[var(--color-muted)]">
                    Aún no hay reglas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={agregar} className="grid gap-2 rounded-md border border-dashed border-[var(--color-border)] p-3 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="regla-patron" className="text-xs">La descripción contiene</Label>
            <Input
              id="regla-patron"
              value={nueva.patron}
              onChange={(e) => setNueva({ ...nueva, patron: e.target.value })}
              placeholder="ej. COMPRA EN"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="regla-nombre" className="text-xs">Nombre (opcional)</Label>
            <Input
              id="regla-nombre"
              value={nueva.nombre}
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              placeholder="ej. Compras con tarjeta"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="regla-tipo" className="text-xs">Aplica a</Label>
            <select
              id="regla-tipo"
              className={SELECT}
              value={nueva.tipo}
              onChange={(e) => setNueva({ ...nueva, tipo: e.target.value as ReglaBanco["tipo"] })}
            >
              {Object.entries(TIPOS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="regla-cat" className="text-xs">Clasificar como</Label>
            <select
              id="regla-cat"
              className={SELECT}
              value={nueva.categoria}
              onChange={(e) => setNueva({ ...nueva, categoria: e.target.value as CategoriaBanco })}
            >
              {Object.entries(NOMBRE_CATEGORIA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={ocupado}>
            <Plus className="size-4" /> Agregar
          </Button>
        </form>

        {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
        {aviso && <p className="text-sm text-[var(--color-text)]">{aviso}</p>}

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={aplicar} disabled={ocupado}>
            <Play className="size-4" /> Aplicar a pendientes
          </Button>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
