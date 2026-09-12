import { useEffect, useMemo, useState } from "react";
import { CircleCheck, AlertCircle, Search, Plus, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { formatCOP, parseCOP } from "@/lib/natillera/format";
import { api, type Socio, type Periodo } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

const CONCEPTOS = [
  { key: "AHORRO", label: "Ahorro" },
  { key: "ACTIVIDADES", label: "Actividades" },
  { key: "RIFA_CHANCE", label: "Rifa chance" },
  { key: "ABONO_PRESTAMO", label: "Abono a préstamo" },
  { key: "INTERESES_PRESTAMO", label: "Intereses préstamo" },
  { key: "MULTA", label: "Multa" },
  { key: "PRESTAMO", label: "Desembolso préstamo" },
];

export interface PagoPreset {
  socio_id?: number | null;
  concepto?: string;
  valor?: number; // total del movimiento del extracto
  fecha_pago?: string;
  periodo_id?: number | null;
  notas?: string;
  extracto_id?: number | null;
  origen_contexto?: string;
}

interface Linea {
  id: number;
  concepto: string;
  valor: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onGuardado?: () => void;
  preset: PagoPreset;
  titulo?: string;
}

let idSeq = 1;

export function RegistrarPagoModal({ open, onClose, onGuardado, preset, titulo }: Props) {
  const socios = useApi(() => api.socios(), []);
  const periodos = useApi(() => api.periodos(), []);

  const [socioId, setSocioId] = useState<string>("");
  const [fecha, setFecha] = useState<string>("");
  const [periodoId, setPeriodoId] = useState<string>("");
  const [notasGlobal, setNotasGlobal] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSocioId(preset.socio_id ? String(preset.socio_id) : "");
    setFecha(preset.fecha_pago || new Date().toISOString().slice(0, 10));
    setNotasGlobal(preset.notas || "");
    setBusqueda("");
    setError(null);
    setOk(null);
    // Auto-selecciona periodo por mes
    if (periodos.data) {
      if (preset.periodo_id) {
        setPeriodoId(String(preset.periodo_id));
      } else {
        const iso = preset.fecha_pago || new Date().toISOString().slice(0, 10);
        const mes = new Date(iso + "T00:00:00").getMonth() + 1;
        const orden = ((mes + 1) % 12) + 1;
        const match = periodos.data.find((p) => p.orden === orden);
        setPeriodoId(match ? String(match.id) : "");
      }
    }
    // Línea inicial con el valor completo
    setLineas([
      {
        id: idSeq++,
        concepto: preset.concepto || "AHORRO",
        valor: preset.valor ? String(preset.valor) : "",
      },
    ]);
  }, [open, preset, periodos.data]);

  const sociosFiltrados = useMemo(() => {
    const lista = (socios.data ?? []).filter((s) => s.tipo === "persona");
    if (!busqueda.trim()) return lista;
    const q = busqueda.toLowerCase();
    return lista.filter((s) => s.nombre.toLowerCase().includes(q));
  }, [socios.data, busqueda]);

  const socioSel = (socios.data ?? []).find((s) => String(s.id) === socioId);
  const totalObjetivo = preset.valor ?? 0;
  const totalAsignado = lineas.reduce((a, l) => a + parseCOP(l.valor), 0);
  const restante = totalObjetivo - totalAsignado;

  function addLinea(conceptoInicial = "AHORRO", valorInicial = "") {
    setLineas((prev) => [
      ...prev,
      { id: idSeq++, concepto: conceptoInicial, valor: valorInicial },
    ]);
  }

  function updateLinea(id: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLinea(id: number) {
    setLineas((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }

  function autocompletar() {
    // Pone el "restante" en la última línea vacía o la última.
    if (restante <= 0) return;
    const ultimaVacia = [...lineas].reverse().find((l) => parseCOP(l.valor) === 0);
    if (ultimaVacia) {
      updateLinea(ultimaVacia.id, { valor: String(parseCOP(ultimaVacia.valor) + restante) });
    } else if (lineas.length > 0) {
      const ultima = lineas[lineas.length - 1];
      updateLinea(ultima.id, { valor: String(parseCOP(ultima.valor) + restante) });
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!socioId) return setError("Elige un socio");
    const preparadas = lineas
      .map((l) => ({ concepto: l.concepto, valor: parseCOP(l.valor) }))
      .filter((l) => l.valor > 0);
    if (preparadas.length === 0)
      return setError("Ingresa al menos un valor mayor a 0");

    if (totalObjetivo > 0 && Math.abs(totalAsignado - totalObjetivo) > 0) {
      const diff = totalObjetivo - totalAsignado;
      if (!confirm(
        `El total desglosado (${formatCOP(totalAsignado)}) es distinto al del extracto (${formatCOP(totalObjetivo)}). Diferencia: ${formatCOP(diff)}. ¿Guardar de todas formas?`,
      )) return;
    }

    setEnviando(true);
    try {
      const res = await api.crearDesglose({
        socio_id: Number(socioId),
        fecha_pago: fecha || undefined,
        periodo_id: periodoId ? Number(periodoId) : null,
        notas: notasGlobal || undefined,
        extracto_id: preset.extracto_id ?? null,
        lineas: preparadas,
      });
      setOk(
        `Guardado ${res.ids.length} concepto${res.ids.length > 1 ? "s" : ""} · Total ${formatCOP(res.total)}`,
      );
      onGuardado?.();
      setTimeout(() => onClose(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo || "Registrar pago"}</DialogTitle>
          {preset.origen_contexto && (
            <DialogDescription className="text-xs">
              {preset.origen_contexto}
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={guardar} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Buscar socio</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-muted)]" />
                <Input
                  className="pl-7"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Empieza a escribir…"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Socio *</Label>
              <select
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                value={socioId}
                onChange={(e) => setSocioId(e.target.value)}
                required
              >
                <option value="">— Elige —</option>
                {sociosFiltrados.map((s: Socio) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} · {s.nombre}
                  </option>
                ))}
              </select>
              {socioSel && (
                <p className="text-xs text-[var(--color-muted)]">
                  Cuota base {formatCOP(socioSel.cuota_sostenimiento)} · aportado{" "}
                  {formatCOP(socioSel.total_aportado)}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Periodo</Label>
              <select
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                value={periodoId}
                onChange={(e) => setPeriodoId(e.target.value)}
              >
                <option value="">— Sin periodo —</option>
                {(periodos.data ?? []).map((p: Periodo) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas generales</Label>
              <Input
                value={notasGlobal}
                onChange={(e) => setNotasGlobal(e.target.value)}
                placeholder="Comentario del pago"
                maxLength={200}
              />
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3 bg-[var(--color-primary)]/[0.03]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <Label className="text-sm">Desglose del pago</Label>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Distribuye el monto entre los conceptos que correspondan.
                </p>
              </div>
              {totalObjetivo > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="text-right">
                    <div className="text-[10px] text-[var(--color-muted)]">Total extracto</div>
                    <div className="font-semibold tabular-nums">
                      {formatCOP(totalObjetivo)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[var(--color-muted)]">Asignado</div>
                    <div
                      className={`font-semibold tabular-nums ${
                        totalAsignado === totalObjetivo
                          ? "text-[var(--color-success)]"
                          : "text-[var(--color-warning)]"
                      }`}
                    >
                      {formatCOP(totalAsignado)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[var(--color-muted)]">Falta</div>
                    <div
                      className={`font-semibold tabular-nums ${
                        restante === 0
                          ? "text-[var(--color-success)]"
                          : "text-[var(--color-warning)]"
                      }`}
                    >
                      {formatCOP(restante)}
                    </div>
                  </div>
                  {restante > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={autocompletar}
                      className="h-7 px-2 text-[11px]"
                    >
                      Autocompletar
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {lineas.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <select
                    className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                    value={l.concepto}
                    onChange={(e) => updateLinea(l.id, { concepto: e.target.value })}
                  >
                    {CONCEPTOS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    inputMode="numeric"
                    value={l.valor}
                    onChange={(e) => updateLinea(l.id, { valor: e.target.value })}
                    placeholder="Valor"
                    className="w-32 tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLinea(l.id)}
                    disabled={lineas.length === 1}
                    className="h-8 w-8 p-0 text-[var(--color-destructive)]"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addLinea()}
                className="w-full gap-1"
              >
                <Plus className="size-4" />
                Agregar concepto
              </Button>
            </div>
          </div>

          {preset.extracto_id != null && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-2">
              <Badge className="bg-[var(--color-primary)] text-white">
                Extracto #{preset.extracto_id}
              </Badge>
              <span className="text-xs text-[var(--color-text)]">
                Se vinculará al primer concepto del desglose.
              </span>
            </div>
          )}

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
              {enviando ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
