import { AlertCircle, RefreshCw, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/dashboard/api";
import { useApi } from "@/lib/dashboard/useApi";
import { LiquidacionCard } from "@/components/dashboard/LiquidacionCard";

export function LiquidacionPage({ onVolver }: { onVolver: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.liquidacion(), []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3" data-print="hide">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Liquidación estimada
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Utilidad total (intereses + multas + rifas) repartida proporcional al ahorro
            individual. Si cerramos el ciclo hoy, cada socio recibiría el "neto a pagar".
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            Imprimir / PDF
          </Button>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={onVolver}>
            ← Volver
          </Button>
        </div>
      </div>

      <div data-print="header">
        <h1>Liquidación estimada — Natillera</h1>
        <p>Corte: {new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3">
          <AlertCircle className="size-4 text-[var(--color-destructive)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        </div>
      )}

      {loading && !data && <Skeleton className="h-96 rounded-[var(--radius-card)]" />}
      {data && <LiquidacionCard filas={data} />}
    </div>
  );
}
