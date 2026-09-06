import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { BancosCard } from "@/components/dashboard/BancosCard";

export function ConciliacionPage({ onVolver }: { onVolver: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.bancos(), []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Conciliación bancaria
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Totales por banco separando lo etiquetado como NATILLERA de lo personal.
            Para conciliar movimiento por movimiento, ve a <strong>Extracto</strong>.
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

      {loading && !data && <Skeleton className="h-40 rounded-[var(--radius-card)]" />}
      {data && <BancosCard bancos={data} />}
    </div>
  );
}
