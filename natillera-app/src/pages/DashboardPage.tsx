import { AlertCircle, HandCoins, PiggyBank, RefreshCw, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/dashboard/useApi";
import { api, USA_SUPABASE } from "@/lib/dashboard/api";
import { formatCOPCompacto, formatFechaCorta } from "@/lib/natillera/format";
import { HeroCaja } from "@/components/panel/HeroCaja";
import { StatTile } from "@/components/panel/StatTile";
import { AhorroPeriodosChart } from "@/components/panel/AhorroPeriodosChart";
import { ConciliacionCard } from "@/components/panel/ConciliacionCard";
import { CarteraCard } from "@/components/panel/CarteraCard";
import { AtencionCard } from "@/components/panel/AtencionCard";

const API_URL = import.meta.env.VITE_NAT_API || "http://localhost:4000";
const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

interface Props {
  onVolver: () => void;
  onIr: (vista: string) => void;
  /** Nombre de quien entra, para el saludo. */
  nombre?: string;
}

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export function DashboardPage({ onVolver: _onVolver, onIr, nombre }: Props) {
  const panel = useApi(() => api.panel());
  const resumen = useApi(() => api.resumen());
  const deudores = useApi(() => api.deudores());
  const morosos = useApi(() => api.morosos(60));

  const cargando = panel.loading || resumen.loading;
  const error = panel.error ?? resumen.error;
  const recargar = () => {
    panel.reload();
    resumen.reload();
    deudores.reload();
    morosos.reload();
  };

  const f = panel.data?.financiero;
  const primerNombre = nombre && nombre !== "Administrador" ? nombre.split(" ")[0] : null;
  const hoyTxt = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hoy = hoyTxt.charAt(0).toUpperCase() + hoyTxt.slice(1);

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--color-muted)]">{hoy}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            {saludo()}
            {primerNombre ? `, ${primerNombre}` : ""}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Resumen financiero de la natillera
            {f?.ultimo_pago ? ` · último pago registrado el ${formatFechaCorta(f.ultimo_pago)}` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recargar} disabled={cargando}>
          <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-4">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-[var(--color-destructive)]" />
          <div className="text-sm">
            <p className="font-semibold text-[var(--color-destructive)]">
              {USA_SUPABASE ? "No se pudo conectar a Supabase" : "No se pudo conectar al backend"}
            </p>
            <p className="mt-1 text-[var(--color-muted)]">
              {USA_SUPABASE ? (
                <>
                  Verifica tu conexión a internet y que <code>{SB_URL ?? "VITE_SUPABASE_URL"}</code> esté bien configurada.
                </>
              ) : (
                <>
                  Verifica que el servidor esté corriendo en <code>{API_URL}</code>.
                </>
              )}
            </p>
            <p className="mt-2 text-xs text-[var(--color-destructive)]">{error}</p>
          </div>
        </div>
      )}

      {!f && cargando && (
        <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Skeleton className="h-72 rounded-[var(--radius-card)] lg:col-span-2" />
          <Skeleton className="h-72 rounded-[var(--radius-card)]" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[var(--radius-card)]" />
          ))}
        </div>
      )}

      {f && panel.data && (
        <>
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <div className="lg:col-span-2">
              <HeroCaja f={f} />
            </div>
            {resumen.data ? (
              <AtencionCard resumen={resumen.data} morosos={morosos.data ?? []} onIr={onIr} />
            ) : (
              <Skeleton className="h-full min-h-60 rounded-[var(--radius-card)]" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*]:min-w-0">
            <StatTile
              label="Ahorro de los socios"
              valor={formatCOPCompacto(f.ahorro)}
              detalle={`${f.socios_activos} socios · ${formatCOPCompacto(f.socios_activos ? f.ahorro / f.socios_activos : 0)} promedio`}
              Icon={PiggyBank}
              onClick={() => onIr("matriz")}
            />
            <StatTile
              label="Cartera por cobrar"
              valor={formatCOPCompacto(f.cartera)}
              detalle={`de ${formatCOPCompacto(f.prestamos_desembolsados)} prestados`}
              Icon={HandCoins}
              onClick={() => onIr("prestamos")}
            />
            <StatTile
              label="Rendimientos del ciclo"
              valor={formatCOPCompacto(f.rendimientos)}
              detalle={`intereses ${formatCOPCompacto(f.intereses)} · rifas ${formatCOPCompacto(f.rifa)}`}
              Icon={TrendingUp}
              onClick={() => onIr("liquidacion")}
            />
            <StatTile
              label="Socios activos"
              valor={String(f.socios_activos)}
              detalle={
                resumen.data
                  ? `${resumen.data.al_dia_mes.al_dia} ya ahorraron este mes`
                  : "—"
              }
              Icon={Users}
              onClick={() => onIr("socios")}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <div className="lg:col-span-2">
              <AhorroPeriodosChart periodos={panel.data.ahorroPeriodos} />
            </div>
            <ConciliacionCard filas={panel.data.conciliacion} onIr={() => onIr("banco")} />
          </div>

          <CarteraCard deudores={deudores.data ?? []} cartera={f.cartera} onIr={() => onIr("prestamos")} />
        </>
      )}
    </div>
  );
}
