"""
Extractor Fase I - Cabecera Fiscal DIAN
=======================================

Toma una carpeta (recursiva) con ZIPs y/o XMLs de facturación electrónica DIAN
UBL 2.1 y produce:

  1. Excel `YYYYMMDD_HHMM_Cabecera_XMLs_DIAN.xlsx` con 3 hojas:
       - Cabecera_XMLs        : las 86 columnas exactas de la spec
       - MAESTRO_PROVEEDORES  : deduplicado, ORIGEN (COMPRA|DOC_SOPORTE) e INTERES_LOCAL
       - MAESTRO_CLIENTES     : deduplicado (sólo Factura_Venta)
  2. CSVs planos contables (plano_asientos.csv, plano_terceros.csv) delegando
     en `generador_planos.generar_planos`.
  3. Upsert idempotente a Supabase (tablas empresas / documentos_electronicos
     / terceros) si el .env está configurado. Si no, se omite silenciosamente.

Notas de diseño (RESUMEN_SESION Fase I):
  * Documento Soporte (05) y Nota Ajuste DS (95): el emisor es propio, el
    proveedor real está en el receptor del XML → los roles se invierten para
    el maestro de proveedores.
  * Los typos `Direccion_Entrega_Muncipio` y `Emisor_Muncipio_Cod` se
    respetan por compatibilidad con la spec original.
  * `Proveedor_Autorizado_NIT` se toma de `sts:ProviderID` (fix v2 externa).
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple
from xml.etree import ElementTree as ET

# --------------------------------------------------------------------------- #
# Namespaces DIAN UBL 2.1
# --------------------------------------------------------------------------- #
NS = {
    'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    'sts': 'dian:gov:co:facturaelectronica:Structures-2-1',
    'ds':  'http://www.w3.org/2000/09/xmldsig#',
}

# --------------------------------------------------------------------------- #
# 86 columnas EXACTAS y en orden (respeta typos originales)
# --------------------------------------------------------------------------- #
COLUMNAS_86: List[str] = [
    # Identificación (1-10)
    "Tipo_Documento", "Documento_ID", "Prefijo", "CUFE_CUDE",
    "Fecha_Emision", "Hora_Emision", "Fecha_Vencimiento",
    "Divisa", "TRM", "Archivo_Origen",
    # Resolución DIAN (11-17)
    "Resolucion_Numero", "Resolucion_Fecha_Desde", "Resolucion_Fecha_Hasta",
    "Resolucion_Prefijo", "Resolucion_Consecutivo_Desde",
    "Resolucion_Consecutivo_Hasta", "Documento_Electronico_Pais",
    # Proveedor Tecnológico (18-21)
    "Proveedor_Autorizado_NIT", "Software_ID", "Huella_Software", "Codigo_QR",
    # Emisor (22-34) — nota typo Emisor_Muncipio_Cod
    "Emisor_NIT", "Emisor_DV", "Emisor_Razon_Social", "Emisor_Nombre_Comercial",
    "Emisor_Tipo_Persona", "Emisor_Regimen", "Emisor_Responsabilidad",
    "Emisor_Direccion", "Emisor_Muncipio_Cod", "Emisor_Municipio_Nombre",
    "Emisor_Departamento", "Emisor_Telefono", "Emisor_Email",
    # Receptor (35-47)
    "Receptor_NIT", "Receptor_DV", "Receptor_Razon_Social",
    "Receptor_Nombre_Comercial", "Receptor_Tipo_Persona", "Receptor_Regimen",
    "Receptor_Responsabilidad", "Receptor_Direccion", "Receptor_Municipio_Cod",
    "Receptor_Municipio_Nombre", "Receptor_Departamento",
    "Receptor_Telefono", "Receptor_Email",
    # Entrega (48-54) — nota typo Direccion_Entrega_Muncipio
    "Direccion_Entrega_Direccion", "Direccion_Entrega_Muncipio",
    "Direccion_Entrega_Municipio_Nombre", "Direccion_Entrega_Departamento",
    "Fecha_Entrega", "Transportadora_NIT", "Transportadora_Razon_Social",
    # Totales (55-64)
    "Valor_Bruto_Antes_Impuestos", "Total_Descuentos", "Total_Cargos",
    "Base_Imponible", "Total_Impuestos", "Total_Anticipos",
    "Total_Con_Impuestos", "Total_Retenciones", "Valor_A_Pagar", "Redondeo",
    # Impuestos (65-76)
    "IVA_19_Base", "IVA_19_Valor", "IVA_5_Base", "IVA_5_Valor",
    "IVA_Exento_Base", "IVA_Excluido_Base",
    "INC_Base", "INC_Valor", "IPOCOM_Base", "IPOCOM_Valor",
    "Bolsas_Base", "Bolsas_Valor",
    # Retenciones (77-82)
    "ReteFuente_Base", "ReteFuente_Valor", "ReteIVA_Base", "ReteIVA_Valor",
    "ReteICA_Base", "ReteICA_Valor",
    # Pago y control (83-86)
    "Forma_Pago", "Medio_Pago", "Cantidad_Lineas", "Observaciones",
]
assert len(COLUMNAS_86) == 86, f"Spec debe tener 86 columnas, tiene {len(COLUMNAS_86)}"

# --------------------------------------------------------------------------- #
# Helpers XML
# --------------------------------------------------------------------------- #
def _t(elem: Optional[ET.Element], path: str) -> Optional[str]:
    if elem is None:
        return None
    found = elem.find(path, NS)
    return found.text.strip() if (found is not None and found.text) else None


def _attr(elem: Optional[ET.Element], path: str, attr: str) -> Optional[str]:
    if elem is None:
        return None
    found = elem.find(path, NS)
    return found.get(attr) if found is not None else None


def _all_text(elem: Optional[ET.Element], path: str, sep: str = "|") -> Optional[str]:
    if elem is None:
        return None
    found = elem.findall(path, NS)
    vals = [f.text.strip() for f in found if f is not None and f.text]
    return sep.join(vals) if vals else None


def _f(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# --------------------------------------------------------------------------- #
# Descubrimiento y descompresión
# --------------------------------------------------------------------------- #
def encontrar_fuentes(carpeta: str) -> List[Tuple[str, str]]:
    """Retorna [(kind, path)] donde kind ∈ {'zip','xml'}."""
    fuentes: List[Tuple[str, str]] = []
    for root, _, files in os.walk(carpeta):
        for f in files:
            low = f.lower()
            full = os.path.join(root, f)
            if low.endswith(".zip"):
                fuentes.append(("zip", full))
            elif low.endswith(".xml"):
                fuentes.append(("xml", full))
    return fuentes


def extraer_xmls_de_zip(zip_path: str) -> List[Tuple[str, bytes]]:
    """Devuelve [(nombre_xml, contenido_bytes)] de todos los XMLs dentro del ZIP.
    Maneja ZIPs anidados (ZIP dentro de ZIP) recursivamente.
    """
    resultados: List[Tuple[str, bytes]] = []
    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            for name in z.namelist():
                low = name.lower()
                if low.endswith(".xml"):
                    resultados.append((os.path.basename(name) or name, z.read(name)))
                elif low.endswith(".zip"):
                    try:
                        inner = io.BytesIO(z.read(name))
                        with zipfile.ZipFile(inner, "r") as zi:
                            for iname in zi.namelist():
                                if iname.lower().endswith(".xml"):
                                    resultados.append((os.path.basename(iname) or iname, zi.read(iname)))
                    except zipfile.BadZipFile:
                        continue
    except zipfile.BadZipFile:
        print(f"  ! ZIP corrupto: {zip_path}", file=sys.stderr)
    return resultados


def extraer_documento_ubl(contenido: bytes) -> Optional[ET.Element]:
    """Si el XML es un AttachedDocument DIAN, saca el UBL embebido; si no, lo
    devuelve tal cual. Retorna el Element raíz del documento fiscal.
    """
    try:
        root = ET.fromstring(contenido)
    except ET.ParseError:
        return None

    tag = root.tag.split('}')[-1] if '}' in root.tag else root.tag
    if tag == "AttachedDocument":
        # El UBL viene en cbc:Description o dentro de cac:Attachment/.../CDATA
        for path in [
            ".//{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}Attachment/"
            "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}ExternalReference/"
            "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}Description",
            "cac:Attachment/cac:ExternalReference/cbc:Description",
        ]:
            try:
                desc = root.find(path, NS) if ":" in path else root.find(path)
            except SyntaxError:
                continue
            if desc is not None and desc.text:
                # Puede venir envuelto en CDATA con XML plano dentro
                inner = desc.text.strip()
                # Quitar posibles marcadores CDATA restantes
                inner = re.sub(r'^<!\[CDATA\[', '', inner)
                inner = re.sub(r']]>$', '', inner)
                try:
                    return ET.fromstring(inner)
                except ET.ParseError:
                    continue
        # Fallback: buscar Invoice/CreditNote/DebitNote como hijos
        for tname in ("Invoice", "CreditNote", "DebitNote"):
            found = root.find(f".//{{{NS['cac'].replace('CommonAggregate', 'Invoice-2').replace('Components-2','') if False else ''}}}{tname}")
            if found is not None:
                return found
        return None
    return root


# --------------------------------------------------------------------------- #
# Clasificación de tipo de documento
# --------------------------------------------------------------------------- #
def clasificar_tipo(root: ET.Element, nit_propio: Optional[str], emisor_nit: Optional[str]) -> str:
    """Devuelve uno de:
    Factura_Venta, Factura_Compra, Nota_Credito_Venta, Nota_Credito_Compra,
    Nota_Debito_Venta, Nota_Debito_Compra, Doc_Soporte, Nota_Ajuste_DS.
    """
    tag = root.tag.split('}')[-1]
    codigo_tipo = _t(root, 'cbc:InvoiceTypeCode') or _t(root, 'cbc:CreditNoteTypeCode') or _t(root, 'cbc:DebitNoteTypeCode') or ""

    # Documento Soporte y Nota de Ajuste DS
    if codigo_tipo == "05":
        return "Doc_Soporte"
    if codigo_tipo == "95":
        return "Nota_Ajuste_DS"

    es_propia = bool(nit_propio and emisor_nit and _norm_nit(nit_propio) == _norm_nit(emisor_nit))

    if tag == "Invoice":
        return "Factura_Venta" if es_propia else "Factura_Compra"
    if tag == "CreditNote":
        return "Nota_Credito_Venta" if es_propia else "Nota_Credito_Compra"
    if tag == "DebitNote":
        return "Nota_Debito_Venta" if es_propia else "Nota_Debito_Compra"
    return f"Otro_{tag}"


def _norm_nit(nit: Optional[str]) -> str:
    if not nit:
        return ""
    return re.sub(r"[^0-9]", "", str(nit)).lstrip("0")


# --------------------------------------------------------------------------- #
# Extracción de las 86 columnas
# --------------------------------------------------------------------------- #
def extraer_impuesto(root: ET.Element, codigo_esquema: str,
                     porcentaje_target: Optional[float] = None) -> Tuple[float, float]:
    """Suma (base, valor) para un TaxScheme.ID dado, opcionalmente filtrando
    por porcentaje. Retorna (0,0) si no encuentra.
    """
    base_total = 0.0
    valor_total = 0.0
    for sub in root.findall('.//cac:TaxTotal/cac:TaxSubtotal', NS):
        tid = _t(sub, 'cac:TaxCategory/cac:TaxScheme/cbc:ID') or ""
        if tid != codigo_esquema:
            continue
        pct = _f(_t(sub, 'cac:TaxCategory/cbc:Percent'))
        if porcentaje_target is not None and abs(pct - porcentaje_target) > 0.5:
            continue
        base_total += _f(_t(sub, 'cbc:TaxableAmount'))
        valor_total += _f(_t(sub, 'cbc:TaxAmount'))
    return base_total, valor_total


def extraer_retencion(root: ET.Element, codigo_esquema: str) -> Tuple[float, float]:
    """Retenciones (WithholdingTaxTotal). Códigos usuales:
       06 = ReteFuente, 05 = ReteIVA, 07 = ReteICA."""
    base_total = 0.0
    valor_total = 0.0
    for sub in root.findall('.//cac:WithholdingTaxTotal/cac:TaxSubtotal', NS):
        tid = _t(sub, 'cac:TaxCategory/cac:TaxScheme/cbc:ID') or ""
        if tid != codigo_esquema:
            continue
        base_total += _f(_t(sub, 'cbc:TaxableAmount'))
        valor_total += _f(_t(sub, 'cbc:TaxAmount'))
    if base_total == 0.0 and valor_total == 0.0:
        # Fallback: algunos proveedores meten reteFuente dentro de TaxTotal con ID especial
        for sub in root.findall('.//cac:TaxTotal/cac:TaxSubtotal', NS):
            tid = _t(sub, 'cac:TaxCategory/cac:TaxScheme/cbc:ID') or ""
            if tid == codigo_esquema:
                base_total += _f(_t(sub, 'cbc:TaxableAmount'))
                valor_total += _f(_t(sub, 'cbc:TaxAmount'))
    return base_total, valor_total


def extraer_cabecera(root: ET.Element, archivo_origen: str,
                     nit_propio: Optional[str]) -> Dict[str, Any]:
    d: Dict[str, Any] = {c: None for c in COLUMNAS_86}

    # Emisor (necesitamos su NIT antes de clasificar)
    supplier = root.find('.//cac:AccountingSupplierParty/cac:Party', NS)
    emisor_nit = _t(supplier, './/cac:PartyTaxScheme/cbc:CompanyID') if supplier is not None else None
    emisor_dv = _attr(supplier, './/cac:PartyTaxScheme/cbc:CompanyID', 'schemeID') if supplier is not None else None

    # Identificación
    d["Tipo_Documento"]        = clasificar_tipo(root, nit_propio, emisor_nit)
    d["Documento_ID"]          = _t(root, 'cbc:ID')
    d["CUFE_CUDE"]             = _t(root, 'cbc:UUID')
    d["Fecha_Emision"]         = _t(root, 'cbc:IssueDate')
    d["Hora_Emision"]          = _t(root, 'cbc:IssueTime')
    d["Fecha_Vencimiento"]     = _t(root, 'cbc:DueDate') or _t(root, './/cac:PaymentMeans/cbc:PaymentDueDate')
    d["Divisa"]                = _t(root, 'cbc:DocumentCurrencyCode')
    d["TRM"]                   = _f(_t(root, './/cac:PaymentExchangeRate/cbc:CalculationRate')) or None
    d["Archivo_Origen"]        = archivo_origen

    # Prefijo: intentar de la resolución o del ID
    d["Prefijo"] = _t(root, './/sts:InvoiceControl/sts:AuthorizedInvoices/sts:Prefix')
    if not d["Prefijo"] and d["Documento_ID"]:
        m = re.match(r"^([A-Za-z]+)", str(d["Documento_ID"]))
        d["Prefijo"] = m.group(1) if m else None

    # Resolución DIAN
    base_dian = './ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sts:DianExtensions'
    d["Resolucion_Numero"]              = _t(root, f'{base_dian}/sts:InvoiceControl/sts:InvoiceAuthorization')
    d["Resolucion_Fecha_Desde"]         = _t(root, f'{base_dian}/sts:InvoiceControl/sts:AuthorizationPeriod/cbc:StartDate')
    d["Resolucion_Fecha_Hasta"]         = _t(root, f'{base_dian}/sts:InvoiceControl/sts:AuthorizationPeriod/cbc:EndDate')
    d["Resolucion_Prefijo"]             = _t(root, f'{base_dian}/sts:InvoiceControl/sts:AuthorizedInvoices/sts:Prefix')
    d["Resolucion_Consecutivo_Desde"]   = _t(root, f'{base_dian}/sts:InvoiceControl/sts:AuthorizedInvoices/sts:From')
    d["Resolucion_Consecutivo_Hasta"]   = _t(root, f'{base_dian}/sts:InvoiceControl/sts:AuthorizedInvoices/sts:To')
    d["Documento_Electronico_Pais"]     = _t(root, f'{base_dian}/sts:InvoiceSource/cbc:IdentificationCode')

    # Proveedor Tecnológico (fix v2: usar ProviderID)
    d["Proveedor_Autorizado_NIT"] = _t(root, f'{base_dian}/sts:SoftwareProvider/sts:ProviderID')
    d["Software_ID"]              = _t(root, f'{base_dian}/sts:SoftwareProvider/sts:SoftwareID')
    d["Huella_Software"]          = _t(root, f'{base_dian}/sts:SoftwareSecurityCode')
    d["Codigo_QR"]                = _t(root, f'{base_dian}/sts:QRCode')

    # Emisor detallado
    if supplier is not None:
        d["Emisor_NIT"]              = emisor_nit
        d["Emisor_DV"]               = emisor_dv
        d["Emisor_Razon_Social"]     = _t(supplier, './/cac:PartyTaxScheme/cbc:RegistrationName')
        d["Emisor_Nombre_Comercial"] = _t(supplier, './/cac:PartyName/cbc:Name')
        d["Emisor_Tipo_Persona"]     = _t(supplier, './/cac:PartyTaxScheme/cac:TaxScheme/cbc:Name') \
                                       or _t(supplier, './/cac:PartyLegalEntity/cac:CorporateRegistrationScheme/cbc:Name')
        d["Emisor_Regimen"]          = _t(supplier, './/cac:PartyTaxScheme/cbc:TaxLevelCode')
        d["Emisor_Responsabilidad"]  = _all_text(supplier, './/cac:PartyTaxScheme/cbc:TaxLevelCode')

        addr = supplier.find('.//cac:PhysicalLocation/cac:Address', NS) \
               or supplier.find('.//cac:PartyTaxScheme/cac:RegistrationAddress', NS)
        if addr is not None:
            d["Emisor_Direccion"]          = _t(addr, 'cac:AddressLine/cbc:Line')
            d["Emisor_Muncipio_Cod"]       = _t(addr, 'cbc:ID')
            d["Emisor_Municipio_Nombre"]   = _t(addr, 'cbc:CityName')
            d["Emisor_Departamento"]       = _t(addr, 'cbc:CountrySubentity')

        contact = supplier.find('.//cac:Contact', NS)
        if contact is not None:
            d["Emisor_Telefono"] = _t(contact, 'cbc:Telephone')
            d["Emisor_Email"]    = _t(contact, 'cbc:ElectronicMail')

    # Receptor detallado
    customer = root.find('.//cac:AccountingCustomerParty/cac:Party', NS)
    if customer is not None:
        d["Receptor_NIT"]              = _t(customer, './/cac:PartyTaxScheme/cbc:CompanyID')
        d["Receptor_DV"]               = _attr(customer, './/cac:PartyTaxScheme/cbc:CompanyID', 'schemeID')
        d["Receptor_Razon_Social"]     = _t(customer, './/cac:PartyTaxScheme/cbc:RegistrationName')
        d["Receptor_Nombre_Comercial"] = _t(customer, './/cac:PartyName/cbc:Name')
        d["Receptor_Tipo_Persona"]     = _t(customer, './/cac:PartyTaxScheme/cac:TaxScheme/cbc:Name') \
                                         or _t(customer, './/cac:PartyLegalEntity/cac:CorporateRegistrationScheme/cbc:Name')
        d["Receptor_Regimen"]          = _t(customer, './/cac:PartyTaxScheme/cbc:TaxLevelCode')
        d["Receptor_Responsabilidad"]  = _all_text(customer, './/cac:PartyTaxScheme/cbc:TaxLevelCode')

        addr_c = customer.find('.//cac:PhysicalLocation/cac:Address', NS) \
                 or customer.find('.//cac:PartyTaxScheme/cac:RegistrationAddress', NS)
        if addr_c is not None:
            d["Receptor_Direccion"]        = _t(addr_c, 'cac:AddressLine/cbc:Line')
            d["Receptor_Municipio_Cod"]    = _t(addr_c, 'cbc:ID')
            d["Receptor_Municipio_Nombre"] = _t(addr_c, 'cbc:CityName')
            d["Receptor_Departamento"]     = _t(addr_c, 'cbc:CountrySubentity')

        contact_c = customer.find('.//cac:Contact', NS)
        if contact_c is not None:
            d["Receptor_Telefono"] = _t(contact_c, 'cbc:Telephone')
            d["Receptor_Email"]    = _t(contact_c, 'cbc:ElectronicMail')

    # Entrega
    delivery = root.find('.//cac:Delivery', NS)
    if delivery is not None:
        d["Direccion_Entrega_Direccion"]        = _t(delivery, 'cac:DeliveryAddress/cac:AddressLine/cbc:Line')
        d["Direccion_Entrega_Muncipio"]         = _t(delivery, 'cac:DeliveryAddress/cbc:ID')
        d["Direccion_Entrega_Municipio_Nombre"] = _t(delivery, 'cac:DeliveryAddress/cbc:CityName')
        d["Direccion_Entrega_Departamento"]     = _t(delivery, 'cac:DeliveryAddress/cbc:CountrySubentity')
        d["Fecha_Entrega"]                      = _t(delivery, 'cbc:ActualDeliveryDate')
        carrier = delivery.find('.//cac:CarrierParty', NS)
        if carrier is not None:
            d["Transportadora_NIT"]         = _t(carrier, './/cac:PartyTaxScheme/cbc:CompanyID')
            d["Transportadora_Razon_Social"] = _t(carrier, './/cac:PartyTaxScheme/cbc:RegistrationName')

    # Totales
    total_path = 'cac:RequestedMonetaryTotal' if root.tag.endswith('DebitNote') else 'cac:LegalMonetaryTotal'
    mtotal = root.find(total_path, NS)
    if mtotal is not None:
        d["Valor_Bruto_Antes_Impuestos"] = _f(_t(mtotal, 'cbc:LineExtensionAmount'))
        d["Base_Imponible"]              = _f(_t(mtotal, 'cbc:TaxExclusiveAmount'))
        d["Total_Con_Impuestos"]         = _f(_t(mtotal, 'cbc:TaxInclusiveAmount'))
        d["Total_Descuentos"]            = _f(_t(mtotal, 'cbc:AllowanceTotalAmount'))
        d["Total_Cargos"]                = _f(_t(mtotal, 'cbc:ChargeTotalAmount'))
        d["Total_Anticipos"]             = _f(_t(mtotal, 'cbc:PrepaidAmount'))
        d["Valor_A_Pagar"]               = _f(_t(mtotal, 'cbc:PayableAmount'))
        d["Redondeo"]                    = _f(_t(mtotal, 'cbc:PayableRoundingAmount'))

    # Impuestos totales
    iva19_b, iva19_v = extraer_impuesto(root, "01", 19.0)
    iva05_b, iva05_v = extraer_impuesto(root, "01", 5.0)
    iva_ex_b, _      = extraer_impuesto(root, "01", 0.0)
    inc_b, inc_v     = extraer_impuesto(root, "04")
    ipocom_b, ipocom_v = extraer_impuesto(root, "20")
    bolsas_b, bolsas_v = extraer_impuesto(root, "22")

    d["IVA_19_Base"]      = iva19_b
    d["IVA_19_Valor"]     = iva19_v
    d["IVA_5_Base"]       = iva05_b
    d["IVA_5_Valor"]      = iva05_v
    d["IVA_Exento_Base"]  = iva_ex_b
    d["INC_Base"]         = inc_b
    d["INC_Valor"]        = inc_v
    d["IPOCOM_Base"]      = ipocom_b
    d["IPOCOM_Valor"]     = ipocom_v
    d["Bolsas_Base"]      = bolsas_b
    d["Bolsas_Valor"]     = bolsas_v

    # Total Impuestos = suma de TaxTotal/TaxAmount a nivel documento
    total_impuestos = 0.0
    for tt in root.findall('cac:TaxTotal', NS):
        total_impuestos += _f(_t(tt, 'cbc:TaxAmount'))
    d["Total_Impuestos"] = total_impuestos

    # Retenciones
    ret_fte_b, ret_fte_v = extraer_retencion(root, "06")
    ret_iva_b, ret_iva_v = extraer_retencion(root, "05")
    ret_ica_b, ret_ica_v = extraer_retencion(root, "07")
    d["ReteFuente_Base"] = ret_fte_b
    d["ReteFuente_Valor"] = ret_fte_v
    d["ReteIVA_Base"]    = ret_iva_b
    d["ReteIVA_Valor"]   = ret_iva_v
    d["ReteICA_Base"]    = ret_ica_b
    d["ReteICA_Valor"]   = ret_ica_v
    d["Total_Retenciones"] = ret_fte_v + ret_iva_v + ret_ica_v

    # Forma de pago
    payment = root.find('.//cac:PaymentMeans', NS)
    if payment is not None:
        d["Forma_Pago"]  = _t(payment, 'cbc:PaymentMeansCode')
        d["Medio_Pago"]  = _t(payment, 'cbc:PaymentID')

    # Líneas
    line_path = './/cac:InvoiceLine' if root.tag.endswith('Invoice') \
        else ('.//cac:CreditNoteLine' if root.tag.endswith('CreditNote') else './/cac:DebitNoteLine')
    d["Cantidad_Lineas"] = len(root.findall(line_path, NS))

    # Observaciones = Notes concatenadas
    d["Observaciones"] = _all_text(root, 'cbc:Note', sep=" | ")

    return d


# --------------------------------------------------------------------------- #
# Procesamiento paralelo
# --------------------------------------------------------------------------- #
def procesar_xml_bytes(nombre: str, contenido: bytes,
                       nit_propio: Optional[str]) -> Optional[Dict[str, Any]]:
    root = extraer_documento_ubl(contenido)
    if root is None:
        return None
    try:
        return extraer_cabecera(root, nombre, nit_propio)
    except Exception as e:  # noqa: BLE001
        print(f"  ! Error extrayendo {nombre}: {e}", file=sys.stderr)
        return None


def procesar_carpeta(carpeta_in: str, nit_propio: Optional[str],
                     max_workers: int = 8) -> List[Dict[str, Any]]:
    fuentes = encontrar_fuentes(carpeta_in)
    if not fuentes:
        return []

    # Aplanar a lista de (nombre, bytes)
    trabajos: List[Tuple[str, bytes]] = []
    for kind, path in fuentes:
        if kind == "zip":
            trabajos.extend(extraer_xmls_de_zip(path))
        else:
            try:
                with open(path, "rb") as fh:
                    trabajos.append((os.path.basename(path), fh.read()))
            except OSError as e:
                print(f"  ! No pude abrir {path}: {e}", file=sys.stderr)

    print(f"→ {len(fuentes)} archivos fuente, {len(trabajos)} XMLs a procesar.")

    filas: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(procesar_xml_bytes, n, c, nit_propio): n for n, c in trabajos}
        for i, fut in enumerate(as_completed(futures), 1):
            row = fut.result()
            if row is not None:
                filas.append(row)
            if i % 25 == 0:
                print(f"  {i}/{len(trabajos)} procesados...")
    return filas


# --------------------------------------------------------------------------- #
# Maestros de terceros
# --------------------------------------------------------------------------- #
def construir_maestro_proveedores(filas: List[Dict[str, Any]],
                                  municipio_interes: Optional[str]) -> List[Dict[str, Any]]:
    """Un renglón por NIT. Para Factura_Compra / Nota_Credito_Compra / Nota_Debito_Compra
    se toma del Emisor. Para Doc_Soporte / Nota_Ajuste_DS se toma del Receptor
    (los roles del XML están invertidos)."""
    dedup: Dict[str, Dict[str, Any]] = {}
    for r in filas:
        tipo = r.get("Tipo_Documento", "")
        if tipo in ("Factura_Compra", "Nota_Credito_Compra", "Nota_Debito_Compra"):
            origen = "COMPRA"
            src = {"NIT": r.get("Emisor_NIT"), "DV": r.get("Emisor_DV"),
                   "Razon_Social": r.get("Emisor_Razon_Social"),
                   "Municipio": r.get("Emisor_Municipio_Nombre"),
                   "Municipio_Cod": r.get("Emisor_Muncipio_Cod"),
                   "Departamento": r.get("Emisor_Departamento"),
                   "Telefono": r.get("Emisor_Telefono"),
                   "Email": r.get("Emisor_Email"),
                   "Regimen": r.get("Emisor_Regimen"),
                   "Responsabilidad": r.get("Emisor_Responsabilidad")}
        elif tipo in ("Doc_Soporte", "Nota_Ajuste_DS"):
            origen = "DOC_SOPORTE"
            src = {"NIT": r.get("Receptor_NIT"), "DV": r.get("Receptor_DV"),
                   "Razon_Social": r.get("Receptor_Razon_Social"),
                   "Municipio": r.get("Receptor_Municipio_Nombre"),
                   "Municipio_Cod": r.get("Receptor_Municipio_Cod"),
                   "Departamento": r.get("Receptor_Departamento"),
                   "Telefono": r.get("Receptor_Telefono"),
                   "Email": r.get("Receptor_Email"),
                   "Regimen": r.get("Receptor_Regimen"),
                   "Responsabilidad": r.get("Receptor_Responsabilidad")}
        else:
            continue

        nit = _norm_nit(src.get("NIT"))
        if not nit:
            continue
        if nit in dedup:
            # Preferir origen COMPRA si ya venía como DOC_SOPORTE
            if dedup[nit]["ORIGEN"] == "DOC_SOPORTE" and origen == "COMPRA":
                dedup[nit]["ORIGEN"] = "COMPRA"
            continue
        interes = "SI" if (municipio_interes and src.get("Municipio")
                           and municipio_interes.strip().lower() in src["Municipio"].lower()) else "NO"
        dedup[nit] = {**src, "ORIGEN": origen, "INTERES_LOCAL": interes}
    return list(dedup.values())


def construir_maestro_clientes(filas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sólo Factura_Venta y sus notas asociadas (donde el emisor es propio).
    Se excluyen DS explícitamente."""
    dedup: Dict[str, Dict[str, Any]] = {}
    for r in filas:
        if r.get("Tipo_Documento") not in ("Factura_Venta", "Nota_Credito_Venta", "Nota_Debito_Venta"):
            continue
        nit = _norm_nit(r.get("Receptor_NIT"))
        if not nit or nit in dedup:
            continue
        dedup[nit] = {
            "NIT": r.get("Receptor_NIT"),
            "DV": r.get("Receptor_DV"),
            "Razon_Social": r.get("Receptor_Razon_Social"),
            "Municipio": r.get("Receptor_Municipio_Nombre"),
            "Departamento": r.get("Receptor_Departamento"),
            "Telefono": r.get("Receptor_Telefono"),
            "Email": r.get("Receptor_Email"),
            "Regimen": r.get("Receptor_Regimen"),
        }
    return list(dedup.values())


# --------------------------------------------------------------------------- #
# Salida: Excel + Supabase
# --------------------------------------------------------------------------- #
def escribir_excel(filas: List[Dict[str, Any]],
                   provs: List[Dict[str, Any]],
                   clis: List[Dict[str, Any]],
                   carpeta_out: str) -> str:
    import pandas as pd  # import local para permitir --help sin pandas

    os.makedirs(carpeta_out, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    ruta = os.path.join(carpeta_out, f"{ts}_Cabecera_XMLs_DIAN.xlsx")

    df = pd.DataFrame(filas, columns=COLUMNAS_86)
    dfp = pd.DataFrame(provs) if provs else pd.DataFrame()
    dfc = pd.DataFrame(clis) if clis else pd.DataFrame()

    with pd.ExcelWriter(ruta, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Cabecera_XMLs")
        dfp.to_excel(writer, index=False, sheet_name="MAESTRO_PROVEEDORES")
        dfc.to_excel(writer, index=False, sheet_name="MAESTRO_CLIENTES")
    return ruta


def upsert_supabase(filas: List[Dict[str, Any]],
                    provs: List[Dict[str, Any]],
                    clis: List[Dict[str, Any]],
                    nit_propio: str,
                    razon_propia: str,
                    municipio_ica: Optional[str]) -> Optional[str]:
    """Upsert a Supabase si hay credenciales. Devuelve empresa_id o None."""
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except ImportError:
        pass

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("→ Supabase omitido (falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env).")
        return None

    try:
        from supabase import create_client  # type: ignore
    except ImportError:
        print("→ Supabase omitido (falta `pip install supabase`).")
        return None

    sb = create_client(url, key)
    print("→ Enviando a Supabase...")

    # 1) Empresa (upsert por nit)
    empresa = sb.table("empresas").upsert(
        {"nit": _norm_nit(nit_propio), "razon_social": razon_propia,
         "municipio_ica": municipio_ica},
        on_conflict="nit",
    ).execute()
    empresa_id = empresa.data[0]["id"] if empresa.data else None
    if not empresa_id:
        print("  ! No pude obtener empresa_id, aborto Supabase.")
        return None

    # 2) Documentos electrónicos (upsert por empresa_id+cufe_cude)
    docs_payload: List[Dict[str, Any]] = []
    for r in filas:
        if not r.get("CUFE_CUDE"):
            continue
        item = {"empresa_id": empresa_id}
        for col in COLUMNAS_86:
            key_snake = col.lower()
            item[key_snake] = r.get(col)
        docs_payload.append(item)
    for i in range(0, len(docs_payload), 250):
        sb.table("documentos_electronicos").upsert(
            docs_payload[i:i+250],
            on_conflict="empresa_id,cufe_cude",
        ).execute()

    # 3) Terceros (proveedores + clientes)
    terc_payload: List[Dict[str, Any]] = []
    for p in provs:
        terc_payload.append({
            "empresa_id": empresa_id,
            "nit": _norm_nit(p.get("NIT")),
            "razon_social": p.get("Razon_Social"),
            "municipio": p.get("Municipio"),
            "departamento": p.get("Departamento"),
            "telefono": p.get("Telefono"),
            "email": p.get("Email"),
            "regimen": p.get("Regimen"),
            "responsabilidad": p.get("Responsabilidad"),
            "es_proveedor": True,
            "es_cliente": False,
            "origen": p.get("ORIGEN"),
            "interes_local": p.get("INTERES_LOCAL") == "SI",
        })
    for c in clis:
        terc_payload.append({
            "empresa_id": empresa_id,
            "nit": _norm_nit(c.get("NIT")),
            "razon_social": c.get("Razon_Social"),
            "municipio": c.get("Municipio"),
            "departamento": c.get("Departamento"),
            "telefono": c.get("Telefono"),
            "email": c.get("Email"),
            "regimen": c.get("Regimen"),
            "es_proveedor": False,
            "es_cliente": True,
        })
    if terc_payload:
        sb.table("terceros").upsert(
            terc_payload,
            on_conflict="empresa_id,nit",
        ).execute()

    print(f"  ✔ Supabase actualizado: {len(docs_payload)} docs, {len(terc_payload)} terceros.")
    return empresa_id


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _pedir(msg: str, default: Optional[str] = None) -> str:
    hint = f" [{default}]" if default else ""
    resp = input(f"{msg}{hint}: ").strip()
    return resp or (default or "")


def main() -> int:
    ap = argparse.ArgumentParser(description="Extractor Fase I — Cabecera Fiscal DIAN")
    ap.add_argument("--input", "-i", help="Carpeta de entrada (recursiva)")
    ap.add_argument("--output", "-o", help="Carpeta de salida")
    ap.add_argument("--nit", help="NIT propio (para clasificar Venta vs Compra)")
    ap.add_argument("--razon", help="Razón social propia (para Supabase)")
    ap.add_argument("--municipio", help="Municipio de interés (INTERES_LOCAL)")
    ap.add_argument("--no-planos", action="store_true", help="No generar CSVs contables")
    ap.add_argument("--no-supabase", action="store_true", help="No enviar a Supabase")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    carpeta_in  = args.input     or _pedir("📁 Carpeta de entrada (ZIPs/XMLs)")
    carpeta_out = args.output    or _pedir("📁 Carpeta de salida", "./output")
    nit_propio  = args.nit       or _pedir("🆔 NIT propio (para clasificar Venta/Compra)")
    razon       = args.razon     or _pedir("🏢 Razón social propia (Supabase)", "")
    municipio   = args.municipio or _pedir("🏙️  Municipio de interés (ICA local)", "")

    if not os.path.isdir(carpeta_in):
        print(f"! No existe la carpeta: {carpeta_in}", file=sys.stderr)
        return 2

    filas = procesar_carpeta(carpeta_in, nit_propio, max_workers=args.workers)
    if not filas:
        print("! No se procesó ningún XML. Nada que hacer.")
        return 1

    provs = construir_maestro_proveedores(filas, municipio or None)
    clis  = construir_maestro_clientes(filas)

    excel_path = escribir_excel(filas, provs, clis, carpeta_out)
    print(f"✔ Excel: {excel_path}")

    if not args.no_planos:
        try:
            from generador_planos import generar_planos
            asientos_path, terceros_path = generar_planos(
                filas, provs, clis, nit_propio, carpeta_out,
            )
            if asientos_path:
                print(f"✔ {asientos_path}")
                print(f"✔ {terceros_path}")
        except ImportError:
            print("→ generador_planos no disponible, omitido.")
        except FileNotFoundError as e:
            print(f"→ Planos omitidos: {e}")

    if not args.no_supabase:
        try:
            upsert_supabase(filas, provs, clis, nit_propio, razon, municipio or None)
        except Exception as e:  # noqa: BLE001
            print(f"! Error Supabase: {e}", file=sys.stderr)

    print(f"\n📊 Resumen: {len(filas)} documentos | "
          f"{len(provs)} proveedores | {len(clis)} clientes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
