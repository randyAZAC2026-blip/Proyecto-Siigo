import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOCUMENT_KIND_LABELS, type PayrollDoc } from "@/lib/xml/types";

type Props = { doc: PayrollDoc };

const formatCop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function PayrollDetail({ doc }: Props) {
  return (
    <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
      <CardHeader>
        <CardTitle className="text-base">
          {DOCUMENT_KIND_LABELS[doc.kind]} #{doc.numero}
        </CardTitle>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Periodo {doc.periodo_inicio ?? "—"} → {doc.periodo_fin ?? "—"}
          {doc.cune && ` · CUNE ${doc.cune.slice(0, 16)}…`}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase text-[var(--color-muted)]">Empleador</p>
          <p className="text-sm text-[var(--color-text)]">{doc.empleador.nombre ?? "—"}</p>
          <p className="text-xs text-[var(--color-muted)]">NIT {doc.empleador.nit ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-[var(--color-muted)]">Trabajador</p>
          <p className="text-sm text-[var(--color-text)]">{doc.trabajador.nombre ?? "—"}</p>
          <p className="text-xs text-[var(--color-muted)]">CC {doc.trabajador.identificacion ?? "—"}</p>
          {doc.trabajador.cargo && (
            <p className="text-xs text-[var(--color-muted)]">Cargo: {doc.trabajador.cargo}</p>
          )}
        </div>
        <div className="sm:col-span-2 grid gap-3 rounded-[var(--radius-default)] bg-[var(--color-muted)]/10 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-[var(--color-muted)]">Devengados</p>
            <p className="text-base font-semibold tabular-nums text-[var(--color-text)]">
              {formatCop.format(doc.totales.devengados_cop)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Deducciones</p>
            <p className="text-base font-semibold tabular-nums text-[var(--color-destructive)]">
              {formatCop.format(doc.totales.deducciones_cop)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Neto</p>
            <p className="text-base font-semibold tabular-nums text-[var(--color-primary)]">
              {formatCop.format(doc.totales.neto_cop)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
