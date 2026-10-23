import { useState } from "react";
import { AlertCircle, RefreshCw, ChevronDown, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP } from "@/lib/natillera/format";
import { api, type MoraPrestamo } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

export function MoraInteresesPage({ onVolver }: { onVolver: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.moraIntereses(true), []);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Mora — Intereses de préstamo
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Cálculo automático de mora acumulada por atraso en el pago de intereses.
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

      {data && data.regla.habilitada === false && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5">
          <CardContent className="py-4 flex items-start gap-2">
            <AlertCircle className="size-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-[var(--color-text)]">
                <strong>Regla de mora DESACTIVADA.</strong> No se cobra mora en este momento.
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Para activarla, arranca el backend con la variable de entorno{" "}
                <code>MORA_HABILITADA=true</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {data && data.regla.habilitada !== false && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5">
          <CardContent className="py-4 flex items-start gap-2">
            <Info className="size-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-[var(--color-text)]">
                <strong>Regla:</strong> cada préstamo genera un vencimiento mensual en el mismo día
                del desembolso (ej: préstamo del 17-ago → vencimientos 17-sep, 17-oct, …).
                Cada día de atraso cobra <strong>{formatCOP(data.regla.mora_por_dia)}</strong>.
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Emparejamiento FIFO: el 1er pago cubre el 1er vencimiento, el 2do cubre el 2do, etc.
                Corte al {data.hoy}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <MiniTile
            label="Mora total acumulada"
            value={formatCOP(data.totales.mora_total)}
            color="var(--color-warning)"
          />
          <MiniTile
            label="Mora ya pagada"
            value={formatCOP(data.totales.mora_pagada)}
            color="var(--color-success)"
          />
          <MiniTile
            label="Mora PENDIENTE por cobrar"
            value={formatCOP(data.totales.mora_pendiente)}
            color="var(--color-destructive)"
          />
          <MiniTile
            label="Vencimientos sin pagar"
            value={String(data.totales.sin_pagar)}
            color="var(--color-warning)"
          />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}

      {loading && !data && <Skeleton className="h-96 rounded-[var(--radius-card)]" />}

      {data && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Préstamos con mora ({data.prestamos.length})</CardTitle>
            <CardDescription>
              Ordenados por mora pendiente. Clic en cualquier fila para ver el detalle de vencimientos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Socio</TableHead>
                  <TableHead>Desembolso</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-center">Venc</TableHead>
                  <TableHead className="text-center">A tiempo</TableHead>
                  <TableHead className="text-center">Tarde</TableHead>
                  <TableHead className="text-center">Sin pagar</TableHead>
                  <TableHead className="text-right">Mora pagada</TableHead>
                  <TableHead className="text-right">Mora pendiente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.prestamos.map((p) => (
                  <FilaPrestamo
                    key={p.prestamo_id}
                    p={p}
                    abierto={abiertos.has(p.prestamo_id)}
                    onToggle={() => toggle(p.prestamo_id)}
                  />
                ))}
                {data.prestamos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-[var(--color-muted)]">
                      No hay préstamos activos con fecha de desembolso registrada.
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

function FilaPrestamo({
  p,
  abierto,
  onToggle,
}: {
  p: MoraPrestamo;
  abierto: boolean;
  onToggle: () => void;
}) {
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
        <TableCell className="font-medium text-xs">{p.socio}</TableCell>
        <TableCell className="text-xs">{p.fecha_desembolso ?? "—"}</TableCell>
        <TableCell className="text-right tabular-nums text-xs">
          {formatCOP(p.monto_prestado)}
        </TableCell>
        <TableCell className="text-center text-xs">{p.total_vencimientos}</TableCell>
        <TableCell className="text-center text-xs text-[var(--color-success)]">
          {p.pagados_a_tiempo}
        </TableCell>
        <TableCell className="text-center text-xs text-[var(--color-warning)]">
          {p.pagados_tarde}
        </TableCell>
        <TableCell className="text-center text-xs text-[var(--color-destructive)] font-semibold">
          {p.sin_pagar}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs text-[var(--color-success)]">
          {formatCOP(p.mora_pagada)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs font-semibold text-[var(--color-destructive)]">
          {formatCOP(p.mora_pendiente)}
        </TableCell>
      </TableRow>
      {abierto && p.detalle && (
        <TableRow>
          <TableCell colSpan={10} className="bg-[var(--color-primary)]/5 p-3">
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
              Vencimientos del préstamo #{p.prestamo_id}
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
                {p.detalle.map((d, i) => (
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
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
