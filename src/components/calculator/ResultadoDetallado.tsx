import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { IvaResultCard } from "@/components/calculator/IvaResultCard";
import { RetefteResultCard } from "@/components/calculator/RetefteResultCard";
import { IcaResultCard } from "@/components/calculator/IcaResultCard";
import type { ClassificationResolved } from "@/lib/types/tax";

export function ResultadoDetallado({ result }: { result: ClassificationResolved }) {
  return (
    <div className="space-y-4">
      <Card className="rounded-[var(--radius-card)] border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5">
        <CardContent className="py-4">
          <p className="text-sm leading-relaxed text-[var(--color-text)]">{result.resumen}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <IvaResultCard iva={result.iva} />
        <RetefteResultCard retefte={result.retefte} />
        <IcaResultCard ica={result.ica} />
      </div>

      <div className="flex items-start gap-2 rounded-[var(--radius-default)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <Info className="size-4 shrink-0 text-[var(--color-muted)] mt-0.5" />
        <p className="text-xs text-[var(--color-muted)]">
          Esta herramienta es orientativa, no reemplaza asesoría contable formal. Para operaciones de
          alto valor o casos complejos, valida el resultado con un contador.
        </p>
      </div>
    </div>
  );
}
