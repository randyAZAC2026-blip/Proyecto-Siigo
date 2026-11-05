import type { CategorizedItem, ProcessedFile } from "@/lib/xml/types";
import { buildFlatRows, type FlatItemRow } from "@/lib/xml/exportExcel";

function escape(value: string | number | undefined | null): string {
  if (value === null || value === undefined || value === "") return "";
  const str = String(value);
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildItemsCsv(
  files: ProcessedFile[],
  categorizations: Record<string, CategorizedItem[]>,
): string {
  const rows = buildFlatRows(files, categorizations);
  const keys = Object.keys(rows[0] ?? {}) as Array<keyof FlatItemRow>;
  const fallbackKeys: Array<keyof FlatItemRow> = [
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
    "retefte_sugerida_cop",
  ];
  const header = (keys.length ? keys : fallbackKeys) as Array<keyof FlatItemRow>;
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((k) => escape(row[k])).join(","));
  }
  return lines.join("\n");
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
