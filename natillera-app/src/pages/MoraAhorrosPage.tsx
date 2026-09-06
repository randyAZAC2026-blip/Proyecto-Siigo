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
import { api, type MoraAhorroSocio } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

export function MoraAhorrosPage({ onVolver }: { onVolver: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.moraAhorros(true), []);
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
            Mora — Ahorros
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Cálculo automático de mora por atraso en el pago del ahorro mensual.
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

      {data && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5">
          <CardContent className="py-4 flex items-start gap-2">
            <Info className="size-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-[var(--color-text)]">
                <strong>Regla:</strong> cada periodo tiene una <em>fecha de corte</em>
                {" "}(configurada en la hoja "Datos" del Excel). Si el socio paga después,
                se cobra <strong>{formatCOP(data.regla.mora_por_dia)}</strong> por cada día
                de atraso.
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Solo se cuentan los periodos cuya fecha de corte ya pasó. Corte al {data.hoy}.
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
            label="Meses sin pagar"
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
            <CardTitle className="text-base">Socios con mora ({data.socios.length})</CardTitle>
            <CardDescription>
              Ordenados por mora pendiente. Clic en cualquier fila para ver el detalle mes a mes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Socio</TableHead>
                  <TableHead className="text-right">Cuota</TableHead>
                  <TableHead className="text-center">Meses</TableHead>
                  <TableHead className="text-center">A tiempo</TableHead>
                  <TableHead className="text-center">Tarde</TableHead>
                  <TableHead className="text-center">Sin pagar</TableHead>
                  <TableHead className="text-right">Mora pagada</TableHead>
                  <TableHead className="text-right">Mora pendiente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.socios.map((s) => (
                  <FilaSocio
                    key={s.socio_id}
                    s={s}
                    abierto={abiertos.has(s.socio_id)}
                    onToggle={() => toggle(s.socio_id)}
                  />
                ))}
                {data.socios.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-[var(--color-muted)]">
                      Ningún socio tiene mora de ahorros.
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

function FilaSocio({
  s,
  abierto,
  onToggle,
}: {
  s: MoraAhorroSocio;
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
        <TableCell className="font-medium text-xs">{s.socio}</TableCell>
        <TableCell className="text-right tabular-nums text-xs">
          {formatCOP(s.cuota_sostenimiento)}
        </TableCell>
        <TableCell className="text-center text-xs">{s.total_periodos}</TableCell>
        <TableCell className="text-center text-xs text-[var(--color-success)]">
          {s.pagados_a_tiempo}
        </TableCell>
        <TableCell className="text-center text-xs text-[var(--color-warning)]">
          {s.pagados_tarde}
        </TableCell>
        <TableCell className="text-center text-xs text-[var(--color-destructive)] font-semibold">
          {s.sin_pagar}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs text-[var(--color-success)]">
          {formatCOP(s.mora_pagada)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-xs font-semibold text-[var(--color-destructive)]">
          {formatCOP(s.mora_pendiente)}
        </TableCell>
      </TableRow>
      {abierto && s.detalle && (
        <TableRow>
          <TableCell colSpan={9} className="bg-[var(--color-primary)]/5 p-3">
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
              Detalle mes por mes de {s.socio}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Corte</TableHead>
                  <TableHead>Fecha de pago</TableHead>
                  <TableHead className="text-center">Días atraso</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Mora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.detalle.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{d.periodo}</TableCell>
                    <TableCell className="text-xs">{d.fecha_corte ?? "—"}</TableCell>
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
