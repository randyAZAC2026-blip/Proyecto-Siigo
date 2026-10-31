import { useEffect, useState } from "react";
import { FlaskConical, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP, formatCOPCompacto, formatFechaCorta, parseCOP } from "@/lib/natillera/format";
import { InformeLayout } from "@/components/informes/InformeLayout";
import {
  api,
  type SimuladorParams,
  type SimuladorResultado,
  type ModoPrestamos,
  type ModoUtilidad,
  type ModoReparto,
} from "@/lib/dashboard/api";

const HOY = new Date().toISOString().slice(0, 10);
const FIN_MES = (() => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
})();

export function SimuladorLiquidacionPage({ onVolver: _onVolver }: { onVolver: () => void }) {
  const [params, setParams] = useState<SimuladorParams>({
    fecha_corte: HOY,
    // La mora no se usa este año: siempre condonada (no descuenta nada).
    mora_ahorros: { modo: "condonar" },
    mora_intereses: { modo: "condonar" },
    prestamos: { modo: "total" },
    utilidad: { modo: "toda" },
    reparto: { modo: "proporcional_ahorro" },
  });
  const [data, setData] = useState<SimuladorResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simula con debounce cuando cambia cualquier param.
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await api.simularLiquidacion(params);
        if (!cancelado) setData(res);
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelado) setLoading(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [params]);

  const t = data?.totales;
  const deducciones = t
    ? t.total_prestamos + t.total_multas
    : 0;

  return (
    <InformeLayout
      titulo="Simulador de cierre"
      descripcion="Proyecta escenarios de liquidación sin modificar la base de datos. Ajusta cualquier control y los resultados se recalculan solos."
      Icon={FlaskConical}
      corte={formatFechaCorta(params.fecha_corte)}
      horizontal
      cargando={loading}
      error={error}
      listo={!!data}
      detalleImpresion={`Escenario: utilidad ${params.utilidad?.modo ?? "—"} · reparto ${params.reparto?.modo ?? "—"} · préstamos ${params.prestamos?.modo ?? "—"}`}
      resumen={
        t
          ? [
              { label: "Aportes", valor: formatCOPCompacto(t.total_aportes) },
              {
                label: "Utilidad a repartir",
                valor: formatCOPCompacto(t.utilidad_a_repartir),
                detalle: t.reserva > 0 ? `reserva ${formatCOPCompacto(t.reserva)}` : undefined,
              },
              { label: "Deducciones", valor: formatCOPCompacto(-deducciones) },
              { label: "Neto a pagar", valor: formatCOPCompacto(t.total_neto) },
              {
                label: "Quedan debiendo",
                valor: String(t.socios_negativos),
                detalle: `de ${t.socios_negativos + t.socios_positivos} socios`,
                tono: t.socios_negativos > 0 ? "alerta" : "bueno",
              },
            ]
          : undefined
      }
      excel={() => [
        {
          nombre: "Proyección por socio",
          columnas: [
            { titulo: "Socio", tipo: "texto", ancho: 30 },
            { titulo: "Aportes", tipo: "moneda" },
            { titulo: "Utilidad", tipo: "moneda" },
            { titulo: "Préstamo", tipo: "moneda" },
            { titulo: "Multas", tipo: "moneda" },
            { titulo: "Neto a recibir", tipo: "moneda" },
          ],
          filas: (data?.socios ?? []).map((x) => [
            x.nombre,
            x.total_aportes,
            x.participacion_utilidad,
            -x.deducc_prestamo_aplicada,
            -x.deducc_multas,
            x.neto_a_recibir,
          ]),
          totales: t
            ? [
                "TOTAL",
                t.total_aportes,
                t.utilidad_a_repartir,
                -t.total_prestamos,
                -t.total_multas,
                t.total_neto,
              ]
            : undefined,
        },
        {
          nombre: "Escenario",
          columnas: [
            { titulo: "Parámetro", tipo: "texto", ancho: 24 },
            { titulo: "Valor", tipo: "texto", ancho: 40 },
          ],
          filas: [
            ["Fecha de corte", params.fecha_corte],
            ["Utilidad", JSON.stringify(params.utilidad)],
            ["Reparto", JSON.stringify(params.reparto)],
            ["Préstamos", JSON.stringify(params.prestamos)],
          ],
        },
      ]}
      avisos={
        <>
          <div
            className="flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3"
            data-print="hide"
          >
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />
            <p className="text-xs text-[var(--color-text)]">
              <strong>Este simulador no toca la base de datos.</strong> Es solo un análisis de escenarios. Si la
              junta aprueba uno, el cierre se hace después en un proceso aparte.
            </p>
          </div>
          {/* Los controles se ven siempre, aunque la simulación aún esté cargando. */}
          <ControlesPanel params={params} onChange={setParams} />
        </>
      }
    >
      {data && <TablaSimulacion data={data} />}
    </InformeLayout>
  );
}

function ControlesPanel({
  params,
  onChange,
}: {
  params: SimuladorParams;
  onChange: (p: SimuladorParams) => void;
}) {
  const upd = (patch: Partial<SimuladorParams>) => onChange({ ...params, ...patch });

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]" data-print="hide">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Escenario</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Fecha */}
          <div className="space-y-1.5">
            <Label>Fecha de corte</Label>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => upd({ fecha_corte: HOY })}
                className={params.fecha_corte === HOY ? "border-[var(--color-primary)]" : ""}
              >
                Hoy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => upd({ fecha_corte: FIN_MES })}
                className={params.fecha_corte === FIN_MES ? "border-[var(--color-primary)]" : ""}
              >
                Fin de mes
              </Button>
              <Input
                type="date"
                value={params.fecha_corte ?? HOY}
                onChange={(e) => upd({ fecha_corte: e.target.value })}
                className="w-40"
              />
            </div>
          </div>

          {/* Reparto */}
          <RadioGroup
            label="Modo de reparto de utilidad"
            value={params.reparto?.modo}
            onChange={(m) => upd({ reparto: { modo: m as ModoReparto } })}
            options={[
              { key: "proporcional_ahorro", label: "Proporcional al ahorro" },
              { key: "proporcional_aportes", label: "Proporcional a aportes totales" },
              { key: "igual", label: "Igual para todos" },
            ]}
          />

          {/* Préstamos */}
          <RadioGroup
            label="Préstamos vigentes"
            value={params.prestamos?.modo}
            onChange={(m) => upd({ prestamos: { modo: m as ModoPrestamos } })}
            options={[
              { key: "total", label: "Descontar saldo total" },
              { key: "no_descontar", label: "No descontar" },
            ]}
          />

          {/* Utilidad */}
          <UtilidadCtrl
            value={params.utilidad ?? { modo: "toda" }}
            onChange={(v) => upd({ utilidad: v })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function UtilidadCtrl({
  value,
  onChange,
}: {
  value: { modo: ModoUtilidad; reserva?: number; porcentaje?: number };
  onChange: (v: { modo: ModoUtilidad; reserva?: number; porcentaje?: number }) => void;
}) {
  const opts: { key: ModoUtilidad; label: string }[] = [
    { key: "toda", label: "Repartir toda" },
    { key: "reserva", label: "Con reserva" },
    { key: "porcentaje", label: "Repartir %" },
    { key: "no_repartir", label: "No repartir" },
  ];
  return (
    <div className="space-y-1.5">
      <Label>Utilidad</Label>
      <div className="flex flex-wrap gap-1 items-center">
        {opts.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange({ ...value, modo: o.key })}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              value.modo === o.key
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
            }`}
          >
            {o.label}
          </button>
        ))}
        {value.modo === "reserva" && (
          <Input
            inputMode="numeric"
            value={value.reserva ? String(value.reserva) : ""}
            onChange={(e) =>
              onChange({ modo: "reserva", reserva: parseCOP(e.target.value) })
            }
            placeholder="Reserva $"
            className="w-32 h-7"
          />
        )}
        {value.modo === "porcentaje" && (
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={value.porcentaje ?? 0.5}
            onChange={(e) =>
              onChange({ modo: "porcentaje", porcentaje: Number(e.target.value) })
            }
            className="w-20 h-7"
          />
        )}
      </div>
    </div>
  );
}

function RadioGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | undefined;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              value === o.key
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TablaSimulacion({ data }: { data: SimuladorResultado }) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Proyección por socio</CardTitle>
        <CardDescription>
          Ordenados por neto a recibir. Rojo = quedaría con deuda pendiente al cierre.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead className="text-right">Aportes</TableHead>
              <TableHead className="text-right">Utilidad</TableHead>
              <TableHead className="text-right">Préstamo</TableHead>
              <TableHead className="text-right">Multas</TableHead>
              <TableHead className="text-right">Neto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.socios.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium text-xs">{s.nombre}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  {formatCOP(s.total_aportes)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs text-[var(--color-success)]">
                  +{formatCOP(s.participacion_utilidad)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs text-[var(--color-warning)]">
                  {s.deducc_prestamo_aplicada > 0
                    ? "-" + formatCOP(s.deducc_prestamo_aplicada)
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs text-[var(--color-warning)]">
                  {s.deducc_multas > 0 ? "-" + formatCOP(s.deducc_multas) : "—"}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-semibold ${
                    s.neto_a_recibir < 0
                      ? "text-[var(--color-destructive)]"
                      : "text-[var(--color-success)]"
                  }`}
                >
                  {formatCOP(s.neto_a_recibir)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow data-total className="bg-[var(--color-background)] hover:bg-[var(--color-background)]">
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs">
                {formatCOP(data.totales.total_aportes)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs text-[var(--color-success)]">
                +{formatCOP(data.totales.utilidad_a_repartir)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs text-[var(--color-warning)]">
                -{formatCOP(data.totales.total_prestamos)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs text-[var(--color-warning)]">
                -{formatCOP(data.totales.total_multas)}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums font-semibold ${
                  data.totales.total_neto < 0
                    ? "text-[var(--color-destructive)]"
                    : "text-[var(--color-success)]"
                }`}
              >
                {formatCOP(data.totales.total_neto)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
