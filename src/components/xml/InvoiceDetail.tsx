import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { classifyXmlItems } from "@/lib/api/classifyXmlItems";
import {
  DOCUMENT_KIND_LABELS,
  ITEM_CATEGORY_LABELS,
  type CategorizedItem,
  type InvoiceDoc,
  type ItemCategory,
} from "@/lib/xml/types";

type Props = {
  doc: InvoiceDoc;
  cachedCategorizations?: CategorizedItem[];
  onCategorized: (items: CategorizedItem[]) => void;
};

const formatCop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const categoryColor: Record<ItemCategory, string> = {
  compra: "bg-blue-100 text-blue-800",
  venta: "bg-green-100 text-green-800",
  honorarios: "bg-purple-100 text-purple-800",
  flete: "bg-amber-100 text-amber-800",
  arrendamiento: "bg-pink-100 text-pink-800",
  servicio: "bg-slate-100 text-slate-800",
  otro: "bg-gray-100 text-gray-800",
};

export function InvoiceDetail({ doc, cachedCategorizations, onCategorized }: Props) {
  const mutation = useMutation({
    mutationFn: classifyXmlItems,
    onSuccess: (data) => onCategorized(data.items),
  });

  const catByLine = useMemo(() => {
    const map = new Map<number, CategorizedItem>();
    (cachedCategorizations ?? []).forEach((c) => map.set(c.linea, c));
    return map;
  }, [cachedCategorizations]);

  function handleCategorize(mi_rol: "emisor" | "receptor") {
    mutation.mutate({
      kind: doc.kind,
      mi_rol,
      emisor_nombre: doc.emisor.nombre,
      receptor_nombre: doc.receptor.nombre,
      items: doc.items.map((i) => ({
        linea: i.linea,
        descripcion: i.descripcion,
        valor_total_cop: i.valor_total_cop,
      })),
    });
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[var(--radius-card)] border-[var(--color-border)]">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {DOCUMENT_KIND_LABELS[doc.kind]} {doc.prefijo}
                {doc.numero}
              </CardTitle>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Emitida el {doc.fecha_emision}
                {doc.cufe && ` · CUFE ${doc.cufe.slice(0, 16)}…`}
              </p>
            </div>
            <span className="text-lg font-semibold tabular-nums text-[var(--color-text)]">
              {formatCop.format(doc.totales.total_cop)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-[var(--color-muted)]">Emisor</p>
            <p className="text-sm text-[var(--color-text)]">{doc.emisor.nombre ?? "—"}</p>
            <p className="text-xs text-[var(--color-muted)]">NIT {doc.emisor.nit ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-[var(--color-muted)]">Receptor</p>
            <p className="text-sm text-[var(--color-text)]">{doc.receptor.nombre ?? "—"}</p>
            <p className="text-xs text-[var(--color-muted)]">NIT {doc.receptor.nit ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--color-muted)]">Categorizar ítems como:</span>
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => handleCategorize("emisor")}
        >
          <Sparkles className="size-4" />
          Soy el emisor (venta)
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => handleCategorize("receptor")}
        >
          <Sparkles className="size-4" />
          Soy el receptor (compra)
        </Button>
        {mutation.isPending && (
          <Loader2 className="size-4 animate-spin text-[var(--color-primary)]" />
        )}
      </div>

      {mutation.isError && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-destructive)]">
          <AlertCircle className="size-4" />
          {(mutation.error as Error).message}
        </p>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-muted)]/10 text-xs uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Descripción</th>
              <th className="px-3 py-2 text-right">Cant.</th>
              <th className="px-3 py-2 text-right">V. Unit</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Categoría IA</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item) => {
              const cat = catByLine.get(item.linea);
              return (
                <tr key={item.linea} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 text-[var(--color-muted)]">{item.linea}</td>
                  <td className="px-3 py-2 text-[var(--color-text)]">
                    {item.descripcion}
                    {cat?.justificacion && (
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{cat.justificacion}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.cantidad}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCop.format(item.valor_unitario_cop)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatCop.format(item.valor_total_cop)}
                  </td>
                  <td className="px-3 py-2">
                    {cat ? (
                      <div className="flex flex-col gap-1">
                        <Badge className={`w-fit ${categoryColor[cat.categoria]}`}>
                          {ITEM_CATEGORY_LABELS[cat.categoria]}
                        </Badge>
                        {cat.concepto_retefte && (
                          <span className="text-xs text-[var(--color-muted)]">
                            {cat.concepto_retefte}
                            {cat.tarifa_retefte_sugerida !== undefined &&
                              ` · ${(cat.tarifa_retefte_sugerida * 100).toFixed(2)}%`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Esta herramienta es orientativa, no reemplaza asesoría contable formal.
      </p>
    </div>
  );
}
