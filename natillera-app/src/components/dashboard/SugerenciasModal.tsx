import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Sparkles, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, type ResultadoSugerencias, type SugerenciaConciliacion } from "@/lib/dashboard/api";
import { formatCOP, formatFechaCorta, nombreConcepto } from "@/lib/natillera/format";

type Filtro = "todas" | "ingreso" | "egreso";

/**
 * Emparejamientos que la base encontró entre movimientos pendientes del
 * banco y pagos ya registrados. Se marcan por defecto los de confianza
 * alta (mismo día); los de fecha cercana quedan para revisar.
 */
export function SugerenciasModal({
  open,
  onClose,
  onAceptadas,
}: {
  open: boolean;
  onClose: () => void;
  onAceptadas: () => void;
}) {
  const [lista, setLista] = useState<SugerenciaConciliacion[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoSugerencias | null>(null);

  useEffect(() => {
    if (!open) return;
    setResultado(null);
    setError(null);
    setLista(null);
    setCargando(true);
    api
      .sugerenciasConciliacion()
      .then((s) => {
        setLista(s);
        setMarcadas(new Set(s.filter((x) => x.confianza === "alta").map((x) => x.extracto_id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  }, [open]);

  const visibles = useMemo(
    () =>
      (lista ?? []).filter((s) =>
        filtro === "todas" ? true : filtro === "ingreso" ? s.monto > 0 : s.monto < 0,
      ),
    [lista, filtro],
  );
  const seleccion = (lista ?? []).filter((s) => marcadas.has(s.extracto_id));
  const totalSel = seleccion.reduce((t, s) => t + Math.abs(s.monto), 0);
  const todasVisiblesMarcadas = visibles.length > 0 && visibles.every((s) => marcadas.has(s.extracto_id));

  const alternar = (id: number) =>
    setMarcadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alternarVisibles = () =>
    setMarcadas((prev) => {
      const n = new Set(prev);
      for (const s of visibles) {
        if (todasVisiblesMarcadas) n.delete(s.extracto_id);
        else n.add(s.extracto_id);
      }
      return n;
    });

  async function aceptar() {
    if (seleccion.length === 0) return;
    setCargando(true);
    setError(null);
    try {
      const r = await api.aceptarSugerencias(seleccion.map((s) => s.extracto_id));
      setResultado(r);
      onAceptadas();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  const n = (f: Filtro) =>
    (lista ?? []).filter((s) => (f === "todas" ? true : f === "ingreso" ? s.monto > 0 : s.monto < 0)).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-[var(--color-primary)]" />
            Sugerencias de conciliación
          </DialogTitle>
          <DialogDescription>
            Movimientos del banco que coinciden con pagos ya registrados: mismo socio y monto, fecha a máximo 5
            días. Solo aparecen los que tienen una única coincidencia posible.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              <CheckCircle2 className="size-5 text-[var(--status-good)]" />
              {resultado.aceptadas} movimientos conciliados.
            </p>
            {resultado.omitidas.length > 0 && (
              <div className="rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-3 text-xs">
                <p className="mb-1 font-medium">{resultado.omitidas.length} no se pudieron aplicar:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {resultado.omitidas.slice(0, 8).map((o) => (
                    <li key={o.extracto_id}>
                      Movimiento #{o.extracto_id}: {o.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={onClose}>Listo</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(["todas", "ingreso", "egreso"] as Filtro[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltro(f)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    filtro === f
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {f === "todas" ? "Todas" : f === "ingreso" ? "Pagos de socios" : "Préstamos entregados"} ({n(f)})
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[var(--color-border)]">
              {cargando && !lista ? (
                <p className="p-6 text-center text-sm text-[var(--color-muted)]">Buscando coincidencias…</p>
              ) : visibles.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--color-muted)]">
                  No hay sugerencias {filtro !== "todas" && "en este grupo"}. Lo que queda pendiente hay que
                  registrarlo a mano desde el monto de cada movimiento.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--color-surface)] shadow-[0_1px_0_var(--color-border)]">
                    <tr className="text-left text-[var(--color-muted)]">
                      <th className="w-8 p-2">
                        <input
                          type="checkbox"
                          aria-label="Marcar todas las visibles"
                          checked={todasVisiblesMarcadas}
                          onChange={alternarVisibles}
                          className="accent-[var(--color-primary)]"
                        />
                      </th>
                      <th className="p-2 font-medium">Banco</th>
                      <th className="p-2 text-right font-medium">Monto</th>
                      <th className="p-2 font-medium">Socio</th>
                      <th className="p-2 font-medium">Pago registrado</th>
                      <th className="p-2 font-medium">Coincidencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((s) => (
                      <tr
                        key={s.extracto_id}
                        className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-primary)]/[0.03]"
                        onClick={() => alternar(s.extracto_id)}
                      >
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Aceptar movimiento del ${s.fecha}`}
                            checked={marcadas.has(s.extracto_id)}
                            onChange={() => alternar(s.extracto_id)}
                            className="accent-[var(--color-primary)]"
                          />
                        </td>
                        <td className="max-w-[16rem] p-2">
                          <div className="tabular-nums text-[var(--color-muted)]">{formatFechaCorta(s.fecha)}</div>
                          <div className="truncate" title={s.descripcion ?? ""}>
                            {s.descripcion ?? "—"}
                          </div>
                        </td>
                        <td
                          className={`p-2 text-right font-semibold tabular-nums ${
                            s.monto < 0 ? "text-[var(--color-destructive)]" : "text-[var(--color-text)]"
                          }`}
                        >
                          {s.monto < 0 ? "−" : ""}
                          {formatCOP(Math.abs(s.monto))}
                        </td>
                        <td className="p-2 font-medium">{s.socio_nombre}</td>
                        <td className="p-2">
                          <div>{s.conceptos.split(",").map(nombreConcepto).join(" + ")}</div>
                          <div className="text-[var(--color-muted)]">{formatFechaCorta(s.fecha_pago)}</div>
                        </td>
                        <td className="p-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              s.confianza === "alta"
                                ? "bg-[var(--status-good)]/10 text-[#0a6e0a]"
                                : "bg-[var(--status-warning)]/15 text-[#8a5d00]"
                            }`}
                          >
                            {s.confianza === "alta" ? (
                              <CheckCircle2 className="size-3" aria-hidden />
                            ) : (
                              <AlertCircle className="size-3" aria-hidden />
                            )}
                            {s.dias === 0 ? "Mismo día" : `${s.dias} día${s.dias > 1 ? "s" : ""} de diferencia`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}

            <DialogFooter className="items-center gap-3 sm:justify-between">
              <span className="text-xs text-[var(--color-muted)]">
                {seleccion.length} marcadas · {formatCOP(totalSel)}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={cargando}>
                  Cancelar
                </Button>
                <Button onClick={aceptar} disabled={cargando || seleccion.length === 0}>
                  <CheckCircle2 className="size-4" />
                  {cargando && lista ? "Conciliando…" : `Conciliar ${seleccion.length}`}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
