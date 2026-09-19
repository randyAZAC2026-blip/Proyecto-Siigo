import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseUblInvoice, UblParseError } from "@/lib/ubl/parser";

const here = dirname(fileURLToPath(import.meta.url));
const facturaXml = readFileSync(resolve(here, "__fixtures__/factura-01.xml"), "utf8");

describe("parseUblInvoice", () => {
  it("extrae cabecera, partes y totales de una factura DIAN válida", () => {
    const invoice = parseUblInvoice(facturaXml);

    expect(invoice.numero).toBe("FE-1024");
    expect(invoice.tipo_documento).toBe("01");
    expect(invoice.tipo_documento_desc).toBe("Factura de venta");
    expect(invoice.fecha_emision).toBe("2026-09-15");
    expect(invoice.moneda).toBe("COP");
    expect(invoice.cufe).toContain("d41d8cd9");

    expect(invoice.proveedor.nit).toBe("900123456");
    expect(invoice.proveedor.razon_social).toContain("SIIGO");
    expect(invoice.proveedor.responsabilidad_fiscal).toEqual(["O-13", "O-15"]);

    expect(invoice.cliente.nit).toBe("1020304050");
    expect(invoice.cliente.razon_social).toBe("RANDY EJEMPLO");

    expect(invoice.totales.subtotal_cop).toBe(1_000_000);
    expect(invoice.totales.total_a_pagar_cop).toBe(1_190_000);
    expect(invoice.totales.total_impuestos_cop).toBe(190_000);
  });

  it("descompone líneas con IVA por línea", () => {
    const invoice = parseUblInvoice(facturaXml);
    expect(invoice.lineas).toHaveLength(2);

    const [asesoria, config] = invoice.lineas;
    expect(asesoria.descripcion).toBe("Asesoría contable mensual");
    expect(asesoria.cantidad).toBe(2);
    expect(asesoria.subtotal_cop).toBe(600_000);
    expect(asesoria.impuestos[0]).toMatchObject({
      tax_name: "IVA",
      tarifa_porcentaje: 19,
      base_cop: 600_000,
      monto_cop: 114_000,
    });

    expect(config.descripcion).toBe("Configuración de facturación electrónica");
    expect(config.subtotal_cop).toBe(400_000);
    expect(config.impuestos[0].monto_cop).toBe(76_000);
  });

  it("agrega impuestos totales al nivel documento", () => {
    const invoice = parseUblInvoice(facturaXml);
    expect(invoice.impuestos).toHaveLength(1);
    expect(invoice.impuestos[0]).toMatchObject({
      tax_name: "IVA",
      tarifa_porcentaje: 19,
      base_cop: 1_000_000,
      monto_cop: 190_000,
    });
  });

  it("rechaza XML vacío o mal formado", () => {
    expect(() => parseUblInvoice("")).toThrow(UblParseError);
    expect(() => parseUblInvoice("<Invoice><cbc:ID>")).toThrow(UblParseError);
  });

  it("rechaza documentos sin raíz Invoice/CreditNote/DebitNote", () => {
    expect(() => parseUblInvoice("<?xml version='1.0'?><Foo/>")).toThrow(UblParseError);
  });
});
