import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  documentTypeLabel,
  ublInvoiceSchema,
  type DocumentTypeCode,
  type UblInvoice,
  type UblInvoiceLine,
  type UblParty,
  type UblTaxSubtotal,
} from "@/lib/ubl/types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type XmlNode = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function pickString(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const record = node as XmlNode;
    if (typeof record["#text"] === "string") return record["#text"] as string;
    if (typeof record["#text"] === "number") return String(record["#text"]);
  }
  return "";
}

function pickNumber(node: unknown): number {
  const raw = pickString(node);
  if (raw === "") return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickAttr(node: unknown, attr: string): string | null {
  if (node == null || typeof node !== "object") return null;
  const value = (node as XmlNode)[`@_${attr}`];
  return typeof value === "string" ? value : null;
}

export class UblParseError extends Error {
  detail?: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "UblParseError";
    this.detail = detail;
  }
}

function parseParty(partyNode: unknown): UblParty {
  const party = (partyNode as XmlNode | undefined)?.["Party"] as XmlNode | undefined;
  const legalEntity = party?.["PartyLegalEntity"] as XmlNode | undefined;
  const taxScheme = party?.["PartyTaxScheme"] as XmlNode | undefined;
  const identification = party?.["PartyIdentification"] as XmlNode | undefined;

  const nit = pickString(identification?.["ID"]) || pickString(taxScheme?.["CompanyID"]);
  const digitoVerificacion =
    pickAttr(identification?.["ID"], "schemeID") ??
    pickAttr(taxScheme?.["CompanyID"], "schemeID");

  const razonSocial =
    pickString(legalEntity?.["RegistrationName"]) ||
    pickString(taxScheme?.["RegistrationName"]);

  const regimen =
    pickString(taxScheme?.["TaxScheme"] && (taxScheme["TaxScheme"] as XmlNode)["Name"]) || null;

  const responsabilidad = asArray(taxScheme?.["TaxLevelCode"])
    .map((node) => pickString(node))
    .filter((value) => value.length > 0);

  return {
    nit,
    digito_verificacion: digitoVerificacion,
    razon_social: razonSocial,
    regimen: regimen || null,
    responsabilidad_fiscal: responsabilidad,
  };
}

function parseTaxSubtotals(taxTotalNode: unknown): UblTaxSubtotal[] {
  const totals = asArray(taxTotalNode) as XmlNode[];
  const subtotals: UblTaxSubtotal[] = [];
  for (const total of totals) {
    const subs = asArray(total?.["TaxSubtotal"]) as XmlNode[];
    for (const sub of subs) {
      const category = sub?.["TaxCategory"] as XmlNode | undefined;
      const scheme = category?.["TaxScheme"] as XmlNode | undefined;
      subtotals.push({
        tax_id: pickString(scheme?.["ID"]),
        tax_name: pickString(scheme?.["Name"]),
        base_cop: pickNumber(sub?.["TaxableAmount"]),
        tarifa_porcentaje: pickNumber(category?.["Percent"]),
        monto_cop: pickNumber(sub?.["TaxAmount"]),
      });
    }
  }
  return subtotals;
}

function parseLines(root: XmlNode): UblInvoiceLine[] {
  const lineKey = root["InvoiceLine"] ? "InvoiceLine" : "CreditNoteLine";
  const rawLines = asArray(root[lineKey]) as XmlNode[];
  return rawLines.map((line, index) => {
    const item = line["Item"] as XmlNode | undefined;
    const price = line["Price"] as XmlNode | undefined;
    const quantityNode =
      line["InvoicedQuantity"] ?? line["CreditedQuantity"] ?? line["Quantity"];
    return {
      linea: Number(pickString(line["ID"])) || index + 1,
      descripcion: pickString(item?.["Description"]) || pickString(item?.["Name"]),
      cantidad: pickNumber(quantityNode),
      unidad: pickAttr(quantityNode, "unitCode") ?? "NIU",
      precio_unitario_cop: pickNumber(price?.["PriceAmount"]),
      subtotal_cop: pickNumber(line["LineExtensionAmount"]),
      impuestos: parseTaxSubtotals(line["TaxTotal"]),
    };
  });
}

function normalizeDocumentType(code: string): DocumentTypeCode {
  const known: DocumentTypeCode[] = ["01", "02", "03", "04", "05", "91", "92"];
  return (known.find((valid) => valid === code) ?? "01") as DocumentTypeCode;
}

export function parseUblInvoice(xml: string): UblInvoice {
  if (typeof xml !== "string" || xml.trim() === "") {
    throw new UblParseError("El XML está vacío.");
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new UblParseError("XML mal formado.", validation);
  }

  let parsed: XmlNode;
  try {
    parsed = xmlParser.parse(xml) as XmlNode;
  } catch (err) {
    throw new UblParseError("XML mal formado.", err);
  }

  const root = (parsed["Invoice"] ?? parsed["CreditNote"] ?? parsed["DebitNote"]) as
    | XmlNode
    | undefined;
  if (!root) {
    throw new UblParseError(
      "No se encontró Invoice, CreditNote ni DebitNote como raíz del documento.",
    );
  }

  const totals = root["LegalMonetaryTotal"] as XmlNode | undefined;
  const impuestos = parseTaxSubtotals(root["TaxTotal"]);
  const totalImpuestos = impuestos.reduce((acc, item) => acc + item.monto_cop, 0);

  const tipo = normalizeDocumentType(pickString(root["InvoiceTypeCode"]) || "01");

  const invoice: UblInvoice = {
    numero: pickString(root["ID"]),
    cufe: pickString(root["UUID"]) || null,
    tipo_documento: tipo,
    tipo_documento_desc: documentTypeLabel[tipo],
    fecha_emision: pickString(root["IssueDate"]),
    hora_emision: pickString(root["IssueTime"]) || null,
    moneda: pickString(root["DocumentCurrencyCode"]) || "COP",
    proveedor: parseParty(root["AccountingSupplierParty"]),
    cliente: parseParty(root["AccountingCustomerParty"]),
    lineas: parseLines(root),
    impuestos,
    totales: {
      subtotal_cop: pickNumber(totals?.["LineExtensionAmount"]),
      base_impuestos_cop: pickNumber(totals?.["TaxExclusiveAmount"]),
      total_impuestos_cop: totalImpuestos,
      total_a_pagar_cop: pickNumber(totals?.["PayableAmount"]),
    },
  };

  const result = ublInvoiceSchema.safeParse(invoice);
  if (!result.success) {
    throw new UblParseError("El documento no cumple el contrato UblInvoice.", result.error);
  }
  return result.data;
}
