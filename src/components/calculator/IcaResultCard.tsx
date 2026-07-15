import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCOP } from "@/lib/utils";
import type { ClassificationResolved } from "@/lib/types/tax";

export function IcaResultCard({ ica }: { ica: ClassificationResolved["ica"] }) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Building2 className="size-4 text-[var(--color-primary)]" />
            ICA (Medellín)
          </span>
          <Badge variant={ica.aplica ? "default" : "secondary"} className={ica.aplica ? "bg-[var(--color-primary)]" : ""}>
            {ica.aplica ? "Aplica" : "No aplica"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--color-muted)]">Clase CIIU</span>
          <span className="text-sm font-medium">{ica.clase_ciiu}</span>
        </div>
        {ica.aplica && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[var(--color-muted)]">Tarifa</span>
              <span className="text-lg font-semibold">{ica.tarifa_por_mil} por mil</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[var(--color-muted)]">Valor a pagar</span>
              <span className="text-lg font-semibold text-[var(--color-primary)]">
                {formatCOP(ica.monto_cop)}
              </span>
            </div>
          </>
        )}
        <p className="text-sm text-[var(--color-muted)] pt-1">{ica.justificacion}</p>
      </CardContent>
    </Card>
  );
}
