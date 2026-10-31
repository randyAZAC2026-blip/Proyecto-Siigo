import { AlertCircle, ArrowRight, Landmark, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { formatCOP, nombreConcepto } from "@/lib/natillera/format";

interface Props {
  socioId: number;
  nombre: string;
  onIr: (vista: "mis-ahorros" | "mis-prestamos" | "mi-liquidacion") => void;
}

function Tile({ label, valor, color, onClick }: { label: string; valor: number; color: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left enabled:hover:border-[var(--color-primary)]/50"
    >
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color }}>
        {formatCOP(valor)}
      </div>
    </button>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-semibold tabular-nums">{valor}</span>
    </div>
  );
}

// Inicio del socio: su situación en tarjetas grandes y, aparte, cómo va la natillera (sin nombres).
export function MiInicioPage({ socioId, nombre, onIr }: Props) {
  const yo = useApi(() => api.socioById(socioId), [socioId]);
  const liq = useApi(() => api.liquidacion(), []);
  const tot = useApi(() => api.totalesGenerales(), []);
  const miLiq = liq.data?.find((l) => l.id === socioId);
  const error = yo.error || liq.error || tot.error;
  const primerNombre = nombre.split(/\s+/)[0]?.toLowerCase().replace(/^./, (c) => c.toUpperCase()) ?? "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Hola, {primerNombre}</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Así vas en la natillera.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}

      {!yo.data && yo.loading && <Skeleton className="h-40 rounded-[var(--radius-card)]" />}
      {yo.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Mis ahorros" valor={yo.data.socio.ahorro} color="var(--color-primary)" onClick={() => onIr("mis-ahorros")} />
          {/* Aportes según la liquidación (ahorro + actividades + rifa + intereses); no incluye abonos a préstamos. */}
          <Tile label="Mis aportes" valor={miLiq?.total_aportes ?? 0} color="var(--color-primary)" onClick={() => onIr("mi-liquidacion")} />
          <Tile
            label="Debo en préstamos"
            valor={yo.data.socio.saldo_prestamos}
            color={yo.data.socio.saldo_prestamos > 0 ? "var(--color-warning)" : "var(--color-success)"}
            onClick={() => onIr("mis-prestamos")}
          />
          <Tile
            label="Recibiría hoy"
            valor={miLiq?.neto_a_recibir ?? 0}
            color={(miLiq?.neto_a_recibir ?? 0) < 0 ? "var(--color-destructive)" : "var(--color-success)"}
            onClick={() => onIr("mi-liquidacion")}
          />
        </div>
      )}

      {yo.data && yo.data.historial.length > 0 && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Últimos movimientos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--color-border)]">
              {yo.data.historial.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{nombreConcepto(t.concepto)}</div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {t.fecha_pago ?? "sin fecha"}
                      {t.periodo ? ` · ${t.periodo.toLowerCase()}` : ""}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${t.tipo === "egreso" ? "text-[var(--color-destructive)]" : "text-[var(--color-success)]"}`}
                  >
                    {t.tipo === "egreso" ? "-" : "+"}
                    {formatCOP(t.valor)}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onIr("mis-ahorros")}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)]"
            >
              Ver todos <ArrowRight className="size-4" />
            </button>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="size-4 text-[var(--color-primary)]" />
            La natillera hoy
          </CardTitle>
          <CardDescription>Totales de todo el grupo. No se muestran datos de otros socios.</CardDescription>
        </CardHeader>
        <CardContent>
          {tot.loading && !tot.data && <Skeleton className="h-28" />}
          {tot.data && (
            <div className="divide-y divide-[var(--color-border)]">
              <div className="flex items-center gap-2 pb-2 text-sm text-[var(--color-muted)]">
                <Users className="size-4" /> {tot.data.socios_activos} socios activos
              </div>
              <Dato label="Ahorrado entre todos" valor={formatCOP(tot.data.total_ahorrado)} />
              <Dato label="Actividades y rifas" valor={formatCOP(tot.data.total_actividades)} />
              <Dato label="Prestado (por cobrar)" valor={formatCOP(tot.data.capital_prestado)} />
              <Dato label="Intereses ganados" valor={formatCOP(tot.data.intereses_cobrados)} />
              <Dato label="Dinero disponible" valor={formatCOP(tot.data.fondo_disponible)} />
              {tot.data.ultimo_movimiento && (
                <p className="pt-2 text-xs text-[var(--color-muted)]">Último movimiento: {tot.data.ultimo_movimiento}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
