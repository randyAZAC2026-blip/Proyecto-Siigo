import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, Anchor, Shuffle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { FuenteIngreso } from "@/lib/supabase/database.types";
import type { IngresosDelMes } from "@/lib/billetera/queries";
import { formatCOP } from "@/lib/billetera/format";

interface Props {
  fuentes: FuenteIngreso[] | undefined;
  ingresos: IngresosDelMes | undefined;
  loading: boolean;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function IngresosMesCard({ fuentes, ingresos, loading }: Props) {
  const hoy = new Date();
  const nombreMes = MESES[hoy.getMonth()];
  const anio = hoy.getFullYear();

  const resumen = useMemo(() => {
    if (!fuentes || !ingresos) return null;
    const fijas = fuentes.filter((f) => f.frecuencia === "fijo" && f.activa);
    const variables = fuentes.filter((f) => f.frecuencia === "variable" && f.activa);

    const montoFijo = (f: FuenteIngreso) => ingresos.porFuente.get(f.id) ?? 0;

    const totalFijoRecibido = fijas.reduce((acc, f) => acc + montoFijo(f), 0);
    const totalFijoEsperado = fijas.reduce(
      (acc, f) => acc + (f.monto_esperado_mensual ?? 0),
      0,
    );
    const totalVariable = variables.reduce((acc, f) => acc + montoFijo(f), 0);
    const totalMes = totalFijoRecibido + totalVariable + ingresos.sinFuente;

    return {
      fijas,
      variables,
      totalFijoRecibido,
      totalFijoEsperado,
      totalVariable,
      totalMes,
      sinFuente: ingresos.sinFuente,
      montoFijo,
    };
  }, [fuentes, ingresos]);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />;
  }

  if (!resumen) return null;

  const sinFuentesConfiguradas = resumen.fijas.length === 0 && resumen.variables.length === 0;

  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] bg-[var(--color-surface)]">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowDownRight className="size-5 text-[var(--color-success)]" />
            Ingresos de {nombreMes} {anio}
          </CardTitle>
          <p className="mt-1 tabular-nums text-2xl font-semibold text-[var(--color-text)]">
            {formatCOP(resumen.totalMes)}
          </p>
        </div>
        <Link to="/ingresos">
          <Button variant="outline" size="sm">
            <Plus className="size-4" />
            Fuentes
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {sinFuentesConfiguradas ? (
          <div className="rounded-[var(--radius-default)] border border-dashed border-[var(--color-border)] p-4 text-center">
            <p className="text-sm text-[var(--color-muted)]">
              Aún no has configurado fuentes de ingreso. Agrégalas para saber de dónde viene tu
              dinero y separar lo fijo de lo variable.
            </p>
            <Link to="/ingresos">
              <Button
                size="sm"
                className="mt-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
              >
                Agregar fuente
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section className="space-y-2">
              <header className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
                  <Anchor className="size-4 text-[var(--color-primary)]" />
                  Fijos
                </h3>
                <p className="tabular-nums text-sm font-semibold">
                  {formatCOP(resumen.totalFijoRecibido)}
                  {resumen.totalFijoEsperado > 0 && (
                    <span className="font-normal text-[var(--color-muted)]">
                      {" / "}
                      {formatCOP(resumen.totalFijoEsperado)}
                    </span>
                  )}
                </p>
              </header>
              {resumen.fijas.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">Sin fuentes fijas.</p>
              ) : (
                <ul className="space-y-1.5">
                  {resumen.fijas.map((f) => {
                    const recibido = resumen.montoFijo(f);
                    const esperado = f.monto_esperado_mensual ?? 0;
                    return (
                      <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-[var(--color-text)]">{f.nombre}</span>
                        <span className="shrink-0 tabular-nums text-[var(--color-text)]">
                          {formatCOP(recibido)}
                          {esperado > 0 && (
                            <span className="text-[var(--color-muted)]">
                              {" / "}
                              {formatCOP(esperado)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <header className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
                  <Shuffle className="size-4 text-[var(--color-warning)]" />
                  Variables
                </h3>
                <p className="tabular-nums text-sm font-semibold">
                  {formatCOP(resumen.totalVariable)}
                </p>
              </header>
              {resumen.variables.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">Sin fuentes variables.</p>
              ) : (
                <ul className="space-y-1.5">
                  {resumen.variables.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-[var(--color-text)]">{f.nombre}</span>
                      <span className="shrink-0 tabular-nums text-[var(--color-text)]">
                        {formatCOP(resumen.montoFijo(f))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {resumen.sinFuente > 0 && (
          <p className="rounded-[var(--radius-default)] bg-[var(--color-muted)]/10 px-3 py-2 text-xs text-[var(--color-muted)]">
            Hay {formatCOP(resumen.sinFuente)} de ingresos este mes sin fuente asignada. Puedes
            editarlos y asociarlos a una fuente para que aparezcan aquí.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
