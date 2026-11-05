import { useState } from "react";
import { FileArchive, Download, Trash2, AlertCircle, FileSpreadsheet, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { XmlDropzone } from "@/components/xml/XmlDropzone";
import { ProcessedDocsList } from "@/components/xml/ProcessedDocsList";
import { InvoiceDetail } from "@/components/xml/InvoiceDetail";
import { PayrollDetail } from "@/components/xml/PayrollDetail";
import { ItemsConsolidatedTable } from "@/components/xml/ItemsConsolidatedTable";
import { processFile } from "@/lib/xml/parser";
import { buildItemsCsv, downloadCsv } from "@/lib/xml/exportCsv";
import { exportItemsXlsx } from "@/lib/xml/exportExcel";
import { classifyXmlItems } from "@/lib/api/classifyXmlItems";
import type { CategorizedItem, ProcessedFile } from "@/lib/xml/types";

export function XmlProcesadorPage() {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [categorizations, setCategorizations] = useState<Record<string, CategorizedItem[]>>({});
  const [bulkCategorizing, setBulkCategorizing] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

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
    setBulkError(null);
  }

  function handleExportCsv() {
    const csv = buildItemsCsv(files, categorizations);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`xml-dian-${stamp}.csv`, csv);
  }

  function handleExportXlsx() {
    exportItemsXlsx(files, categorizations);
  }

  async function handleCategorizeAll(mi_rol: "emisor" | "receptor") {
    const pendientes = files.filter((f) => {
      const d = f.doc;
      if (d.kind === "desconocido" || d.kind === "nomina" || d.kind === "nomina_ajuste") return false;
      return !categorizations[f.id];
    });
    if (pendientes.length === 0) return;

    setBulkCategorizing(true);
    setBulkError(null);
    setBulkProgress({ done: 0, total: pendientes.length });
    try {
      for (let i = 0; i < pendientes.length; i++) {
        const f = pendientes[i];
        const d = f.doc;
        if (d.kind === "desconocido" || d.kind === "nomina" || d.kind === "nomina_ajuste") continue;
        const resp = await classifyXmlItems({
          kind: d.kind,
          mi_rol,
          emisor_nombre: d.emisor.nombre,
          receptor_nombre: d.receptor.nombre,
          items: d.items.map((it) => ({
            linea: it.linea,
            descripcion: it.descripcion,
            valor_total_cop: it.valor_total_cop,
          })),
        });
        setCategorizations((prev) => ({ ...prev, [f.id]: resp.items }));
        setBulkProgress({ done: i + 1, total: pendientes.length });
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Error categorizando.");
    } finally {
      setBulkCategorizing(false);
    }
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

  const pendientesCategorizar = files.filter((f) => {
    const d = f.doc;
    if (d.kind === "desconocido" || d.kind === "nomina" || d.kind === "nomina_ajuste") return false;
    return !categorizations[f.id];
  }).length;

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

      <XmlDropzone onFiles={handleFiles} disabled={processing} />

      {processError && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-destructive)]">
          <AlertCircle className="size-4" />
          {processError}
        </p>
      )}

      {files.length > 0 && (
        <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Documentos procesados ({files.length})
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleExportXlsx}>
                  <FileSpreadsheet className="size-4" />
                  Exportar Excel
                </Button>
                <Button size="sm" variant="ghost" onClick={handleExportCsv}>
                  <Download className="size-4" />
                  CSV
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

            {pendientesCategorizar > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-default)] bg-[var(--color-primary)]/5 p-3">
                <Sparkles className="size-4 text-[var(--color-primary)]" />
                <span className="text-sm text-[var(--color-text)]">
                  {pendientesCategorizar} documento{pendientesCategorizar === 1 ? "" : "s"} sin categorizar.
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkCategorizing}
                    onClick={() => handleCategorizeAll("receptor")}
                  >
                    {bulkCategorizing && <Loader2 className="size-3 animate-spin" />}
                    Soy receptor
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkCategorizing}
                    onClick={() => handleCategorizeAll("emisor")}
                  >
                    {bulkCategorizing && <Loader2 className="size-3 animate-spin" />}
                    Soy emisor
                  </Button>
                </div>
                {bulkProgress && bulkCategorizing && (
                  <p className="w-full text-xs text-[var(--color-muted)]">
                    Procesando {bulkProgress.done} / {bulkProgress.total}…
                  </p>
                )}
              </div>
            )}
            {bulkError && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--color-destructive)]">
                <AlertCircle className="size-4" />
                {bulkError}
              </p>
            )}
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="lista">
              <TabsList>
                <TabsTrigger value="lista">Lista de ítems</TabsTrigger>
                <TabsTrigger value="documentos">Por documento</TabsTrigger>
              </TabsList>

              <TabsContent value="lista" className="mt-4">
                <ItemsConsolidatedTable files={files} categorizations={categorizations} />
              </TabsContent>

              <TabsContent value="documentos" className="mt-4 space-y-4">
                <ProcessedDocsList
                  files={files}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
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
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
