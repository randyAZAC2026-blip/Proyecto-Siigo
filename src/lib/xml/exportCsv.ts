import type { CategorizedItem, ProcessedFile } from "@/lib/xml/types";

function escape(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildItemsCsv(
  files: ProcessedFile[],
  categorizations: Record<string, CategorizedItem[]>,
): string {
  const headers = [
    "archivo",
    "tipo_documento",
    "numero",
    "fecha_emision",
    "cufe",
    "emisor_nit",
    "emisor_nombre",
    "receptor_nit",
    "receptor_nombre",
    "linea",
    "descripcion",
    "cantidad",
    "unidad",
    "valor_unitario_cop",
    "valor_total_cop",
    "iva_cop",
    "categoria_ia",
    "concepto_retefte_sugerido",
    "tarifa_retefte_sugerida",
  ];

  const rows: string[] = [headers.join(",")];

  for (const file of files) {
    if (file.doc.kind === "desconocido" || file.doc.kind === "nomina" || file.doc.kind === "nomina_ajuste") {
      continue;
    }
    const cats = categorizations[file.id] ?? [];
    const catByLine = new Map(cats.map((c) => [c.linea, c]));

    for (const item of file.doc.items) {
      const cat = catByLine.get(item.linea);
      const iva = item.impuestos
        .filter((t) => t.nombre.toUpperCase().includes("IVA"))
        .reduce((sum, t) => sum + t.monto_cop, 0);
      rows.push(
        [
          escape(file.filename),
          escape(file.doc.kind),
          escape(`${file.doc.prefijo ?? ""}${file.doc.numero}`),
          escape(file.doc.fecha_emision),
          escape(file.doc.cufe ?? ""),
          escape(file.doc.emisor.nit ?? ""),
          escape(file.doc.emisor.nombre ?? ""),
          escape(file.doc.receptor.nit ?? ""),
          escape(file.doc.receptor.nombre ?? ""),
          escape(item.linea),
          escape(item.descripcion),
          escape(item.cantidad),
          escape(item.unidad ?? ""),
          escape(item.valor_unitario_cop),
          escape(item.valor_total_cop),
          escape(iva),
          escape(cat?.categoria ?? ""),
          escape(cat?.concepto_retefte ?? ""),
          escape(cat?.tarifa_retefte_sugerida ?? ""),
        ].join(","),
      );
    }
  }

  return rows.join("\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
