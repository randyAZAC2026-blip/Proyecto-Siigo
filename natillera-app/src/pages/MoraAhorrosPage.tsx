import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Info, CalendarClock } from "lucide-react";
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
import { formatCOP, formatFechaCorta } from "@/lib/natillera/format";
import { InformeLayout } from "@/components/informes/InformeLayout";
import { api, USA_SUPABASE, type MoraAhorroSocio } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

const ESTADO_TXT = { pagado_a_tiempo: "A tiempo", pagado_tarde: "Tarde", sin_pagar: "Sin pagar" } as const;

export function MoraAhorrosPage({ onVolver: _onVolver }: { onVolver: () => void }) {
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
    <InformeLayout
      titulo="Mora de ahorros"
      descripcion="Pagos de ahorro hechos después de la fecha de corte de cada mes, o que no se han hecho, y la mora que generan."
      Icon={CalendarClock}
      corte={data ? formatFechaCorta(data.hoy) : undefined}
      horizontal
      cargando={loading}
      error={error}
      listo={!!data}
      onActualizar={reload}
      resumen={
        data
          ? [
              { label: "Mora pendiente por cobrar", valor: formatCOP(data.totales.mora_pendiente),
                tono: data.totales.mora_pendiente > 0 ? "alerta" : "bueno" },
              { label: "Mora ya pagada", valor: formatCOP(data.totales.mora_pagada) },
              { label: "Mora total", valor: formatCOP(data.totales.mora_total) },
              { label: "Meses sin pagar", valor: String(data.totales.sin_pagar),
                tono: data.totales.sin_pagar > 0 ? "alerta" : "bueno" },
            ]
          : undefined
      }
      excel={() => [
        {
          nombre: "Mora por socio",
          columnas: [
            { titulo: "Socio", tipo: "texto", ancho: 30 },
            { titulo: "Cuota", tipo: "moneda" },
            { titulo: "Meses", tipo: "numero" },
            { titulo: "A tiempo", tipo: "numero" },
            { titulo: "Tarde", tipo: "numero" },
            { titulo: "Sin pagar", tipo: "numero" },
            { titulo: "Mora pagada", tipo: "moneda" },
            { titulo: "Mora pendiente", tipo: "moneda" },
          ],
          filas: (data?.socios ?? []).map((s) => [
            s.socio, s.cuota_sostenimiento, s.total_periodos, s.pagados_a_tiempo,
            s.pagados_tarde, s.sin_pagar, s.mora_pagada, s.mora_pendiente,
          ]),
          totales: ["TOTAL", null, null, null, null, data?.totales.sin_pagar ?? 0,
            data?.totales.mora_pagada ?? 0, data?.totales.mora_pendiente ?? 0],
        },
        {
          nombre: "Detalle mes a mes",
          columnas: [
            { titulo: "Socio", tipo: "texto", ancho: 30 },
            { titulo: "Periodo", tipo: "texto", ancho: 14 },
            { titulo: "Fecha de corte", tipo: "fecha" },
            { titulo: "Fecha de pago", tipo: "fecha" },
            { titulo: "Días de atraso", tipo: "numero" },
            { titulo: "Estado", tipo: "texto", ancho: 12 },
            { titulo: "Mora", tipo: "moneda" },
          ],
          filas: (data?.socios ?? []).flatMap((s) =>
            (s.detalle ?? []).map((d) => [
              s.socio, d.periodo, d.fecha_corte, d.fecha_pago, d.dias_atraso, ESTADO_TXT[d.estado], d.mora,
            ]),
          ),
        },
      ]}
      avisos={
        <>
          {USA_SUPABASE && (
            <div className="flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-3 text-sm" data-print="hide">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" />
              <span>
                <strong>Todavía no se calcula en la versión en la nube.</strong> Los números de este informe salen
                en cero aunque haya atrasos; por ahora solo el servidor local hace este cálculo.
              </span>
            </div>
          )}
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

        </>
      }
    >
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
    </InformeLayout>
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
