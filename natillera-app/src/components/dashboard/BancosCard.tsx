import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCOP } from "@/lib/natillera/format";
import type { Banco } from "@/lib/dashboard/api";

export function BancosCard({ bancos }: { bancos: Banco[] }) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="size-4 text-[var(--color-primary)]" />
          Conciliación bancaria
        </CardTitle>
        <CardDescription>
          Ingresos etiquetados como "natillera" en el extracto vs. lo total del banco.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {bancos.map((b) => (
          <div
            key={b.banco}
            className="rounded-[var(--radius-default)] border border-[var(--color-border)] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{b.banco}</span>
              <span className="text-xs text-[var(--color-muted)]">{b.n_movs} movs</span>
            </div>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Ingresos totales</dt>
                <dd className="tabular-nums">{formatCOP(b.ingresos)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted)]">Egresos totales</dt>
                <dd className="tabular-nums">{formatCOP(b.egresos)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt className="text-[var(--color-primary)]">Ingresos natillera</dt>
                <dd className="tabular-nums text-[var(--color-primary)]">
                  {formatCOP(b.ingresos_natillera)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
