import * as XLSX from "xlsx";
import type { CategorizedItem, ProcessedFile } from "@/lib/xml/types";
import { DOCUMENT_KIND_LABELS, ITEM_CATEGORY_LABELS } from "@/lib/xml/types";

export type FlatItemRow = {
  archivo: string;
  tipo_documento: string;
  numero: string;
  fecha_emision: string;
  cufe: string;
  emisor_nit: string;
  emisor_nombre: string;
  receptor_nit: string;
  receptor_nombre: string;
  linea: number;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valor_unitario_cop: number;
  valor_total_cop: number;
  iva_cop: number;
  categoria_ia: string;
  concepto_retefte_sugerido: string;
  tarifa_retefte_sugerida: number | "";
  retefte_sugerida_cop: number | "";
};

export function buildFlatRows(
  files: ProcessedFile[],
  categorizations: Record<string, CategorizedItem[]>,
): FlatItemRow[] {
  const rows: FlatItemRow[] = [];

  for (const file of files) {
    const doc = file.doc;
    if (doc.kind === "desconocido" || doc.kind === "nomina" || doc.kind === "nomina_ajuste") {
      continue;
    }
    const cats = categorizations[file.id] ?? [];
    const catByLine = new Map(cats.map((c) => [c.linea, c]));

    for (const item of doc.items) {
      const cat = catByLine.get(item.linea);
      const iva = item.impuestos
        .filter((t) => t.nombre.toUpperCase().includes("IVA"))
        .reduce((sum, t) => sum + t.monto_cop, 0);
      const tarifa = cat?.tarifa_retefte_sugerida;
      const retefte =
        tarifa !== undefined ? Number((item.valor_total_cop * tarifa).toFixed(0)) : "";

      rows.push({
        archivo: file.filename,
        tipo_documento: DOCUMENT_KIND_LABELS[doc.kind],
        numero: `${doc.prefijo ?? ""}${doc.numero}`,
        fecha_emision: doc.fecha_emision,
        cufe: doc.cufe ?? "",
        emisor_nit: doc.emisor.nit ?? "",
        emisor_nombre: doc.emisor.nombre ?? "",
        receptor_nit: doc.receptor.nit ?? "",
        receptor_nombre: doc.receptor.nombre ?? "",
        linea: item.linea,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        unidad: item.unidad ?? "",
        valor_unitario_cop: item.valor_unitario_cop,
        valor_total_cop: item.valor_total_cop,
        iva_cop: iva,
        categoria_ia: cat ? ITEM_CATEGORY_LABELS[cat.categoria] : "",
        concepto_retefte_sugerido: cat?.concepto_retefte ?? "",
        tarifa_retefte_sugerida: tarifa ?? "",
        retefte_sugerida_cop: retefte,
      });
    }
  }
  return rows;
}

const HEADER_LABELS: Record<keyof FlatItemRow, string> = {
  archivo: "Archivo",
  tipo_documento: "Tipo de documento",
  numero: "Número",
  fecha_emision: "Fecha emisión",
  cufe: "CUFE/CUDE",
  emisor_nit: "Emisor NIT",
  emisor_nombre: "Emisor nombre",
  receptor_nit: "Receptor NIT",
  receptor_nombre: "Receptor nombre",
  linea: "Línea",
  descripcion: "Descripción",
  cantidad: "Cantidad",
  unidad: "Unidad",
  valor_unitario_cop: "Valor unitario (COP)",
  valor_total_cop: "Valor total (COP)",
  iva_cop: "IVA (COP)",
  categoria_ia: "Categoría IA",
  concepto_retefte_sugerido: "Concepto retefte",
  tarifa_retefte_sugerida: "Tarifa retefte",
  retefte_sugerida_cop: "Retefte sugerida (COP)",
};

export function exportItemsXlsx(
  files: ProcessedFile[],
  categorizations: Record<string, CategorizedItem[]>,
  filename = `xml-dian-${new Date().toISOString().slice(0, 10)}.xlsx`,
): void {
  const rows = buildFlatRows(files, categorizations);
  const headerKeys = Object.keys(HEADER_LABELS) as Array<keyof FlatItemRow>;
  const aoa: (string | number)[][] = [headerKeys.map((k) => HEADER_LABELS[k])];
  for (const row of rows) {
    aoa.push(headerKeys.map((k) => row[k] as string | number));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Formato de columnas numéricas COP — Excel aplica el formato de celda
  // sólo si lo marcamos. Convertir las columnas de montos a tipo numérico.
  const moneyCols = new Set([
    "valor_unitario_cop",
    "valor_total_cop",
    "iva_cop",
    "retefte_sugerida_cop",
  ]);
  for (let r = 1; r < aoa.length; r++) {
    for (let c = 0; c < headerKeys.length; c++) {
      if (moneyCols.has(headerKeys[c]) && typeof aoa[r][c] === "number") {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].z = '"$"#,##0';
      }
      if (headerKeys[c] === "tarifa_retefte_sugerida" && typeof aoa[r][c] === "number") {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].z = "0.00%";
      }
    }
  }
  ws["!cols"] = headerKeys.map((k) => ({
    wch:
      k === "descripcion"
        ? 40
        : k === "emisor_nombre" || k === "receptor_nombre" || k === "archivo"
          ? 28
          : k === "cufe"
            ? 20
            : k === "categoria_ia" || k === "concepto_retefte_sugerido"
              ? 22
              : 14,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ítems XML DIAN");
  XLSX.writeFile(wb, filename);
}
