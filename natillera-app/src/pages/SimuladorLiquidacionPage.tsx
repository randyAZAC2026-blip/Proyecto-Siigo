import { useEffect, useState } from "react";
import { FlaskConical, AlertCircle, Info, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCOP, parseCOP } from "@/lib/natillera/format";
import {
  api,
  type SimuladorParams,
  type SimuladorResultado,
  type ModoMora,
  type ModoPrestamos,
  type ModoUtilidad,
  type ModoReparto,
} from "@/lib/dashboard/api";

const HOY = new Date().toISOString().slice(0, 10);
const FIN_MES = (() => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
})();

export function SimuladorLiquidacionPage({ onVolver }: { onVolver: () => void }) {
  const [params, setParams] = useState<SimuladorParams>({
    fecha_corte: HOY,
    mora_ahorros: { modo: "cobrar" },
    mora_intereses: { modo: "cobrar" },
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3" data-print="hide">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
            <FlaskConical className="size-6 text-[var(--color-primary)]" />
            Simulador de liquidación
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Proyecta escenarios de cierre sin modificar la BD. Ajusta cualquier control y los
            resultados se recalculan automáticamente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            Imprimir / PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={onVolver}>
            ← Volver
          </Button>
        </div>
      </div>

      <Card
        className="rounded-[var(--radius-card)] border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5"
        data-print="hide"
      >
        <CardContent className="py-3 flex items-start gap-2">
          <Info className="size-4 text-[var(--color-primary)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--color-text)]">
            <strong>Este simulador no toca la base de datos.</strong> Es solo análisis
            "what-if". Si la junta aprueba un escenario, se ejecuta después en un proceso
            separado de cierre.
          </p>
        </CardContent>
      </Card>

      <ControlesPanel params={params} onChange={setParams} />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}

      {loading && !data && <Skeleton className="h-96 rounded-[var(--radius-card)]" />}

      {data && <ResumenTotales totales={data.totales} loading={loading} />}
      {data && <TablaSimulacion data={data} />}
    </div>
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

          {/* Mora ahorros */}
          <ModoMoraCtrl
            label="Mora de ahorros"
            value={params.mora_ahorros ?? { modo: "cobrar" }}
            onChange={(v) => upd({ mora_ahorros: v })}
          />

          {/* Mora intereses */}
          <ModoMoraCtrl
            label="Mora de intereses"
            value={params.mora_intereses ?? { modo: "cobrar" }}
            onChange={(v) => upd({ mora_intereses: v })}
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

function ModoMoraCtrl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { modo: ModoMora; valor?: number };
  onChange: (v: { modo: ModoMora; valor?: number }) => void;
}) {
  const opts: { key: ModoMora; label: string }[] = [
    { key: "cobrar", label: "Cobrar" },
    { key: "condonar", label: "Condonar" },
    { key: "porcentaje", label: "%" },
    { key: "manual", label: "Manual" },
  ];
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1 items-center">
        {opts.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange({ modo: o.key, valor: value.valor })}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              value.modo === o.key
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
            }`}
          >
            {o.label}
          </button>
        ))}
        {value.modo === "porcentaje" && (
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={value.valor ?? 0.5}
            onChange={(e) => onChange({ modo: "porcentaje", valor: Number(e.target.value) })}
            placeholder="0.5"
            className="w-20 h-7"
          />
        )}
        {value.modo === "manual" && (
          <Input
            inputMode="numeric"
            value={value.valor ? String(value.valor) : ""}
            onChange={(e) => onChange({ modo: "manual", valor: parseCOP(e.target.value) })}
            placeholder="Monto"
            className="w-28 h-7"
          />
        )}
      </div>
    </div>
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

function ResumenTotales({
  totales,
  loading,
}: {
  totales: SimuladorResultado["totales"];
  loading: boolean;
}) {
  const tiles = [
    { label: "Total ahorros", value: formatCOP(totales.total_ahorros), color: "var(--color-primary)" },
    { label: "Utilidad total", value: formatCOP(totales.utilidad_total), color: "var(--color-success)" },
    { label: "A repartir", value: formatCOP(totales.utilidad_a_repartir), color: "var(--color-success)" },
    { label: "Reserva", value: formatCOP(totales.reserva), color: "var(--color-warning)" },
    {
      label: "Total a pagar (neto)",
      value: formatCOP(totales.total_neto),
      color: totales.total_neto < 0 ? "var(--color-destructive)" : "var(--color-primary)",
    },
    { label: "Socios positivos", value: `${totales.socios_positivos}`, color: "var(--color-success)" },
    { label: "Socios negativos", value: `${totales.socios_negativos}`, color: "var(--color-destructive)" },
    {
      label: "Mora cobrada",
      value: formatCOP(totales.total_mora_ahorro_cobrada + totales.total_mora_intereses_cobrada),
      color: "var(--color-warning)",
    },
  ];
  return (
    <div className={`grid gap-3 grid-cols-2 sm:grid-cols-4 ${loading ? "opacity-70" : ""}`}>
      {tiles.map((t) => (
        <Card key={t.label} className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardContent className="py-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
              {t.label}
            </div>
            <div className="text-lg font-semibold tabular-nums mt-1" style={{ color: t.color }}>
              {t.value}
            </div>
          </CardContent>
        </Card>
      ))}
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
        <div data-print="header">
          <h1>Simulación de liquidación — Natillera</h1>
          <p>Corte: {data.parametros.fecha_corte}</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead className="text-right">Aportes</TableHead>
              <TableHead className="text-right">Utilidad</TableHead>
              <TableHead className="text-right">Préstamo</TableHead>
              <TableHead className="text-right">Multas</TableHead>
              <TableHead className="text-right">Mora ahorro</TableHead>
              <TableHead className="text-right">Mora int.</TableHead>
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
                <TableCell className="text-right tabular-nums text-xs text-[var(--color-destructive)]">
                  {s.deducc_mora_ahorro > 0 ? "-" + formatCOP(s.deducc_mora_ahorro) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs text-[var(--color-destructive)]">
                  {s.deducc_mora_intereses > 0
                    ? "-" + formatCOP(s.deducc_mora_intereses)
                    : "—"}
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
            <TableRow className="bg-[var(--color-primary)]/5">
              <TableCell className="font-semibold">TOTAL</TableCell>
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
              <TableCell className="text-right tabular-nums font-semibold text-xs text-[var(--color-destructive)]">
                -{formatCOP(data.totales.total_mora_ahorro_cobrada)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-xs text-[var(--color-destructive)]">
                -{formatCOP(data.totales.total_mora_intereses_cobrada)}
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
