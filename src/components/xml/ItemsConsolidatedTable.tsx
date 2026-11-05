import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DOCUMENT_KIND_LABELS,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  type CategorizedItem,
  type ItemCategory,
  type ProcessedFile,
} from "@/lib/xml/types";

type Props = {
  files: ProcessedFile[];
  categorizations: Record<string, CategorizedItem[]>;
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

type Row = {
  key: string;
  documento: string;
  tipo: string;
  fecha: string;
  emisor: string;
  receptor: string;
  linea: number;
  descripcion: string;
  cantidad: number;
  valorTotal: number;
  categoria?: ItemCategory;
  concepto?: string;
  tarifa?: number;
};

export function ItemsConsolidatedTable({ files, categorizations }: Props) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory | "todas" | "sin_categorizar">(
    "todas",
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const file of files) {
      const doc = file.doc;
      if (doc.kind === "desconocido" || doc.kind === "nomina" || doc.kind === "nomina_ajuste") {
        continue;
      }
      const cats = categorizations[file.id] ?? [];
      const catByLine = new Map(cats.map((c) => [c.linea, c]));
      for (const item of doc.items) {
        const cat = catByLine.get(item.linea);
        out.push({
          key: `${file.id}-${item.linea}`,
          documento: `${doc.prefijo ?? ""}${doc.numero}`,
          tipo: DOCUMENT_KIND_LABELS[doc.kind],
          fecha: doc.fecha_emision,
          emisor: doc.emisor.nombre ?? doc.emisor.nit ?? "—",
          receptor: doc.receptor.nombre ?? doc.receptor.nit ?? "—",
          linea: item.linea,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          valorTotal: item.valor_total_cop,
          categoria: cat?.categoria,
          concepto: cat?.concepto_retefte,
          tarifa: cat?.tarifa_retefte_sugerida,
        });
      }
    }
    return out;
  }, [files, categorizations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter === "sin_categorizar" && r.categoria) return false;
      if (
        categoryFilter !== "todas" &&
        categoryFilter !== "sin_categorizar" &&
        r.categoria !== categoryFilter
      )
        return false;
      if (!q) return true;
      return (
        r.descripcion.toLowerCase().includes(q) ||
        r.documento.toLowerCase().includes(q) ||
        r.emisor.toLowerCase().includes(q) ||
        r.receptor.toLowerCase().includes(q)
      );
    });
  }, [rows, query, categoryFilter]);

  const totalesPorCategoria = useMemo(() => {
    const acc = new Map<ItemCategory, { count: number; monto: number }>();
    for (const r of filtered) {
      if (!r.categoria) continue;
      const cur = acc.get(r.categoria) ?? { count: 0, monto: 0 };
      cur.count += 1;
      cur.monto += r.valorTotal;
      acc.set(r.categoria, cur);
    }
    return acc;
  }, [filtered]);

  const totalMonto = filtered.reduce((sum, r) => sum + r.valorTotal, 0);

  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-muted)]">
        No hay ítems para mostrar. Sólo facturas, notas y documentos soporte aparecen aquí (la
        nómina y los XML no reconocidos se omiten).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <Input
            placeholder="Buscar en descripción, # factura, emisor o receptor"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          className="h-9 rounded-[var(--radius-default)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]"
        >
          <option value="todas">Todas las categorías</option>
          <option value="sin_categorizar">Sin categorizar</option>
          {ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ITEM_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
        <span>
          {filtered.length} de {rows.length} ítems · {formatCop.format(totalMonto)}
        </span>
        {Array.from(totalesPorCategoria.entries()).map(([cat, data]) => (
          <span key={cat} className="flex items-center gap-1">
            · <Badge className={`${categoryColor[cat]} text-[10px]`}>{ITEM_CATEGORY_LABELS[cat]}</Badge>
            {data.count} · {formatCop.format(data.monto)}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-muted)]/10 text-xs uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Documento</th>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Emisor → Receptor</th>
              <th className="px-3 py-2 text-left">Descripción</th>
              <th className="px-3 py-2 text-right">Cant.</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Categoría IA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.key} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2">
                  <p className="font-medium text-[var(--color-text)]">{r.documento}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {r.tipo} · línea {r.linea}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted)] tabular-nums">
                  {r.fecha}
                </td>
                <td className="px-3 py-2 text-xs">
                  <p className="text-[var(--color-text)]">{r.emisor}</p>
                  <p className="text-[var(--color-muted)]">→ {r.receptor}</p>
                </td>
                <td className="px-3 py-2 text-[var(--color-text)]">{r.descripcion}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.cantidad}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatCop.format(r.valorTotal)}
                </td>
                <td className="px-3 py-2">
                  {r.categoria ? (
                    <div className="flex flex-col gap-1">
                      <Badge className={`w-fit ${categoryColor[r.categoria]}`}>
                        {ITEM_CATEGORY_LABELS[r.categoria]}
                      </Badge>
                      {r.concepto && (
                        <span className="text-[10px] text-[var(--color-muted)]">
                          {r.concepto}
                          {r.tarifa !== undefined && ` · ${(r.tarifa * 100).toFixed(2)}%`}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
