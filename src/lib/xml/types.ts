import { z } from "zod";

// Categorías de ítem usadas por el categorizador IA.
// Se mantiene sincronizado con la Edge Function classify-xml-items.
export const ITEM_CATEGORIES = [
  "compra",
  "venta",
  "honorarios",
  "flete",
  "arrendamiento",
  "servicio",
  "otro",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const DOCUMENT_KINDS = [
  "factura_venta",
  "factura_compra",
  "nota_credito",
  "nota_debito",
  "nomina",
  "nomina_ajuste",
  "documento_soporte",
  "desconocido",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const partySchema = z.object({
  nit: z.string().optional(),
  nombre: z.string().optional(),
  tipo_persona: z.enum(["natural", "juridica"]).optional(),
  regimen: z.string().optional(),
});

export const taxLineSchema = z.object({
  codigo: z.string(),
  nombre: z.string(),
  porcentaje: z.number(),
  base_cop: z.number(),
  monto_cop: z.number(),
});

export const invoiceItemSchema = z.object({
  linea: z.number(),
  descripcion: z.string(),
  cantidad: z.number(),
  unidad: z.string().optional(),
  valor_unitario_cop: z.number(),
  valor_total_cop: z.number(),
  impuestos: z.array(taxLineSchema).default([]),
});

export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export const invoiceDocSchema = z.object({
  kind: z.enum(["factura_venta", "factura_compra", "nota_credito", "nota_debito", "documento_soporte"]),
  numero: z.string(),
  prefijo: z.string().optional(),
  cufe: z.string().optional(),
  fecha_emision: z.string(),
  moneda: z.string().default("COP"),
  emisor: partySchema,
  receptor: partySchema,
  items: z.array(invoiceItemSchema),
  totales: z.object({
    subtotal_cop: z.number(),
    impuestos_cop: z.number(),
    total_cop: z.number(),
  }),
  notas: z.array(z.string()).default([]),
});

export type InvoiceDoc = z.infer<typeof invoiceDocSchema>;

export const payrollDocSchema = z.object({
  kind: z.enum(["nomina", "nomina_ajuste"]),
  numero: z.string(),
  cune: z.string().optional(),
  fecha_emision: z.string(),
  periodo_inicio: z.string().optional(),
  periodo_fin: z.string().optional(),
  empleador: partySchema,
  trabajador: z.object({
    identificacion: z.string().optional(),
    nombre: z.string().optional(),
    cargo: z.string().optional(),
  }),
  totales: z.object({
    devengados_cop: z.number(),
    deducciones_cop: z.number(),
    neto_cop: z.number(),
  }),
});

export type PayrollDoc = z.infer<typeof payrollDocSchema>;

export const unknownDocSchema = z.object({
  kind: z.literal("desconocido"),
  razon: z.string(),
  raw_root: z.string().optional(),
});

export type UnknownDoc = z.infer<typeof unknownDocSchema>;

export const parsedDocSchema = z.discriminatedUnion("kind", [
  invoiceDocSchema.extend({ kind: z.literal("factura_venta") }),
  invoiceDocSchema.extend({ kind: z.literal("factura_compra") }),
  invoiceDocSchema.extend({ kind: z.literal("nota_credito") }),
  invoiceDocSchema.extend({ kind: z.literal("nota_debito") }),
  invoiceDocSchema.extend({ kind: z.literal("documento_soporte") }),
  payrollDocSchema.extend({ kind: z.literal("nomina") }),
  payrollDocSchema.extend({ kind: z.literal("nomina_ajuste") }),
  unknownDocSchema,
]);

export type ParsedDoc = z.infer<typeof parsedDocSchema>;

// Resultado completo de procesar un archivo subido (XML o ZIP con N XMLs).
export type ProcessedFile = {
  id: string;
  filename: string;
  doc: ParsedDoc;
  parsedAt: string;
};

// Categorización devuelta por la Edge Function para cada ítem.
export const categorizedItemSchema = z.object({
  linea: z.number(),
  categoria: z.enum(ITEM_CATEGORIES),
  concepto_retefte: z.string().optional(),
  tarifa_retefte_sugerida: z.number().optional(),
  justificacion: z.string(),
});

export type CategorizedItem = z.infer<typeof categorizedItemSchema>;

export const categorizeResponseSchema = z.object({
  items: z.array(categorizedItemSchema),
  resumen: z.string(),
});

export type CategorizeResponse = z.infer<typeof categorizeResponseSchema>;

// Label humano por kind — usado en UI.
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  factura_venta: "Factura de venta",
  factura_compra: "Factura de compra",
  nota_credito: "Nota crédito",
  nota_debito: "Nota débito",
  nomina: "Nómina electrónica",
  nomina_ajuste: "Ajuste de nómina",
  documento_soporte: "Documento soporte",
  desconocido: "Desconocido",
};

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  compra: "Compra",
  venta: "Venta",
  honorarios: "Honorarios",
  flete: "Flete / transporte",
  arrendamiento: "Arrendamiento",
  servicio: "Servicio",
  otro: "Otro",
};
