import type { ColumnDef } from "@/components/admin/DataTableEditor";

export interface TablaConfig {
  slug: string;
  table: string;
  label: string;
  primaryKey: string;
  orderBy?: string;
  columns: ColumnDef[];
}

export const TABLAS: TablaConfig[] = [
  {
    slug: "uvt",
    table: "uvt_rates",
    label: "UVT por año",
    primaryKey: "year",
    orderBy: "year",
    columns: [
      { key: "year", label: "Año", type: "number", editableOnCreateOnly: true },
      { key: "value_cop", label: "Valor UVT (COP)", type: "number" },
    ],
  },
  {
    slug: "retefte",
    table: "retefte_concepts",
    label: "Retención en la fuente",
    primaryKey: "id",
    orderBy: "rubro",
    columns: [
      { key: "rubro", label: "Rubro", type: "text" },
      { key: "concepto", label: "Concepto", type: "text" },
      { key: "uvt_base", label: "Base (UVT)", type: "number" },
      { key: "valor_base_cop", label: "Base (COP)", type: "number" },
      { key: "tarifa_persona_juridica", label: "Tarifa P. Jurídica", type: "number", nullable: true },
      { key: "tarifa_natural_declarante", label: "Tarifa Nat. Declarante", type: "number", nullable: true },
      { key: "tarifa_natural_no_declarante", label: "Tarifa Nat. No Declarante", type: "number", nullable: true },
      { key: "year", label: "Año", type: "number" },
    ],
  },
  {
    slug: "iva",
    table: "iva_items",
    label: "Tarifas de IVA",
    primaryKey: "id",
    orderBy: "categoria",
    columns: [
      { key: "codigo_dane", label: "Código DANE", type: "text", nullable: true },
      { key: "descripcion", label: "Descripción" , type: "text" },
      { key: "categoria", label: "Categoría", type: "text" },
      { key: "tarifa", label: "Tarifa", type: "number" },
      { key: "tipo", label: "Tipo", type: "select", options: ["gravado", "exento", "excluido"] },
      { key: "fuente", label: "Fuente", type: "text" },
    ],
  },
  {
    slug: "ica-medellin",
    table: "ica_medellin_activities",
    label: "ICA Medellín (CIIU)",
    primaryKey: "id",
    orderBy: "clase_ciiu",
    columns: [
      { key: "clase_ciiu", label: "Clase CIIU", type: "text" },
      { key: "descripcion", label: "Descripción", type: "text" },
      { key: "grupo_ica", label: "Grupo ICA", type: "text" },
      { key: "sector", label: "Sector", type: "select", options: ["Industrial", "Comercial", "Servicios", "Financiero", "Especial"] },
      { key: "tarifa_por_mil", label: "Tarifa (por mil)", type: "number" },
    ],
  },
  {
    slug: "regimenes",
    table: "tax_regimes",
    label: "Regímenes tributarios",
    primaryKey: "code",
    orderBy: "code",
    columns: [
      { key: "code", label: "Código", type: "text", editableOnCreateOnly: true },
      { key: "label", label: "Nombre", type: "text" },
      { key: "description", label: "Descripción", type: "text", nullable: true },
    ],
  },
];

export function getTablaConfig(slug: string): TablaConfig | undefined {
  return TABLAS.find((t) => t.slug === slug);
}
