import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { MatrizAhorros } from "@/components/dashboard/MatrizAhorros";

export function MatrizAhorrosPage({ onVolver }: { onVolver: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.matrizAhorro(), []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Matriz de ahorros — socios × mes
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Vista de solo lectura del ahorro recaudado por socio en cada mes del ciclo.
            Para registrar / editar pagos, ve a <strong>Control pagos</strong>.
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

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}

      {loading && !data && <Skeleton className="h-96 rounded-[var(--radius-card)]" />}
      {data && <MatrizAhorros matriz={data} />}
    </div>
  );
}
