import { useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import { api, type Periodo, type Socio, type Matriz } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import {
  RegistrarPagoModal,
  type PagoPreset,
} from "@/components/dashboard/RegistrarPagoModal";

type Concepto = "AHORRO" | "ACTIVIDADES";

export function ControlPagosPage({ onVolver }: { onVolver: () => void }) {
  const [concepto, setConcepto] = useState<Concepto>("AHORRO");
  const [busqueda, setBusqueda] = useState("");
  const [preset, setPreset] = useState<PagoPreset | null>(null);

  const socios = useApi(() => api.socios(), []);
  const periodos = useApi(() => api.periodos(), []);
  const matriz = useApi(
    () => (concepto === "AHORRO" ? api.matrizAhorro() : api.matrizActividades()),
    [concepto],
  );

  const sociosPorId = useMemo(() => {
    const m = new Map<number, Socio>();
    (socios.data ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [socios.data]);

  const periodosPorNombre = useMemo(() => {
    const m = new Map<string, Periodo>();
    (periodos.data ?? []).forEach((p) => m.set(p.nombre, p));
    return m;
  }, [periodos.data]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (matriz.data?.socios ?? []).filter((row) => {
      const socio = sociosPorId.get(row.socio_id);
      if (!socio || socio.tipo !== "persona") return false;
      if (!q) return true;
      return socio.nombre.toLowerCase().includes(q);
    });
  }, [matriz.data, sociosPorId, busqueda]);

  function abrirCelda(socioId: number, periodoNombre: string, valorActual: number) {
    const periodo = periodosPorNombre.get(periodoNombre);
    const socio = sociosPorId.get(socioId);
    setPreset({
      socio_id: socioId,
      concepto,
      valor: valorActual > 0 ? valorActual : socio?.cuota_sostenimiento ?? 0,
      periodo_id: periodo?.id ?? null,
      fecha_pago: periodo?.fecha_corte_ahorro ?? new Date().toISOString().slice(0, 10),
      origen_contexto: `Matriz de ${concepto.toLowerCase()} · ${socio?.nombre ?? ""} · ${periodoNombre}`,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
            <CheckCircle2 className="size-6 text-[var(--color-primary)]" />
            Control de pagos
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Matriz socio × mes. Verde = pagó completo. Ámbar = parcial. Clic en cualquier celda
            para registrar o corregir un pago.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => matriz.reload()}>
            <RefreshCw className={`size-4 ${matriz.loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={onVolver}>
            ← Volver
          </Button>
        </div>
      </div>

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Concepto</Label>
              <div className="flex gap-1">
                {(["AHORRO", "ACTIVIDADES"] as Concepto[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setConcepto(c)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      concepto === c
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
                    }`}
                  >
                    {c === "AHORRO" ? "Ahorros" : "Actividades"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Buscar socio</Label>
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Empieza a escribir…"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {matriz.error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{matriz.error}</p>
        </div>
      )}

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {concepto === "AHORRO" ? "Ahorros" : "Actividades"} · {filas.length} socios
          </CardTitle>
          <CardDescription>
            Los totales se recalculan al vuelo. Los datos ingresados aquí quedan directo en SQLite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MatrizTable
            matriz={matriz.data}
            filas={filas}
            sociosPorId={sociosPorId}
            onCelda={(s, mes, v) => abrirCelda(s, mes, v)}
          />
        </CardContent>
      </Card>

      {preset && (
        <RegistrarPagoModal
          open={true}
          onClose={() => setPreset(null)}
          onGuardado={() => {
            matriz.reload();
            setPreset(null);
          }}
          preset={preset}
          titulo={`Registrar ${concepto === "AHORRO" ? "ahorro" : "actividad"}`}
        />
      )}
    </div>
  );
}

interface FilaMatriz {
  socio_id: number;
  nombre: string;
  total: number;
  celdas: Record<string, number>;
}

function MatrizTable({
  matriz,
  filas,
  sociosPorId,
  onCelda,
}: {
  matriz: Matriz | null;
  filas: FilaMatriz[];
  sociosPorId: Map<number, Socio>;
  onCelda: (socio_id: number, mes: string, valor: number) => void;
}) {
  if (!matriz) return <p className="text-sm text-[var(--color-muted)]">Cargando…</p>;
  const cortaMes = (n: string) => n.slice(0, 3);

  const totalPorMes = new Map<string, number>();
  for (const mes of matriz.meses) {
    let total = 0;
    for (const s of filas) total += s.celdas[mes.nombre] || 0;
    totalPorMes.set(mes.nombre, total);
  }
  const totalGeneral = filas.reduce((a, s) => a + s.total, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 bg-[var(--color-surface)]">Socio</TableHead>
          {matriz.meses.map((m) => (
            <TableHead key={m.nombre} className="text-center text-xs">
              {cortaMes(m.nombre)}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((s) => {
          const cuota = sociosPorId.get(s.socio_id)?.cuota_sostenimiento ?? 0;
          return (
            <TableRow key={s.socio_id}>
              <TableCell className="sticky left-0 bg-[var(--color-surface)] font-medium text-xs">
                {s.nombre}
                {cuota > 0 && (
                  <div className="text-[10px] text-[var(--color-muted)]">{formatCOP(cuota)}</div>
                )}
              </TableCell>
              {matriz.meses.map((m) => {
                const v = s.celdas[m.nombre] || 0;
                const estado =
                  v === 0
                    ? "vacio"
                    : v >= cuota && cuota > 0
                      ? "pagado"
                      : "parcial";
                const clase =
                  estado === "pagado"
                    ? "bg-[var(--color-success)]/15 hover:bg-[var(--color-success)]/25 text-[var(--color-success)]"
                    : estado === "parcial"
                      ? "bg-[var(--color-warning)]/15 hover:bg-[var(--color-warning)]/25 text-[var(--color-warning)]"
                      : "hover:bg-[var(--color-primary)]/5 text-[var(--color-muted)]";
                return (
                  <TableCell key={m.nombre} className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => onCelda(s.socio_id, m.nombre, v)}
                      className={`w-full rounded-md px-1 py-1.5 text-[11px] font-medium tabular-nums transition-colors ${clase}`}
                      title={v > 0 ? formatCOP(v) : "Sin pago"}
                    >
                      {v > 0 ? formatCOP(v).replace("$", "").replace(".000", "k") : "—"}
                    </button>
                  </TableCell>
                );
              })}
              <TableCell className="text-right tabular-nums font-semibold text-xs">
                {formatCOP(s.total)}
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow className="bg-[var(--color-primary)]/5">
          <TableCell className="sticky left-0 bg-[var(--color-primary)]/5 font-semibold">
            TOTAL
          </TableCell>
          {matriz.meses.map((m) => (
            <TableCell key={m.nombre} className="text-center tabular-nums text-xs font-semibold">
              {formatCOP(totalPorMes.get(m.nombre) || 0)
                .replace("$", "")
                .replace(".000", "k")}
            </TableCell>
          ))}
          <TableCell className="text-right tabular-nums font-semibold">
            {formatCOP(totalGeneral)}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
