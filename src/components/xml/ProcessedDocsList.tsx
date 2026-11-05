import { FileText, AlertCircle, ChevronRight } from "lucide-react";
import { DOCUMENT_KIND_LABELS, type ProcessedFile } from "@/lib/xml/types";

type Props = {
  files: ProcessedFile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const formatCop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function ProcessedDocsList({ files, selectedId, onSelect }: Props) {
  if (files.length === 0) return null;

  return (
    <div className="divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {files.map((file) => {
        const isSelected = selectedId === file.id;
        const doc = file.doc;

        let subtitle = DOCUMENT_KIND_LABELS[doc.kind];
        let amount: number | null = null;

        if (doc.kind === "desconocido") {
          subtitle += ` · ${doc.razon}`;
        } else if (doc.kind === "nomina" || doc.kind === "nomina_ajuste") {
          if (doc.periodo_inicio) subtitle += ` · ${doc.periodo_inicio} → ${doc.periodo_fin ?? ""}`;
          amount = doc.totales.neto_cop;
        } else {
          subtitle += ` · ${doc.prefijo ?? ""}${doc.numero} · ${doc.fecha_emision}`;
          amount = doc.totales.total_cop;
        }

        return (
          <button
            key={file.id}
            onClick={() => onSelect(file.id)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-primary)]/5 ${
              isSelected ? "bg-[var(--color-primary)]/10" : ""
            }`}
          >
            {doc.kind === "desconocido" ? (
              <AlertCircle className="size-5 shrink-0 text-[var(--color-destructive)]" />
            ) : (
              <FileText className="size-5 shrink-0 text-[var(--color-primary)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">
                {file.filename}
              </p>
              <p className="truncate text-xs text-[var(--color-muted)]">{subtitle}</p>
            </div>
            {amount !== null && (
              <span className="hidden text-sm font-medium tabular-nums text-[var(--color-text)] sm:inline">
                {formatCop.format(amount)}
              </span>
            )}
            <ChevronRight className="size-4 shrink-0 text-[var(--color-muted)]" />
          </button>
        );
      })}
    </div>
  );
}
