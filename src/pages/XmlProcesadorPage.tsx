import { useState } from "react";
import { FileArchive, Download, Trash2, AlertCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { XmlDropzone } from "@/components/xml/XmlDropzone";
import { ProcessedDocsList } from "@/components/xml/ProcessedDocsList";
import { InvoiceDetail } from "@/components/xml/InvoiceDetail";
import { PayrollDetail } from "@/components/xml/PayrollDetail";
import { processFile } from "@/lib/xml/parser";
import { buildItemsCsv, downloadCsv } from "@/lib/xml/exportCsv";
import type { CategorizedItem, ProcessedFile } from "@/lib/xml/types";

export function XmlProcesadorPage() {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [categorizations, setCategorizations] = useState<Record<string, CategorizedItem[]>>({});

  async function handleFiles(incoming: File[]) {
    setProcessing(true);
    setProcessError(null);
    try {
      const results: ProcessedFile[] = [];
      for (const file of incoming) {
        const parsed = await processFile(file);
        results.push(...parsed);
      }
      setFiles((prev) => [...prev, ...results]);
      if (!selectedId && results[0]) setSelectedId(results[0].id);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Error procesando los archivos.");
    } finally {
      setProcessing(false);
    }
  }

  function handleClear() {
    setFiles([]);
    setSelectedId(null);
    setCategorizations({});
  }

  function handleExport() {
    const csv = buildItemsCsv(files, categorizations);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`xml-dian-${stamp}.csv`, csv);
  }

  const selected = files.find((f) => f.id === selectedId) ?? null;

  const summary = files.reduce(
    (acc, f) => {
      if (f.doc.kind === "desconocido") acc.desconocido++;
      else if (f.doc.kind === "nomina" || f.doc.kind === "nomina_ajuste") acc.nomina++;
      else acc.facturas++;
      return acc;
    },
    { facturas: 0, nomina: 0, desconocido: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)]">
          <FileArchive className="size-6 text-[var(--color-primary)]" />
          Procesador de XML DIAN
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Sube los XML descargados de DIAN (o un ZIP). Detectamos el tipo, extraemos ítems y los
          categorizamos con IA.
        </p>
      </div>

      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)] bg-amber-50/60">
        <CardContent className="flex items-start gap-3 pt-6">
          <ShieldAlert className="size-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-[var(--color-text)]">
              Descarga automática desde DIAN con certificado — próximamente
            </p>
            <p className="mt-1 text-[var(--color-muted)]">
              Por ahora los XML se cargan manualmente (desde el ZIP que descargaste del portal
              DIAN o del buzón de recepción). La integración directa con tu certificado digital se
              trabajará en una siguiente entrega porque requiere un diseño de seguridad aparte
              para custodiar el <code>.p12</code> y el PIN.
            </p>
          </div>
        </CardContent>
      </Card>

      <XmlDropzone onFiles={handleFiles} disabled={processing} />

      {processError && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-destructive)]">
          <AlertCircle className="size-4" />
          {processError}
        </p>
      )}

      {files.length > 0 && (
        <div className="space-y-4">
          <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  Documentos procesados ({files.length})
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleExport}>
                    <Download className="size-4" />
                    Exportar CSV
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleClear}>
                    <Trash2 className="size-4" />
                    Limpiar
                  </Button>
                </div>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                {summary.facturas} factura/nota · {summary.nomina} nómina
                {summary.desconocido > 0 && ` · ${summary.desconocido} no reconocido(s)`}
              </p>
            </CardHeader>
            <CardContent>
              <ProcessedDocsList
                files={files}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </CardContent>
          </Card>

          {selected && selected.doc.kind !== "desconocido" && (
            <>
              {selected.doc.kind === "nomina" || selected.doc.kind === "nomina_ajuste" ? (
                <PayrollDetail doc={selected.doc} />
              ) : (
                <InvoiceDetail
                  doc={selected.doc}
                  cachedCategorizations={categorizations[selected.id]}
                  onCategorized={(items) =>
                    setCategorizations((prev) => ({ ...prev, [selected.id]: items }))
                  }
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
