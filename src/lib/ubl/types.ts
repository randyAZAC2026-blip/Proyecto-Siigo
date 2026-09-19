import { z } from "zod";

export const documentTypeCodeSchema = z.enum([
  "01",
  "02",
  "03",
  "04",
  "05",
  "91",
  "92",
]);
export type DocumentTypeCode = z.infer<typeof documentTypeCodeSchema>;

export const documentTypeLabel: Record<DocumentTypeCode, string> = {
  "01": "Factura de venta",
  "02": "Factura de exportación",
  "03": "Factura por contingencia",
  "04": "Factura de contingencia (talonario)",
  "05": "Documento soporte",
  "91": "Nota crédito",
  "92": "Nota débito",
};

const partySchema = z.object({
  nit: z.string(),
  digito_verificacion: z.string().nullable(),
  razon_social: z.string(),
  regimen: z.string().nullable(),
  responsabilidad_fiscal: z.array(z.string()),
});
export type UblParty = z.infer<typeof partySchema>;

const taxSubtotalSchema = z.object({
  tax_id: z.string(),
  tax_name: z.string(),
  base_cop: z.number(),
  tarifa_porcentaje: z.number(),
  monto_cop: z.number(),
});
export type UblTaxSubtotal = z.infer<typeof taxSubtotalSchema>;

const invoiceLineSchema = z.object({
  linea: z.number().int().positive(),
  descripcion: z.string(),
  cantidad: z.number(),
  unidad: z.string(),
  precio_unitario_cop: z.number(),
  subtotal_cop: z.number(),
  impuestos: z.array(taxSubtotalSchema),
});
export type UblInvoiceLine = z.infer<typeof invoiceLineSchema>;

const monetaryTotalSchema = z.object({
  subtotal_cop: z.number(),
  base_impuestos_cop: z.number(),
  total_impuestos_cop: z.number(),
  total_a_pagar_cop: z.number(),
});
export type UblMonetaryTotal = z.infer<typeof monetaryTotalSchema>;

export const ublInvoiceSchema = z.object({
  numero: z.string(),
  cufe: z.string().nullable(),
  tipo_documento: documentTypeCodeSchema,
  tipo_documento_desc: z.string(),
  fecha_emision: z.string(),
  hora_emision: z.string().nullable(),
  moneda: z.string(),
  proveedor: partySchema,
  cliente: partySchema,
  lineas: z.array(invoiceLineSchema),
  impuestos: z.array(taxSubtotalSchema),
  totales: monetaryTotalSchema,
});
export type UblInvoice = z.infer<typeof ublInvoiceSchema>;
