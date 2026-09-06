import { RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/dashboard/useApi";
import { api } from "@/lib/dashboard/api";
import { KpiTiles } from "@/components/dashboard/KpiTiles";
import { SociosTabla } from "@/components/dashboard/SociosTabla";
import { MatrizAhorros } from "@/components/dashboard/MatrizAhorros";
import { LiquidacionCard } from "@/components/dashboard/LiquidacionCard";
import { BancosCard } from "@/components/dashboard/BancosCard";
import { DeudoresCard } from "@/components/dashboard/DeudoresCard";

const API_URL = import.meta.env.VITE_NAT_API || "http://localhost:4000";

export function DashboardPage({ onVolver }: { onVolver: () => void }) {
  const resumen = useApi(() => api.resumen());
  const socios = useApi(() => api.socios());
  const matriz = useApi(() => api.matrizAhorro());
  const liquidacion = useApi(() => api.liquidacion());
  const bancos = useApi(() => api.bancos());
  const deudores = useApi(() => api.deudores());

  const cargando =
    resumen.loading ||
    socios.loading ||
    matriz.loading ||
    liquidacion.loading ||
    bancos.loading ||
    deudores.loading;

  const errores = [
    resumen.error,
    socios.error,
    matriz.error,
    liquidacion.error,
    bancos.error,
    deudores.error,
  ].filter(Boolean);

  function reload() {
    resumen.reload();
    socios.reload();
    matriz.reload();
    liquidacion.reload();
    bancos.reload();
    deudores.reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Dashboard consolidado
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Vista en vivo de la base SQLite. Se actualiza al re-migrar el Excel.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={cargando}>
            <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={onVolver}>
            ← Volver
          </Button>
        </div>
      </div>

      {errores.length > 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius-default)] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-4">
          <AlertCircle className="size-5 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-[var(--color-destructive)]">
              No se pudo conectar al backend
            </p>
            <p className="text-[var(--color-muted)] mt-1">
              Asegúrate de que el servidor esté corriendo en <code>{API_URL}</code>. En otra
              terminal:
            </p>
            <pre className="mt-2 rounded bg-[var(--color-muted)]/20 p-2 text-xs">
              cd natillera-backend{"\n"}pnpm dev
            </pre>
            <p className="text-xs mt-2 text-[var(--color-destructive)]">{errores[0]}</p>
          </div>
        </div>
      )}

      {cargando && !resumen.data && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />
          ))}
        </div>
      )}

      {resumen.data && <KpiTiles resumen={resumen.data} />}
      {socios.data && <SociosTabla socios={socios.data} />}
      {matriz.data && <MatrizAhorros matriz={matriz.data} />}
      {liquidacion.data && <LiquidacionCard filas={liquidacion.data} />}
      {deudores.data && <DeudoresCard deudores={deudores.data} />}
      {bancos.data && <BancosCard bancos={bancos.data} />}
    </div>
  );
}
