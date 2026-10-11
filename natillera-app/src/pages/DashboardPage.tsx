import { RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/dashboard/useApi";
import { api } from "@/lib/dashboard/api";
import { KpiTiles } from "@/components/dashboard/KpiTiles";

const API_URL = import.meta.env.VITE_NAT_API || "http://localhost:4000";

interface Props {
  onVolver: () => void;
  onIr: (vista: string) => void;
}

export function DashboardPage({ onVolver: _onVolver, onIr: _onIr }: Props) {
  const resumen = useApi(() => api.resumen());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Panel principal
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Indicadores del ciclo actual y accesos rápidos a cada módulo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => resumen.reload()} disabled={resumen.loading}>
          <RefreshCw className={`size-4 ${resumen.loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {resumen.error && (
        <div className="flex items-start gap-2 rounded-[var(--radius-default)] border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-4">
          <AlertCircle className="size-5 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-[var(--color-destructive)]">
              No se pudo conectar al backend
            </p>
            <p className="text-[var(--color-muted)] mt-1">
              Verifica que el servidor esté corriendo en <code>{API_URL}</code>. En otra
              terminal:
            </p>
            <pre className="mt-2 rounded bg-[var(--color-muted)]/20 p-2 text-xs">
              cd natillera-backend{"\n"}pnpm dev
            </pre>
            <p className="text-xs mt-2 text-[var(--color-destructive)]">{resumen.error}</p>
          </div>
        </div>
      )}

      {resumen.loading && !resumen.data && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />
          ))}
        </div>
      )}

      {resumen.data && <KpiTiles resumen={resumen.data} />}
    </div>
  );
}
