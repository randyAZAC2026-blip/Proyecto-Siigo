import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCOP, formatPercent } from "@/lib/utils";
import type { ClassificationResolved } from "@/lib/types/tax";

export function RetefteResultCard({ retefte }: { retefte: ClassificationResolved["retefte"] }) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Landmark className="size-4 text-[var(--color-primary)]" />
            Retención en la fuente
          </span>
          <Badge variant={retefte.aplica ? "default" : "secondary"} className={retefte.aplica ? "bg-[var(--color-primary)]" : ""}>
            {retefte.aplica ? "Aplica" : "No aplica"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--color-muted)]">Concepto</span>
          <span className="text-sm font-medium text-right">{retefte.concepto}</span>
        </div>
        {retefte.aplica && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[var(--color-muted)]">Tarifa</span>
              <span className="text-lg font-semibold">{formatPercent(retefte.tarifa)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[var(--color-muted)]">Valor a retener</span>
              <span className="text-lg font-semibold text-[var(--color-primary)]">
                {formatCOP(retefte.monto_cop)}
              </span>
            </div>
          </>
        )}
        {!retefte.aplica && (
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-[var(--color-muted)]">Base mínima</span>
            <span className="text-sm font-medium">{formatCOP(retefte.base_minima_cop)}</span>
          </div>
        )}
        <p className="text-sm text-[var(--color-muted)] pt-1">{retefte.justificacion}</p>
      </CardContent>
    </Card>
  );
}
