import JSZip from "jszip";
import type {
  DocumentKind,
  InvoiceDoc,
  InvoiceItem,
  ParsedDoc,
  PayrollDoc,
  ProcessedFile,
} from "@/lib/xml/types";

// Helpers DOM — UBL de DIAN usa namespaces (cac, cbc, ...) que a veces llegan
// con prefijos distintos. Buscamos por localName para no depender del prefijo.

function* descendants(root: Element): Generator<Element> {
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    yield el;
    for (let i = el.children.length - 1; i >= 0; i--) {
      stack.push(el.children[i]);
    }
  }
}

function firstLocal(root: Element | null, localName: string): Element | null {
  if (!root) return null;
  for (const el of descendants(root)) {
    if (el.localName === localName) return el;
  }
  return null;
}

function allLocal(root: Element | null, localName: string): Element[] {
  if (!root) return [];
  const out: Element[] = [];
  for (const el of descendants(root)) {
    if (el.localName === localName) out.push(el);
  }
  return out;
}

function directChildLocal(root: Element | null, localName: string): Element | null {
  if (!root) return null;
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].localName === localName) return root.children[i];
  }
  return null;
}

function text(el: Element | null): string {
  return el?.textContent?.trim() ?? "";
}

function num(el: Element | null): number {
  const t = text(el);
  if (!t) return 0;
  const parsed = Number(t.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseXmlString(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  // Detectar error de parseo (el parser mete un <parsererror> en lugar de fallar).
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) {
    throw new Error(`XML inválido: ${err.textContent?.slice(0, 160) ?? "sin detalle"}`);
  }
  return doc;
}

// AttachedDocument de DIAN envuelve el documento real dentro de un
// <cbc:Description> con CDATA. Desenvolvemos antes de clasificar.
function unwrapAttachedDocument(doc: Document): Document {
  const root = doc.documentElement;
  if (!root || root.localName !== "AttachedDocument") return doc;

  const attachment = firstLocal(root, "Attachment");
  if (!attachment) return doc;
  // La estructura es Attachment > ExternalReference | Attachment interno.
  // El payload suele estar en Attachment > ExternalReference > Description (CDATA)
  // o Attachment > Description directa.
  const descCandidates = allLocal(attachment, "Description");
  for (const desc of descCandidates) {
    const inner = desc.textContent?.trim() ?? "";
    if (inner.startsWith("<")) {
      try {
        return parseXmlString(inner);
      } catch {
        continue;
      }
    }
  }
  return doc;
}

function detectKind(doc: Document): DocumentKind {
  const rootName = doc.documentElement?.localName ?? "";
  if (rootName === "Invoice") {
    // InvoiceTypeCode 01 = factura venta, 05 = documento soporte en adquisiciones
    const code = text(firstLocal(doc.documentElement, "InvoiceTypeCode"));
    if (code === "05") return "documento_soporte";
    return "factura_venta";
  }
  if (rootName === "CreditNote") return "nota_credito";
  if (rootName === "DebitNote") return "nota_debito";
  if (rootName === "NominaIndividual" || rootName === "NominaIndividualDeAjuste") {
    return rootName === "NominaIndividual" ? "nomina" : "nomina_ajuste";
  }
  return "desconocido";
}

function parseParty(partyEl: Element | null) {
  if (!partyEl) return {};
  const partyLegal = firstLocal(partyEl, "PartyLegalEntity");
  const partyTaxScheme = firstLocal(partyEl, "PartyTaxScheme");
  const partyName = firstLocal(partyEl, "PartyName");
  const idEl = firstLocal(partyEl, "CompanyID");

  const nombre =
    text(firstLocal(partyLegal, "RegistrationName")) ||
    text(firstLocal(partyName, "Name")) ||
    text(firstLocal(partyTaxScheme, "RegistrationName")) ||
    undefined;
  const nit = text(idEl) || undefined;

  // AdditionalAccountID en DIAN: "1" = persona jurídica, "2" = persona natural.
  const additional = text(firstLocal(partyEl.parentElement, "AdditionalAccountID"));
  const tipo_persona: "natural" | "juridica" | undefined =
    additional === "1" ? "juridica" : additional === "2" ? "natural" : undefined;

  const regimen = text(firstLocal(partyTaxScheme, "Name")) || undefined;

  return { nit, nombre, tipo_persona, regimen };
}

function parseInvoiceLikeItems(root: Element, lineLocalName: string): InvoiceItem[] {
  const lines = allLocal(root, lineLocalName);
  return lines.map((line, idx) => {
    const quantityEl =
      firstLocal(line, "InvoicedQuantity") ??
      firstLocal(line, "CreditedQuantity") ??
      firstLocal(line, "DebitedQuantity");
    const price = firstLocal(line, "Price");
    const item = firstLocal(line, "Item");
    const impuestos = allLocal(line, "TaxSubtotal").map((sub) => {
      const category = firstLocal(sub, "TaxCategory");
      const scheme = firstLocal(category, "TaxScheme");
      return {
        codigo: text(firstLocal(scheme, "ID")) || "00",
        nombre: text(firstLocal(scheme, "Name")) || "IVA",
        porcentaje: num(firstLocal(category, "Percent")),
        base_cop: num(firstLocal(sub, "TaxableAmount")),
        monto_cop: num(firstLocal(sub, "TaxAmount")),
      };
    });

    return {
      linea: Number(text(directChildLocal(line, "ID"))) || idx + 1,
      descripcion:
        text(firstLocal(item, "Description")) ||
        text(firstLocal(item, "Name")) ||
        "(sin descripción)",
      cantidad: num(quantityEl) || 1,
      unidad: quantityEl?.getAttribute("unitCode") ?? undefined,
      valor_unitario_cop: num(firstLocal(price, "PriceAmount")),
      valor_total_cop: num(firstLocal(line, "LineExtensionAmount")),
      impuestos,
    };
  });
}

function parseInvoiceLike(doc: Document, kind: InvoiceDoc["kind"]): InvoiceDoc {
  const root = doc.documentElement;
  const supplier = firstLocal(firstLocal(root, "AccountingSupplierParty"), "Party");
  const customer = firstLocal(firstLocal(root, "AccountingCustomerParty"), "Party");

  const lineLocalName =
    kind === "nota_credito"
      ? "CreditNoteLine"
      : kind === "nota_debito"
        ? "DebitNoteLine"
        : "InvoiceLine";

  const totales = firstLocal(root, "LegalMonetaryTotal") ?? firstLocal(root, "RequestedMonetaryTotal");

  const notas = allLocal(root, "Note")
    .map((n) => text(n))
    .filter(Boolean);

  const prefijo = text(directChildLocal(root, "ID"));
  // DIAN parte en prefijo + número (p.ej. FVE123). Sacamos la parte numérica si existe.
  const numeroMatch = prefijo.match(/^([A-Za-z]+)?(\d+)$/);
  const numeroFinal = numeroMatch?.[2] ?? prefijo;
  const prefijoFinal = numeroMatch?.[1];

  // CUFE/CUDE suele estar en cbc:UUID.
  const cufe = text(directChildLocal(root, "UUID")) || undefined;

  const fecha = text(directChildLocal(root, "IssueDate"));
  const moneda = text(directChildLocal(root, "DocumentCurrencyCode")) || "COP";

  return {
    kind,
    numero: numeroFinal,
    prefijo: prefijoFinal,
    cufe,
    fecha_emision: fecha,
    moneda,
    emisor: parseParty(supplier),
    receptor: parseParty(customer),
    items: parseInvoiceLikeItems(root, lineLocalName),
    totales: {
      subtotal_cop: num(firstLocal(totales, "LineExtensionAmount")),
      impuestos_cop: num(firstLocal(totales, "TaxExclusiveAmount"))
        ? num(firstLocal(totales, "TaxInclusiveAmount")) - num(firstLocal(totales, "TaxExclusiveAmount"))
        : 0,
      total_cop: num(firstLocal(totales, "PayableAmount")) || num(firstLocal(totales, "TaxInclusiveAmount")),
    },
    notas,
  };
}

function parsePayroll(doc: Document, kind: PayrollDoc["kind"]): PayrollDoc {
  const root = doc.documentElement;
  const empleador = firstLocal(root, "Empleador");
  const trabajador = firstLocal(root, "Trabajador");
  const devengados = firstLocal(root, "Devengados");
  const deducciones = firstLocal(root, "Deducciones");

  return {
    kind,
    numero: root.getAttribute("Numero") ?? text(firstLocal(root, "NumeroSecuenciaXML")),
    cune: root.getAttribute("CUNE") ?? undefined,
    fecha_emision: root.getAttribute("FechaGen") ?? text(firstLocal(root, "FechaGen")),
    periodo_inicio: firstLocal(root, "Periodo")?.getAttribute("FechaLiquidacionInicio") ?? undefined,
    periodo_fin: firstLocal(root, "Periodo")?.getAttribute("FechaLiquidacionFin") ?? undefined,
    empleador: {
      nit: empleador?.getAttribute("NIT") ?? undefined,
      nombre: empleador?.getAttribute("RazonSocial") ?? undefined,
    },
    trabajador: {
      identificacion: trabajador?.getAttribute("NumeroDocumento") ?? undefined,
      nombre: [
        trabajador?.getAttribute("PrimerNombre"),
        trabajador?.getAttribute("SegundoNombre"),
        trabajador?.getAttribute("PrimerApellido"),
        trabajador?.getAttribute("SegundoApellido"),
      ]
        .filter(Boolean)
        .join(" ") || undefined,
      cargo: trabajador?.getAttribute("CargoTrabajador") ?? undefined,
    },
    totales: {
      devengados_cop: Number(devengados?.getAttribute("DevengadosTotal") ?? 0),
      deducciones_cop: Number(deducciones?.getAttribute("DeduccionesTotal") ?? 0),
      neto_cop: Number(firstLocal(root, "ComprobanteTotal")?.textContent ?? 0),
    },
  };
}

export function parseXml(xmlString: string): ParsedDoc {
  let doc = parseXmlString(xmlString);
  doc = unwrapAttachedDocument(doc);
  const kind = detectKind(doc);

  switch (kind) {
    case "factura_venta":
    case "factura_compra":
    case "documento_soporte":
      return parseInvoiceLike(doc, kind);
    case "nota_credito":
    case "nota_debito":
      return parseInvoiceLike(doc, kind);
    case "nomina":
    case "nomina_ajuste":
      return parsePayroll(doc, kind);
    default:
      return {
        kind: "desconocido",
        razon: `Elemento raíz no soportado: ${doc.documentElement?.localName ?? "sin raíz"}.`,
        raw_root: doc.documentElement?.localName,
      };
  }
}

// Procesa un File (XML suelto o ZIP con varios XML).
export async function processFile(file: File): Promise<ProcessedFile[]> {
  const isZip =
    file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";

  if (!isZip) {
    const content = await file.text();
    const doc = parseXml(content);
    return [
      {
        id: crypto.randomUUID(),
        filename: file.name,
        doc,
        parsedAt: new Date().toISOString(),
      },
    ];
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out: ProcessedFile[] = [];
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xml"),
  );
  for (const entry of entries) {
    try {
      const content = await entry.async("string");
      const doc = parseXml(content);
      out.push({
        id: crypto.randomUUID(),
        filename: `${file.name}:${entry.name}`,
        doc,
        parsedAt: new Date().toISOString(),
      });
    } catch (err) {
      out.push({
        id: crypto.randomUUID(),
        filename: `${file.name}:${entry.name}`,
        doc: {
          kind: "desconocido",
          razon: err instanceof Error ? err.message : "Error de parseo.",
        },
        parsedAt: new Date().toISOString(),
      });
    }
  }
  return out;
}
