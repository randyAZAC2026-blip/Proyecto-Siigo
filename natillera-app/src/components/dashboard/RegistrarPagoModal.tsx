import { useEffect, useMemo, useState } from "react";
import { CircleCheck, AlertCircle, Search } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { formatCOP, parseCOP } from "@/lib/natillera/format";
import { api, type Socio, type Periodo } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

// Los conceptos agrupados por categoría para que el usuario los ubique rápido.
const CONCEPTOS_GRUPOS = [
  {
    grupo: "Aportes",
    items: [
      { key: "AHORRO", label: "Ahorro mensual" },
      { key: "ACTIVIDADES", label: "Actividades" },
      { key: "RIFA_CHANCE", label: "Rifa chance" },
    ],
  },
  {
    grupo: "Préstamos",
    items: [
      { key: "ABONO_PRESTAMO", label: "Abono a préstamo (capital)" },
      { key: "INTERESES_PRESTAMO", label: "Intereses de préstamo" },
      { key: "PRESTAMO", label: "Desembolso de préstamo (egreso)" },
    ],
  },
  {
    grupo: "Otros",
    items: [{ key: "MULTA", label: "Multa" }],
  },
];

export interface PagoPreset {
  socio_id?: number | null;
  concepto?: string;
  valor?: number;
  fecha_pago?: string;
  periodo_id?: number | null;
  notas?: string;
  extracto_id?: number | null;
  origen_contexto?: string; // "Desde extracto: banco fecha descripción" etc.
}

interface Props {
  open: boolean;
  onClose: () => void;
  onGuardado?: (txId: number) => void;
  preset: PagoPreset;
  titulo?: string;
}

export function RegistrarPagoModal({ open, onClose, onGuardado, preset, titulo }: Props) {
  const socios = useApi(() => api.socios(), []);
  const periodos = useApi(() => api.periodos(), []);

  const [socioId, setSocioId] = useState<string>("");
  const [concepto, setConcepto] = useState<string>("AHORRO");
  const [valor, setValor] = useState<string>("");
  const [fecha, setFecha] = useState<string>("");
  const [periodoId, setPeriodoId] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  // Cuando se abre, sembramos con el preset y elegimos un periodo sensato.
  useEffect(() => {
    if (!open) return;
    setSocioId(preset.socio_id ? String(preset.socio_id) : "");
    setConcepto(preset.concepto || "AHORRO");
    setValor(preset.valor ? String(preset.valor) : "");
    setFecha(preset.fecha_pago || new Date().toISOString().slice(0, 10));
    setNotas(preset.notas || "");
    setError(null);
    setOk(null);
    // Auto-selecciona periodo por el mes de la fecha (o del hoy)
    if (!preset.periodo_id && periodos.data) {
      const iso = preset.fecha_pago || new Date().toISOString().slice(0, 10);
      const mes = new Date(iso + "T00:00:00").getMonth() + 1; // 1..12
      const orden = ((mes + 1) % 12) + 1; // DIC=1 en nuestro catálogo
      const match = periodos.data.find((p) => p.orden === orden);
      setPeriodoId(match ? String(match.id) : "");
    } else {
      setPeriodoId(preset.periodo_id ? String(preset.periodo_id) : "");
    }
    setBusqueda("");
  }, [open, preset, periodos.data]);

  const sociosFiltrados = useMemo(() => {
    const lista = (socios.data ?? []).filter((s) => s.tipo === "persona");
    if (!busqueda.trim()) return lista;
    const q = busqueda.toLowerCase();
    return lista.filter((s) => s.nombre.toLowerCase().includes(q));
  }, [socios.data, busqueda]);

  const socioSel = (socios.data ?? []).find((s) => String(s.id) === socioId);
  const cuotaSug = socioSel?.cuota_sostenimiento ?? 0;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!socioId) return setError("Elige un socio");
    const montoLimpio = parseCOP(valor);
    if (montoLimpio <= 0) return setError("El valor debe ser mayor que 0");
    setEnviando(true);
    try {
      const res = await api.crearTransaccion({
        socio_id: Number(socioId),
        concepto,
        valor: montoLimpio,
        fecha_pago: fecha || undefined,
        periodo_id: periodoId ? Number(periodoId) : null,
        notas: notas || undefined,
        extracto_id: preset.extracto_id ?? null,
      });
      setOk(`Guardado tx #${res.id}`);
      onGuardado?.(res.id);
      setTimeout(() => onClose(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  Cuota base {formatCOP(cuotaSug)} · aportado {formatCOP(socioSel.total_aportado)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Concepto *</Label>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {CONCEPTOS_GRUPOS.map((g) => (
                <div key={g.grupo} className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    {g.grupo}
                  </p>
                  <div className="flex flex-col gap-1">
                    {g.items.map((c) => {
                      const activo = concepto === c.key;
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => setConcepto(c.key)}
                          className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                            activo
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                              : "border-[var(--color-border)] hover:border-[var(--color-primary)]/50"
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <Input
                inputMode="numeric"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={cuotaSug ? String(cuotaSug) : "50000"}
                required
              />
              {cuotaSug > 0 && concepto === "AHORRO" && (
                <button
                  type="button"
                  onClick={() => setValor(String(cuotaSug))}
                  className="text-[10px] text-[var(--color-primary)] hover:underline"
                >
                  Usar cuota base
                </button>
              )}
            </div>
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
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Referencia, comentario…"
            />
          </div>

          {preset.extracto_id != null && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-2">
              <Badge className="bg-[var(--color-primary)] text-white">
                Extracto #{preset.extracto_id}
              </Badge>
              <span className="text-xs text-[var(--color-text)]">
                Se vinculará automáticamente al guardar.
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
