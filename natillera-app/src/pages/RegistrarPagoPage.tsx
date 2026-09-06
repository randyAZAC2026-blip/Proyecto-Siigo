import { useEffect, useMemo, useState } from "react";
import { CircleCheck, ClipboardCheck, Search, AlertCircle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP, parseCOP } from "@/lib/natillera/format";
import { api, type Socio, type Transaccion, type Periodo } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

const CONCEPTOS = [
  { key: "AHORRO", label: "Ahorro mensual" },
  { key: "ACTIVIDADES", label: "Actividades" },
  { key: "RIFA_CHANCE", label: "Rifa chance" },
  { key: "ABONO_PRESTAMO", label: "Abono a préstamo" },
  { key: "INTERESES_PRESTAMO", label: "Intereses de préstamo" },
  { key: "MULTA", label: "Multa" },
  { key: "PRESTAMO", label: "Desembolso de préstamo (egreso)" },
];

export function RegistrarPagoPage({ onVolver }: { onVolver: () => void }) {
  const socios = useApi(() => api.socios(), []);
  const periodos = useApi(() => api.periodos(), []);
  const [socioId, setSocioId] = useState<string>("");
  const [concepto, setConcepto] = useState<string>("AHORRO");
  const [valor, setValor] = useState<string>("");
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [periodoId, setPeriodoId] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<{ id: number; nombre: string; valor: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const historial = useApi(
    () =>
      api.buscarTransacciones({
        socio_id: socioId ? Number(socioId) : undefined,
        limit: 30,
      }),
    [socioId, refresh],
  );

  const sociosFiltrados = useMemo(() => {
    const lista = (socios.data ?? []).filter((s) => s.tipo === "persona");
    if (!busqueda.trim()) return lista;
    const q = busqueda.toLowerCase();
    return lista.filter((s) => s.nombre.toLowerCase().includes(q));
  }, [socios.data, busqueda]);

  const socioSel = (socios.data ?? []).find((s) => String(s.id) === socioId);

  useEffect(() => {
    // Auto-selecciona el periodo del mes actual si aún no se ha elegido.
    if (periodoId || !periodos.data) return;
    const mesActual = new Date().getMonth() + 1; // 1..12
    // El catálogo empieza en DICIEMBRE=1
    const orden = ((mesActual + 1) % 12) + 1;
    const match = periodos.data.find((p) => p.orden === orden);
    if (match) setPeriodoId(String(match.id));
  }, [periodos.data, periodoId]);

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
      });
      setOk({
        id: res.id,
        nombre: socioSel?.nombre ?? "",
        valor: montoLimpio,
      });
      setValor("");
      setNotas("");
      setRefresh((r) => r + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar(id: number) {
    if (!confirm("¿Eliminar esta transacción manual? (solo se puede borrar las que registraste aquí)")) return;
    try {
      await api.eliminarTransaccion(id);
      setRefresh((r) => r + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  const cuotaSugerida = socioSel?.cuota_sostenimiento ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
            <ClipboardCheck className="size-6 text-[var(--color-primary)]" />
            Registrar pago
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Cada pago que registres aquí queda directo en la BD SQLite — no vuelvas a Excel.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onVolver}>
          ← Volver
        </Button>
      </div>

      <form onSubmit={guardar}>
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader>
            <CardTitle>Nuevo movimiento</CardTitle>
            <CardDescription>
              El sistema calcula automáticamente el tipo (ingreso/egreso) según el concepto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                <Label>Socio</Label>
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
                    Cuota base: {formatCOP(socioSel.cuota_sostenimiento)} · Total aportado:{" "}
                    {formatCOP(socioSel.total_aportado)}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Concepto</Label>
                <select
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                >
                  {CONCEPTOS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <Input
                  inputMode="numeric"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder={cuotaSugerida ? String(cuotaSugerida) : "50000"}
                  required
                />
                {cuotaSugerida > 0 && (
                  <button
                    type="button"
                    onClick={() => setValor(String(cuotaSugerida))}
                    className="text-[10px] text-[var(--color-primary)] hover:underline"
                  >
                    Usar cuota base ({formatCOP(cuotaSugerida)})
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Periodo (mes)</Label>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Fecha del pago</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notas (opcional)</Label>
                <Textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={1}
                  maxLength={300}
                  placeholder="Ej: transferencia Nequi, referencia 456…"
                />
              </div>
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
                <p className="text-sm text-[var(--color-success)]">
                  Guardado: <strong>{ok.nombre}</strong> — {formatCOP(ok.valor)} (tx #{ok.id})
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={enviando}
                className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
              >
                {enviando ? "Guardando…" : "Registrar pago"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setValor("");
                  setNotas("");
                  setError(null);
                  setOk(null);
                }}
              >
                Limpiar
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {socioSel && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader>
            <CardTitle className="text-base">
              Últimas transacciones de {socioSel.nombre}
            </CardTitle>
            <CardDescription>
              Las etiquetadas como "manual" fueron creadas desde aquí y se pueden eliminar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Origen</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historial.data ?? []).map((t: Transaccion) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{t.fecha_pago ?? "—"}</TableCell>
                    <TableCell className="text-xs">{t.concepto}</TableCell>
                    <TableCell className="text-xs">{t.periodo ?? "—"}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums text-xs ${
                        t.tipo === "egreso" ? "text-[var(--color-destructive)]" : ""
                      }`}
                    >
                      {t.tipo === "egreso" ? "-" : "+"}
                      {formatCOP(t.valor)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className={
                          t.origen === "manual"
                            ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                            : ""
                        }
                      >
                        {t.origen}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.origen === "manual" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1 text-[var(--color-destructive)]"
                          onClick={() => eliminar(t.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(historial.data ?? []).length === 0 && !historial.loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-[var(--color-muted)]">
                      Sin transacciones registradas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
