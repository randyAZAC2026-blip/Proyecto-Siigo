import { Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCOP, formatPercent } from "@/lib/utils";
import type { ClassificationResolved } from "@/lib/types/tax";

const TIPO_LABEL: Record<string, string> = {
  gravado: "Gravado",
  exento: "Exento",
  excluido: "Excluido",
};

export function IvaResultCard({ iva }: { iva: ClassificationResolved["iva"] }) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Receipt className="size-4 text-[var(--color-primary)]" />
            IVA
          </span>
          <Badge variant="outline">{TIPO_LABEL[iva.tipo] ?? iva.tipo}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--color-muted)]">Tarifa</span>
          <span className="text-lg font-semibold">{formatPercent(iva.tarifa)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--color-muted)]">Valor a cobrar</span>
          <span className="text-lg font-semibold text-[var(--color-primary)]">
            {formatCOP(iva.monto_cop)}
          </span>
        </div>
        <p className="text-sm text-[var(--color-muted)] pt-1">{iva.justificacion}</p>
      </CardContent>
    </Card>
  );
}
