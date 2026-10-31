import { useEffect, useState } from "react";
import { AlertCircle, Undo2, PlusCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  api,
  type Extracto,
  type LineaDesgloseExtracto,
  type ResultadoDeshacerDesglose,
} from "@/lib/dashboard/api";
import { formatCOP, formatFechaCorta, nombreConcepto } from "@/lib/natillera/format";

/**
 * Muestra cómo quedó desglosado un movimiento del banco y permite deshacerlo
 * para corregirlo (por ejemplo, un préstamo asignado a la persona equivocada).
 * Al deshacer, los pagos creados desde la app se borran con su préstamo o
 * abono; los que venían del Excel solo se sueltan.
 */
export function DesgloseExtractoModal({
  fila,
  onClose,
  onDeshecho,
  onCompletar,
}: {
  fila: Extracto;
  onClose: () => void;
  /** Se llama después de deshacer, para reabrir el registro y corregir. */
  onDeshecho: (r: ResultadoDeshacerDesglose) => void;
  /** Solo en movimientos parciales: registrar lo que falta sin deshacer. */
  onCompletar?: () => void;
}) {
  const [lineas, setLineas] = useState<LineaDesgloseExtracto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const delExcel = !fila.n_transacciones;

  useEffect(() => {
    if (delExcel) {
      setLineas([]);
      return;
    }
    api
      .desgloseExtracto(fila.id)
      .then(setLineas)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [fila.id, delExcel]);

  const salida = fila.monto < 0;
  const neto = (lineas ?? []).reduce(
    (s, l) => s + ((l.tipo === "egreso") === salida ? l.valor : -l.valor),
    0,
  );
  const prestamos = (lineas ?? []).filter((l) => l.concepto === "PRESTAMO" && !l.del_excel).length;
  const borrables = (lineas ?? []).filter((l) => !l.del_excel).length;
  const soltables = (lineas ?? []).length - borrables;

  const deshacer = async () => {
    setTrabajando(true);
    setError(null);
    try {
      onDeshecho(await api.deshacerDesglose(fila.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirmar(false);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Desglose del movimiento</DialogTitle>
          <DialogDescription>
            {formatFechaCorta(fila.fecha)} · {fila.descripcion ?? "—"} ·{" "}
            <span className="font-semibold tabular-nums">
              {salida ? "−" : "+"}
              {formatCOP(Math.abs(fila.monto))}
            </span>
          </DialogDescription>
        </DialogHeader>

        {delExcel ? (
          <p className="text-sm text-[var(--color-text)]">
            Este movimiento venía conciliado desde el Excel
            {fila.socio_nombre ? ` a nombre de ${fila.socio_nombre}` : ""}, sin pagos unidos en la app.
            Si lo deshaces, queda pendiente para que registres el desglose correcto.
          </p>
        ) : lineas === null && !error ? (
          <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-input)] border border-[var(--color-border)]">
            {(lineas ?? []).map((l) => {
              const descuenta = (l.tipo === "egreso") !== salida;
              return (
                <li key={l.transaccion_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--color-text)]">
                      {nombreConcepto(l.concepto)}
                      {l.del_excel && (
                        <span className="ml-2 rounded bg-[var(--color-muted)]/15 px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-muted)]">
                          del Excel
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-[var(--color-muted)]">
                      {l.socio_nombre ?? "Sin socio"} · {formatFechaCorta(l.fecha_pago)}
                    </div>
                  </div>
                  <span className="shrink-0 tabular-nums font-semibold">
                    {descuenta ? "− " : ""}
                    {formatCOP(l.valor)}
                  </span>
                </li>
              );
            })}
            {lineas && lineas.length > 0 && (
              <li className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-[var(--color-muted)]">Neto</span>
                <span className="tabular-nums font-semibold">{formatCOP(neto)}</span>
              </li>
            )}
          </ul>
        )}

        {confirmar && !delExcel && (
          <div className="rounded-[var(--radius-input)] border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 p-3 text-sm space-y-1">
            <p className="font-medium">Al deshacer:</p>
            <ul className="list-disc pl-5 text-xs space-y-0.5">
              {borrables > 0 && (
                <li>
                  Se borran {borrables} pago(s) registrados desde la app
                  {prestamos > 0 ? `, incluido el préstamo (sale de la cartera)` : ""}.
                </li>
              )}
              {soltables > 0 && <li>{soltables} pago(s) del Excel se sueltan, pero siguen registrados.</li>}
              <li>El movimiento queda pendiente y se abre el registro para que lo hagas bien.</li>
            </ul>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 text-sm text-[var(--color-destructive)]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={trabajando}>
            Cerrar
          </Button>
          {onCompletar && !confirmar && (
            <Button variant="outline" onClick={onCompletar} disabled={trabajando} className="gap-1">
              <PlusCircle className="size-4" />
              Completar lo que falta
            </Button>
          )}
          {confirmar || delExcel ? (
            <Button
              onClick={deshacer}
              disabled={trabajando || (!delExcel && lineas === null)}
              className="gap-1 bg-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/90"
            >
              <Undo2 className="size-4" />
              {trabajando ? "Deshaciendo…" : "Sí, deshacer y corregir"}
            </Button>
          ) : (
            <Button onClick={() => setConfirmar(true)} disabled={lineas === null} className="gap-1">
              <Undo2 className="size-4" />
              Deshacer para corregir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
