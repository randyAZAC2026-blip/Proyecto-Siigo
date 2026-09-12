import { useMemo, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import { api, type Deudor, type MatrizPrestamos, type MoraReporte } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

type Orden = "saldo_desc" | "mora_desc" | "nombre";

interface FilaPrestamo {
  prestamo_id: number;
  socio_id: number;
  socio: string;
  monto_prestado: number;
  saldo: number;
  intereses_pagados: number;
  mora_pagada: number;
  mora_pendiente: number;
  fecha_desembolso: string | null;
  deuda_total: number;
  estado: "al_dia" | "en_mora" | "cancelado";
}

export function PrestamosPage({ onVolver }: { onVolver: () => void }) {
  const deudoresQ = useApi(() => api.deudores(), []);
  const matrizQ = useApi(() => api.matrizPrestamos(), []);
  const moraQ = useApi(() => api.moraIntereses(true), []);

  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("saldo_desc");
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  const loading = deudoresQ.loading || matrizQ.loading || moraQ.loading;
  const error = deudoresQ.error || matrizQ.error || moraQ.error;

  function reload() {
    deudoresQ.reload();
    matrizQ.reload();
    moraQ.reload();
  }

  function toggle(id: number) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filas: FilaPrestamo[] = useMemo(() => {
    if (!deudoresQ.data) return [];
    const moraByPrestamo = new Map<number, { pagada: number; pendiente: number }>();
    for (const p of moraQ.data?.prestamos ?? []) {
      moraByPrestamo.set(p.prestamo_id, {
        pagada: p.mora_pagada,
        pendiente: p.mora_pendiente,
      });
    }
    return deudoresQ.data.map((d: Deudor) => {
      const m = moraByPrestamo.get(d.prestamo_id) ?? { pagada: 0, pendiente: 0 };
      const deuda = d.saldo + m.pendiente;
      const estado: FilaPrestamo["estado"] =
        d.saldo <= 0 && m.pendiente <= 0
          ? "cancelado"
          : m.pendiente > 0
            ? "en_mora"
            : "al_dia";
      return {
        prestamo_id: d.prestamo_id,
        socio_id: d.id,
        socio: d.nombre,
        monto_prestado: d.monto_prestado,
        saldo: d.saldo,
        intereses_pagados: d.intereses_pagados,
        mora_pagada: m.pagada,
        mora_pendiente: m.pendiente,
        fecha_desembolso: d.fecha_desembolso,
        deuda_total: deuda,
        estado,
      };
    });
  }, [deudoresQ.data, moraQ.data]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtered = q
      ? filas.filter((f) => f.socio.toLowerCase().includes(q))
      : filas;
    const sorted = [...filtered];
    if (orden === "saldo_desc") sorted.sort((a, b) => b.saldo - a.saldo);
    else if (orden === "mora_desc") sorted.sort((a, b) => b.mora_pendiente - a.mora_pendiente);
    else sorted.sort((a, b) => a.socio.localeCompare(b.socio));
    return sorted;
  }, [filas, busqueda, orden]);

  const tot = useMemo(
    () =>
      filas.reduce(
        (a, f) => ({
          total_prestado: a.total_prestado + f.monto_prestado,
          saldo_capital: a.saldo_capital + f.saldo,
          intereses_cobrados: a.intereses_cobrados + f.intereses_pagados,
          mora_pendiente: a.mora_pendiente + f.mora_pendiente,
          activos: a.activos + (f.estado !== "cancelado" ? 1 : 0),
        }),
        {
          total_prestado: 0,
          saldo_capital: 0,
          intereses_cobrados: 0,
          mora_pendiente: 0,
          activos: 0,
        },
      ),
    [filas],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Préstamos</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Control completo de cartera: capital, intereses, mora y detalle mensual por socio.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={onVolver}>
            ← Volver
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        <MiniTile label="Total prestado" value={formatCOP(tot.total_prestado)} color="var(--color-muted)" />
        <MiniTile
          label="Saldo capital pendiente"
          value={formatCOP(tot.saldo_capital)}
          color="var(--color-warning)"
        />
        <MiniTile
          label="Intereses cobrados"
          value={formatCOP(tot.intereses_cobrados)}
          color="var(--color-success)"
        />
        <MiniTile
          label="Mora pendiente"
          value={formatCOP(tot.mora_pendiente)}
          color="var(--color-destructive)"
        />
        <MiniTile
          label="Socios con préstamo"
          value={String(tot.activos)}
          color="var(--color-primary)"
        />
      </div>

      {loading && !deudoresQ.data && (
        <Skeleton className="h-96 rounded-[var(--radius-card)]" />
      )}

      {deudoresQ.data && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Préstamos ({filtradas.length}
              {filtradas.length !== filas.length ? ` de ${filas.length}` : ""})
            </CardTitle>
            <CardDescription>
              Clic en cualquier fila para ver la matriz mensual del socio y el detalle de mora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-[var(--color-muted)]" />
                <Input
                  placeholder="Buscar socio…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex gap-1 text-xs">
                {(["saldo_desc", "mora_desc", "nombre"] as Orden[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrden(o)}
                    className={`rounded-md border px-3 py-1 transition-colors ${
                      orden === o
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
                    }`}
                  >
                    {o === "saldo_desc"
                      ? "Ordenar por saldo"
                      : o === "mora_desc"
                        ? "Ordenar por mora"
                        : "Ordenar por nombre"}
                  </button>
                ))}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Socio</TableHead>
                  <TableHead>Desembolso</TableHead>
                  <TableHead className="text-right">Capital inicial</TableHead>
                  <TableHead className="text-right">Saldo capital</TableHead>
                  <TableHead className="text-right">Int. pagados</TableHead>
                  <TableHead className="text-right">Mora pendiente</TableHead>
                  <TableHead className="text-right">Deuda total</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((f) => (
                  <FilaExpansible
                    key={f.prestamo_id}
                    fila={f}
                    matriz={matrizQ.data}
                    mora={moraQ.data}
                    abierto={abiertos.has(f.prestamo_id)}
                    onToggle={() => toggle(f.prestamo_id)}
                  />
                ))}
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-[var(--color-muted)]">
                      {busqueda
                        ? "No hay préstamos que coincidan con la búsqueda."
                        : "No hay préstamos registrados."}
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

function MiniTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardContent className="py-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </div>
        <div className="text-lg font-semibold tabular-nums mt-1" style={{ color }}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function FilaExpansible({
  fila,
  matriz,
  mora,
  abierto,
  onToggle,
}: {
  fila: FilaPrestamo;
  matriz: MatrizPrestamos | null;
  mora: MoraReporte | null;
  abierto: boolean;
  onToggle: () => void;
}) {
  const estadoBadge =
    fila.estado === "al_dia"
      ? { label: "Al día", clase: "bg-[var(--color-success)]/15 text-[var(--color-success)]" }
      : fila.estado === "en_mora"
        ? { label: "En mora", clase: "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]" }
        : { label: "Cancelado", clase: "bg-[var(--color-muted)]/20 text-[var(--color-muted)]" };

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-[var(--color-primary)]/5" onClick={onToggle}>
        <TableCell className="w-8">
          {abierto ? (
            <ChevronDown className="size-4 text-[var(--color-muted)]" />
          ) : (
            <ChevronRight className="size-4 text-[var(--color-muted)]" />
          )}
        </TableCell>
        <TableCell className="font-medium text-xs">{fila.socio}</TableCell>
        <TableCell className="text-xs text-[var(--color-muted)]">
          {fila.fecha_desembolso ?? "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs">
          {formatCOP(fila.monto_prestado)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs font-semibold text-[var(--color-warning)]">
          {formatCOP(fila.saldo)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs text-[var(--color-success)]">
          {formatCOP(fila.intereses_pagados)}
        </TableCell>
        <TableCell
          className={`text-right tabular-nums text-xs ${
            fila.mora_pendiente > 0
              ? "text-[var(--color-destructive)] font-semibold"
              : "text-[var(--color-muted)]"
          }`}
        >
          {formatCOP(fila.mora_pendiente)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs font-semibold">
          {formatCOP(fila.deuda_total)}
        </TableCell>
        <TableCell className="text-center">
          <Badge variant="secondary" className={estadoBadge.clase}>
            {estadoBadge.label}
          </Badge>
        </TableCell>
      </TableRow>
      {abierto && (
        <TableRow>
          <TableCell colSpan={9} className="bg-[var(--color-primary)]/5 p-4">
            <Detalle fila={fila} matriz={matriz} mora={mora} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function Detalle({
  fila,
  matriz,
  mora,
}: {
  fila: FilaPrestamo;
  matriz: MatrizPrestamos | null;
  mora: MoraReporte | null;
}) {
  const socioMatriz = matriz?.socios.find((s) => s.socio_id === fila.socio_id);
  const prestamoMora = mora?.prestamos.find((p) => p.prestamo_id === fila.prestamo_id);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
          Matriz mensual — {fila.socio}
        </div>
        {socioMatriz ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Abono capital</TableHead>
                <TableHead className="text-right">Intereses pagados</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matriz!.meses.map((m) => {
                const c = socioMatriz.celdas[m.nombre] ?? {
                  abono: 0,
                  intereses: 0,
                  total: 0,
                };
                if (c.abono === 0 && c.intereses === 0) return null;
                return (
                  <TableRow key={m.nombre}>
                    <TableCell className="text-xs">{m.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {c.abono > 0 ? formatCOP(c.abono) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {c.intereses > 0 ? formatCOP(c.intereses) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-semibold">
                      {formatCOP(c.total)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-[var(--color-primary)]/5">
                <TableCell className="text-xs font-semibold">TOTAL</TableCell>
                <TableCell className="text-right tabular-nums text-xs font-semibold">
                  {formatCOP(socioMatriz.totalAbono)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs font-semibold">
                  {formatCOP(socioMatriz.totalIntereses)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs font-semibold">
                  {formatCOP(socioMatriz.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <div className="text-xs text-[var(--color-muted)]">
            Sin movimientos mensuales registrados.
          </div>
        )}
      </div>

      {prestamoMora && prestamoMora.detalle && prestamoMora.detalle.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
            Vencimientos de intereses del préstamo
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Fecha de pago</TableHead>
                <TableHead className="text-center">Días atraso</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Mora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prestamoMora.detalle.map((d, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{i + 1}</TableCell>
                  <TableCell className="text-xs">{d.vencimiento}</TableCell>
                  <TableCell className="text-xs">{d.fecha_pago ?? "—"}</TableCell>
                  <TableCell className="text-center text-xs tabular-nums">
                    {d.dias_atraso}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="secondary"
                      className={
                        d.estado === "pagado_a_tiempo"
                          ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                          : d.estado === "pagado_tarde"
                            ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                            : "bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]"
                      }
                    >
                      {d.estado === "pagado_a_tiempo"
                        ? "A tiempo"
                        : d.estado === "pagado_tarde"
                          ? "Tarde"
                          : "Sin pagar"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-xs ${
                      d.mora > 0 ? "text-[var(--color-destructive)] font-semibold" : ""
                    }`}
                  >
                    {formatCOP(d.mora)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
