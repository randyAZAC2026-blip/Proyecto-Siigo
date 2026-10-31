import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Info, HandCoins } from "lucide-react";
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
import { api, USA_SUPABASE, type MoraPrestamo } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";

const ESTADO_TXT = { pagado_a_tiempo: "A tiempo", pagado_tarde: "Tarde", sin_pagar: "Sin pagar" } as const;

export function MoraInteresesPage({ onVolver: _onVolver }: { onVolver: () => void }) {
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
    <InformeLayout
      titulo="Mora de intereses"
      descripcion="Intereses de préstamos pagados después de su vencimiento mensual, o pendientes, y la mora que generan."
      Icon={HandCoins}
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
              { label: "Vencimientos sin pagar", valor: String(data.totales.sin_pagar),
                tono: data.totales.sin_pagar > 0 ? "alerta" : "bueno" },
            ]
          : undefined
      }
      excel={() => [
        {
          nombre: "Mora por préstamo",
          columnas: [
            { titulo: "Socio", tipo: "texto", ancho: 30 },
            { titulo: "Desembolso", tipo: "fecha" },
            { titulo: "Monto prestado", tipo: "moneda" },
            { titulo: "Vencimientos", tipo: "numero" },
            { titulo: "A tiempo", tipo: "numero" },
            { titulo: "Tarde", tipo: "numero" },
            { titulo: "Sin pagar", tipo: "numero" },
            { titulo: "Mora pagada", tipo: "moneda" },
            { titulo: "Mora pendiente", tipo: "moneda" },
          ],
          filas: (data?.prestamos ?? []).map((p) => [
            p.socio, p.fecha_desembolso, p.monto_prestado, p.total_vencimientos, p.pagados_a_tiempo,
            p.pagados_tarde, p.sin_pagar, p.mora_pagada, p.mora_pendiente,
          ]),
          totales: ["TOTAL", null, null, null, null, null, data?.totales.sin_pagar ?? 0,
            data?.totales.mora_pagada ?? 0, data?.totales.mora_pendiente ?? 0],
        },
        {
          nombre: "Detalle de vencimientos",
          columnas: [
            { titulo: "Socio", tipo: "texto", ancho: 30 },
            { titulo: "Vencimiento", tipo: "fecha" },
            { titulo: "Fecha de pago", tipo: "fecha" },
            { titulo: "Días de atraso", tipo: "numero" },
            { titulo: "Estado", tipo: "texto", ancho: 12 },
            { titulo: "Mora", tipo: "moneda" },
          ],
          filas: (data?.prestamos ?? []).flatMap((p) =>
            (p.detalle ?? []).map((d) => [
              p.socio, d.vencimiento, d.fecha_pago, d.dias_atraso, ESTADO_TXT[d.estado], d.mora,
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

        </>
      }
    >
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
    </InformeLayout>
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
