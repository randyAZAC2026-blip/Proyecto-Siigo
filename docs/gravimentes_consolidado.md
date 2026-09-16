# Gravimentes — Especificación Consolidada del Proyecto

> **Propósito.** ERP contable web para pyme colombiana que digitaliza el ciclo contable completo: importa facturas electrónicas DIAN, clasifica productos con un motor que aprende, calcula retenciones según UVT y régimen fiscal, concilia extractos bancarios contra libros, y exporta comprobantes al motor contable **Contai · Siigo + ilimitada** mediante planos tab-delimitados.
>
> Este documento fusiona la especificación del **producto** (artifact web funcional) con la especificación del **backend** (Módulo 10 · Conciliación Bancaria, arquitectura multi-tenant Postgres/RLS), y define la ruta de integración entre ambos.

**URL del artifact:** https://claude.ai/code/artifact/eec4fd9a-a2cc-4116-a5e3-e845e2ece558

**Estado:** Frontend funcional single-file; backend en spec (SQL, triggers, RLS listos para migración).

---

## Cómo encaja en el flujo documental completo

```
                    ┌──────────────────────────────────────────────┐
                    │            FLUJO DOCUMENTAL COMPLETO         │
                    └──────────────────────────────────────────────┘

  Correo/ZIP DIAN ──▶ FACTURAS (mód. web) ──▶ Causación Contai (plantilla 0001)
                              │                        │
                              ▼                        ▼
                     CxP / CxC abierta          Comprobante 00001/00002
                              │                        │
  Extracto banco ──▶ EXTRACTOS ──▶ CONCILIACIÓN ───────┤
    (PDF/XLSX/CSV/OFX)               │                 ▼
                                     └─▶ Comprobante Ingreso/Egreso (CI/CE)
                                                       │
                                                       ▼
                                             COMPROBANTES CONTAI
                                             (plantilla 0003 · tab-delimitada)
                                                       │
                                                       ▼
                                             Import en Contai
                                                       │
                                                       ▼
                                       CxP / CxC cerrada · Bancos cargados
```

---

# PARTE I · Producto (artifact web actual)

## 1. Arquitectura de módulos (frontend)

Sidebar con 4 secciones y 10 módulos:

```
Panel
  └─ Panel general               (dashboard consolidado)

Documentos
  ├─ Facturas                    (compras + ventas con parametrización IA)
  ├─ Clientes                    (terceros tipo C · CxC)
  ├─ Proveedores                 (terceros tipo C · CxP · retenciones)
  └─ Nómina                      (quincenal · PILA)

Bancos
  ├─ Extractos                   (importar PDF/XLSX/CSV bancarios)
  ├─ Conciliación                (movimiento ↔ documento con clasificador)
  ├─ Cartera                     (edades de saldos CxC)
  └─ Comprobantes Contai         (CI/CE listos para exportar)

Sistema
  ├─ Parametrización Contai      (comprobantes · PUC · tipos S/C/B/A · plantillas · Ficha 17 · TrB · retenciones · regímenes)
  └─ Configuración               (cuentas bancarias · reglas · parámetros · usuarios)
```

Navegación por hash routing (`#dashboard`, `#facturas`, …). Cada módulo es una vista `<section>` swappable con animación de fade-in.

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| **Runtime frontend** | HTML + CSS + JavaScript vanilla, single file (~2.700 líneas) |
| **PDF parsing** | `pdf.js 3.11.174` (Mozilla) desde cdnjs |
| **ZIP handling** | `jszip 3.10.1` desde cdnjs |
| **XML DIAN** | `DOMParser` nativo (UBL 2.1 con extract de `AttachedDocument` → CDATA `Description` → inner `Invoice`) |
| **Fuentes** | Source Serif 4 (titulares) · Inter (UI) · IBM Plex Mono (datos) desde Google Fonts |
| **Storage frontend** | `localStorage` — tema, tratamiento contable, reglas aprendidas del clasificador |
| **Backend (spec)** | PostgreSQL + PostgREST + RLS · esquema `data` + `api` |
| **Auth (spec)** | JWT con claim `empresa_id` para multi-tenant |
| **Jobs (spec)** | Workers para import/export/OCR/matching |

## 3. Sistema de diseño

### 3.1. Paleta (refinada para uso contable formal)

| Token | Valor | Uso |
|---|---|---|
| `--ground` | `#F4F5F7` | Fondo de la app |
| `--surface` | `#FFFFFF` | Cards, tablas |
| `--surface-2` | `#F9FAFB` | Superficies secundarias, hover |
| `--surface-3` | `#F1F3F6` | Encabezados de tabla, chips neutros |
| `--ink` | `#111827` | Texto principal (charcoal) |
| `--ink-2` | `#1F2937` | Títulos, valores |
| `--muted` | `#6B7280` | Metadatos, labels |
| `--border` | `#E5E7EB` | Bordes |
| `--accent` | `#1E3A6E` | Navy corporativo · botones primarios |
| `--positive` | `#0F6B52` | Verde forestal · cuadre OK |
| `--warning` | `#A16207` | Ámbar apagado · atención |
| `--critical` | `#9F2626` | Rojo desaturado · errores |

Paleta deliberadamente sobria: neutros cálidos, saturaciones bajas. Sin gradientes ni sombras cargadas.

### 3.2. Tipografía

- **Titulares:** Source Serif 4 (600) — autoridad editorial
- **UI y body:** Inter (400/500/600) — claridad operativa
- **Números y códigos:** IBM Plex Mono con `font-variant-numeric: tabular-nums` — alineación de columnas

### 3.3. Tema

Auto / Claro / Oscuro con toggle en topbar. Persistente en localStorage.

## 4. Módulos en detalle

### 4.1. Panel general

Card de introducción en 2 columnas (descripción del sistema + 4 pilares: Documentos, Bancos, Contai, DIAN) + KPI row (saldo total, movs pendientes, comprobantes del mes, alertas) + tabla de cuentas bancarias con saldos + actividad reciente.

### 4.2. Facturas — el corazón del sistema

**Vista principal:** tabla con Prefijo/Nº, Fecha, Tipo, Tercero, NIT, **Régimen fiscal**, Subtotal, IVA, **Retención sugerida**, Total, Comprobante Contai, Estado.

**Carga masiva:** botón "Cargar ZIP (PDF + XML)" acepta:
- `.zip` con múltiples PDFs y/o XMLs adentro
- `.xml` sueltos (formato DIAN UBL 2.1)
- `.pdf` sueltos (fallback con regex)

**Parser XML DIAN:** cuando el ZIP contiene un XML, lo prioriza sobre el PDF por ser 100% preciso. Extrae:
- `AccountingSupplierParty`: nombre, NIT, TaxLevelCode (régimen fiscal), ciudad
- `AccountingCustomerParty`: idem
- `LegalMonetaryTotal`: PayableAmount, LineExtensionAmount, TaxInclusiveAmount
- `TaxTotal`: IVA por línea y agregado
- `InvoiceLine` (todas): Description, SellersItemIdentification (SKU), Quantity, ExtensionAmount, IVA por línea
- CUFE / UUID
- Prefijo, número, fecha de emisión

#### 4.2.1. Modal de parametrización (clic en cualquier fila)

3 pestañas:

1. **Líneas del documento** — cada línea del XML con clasificación PUC automática:
   - Chip de fuente: `aprendido` (verde), `regla` (azul), `default` (ámbar)
   - Botón "Editar/Aprender" abre 3 prompts (cuenta, nombre, keyword) y guarda la regla en localStorage.

2. **Asiento contable propuesto** — consolidación en vivo:
   - Débitos: cuentas PUC agrupadas por clasificación + IVA descontable
   - Créditos: retenciones aplicables (si adquiriente es agente) + proveedor 220505 con neto a pagar
   - Chip de cuadre `✓ Db = Cr` en el footer

3. **Reglas aprendidas** — todas las keywords enseñadas con hits, fecha y botón para eliminar.

**Toggle "Tratamiento contable"** en header del modal (Inventario · Gasto directo · Activo fijo) — cambia la cuenta PUC sugerida en tiempo real. Se persiste en localStorage.

**Botón "Causar"** marca la factura, guarda las cuentas parametrizadas y confirma el asiento generado.

#### 4.2.2. Clasificador de productos (9 familias por defecto)

| Familia (keywords) | Inventario | Gasto | Activo |
|---|---|---|---|
| Repuestos, cilindro, pistón, empaque, filtro, banda freno, aceite… | 143520 | 519535 | 152405 |
| Papel, impresión, tóner, cartucho… | 143515 | 519515 | 519515 |
| Combustible, ACPM, lubricantes | 143530 | 513095 | 513095 |
| Energía, acueducto, gas, internet, teléfono | 513525 | 513525 | 513525 |
| Honorarios, asesoría, consultoría | 511010 | 511010 | 511010 |
| Arrendamiento, arriendo, canon | 511510 | 511510 | 511510 |
| Seguros, SOAT, ARL, pólizas | 512505 | 512505 | 512505 |
| Mantenimiento, reparación | 513525 | 513525 | 513525 |
| Computador, laptop, monitor, escritorio | 152805 | 519530 | 152805 |

**Aprendizaje:** cuando el usuario corrige manualmente con un keyword K → cuenta C, se guarda `{keyword, cuenta, nombre, hits, at}` en localStorage. En la próxima factura que contenga K, el clasificador aplica C automáticamente (chip verde `aprendido`).

Prioridad: `aprendido` > `regla` > `default`.

#### 4.2.3. Motor de retenciones

Basado en UVT 2026 = **$49.799**. Evalúa cada factura:

```
Retefuente compras 2.5%  — aplica si base >= 27 UVT ($1.344.573) Y adquiriente es agente
ReteIVA 15%              — aplica si adquiriente es O-13/O-23 Y hay IVA
ReteICA Medellín 7‰       — aplica si base >= 27 UVT
```

Retorna una lista de reglas con: concepto, base, tarifa, tope UVT, valor a retener, cuenta PUC, aplica sí/no, motivo (para trazabilidad).

### 4.3. Clientes / Proveedores

Tablas de terceros con NIT, razón social, ciudad, actividad económica DIAN, plazo, saldo actual, responsabilidades DIAN (chips: `05`, `O-13`, `O-15`, `Gran Contribuyente`, `Autorretenedor`, `Régimen Simple`, etc.), tarifa retefuente aplicable por defecto.

Ambas vistas listas para importar Plantilla 0002 (20 campos, con títulos).

### 4.4. Nómina

Selector de período quincenal · KPIs (empleados activos, devengado, deducciones, neto) · tabla de empleados. Al procesar genera comprobante 00004 Egresos + archivo PILA.

### 4.5. Extractos

Split layout: sidebar de lotes importados (4 bancos: Bancolombia, Davivienda, Nequi, BBVA) + panel principal con meta del extracto (saldo anterior, abonos, cargos, saldo actual) y tabla de movimientos con chip de estado por cada uno.

Formatos aceptados: `PDF`, `XLSX`, `CSV`, `OFX`.

### 4.6. Conciliación

Split layout: tabla de movimientos pendientes/parciales + panel de conciliación del movimiento seleccionado:
- Info del mov (fecha, descripción, monto, cuenta)
- **Sugerencia del Learning Engine** con % de confianza
- **Facturas candidatas** de la carga ZIP con checkboxes para asociar
- Líneas del comprobante contable con cuadre en vivo
- Botón "Conciliar y generar CE-000437"

### 4.7. Cartera

5 baldes de edades (Corriente · 1-30 · 31-60 · 61-90 · 90+) + tabla de CxC con cliente, NIT, factura, emisión, vencimiento, valor, saldo, mora y balde con chip por severidad.

### 4.8. Comprobantes Contai

Tabla de CI/CE generados con consecutivo, fecha, tercero, concepto, valor, estado (borrador/listo/exportado) y acción para exportar.

### 4.9. Parametrización Contai (8 sub-tabs)

1. **Comprobantes** — 00001 Compras, 00002 Ventas, 00003 Otros ingresos, 00004 Egresos, 00005 Ajustes + CI/CE automáticos
2. **Plan de cuentas (PUC)** — jerarquía con clase/grupo/cuenta/aux, tipo S/C/B/A, recibe movimiento
3. **Tipos de cuenta S/C/B/A** — qué exige Contai al asentar cada tipo + código de inconsistencia
4. **Plantillas import/export** — 0001, 0002, 3220, 32004, 3221
5. **Códigos Ficha 17** — los 20 códigos de inconsistencia clasificados en `bloquea` / `advierte`
6. **Transacciones bancarias (TrB)** — 10 códigos con mapeo interno ↔ externo
7. **Reglas de retención** — retefuente, ReteIVA, ReteICA por municipio
8. **Regímenes fiscales** — 8 códigos DIAN + matriz de decisión

### 4.10. Configuración

Cuentas bancarias · Reglas de auto-conciliación · Parámetros · Usuarios y roles.

## 5. Generador de plano Contai (Plantilla 0001)

Convierte las facturas causadas en el plano tab-delimitado exacto que Contai importa.

### 5.1. Formato exacto (18 campos)

```
Campo (18)             Long  Ejemplo
─────────────────────  ────  ─────────────────
1. Código Cuenta       20    143520
2. Comprobante         5     00001
3. Fecha D/M/A         10    31/7/2026
4. Documento           9     1000
5. Documento Ref       9     FV1563546
6. NIT                 11    811044788
7. Detalle             28    Mercancías repuestos
8. Tipo (1 Db / 2 Cr)  1     1
9. Valor               21    1063496
10. Valor Base         21    0            (solo cuentas B)
11. Centro de costos   20    CC-ADM
12. Transacción TrB    3                  (solo bancos)
13. Plazo              4     30
14. Cta NIIF           20                 (paralelo NIIF)
15. CC NIIF            20
16. Ident NIIF         1     0
17. Prefijo            9     FV
18. Doc Electrónico    var   ed8372bf...  (CUFE)
```

### 5.2. Ejemplo de salida (FV1563546)

```
143520  00001  31/7/2026  1000  FV1563546  811044788  Mercancías · repuestos       1  1063496  0        CC-ADM  30  0  FV  ed8372bf...
240810  00001  31/7/2026  1000  FV1563546  811044788  IVA descontable 19%           1  178504   1063496  CC-ADM  30  0  FV  ed8372bf...
220505  00001  31/7/2026  1000  FV1563546  811044788  Proveedor MUNDIAL REPUESTOS   2  1242000  0        CC-ADM  30  0  FV  ed8372bf...
```

### 5.3. Reglas de generación

1. Filtra facturas con estado `parametrizada`, `causada` o `pagada` (excluye `anulada`).
2. Por cada factura:
   - **Débitos** (compra) / **Créditos** (venta): una línea por cada cuenta PUC clasificada consolidada
   - **IVA**: 240810 débito (compra) o 240805 crédito (venta), con la base en Valor Base
   - **Retenciones aplicables** (si adquiriente es agente): una línea por concepto
   - **Contrapartida**: 220505 crédito (compra) o 130505 débito (venta) con el neto
3. Fecha normalizada a **D/M/A**.
4. Prefijo extraído automáticamente del número.
5. CUFE en campo 18 cuando el XML lo contiene.

### 5.4. UX

Botón **"Generar plano Contai"** en Facturas → abre modal con preview tab-alineado + botones Copiar TSV, Copiar al portapapeles, Descargar .txt.

Destino: `X:\iltda\Contai\import\Movimiento\` → menú **Procesos → Intercambio de datos → Importar → Movimiento**.

---

# PARTE II · Backend (spec Módulo 10 — a implementar)

Multi-tenant vía `empresa_id` con RLS por JWT claim. Todo en el esquema `data`.

## 6. Modelo de datos

### 6.1. `data.cuenta_bancaria` — Cuentas registradas por empresa

```sql
CREATE TABLE data.cuenta_bancaria (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES data.empresa(id) ON DELETE CASCADE,
  banco               TEXT NOT NULL,                       -- 'Bancolombia','Nequi','BBVA','Davivienda',...
  tipo                TEXT NOT NULL CHECK (tipo IN ('AHORROS','CORRIENTE','NEQUI','DAVIPLATA','FIDUCIA','TARJETA_CREDITO')),
  numero_cuenta       TEXT NOT NULL,                       -- ofuscado: '****3421'
  numero_cuenta_hash  TEXT NOT NULL,                       -- SHA-256 para matching sin exponer
  moneda              CHAR(3) NOT NULL DEFAULT 'COP',
  cuenta_puc          TEXT NOT NULL,                       -- 111005, 111010, 111505...
  centro_costo_default TEXT,
  aplica_gmf          BOOLEAN NOT NULL DEFAULT TRUE,       -- FALSE si es cuenta exenta 4x1000
  activa              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, numero_cuenta_hash)
);

ALTER TABLE data.cuenta_bancaria ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuenta_bancaria_tenant ON data.cuenta_bancaria
  USING (empresa_id = current_setting('request.jwt.claims', true)::json->>'empresa_id' :: BIGINT);
```

### 6.2. `data.extracto_lote` — Extractos importados

```sql
CREATE TABLE data.extracto_lote (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL,
  cuenta_bancaria_id  BIGINT NOT NULL REFERENCES data.cuenta_bancaria(id),
  archivo_nombre      TEXT NOT NULL,
  archivo_hash        TEXT NOT NULL,                       -- SHA-256 del binario
  formato             TEXT NOT NULL CHECK (formato IN ('BANCOLOMBIA_XLS','NEQUI_XLSX','BBVA_CSV','DAVIVIENDA_XLSX','OFX','MT940','PDF_OCR','GENERICO_CSV')),
  fecha_inicio        DATE NOT NULL,
  fecha_fin           DATE NOT NULL,
  saldo_inicial       NUMERIC(18,2),
  saldo_final         NUMERIC(18,2),
  total_ingresos      NUMERIC(18,2),
  total_egresos       NUMERIC(18,2),
  filas_leidas        INTEGER NOT NULL,
  filas_insertadas    INTEGER NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'PROCESADO' CHECK (estado IN ('PROCESANDO','PROCESADO','ERROR','REVERSADO')),
  importado_por       BIGINT REFERENCES data.usuario(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, cuenta_bancaria_id, archivo_hash)   -- idempotencia
);
```

### 6.3. `data.movimiento_bancario` — Fuente de verdad del banco

```sql
CREATE TABLE data.movimiento_bancario (
  id                   BIGSERIAL PRIMARY KEY,
  empresa_id           BIGINT NOT NULL,
  cuenta_bancaria_id   BIGINT NOT NULL REFERENCES data.cuenta_bancaria(id),
  extracto_lote_id     BIGINT NOT NULL REFERENCES data.extracto_lote(id) ON DELETE CASCADE,
  fecha_movimiento     DATE NOT NULL,
  fecha_valor          DATE,
  descripcion_raw      TEXT NOT NULL,
  descripcion_norm     TEXT,
  referencia_banco     TEXT,
  monto                NUMERIC(18,2) NOT NULL,              -- CONSERVA SIGNO
  saldo_despues        NUMERIC(18,2),
  canal                TEXT,                                -- PSE, ACH, EFECTIVO, CHEQUE, DEBITO_AUT, COMISION, GMF
  estado_conciliacion  TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_conciliacion IN ('PENDIENTE','PARCIAL','CONCILIADO','IGNORADO','EN_DISPUTA')),
  clasificacion        TEXT CHECK (clasificacion IN ('OPERACIONAL','PERSONAL','NO_APLICA','AJUSTE_BANCO')),
  fila_origen          INTEGER NOT NULL,
  hash_linea           TEXT NOT NULL,                       -- SHA-256 dedupe
  notas                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_bancaria_id, hash_linea)
);

CREATE INDEX idx_mov_empresa_fecha ON data.movimiento_bancario(empresa_id, fecha_movimiento);
CREATE INDEX idx_mov_estado        ON data.movimiento_bancario(empresa_id, estado_conciliacion)
                                   WHERE estado_conciliacion IN ('PENDIENTE','PARCIAL');
CREATE INDEX idx_mov_descripcion   ON data.movimiento_bancario USING gin (to_tsvector('spanish', descripcion_norm));
```

### 6.4. `data.movimiento_documento` — Relación N:M

Tabla clave. Un movimiento puede vincularse a varias facturas; una factura puede pagarse en varios movimientos.

```sql
CREATE TABLE data.movimiento_documento (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL,
  movimiento_id       BIGINT NOT NULL REFERENCES data.movimiento_bancario(id) ON DELETE CASCADE,
  documento_id        BIGINT NOT NULL REFERENCES data.documento(id) ON DELETE RESTRICT,
  concepto            TEXT NOT NULL CHECK (concepto IN (
                        'PAGO_FACTURA_COMPRA','PAGO_FACTURA_VENTA',
                        'ANTICIPO_PROVEEDOR','ANTICIPO_CLIENTE',
                        'NOTA_CREDITO_APLICADA','NOTA_DEBITO_APLICADA',
                        'DEVOLUCION','RETENCION_PRACTICADA','DESCUENTO_PP',
                        'AJUSTE_CAMBIARIO','GMF','COMISION_BANCARIA','RENDIMIENTOS'
                      )),
  valor               NUMERIC(18,2) NOT NULL CHECK (valor > 0),
  cuenta_puc          TEXT NOT NULL,
  centro_costo        TEXT,
  base_gravable       NUMERIC(18,2),
  tarifa_pct          NUMERIC(6,3),
  notas               TEXT,
  origen              TEXT NOT NULL DEFAULT 'MANUAL' CHECK (origen IN ('MANUAL','SUGERENCIA_ML','REGLA_EXPLICITA','AUTO_MATCH_EXACTO')),
  confianza           NUMERIC(4,3),
  created_by          BIGINT REFERENCES data.usuario(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.5. `data.movimiento_log` — Log inmutable de auditoría

Sagrado, nunca se toca.

```sql
CREATE TABLE data.movimiento_log (
  id             BIGSERIAL PRIMARY KEY,
  empresa_id     BIGINT NOT NULL,
  usuario_id     BIGINT NOT NULL REFERENCES data.usuario(id),
  entidad        TEXT NOT NULL,
  entidad_id     BIGINT NOT NULL,
  accion         TEXT NOT NULL CHECK (accion IN ('CREATE','UPDATE','DELETE','CONCILIAR','DESCONCILIAR','EXPORTAR')),
  payload_antes  JSONB,
  payload_despues JSONB,
  ip             INET,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE UPDATE, DELETE ON data.movimiento_log FROM PUBLIC;

CREATE TRIGGER log_no_update BEFORE UPDATE ON data.movimiento_log
  FOR EACH ROW EXECUTE FUNCTION data.trg_log_immutable();
CREATE TRIGGER log_no_delete BEFORE DELETE ON data.movimiento_log
  FOR EACH ROW EXECUTE FUNCTION data.trg_log_immutable();
```

### 6.6. `data.comprobante_pago` — Cabecera del asiento

```sql
CREATE TABLE data.comprobante_pago (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL,
  movimiento_id       BIGINT NOT NULL UNIQUE REFERENCES data.movimiento_bancario(id) ON DELETE RESTRICT,
  tipo                TEXT NOT NULL CHECK (tipo IN ('CI','CE')),  -- Ingreso / Egreso
  consecutivo         BIGINT NOT NULL,
  fecha               DATE NOT NULL,
  tercero_id          BIGINT NOT NULL REFERENCES data.tercero(id),
  concepto_general    TEXT NOT NULL,
  valor_bruto         NUMERIC(18,2) NOT NULL,
  valor_retenciones   NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_gmf           NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_comision      NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_neto          NUMERIC(18,2) NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','LISTO','EXPORTADO','ANULADO')),
  exportado_at        TIMESTAMPTZ,
  exportado_lote_id   BIGINT REFERENCES data.export_lote(id),
  ficha_17_ok         BOOLEAN,
  ficha_17_errores    JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo, consecutivo)
);
```

## 7. Trigger de cuadre

El trigger que garantiza la invariante `SUM(movimiento_documento.valor · signo) == ABS(movimiento_bancario.monto)`:

```sql
CREATE OR REPLACE FUNCTION data.trg_movdoc_cuadre()
RETURNS TRIGGER AS $$
DECLARE
  v_monto_banco    NUMERIC(18,2);
  v_suma_asignada  NUMERIC(18,2);
  v_tolerancia     NUMERIC(18,2) := 1.00;
BEGIN
  SELECT ABS(monto) INTO v_monto_banco
  FROM data.movimiento_bancario
  WHERE id = COALESCE(NEW.movimiento_id, OLD.movimiento_id);

  SELECT COALESCE(SUM(
      CASE
        WHEN concepto IN ('RETENCION_PRACTICADA','DESCUENTO_PP','NOTA_CREDITO_APLICADA')
          THEN -valor
        ELSE valor
      END
    ), 0)
  INTO v_suma_asignada
  FROM data.movimiento_documento
  WHERE movimiento_id = COALESCE(NEW.movimiento_id, OLD.movimiento_id);

  IF ABS(v_suma_asignada - v_monto_banco) > v_tolerancia THEN
    RAISE EXCEPTION 'Cuadre inválido: banco=%, asignado=% (dif=%)',
      v_monto_banco, v_suma_asignada, (v_suma_asignada - v_monto_banco);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
```

## 8. Reglas de signo y cuadre

| Concepto (`movimiento_documento.concepto`) | Signo | Cuenta PUC típica |
|---|---|---|
| `PAGO_FACTURA_COMPRA` | +\|monto\| (egreso) | 220505 / 220510 |
| `PAGO_FACTURA_VENTA` | +\|monto\| (ingreso) | 130505 / 130510 |
| `ANTICIPO_PROVEEDOR` | +\|monto\| | 133005 |
| `ANTICIPO_CLIENTE` | +\|monto\| | 280505 |
| `NOTA_CREDITO_APLICADA` | −\|monto\| | contra CxP/CxC |
| `NOTA_DEBITO_APLICADA` | +\|monto\| | contra CxP/CxC |
| `RETENCION_PRACTICADA` | −\|monto\| (redujo lo que salió/entró) | 236540 / 236525 / 236805 |
| `DESCUENTO_PP` | −\|monto\| | 421040 |
| `GMF` | +\|monto\| (sale extra) | 530525 |
| `COMISION_BANCARIA` | +\|monto\| | 530595 |
| `RENDIMIENTOS` | +\|monto\| (entra al banco) | 421005 |
| `AJUSTE_CAMBIARIO` | ±\|monto\| | 421020 / 530520 |

**Regla de oro:** el neto asignado (aplicando signos) debe igualar `|movimiento_bancario.monto|` — con tolerancia $1 COP — al momento de conciliar.

### 8.1. Ejemplo con retención

Factura de compra $10.000.000 base + $1.900.000 IVA = $11.900.000 total. Retefuente 2.5% sobre base = $250.000. Neto a pagar: **$11.650.000**.

Movimiento bancario: `−$11.650.000`.

Líneas de conciliación:
```
PAGO_FACTURA_COMPRA     11.900.000   cta 220505   (+)
RETENCION_PRACTICADA       250.000   cta 236540   (−)   base 10.000.000  tarifa 2.5%
                        ──────────
Neto:                   11.650.000  ✓
```

Asiento en Contai:
```
DB 220505 Proveedores            11.900.000
CR 111005 Bancolombia                        11.650.000
CR 236540 Retefuente por pagar                  250.000
```

## 9. Learning Engine (SQL)

Con Laplace-smoothed confidence:

```sql
CREATE TABLE data.patron_movimiento (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL,
  cuenta_bancaria_id  BIGINT REFERENCES data.cuenta_bancaria(id),
  patron_regex        TEXT NOT NULL,
  tercero_id_sugerido BIGINT REFERENCES data.tercero(id),
  concepto_sugerido   TEXT,
  cuenta_puc_sugerida TEXT,
  centro_costo_sugerido TEXT,
  hits                INTEGER NOT NULL DEFAULT 0,
  aciertos            INTEGER NOT NULL DEFAULT 0,
  confianza           NUMERIC(4,3) GENERATED ALWAYS AS
                        ((aciertos + 1.0) / (hits + 2.0)) STORED,
  prioridad           INTEGER NOT NULL DEFAULT 100,
  activo              BOOLEAN NOT NULL DEFAULT TRUE
);
```

Autopromoción: si un patrón alcanza >30 hits con confianza >0.90 se promueve a regla explícita.

Feedback loop: aceptar sugerencia sin modificar → `aciertos++`; modificar → solo `hits++`.

```sql
CREATE OR REPLACE FUNCTION api.sugerir_conciliacion(p_movimiento_id BIGINT)
RETURNS TABLE (
  tercero_id BIGINT, tercero_nombre TEXT, concepto TEXT,
  cuenta_puc TEXT, centro_costo TEXT, confianza NUMERIC, fuente TEXT
) AS $$
  -- 1. Match por regla explícita → confianza 1.0, fuente 'REGLA'
  -- 2. Match por patrón regex → confianza del patrón, fuente 'PATRON'
  -- 3. Match por historia de pagos al mismo tercero → confianza histórica, fuente 'HISTORIA'
  -- 4. Match por monto exacto contra CxP/CxC abiertas → confianza calculada, fuente 'MONTO'
$$ LANGUAGE sql SECURITY DEFINER;
```

## 10. Exportación Contai — Plantilla 0003 (comprobantes)

Estructura doble nivel: cabecera + detalle en el mismo archivo, diferenciados por primer campo (`H`/`D`):

```
H\tCE\t000437\t20260905\t900123456\tPago retencion IVA bim3\t4200000\t
D\t1\t240810\t900123456\t3800000\t0\tCC-ADM\tPago retencion IVA
D\t2\t530595\t900123456\t400000\t0\tCC-ADM\tIntereses mora
D\t3\t111005\t\t0\t4200000\tCC-ADM\tSalida Bancolombia
```

El generador valida ficha-17 antes de escribir, deposita el archivo en `X:\iltda\Contai\import\comprobantes\` y registra el hash en `data.export_lote`.

## 11. API REST expuesta por PostgREST

| Verb | Ruta | Devuelve |
|---|---|---|
| GET | `/cuenta_bancaria` | Cuentas activas de la empresa |
| GET | `/movimiento_bancario?estado_conciliacion=eq.PENDIENTE&order=fecha_movimiento.desc` | Pendientes |
| GET | `/mv_tesoreria` | Panel de tesorería |
| GET | `/cartera_edades?tercero_id=eq.44` | Edades de saldo de un cliente |
| POST | `/rpc/movimiento_conciliar` | Conciliación manual |
| POST | `/rpc/movimiento_desconciliar` | Deshace conciliación (si mes no cerrado) |
| POST | `/rpc/importar_extracto` | Encola `JOB_IMPORT_EXTRACTO` |
| POST | `/rpc/auto_match_lote` | Encola `JOB_AUTO_MATCH` |
| GET | `/rpc/facturas_candidatas?movimiento_id=8891` | Autocomplete de facturas |
| GET | `/rpc/sugerir_conciliacion?movimiento_id=8891` | Sugerencias Learning Engine |
| POST | `/rpc/exportar_mes_contai` | Export batch del mes |
| POST | `/rpc/congelar_mes` | Cierra mes contable |

Todas con RLS por `empresa_id` del JWT.

---

# PARTE III · Integración frontend ↔ backend

## 12. Mapeo entre el artifact actual y las tablas

| Módulo frontend | Tabla(s) backend | Endpoint |
|---|---|---|
| Panel general → cuentas bancarias | `data.cuenta_bancaria`, `api.mv_tesoreria` | `GET /mv_tesoreria` |
| Panel → actividad reciente | `data.movimiento_bancario` (últimos 10) | `GET /movimiento_bancario?limit=10&order=created_at.desc` |
| Facturas → tabla | `data.documento` | `GET /documento?tipo=in.(FACTURA_COMPRA,FACTURA_VENTA)` |
| Facturas → parametrización modal (líneas + PUC) | `data.documento_linea`, `data.parametrizacion_puc` | `GET /documento/{id}?select=*,documento_linea(*)` |
| Facturas → clasificador aprendizaje (localStorage) | `data.patron_movimiento` | `GET /patron_movimiento` + `POST /rpc/aprender_patron` |
| Facturas → generador plano Contai | `data.comprobante_pago`, `data.movimiento_documento` | `POST /rpc/generar_plano_movimiento` |
| Clientes / Proveedores | `data.tercero` | `GET /tercero?tipo=eq.CLIENTE` |
| Nómina | `data.nomina_periodo`, `data.nomina_empleado` | `POST /rpc/procesar_quincena` |
| Extractos → lotes | `data.extracto_lote` | `GET /extracto_lote?order=created_at.desc` |
| Extractos → movimientos | `data.movimiento_bancario` | `GET /movimiento_bancario?extracto_lote_id=eq.X` |
| Conciliación → pendientes | `data.movimiento_bancario` | `GET /movimiento_bancario?estado_conciliacion=in.(PENDIENTE,PARCIAL)` |
| Conciliación → sugerencia | Learning Engine | `GET /rpc/sugerir_conciliacion?movimiento_id=X` |
| Conciliación → asociar factura | `data.movimiento_documento` | `POST /rpc/movimiento_conciliar` |
| Cartera → baldes de edades | `api.cartera_edades` (vista) | `GET /cartera_edades` |
| Comprobantes Contai | `data.comprobante_pago` | `GET /comprobante_pago?estado=eq.LISTO` |
| Parametrización → cuentas bancarias | `data.cuenta_bancaria` | `GET /cuenta_bancaria` + `POST /cuenta_bancaria` |
| Parametrización → reglas retención | `data.regla_retencion` (nueva) | `GET /regla_retencion` |

## 13. Flujos end-to-end (integración completa)

### 13.1. Causación automática de factura DIAN

```
1. Contador sube ZIP en Facturas → parser XML DIAN extrae emisor + adquiriente + regímen + 19 líneas
2. Frontend: POST /rpc/parametrizar_factura {factura, lineas}
3. Backend: INSERT en data.documento + data.documento_linea
4. Clasificador (backend) evalúa cada línea contra data.patron_movimiento + reglas por defecto
5. Motor retenciones evalúa contra UVT + régimen fiscal del adquiriente
6. Frontend: modal muestra líneas parametrizadas + asiento cuadrado
7. Contador ajusta y "Causa" → POST /rpc/causar_factura
8. Backend: INSERT en data.comprobante_pago + líneas del asiento, trigger cuadre valida
9. Frontend: al presionar "Generar plano Contai" → GET /rpc/generar_plano_movimiento
10. Backend responde con texto tab-delimitado (Plantilla 0001)
11. Contador pega en Contai → import valida contra Ficha 17
```

### 13.2. Conciliación bancaria mensual

```
1. Contador sube extracto en Extractos → POST /rpc/importar_extracto
2. Backend crea data.extracto_lote + inserta N data.movimiento_bancario (idempotente por hash_linea)
3. JOB_AUTO_MATCH corre auto-conciliación de GMF/comisiones (regla explícita, confianza 1.0)
4. Frontend: movimientos aparecen en Conciliación con chips
5. Contador clic en mov → GET /rpc/sugerir_conciliacion?movimiento_id=X
6. Backend consulta: (1) reglas explícitas, (2) patrones regex, (3) historia de pagos, (4) monto exacto contra CxP/CxC abiertas
7. Frontend muestra sugerencia con % confianza + facturas candidatas
8. Contador marca facturas → POST /rpc/movimiento_conciliar {movimiento_id, lineas}
9. Backend: INSERT en data.movimiento_documento, trigger cuadre valida, INSERT en data.comprobante_pago (CI/CE), UPDATE movimiento a CONCILIADO, INSERT en data.movimiento_log
10. Al final del mes: POST /rpc/congelar_mes → marca lote como CONGELADO + genera PDF acta + export batch
```

---

# PARTE IV · Extensiones y roadmap

## 14. Mejoras del backend (Módulo 10)

### 14.1. Auto-matcher en dos vías

Job que intenta conciliar automáticamente todo lo obvio:
- Monto único + tercero identificable + factura abierta con monto exacto → auto-conciliación 100%
- GMF y comisiones bancarias → siempre auto-conciliados
- Nómina → si egreso = suma neta nómina del mes → auto-vincula a 250505
- PILA → match contra archivo PILA del mes

En una empresa mediana con 400 movimientos/mes, esto reduce el trabajo humano a ~40-60 registros.

### 14.2. Panel de tesorería en vivo

Vista materializada refrescada cada 15 min:

```sql
CREATE MATERIALIZED VIEW api.mv_tesoreria AS
SELECT e.id AS empresa_id, e.razon_social,
  cb.banco, cb.numero_cuenta, cb.tipo,
  (SELECT saldo_despues FROM data.movimiento_bancario m
     WHERE m.cuenta_bancaria_id = cb.id
     ORDER BY fecha_movimiento DESC, id DESC LIMIT 1) AS saldo_actual,
  COUNT(m.id) FILTER (WHERE m.estado_conciliacion IN ('PENDIENTE','PARCIAL'))
    AS movimientos_pendientes,
  COUNT(m.id) FILTER (WHERE m.estado_conciliacion IN ('PENDIENTE','PARCIAL')
                       AND m.fecha_movimiento < CURRENT_DATE - 30)
    AS pendientes_criticos
FROM data.empresa e
JOIN data.cuenta_bancaria cb ON cb.empresa_id = e.id
LEFT JOIN data.movimiento_bancario m ON m.cuenta_bancaria_id = cb.id
GROUP BY e.id, e.razon_social, cb.banco, cb.numero_cuenta, cb.tipo, cb.id;
```

### 14.3. Detección de anomalías

Cron diario:
- Movimientos duplicados (misma fecha + monto + descripción)
- Egresos inusuales por magnitud (z-score >3)
- Terceros nuevos con montos altos (fraude/error digitación)
- GMF que no cuadra con 0.4% de egresos gravables

Se materializa en `data.alerta_conciliacion`.

### 14.4. Cartera y edades de saldo (sub-producto gratis)

```sql
CREATE VIEW api.cartera_edades AS
SELECT d.tercero_id, t.razon_social, d.numero_documento, d.fecha_emision,
  d.valor_total,
  d.valor_total - COALESCE(SUM(md.valor), 0) AS saldo_pendiente,
  CURRENT_DATE - d.fecha_vencimiento AS dias_mora,
  CASE
    WHEN CURRENT_DATE - d.fecha_vencimiento <= 0   THEN 'CORRIENTE'
    WHEN CURRENT_DATE - d.fecha_vencimiento <= 30  THEN '1-30'
    WHEN CURRENT_DATE - d.fecha_vencimiento <= 60  THEN '31-60'
    WHEN CURRENT_DATE - d.fecha_vencimiento <= 90  THEN '61-90'
    ELSE '90+'
  END AS balde
FROM data.documento d
JOIN data.tercero t ON t.id = d.tercero_id
LEFT JOIN data.movimiento_documento md ON md.documento_id = d.id AND md.concepto = 'PAGO_FACTURA_VENTA'
WHERE d.tipo = 'FACTURA_VENTA'
GROUP BY d.id, t.razon_social;
```

### 14.5. Flujo de efectivo NIIF (sección 7) método directo

```sql
CREATE VIEW api.flujo_efectivo_directo AS
SELECT empresa_id, DATE_TRUNC('month', fecha_movimiento) AS mes,
  CASE
    WHEN concepto IN ('PAGO_FACTURA_VENTA','ANTICIPO_CLIENTE','RENDIMIENTOS') THEN 'RECAUDOS_CLIENTES'
    WHEN concepto IN ('PAGO_FACTURA_COMPRA','ANTICIPO_PROVEEDOR') THEN 'PAGOS_PROVEEDORES'
    WHEN concepto = 'RETENCION_PRACTICADA' THEN 'IMPUESTOS'
  END AS renglon,
  SUM(md.valor) AS valor
FROM data.movimiento_documento md
JOIN data.movimiento_bancario mb ON mb.id = md.movimiento_id
WHERE mb.clasificacion = 'OPERACIONAL'
GROUP BY 1, 2, 3;
```

### 14.6. Integración PSE y pasarelas

```sql
UPDATE data.movimiento_bancario mb
SET estado_conciliacion = 'CONCILIADO'
FROM data.documento d
WHERE mb.canal = 'PSE'
  AND regexp_matches(mb.referencia_banco, '(FE[- ]?\d+)')[1] = d.numero_documento
  AND d.tipo = 'FACTURA_VENTA'
  AND d.valor_total = mb.monto;
```

### 14.7. OCR de soportes de pago recibidos

Endpoint `POST /rpc/subir_soporte_pago` acepta imagen, corre OCR + heurísticas para extraer fecha, monto, cuenta destino, referencia. Busca el `movimiento_bancario` correspondiente y adjunta el soporte.

### 14.8. Partidas conciliatorias clásicas

Vista que compara `data.movimiento_bancario` vs. `data.movimiento_libros` y genera:
- Cheques girados y no cobrados
- Consignaciones en tránsito
- Notas débito/crédito no contabilizadas
- Errores del banco / de la empresa

Genera automáticamente el **acta de conciliación bancaria firmable** en PDF.

### 14.9. Multi-cuenta con transferencias internas

Matcher automático de pares egreso/ingreso entre cuentas propias:

```sql
CREATE VIEW api.traslados_internos_candidatos AS
SELECT a.id AS mov_egreso, b.id AS mov_ingreso,
  a.cuenta_bancaria_id AS cb_origen, b.cuenta_bancaria_id AS cb_destino,
  a.monto, a.fecha_movimiento
FROM data.movimiento_bancario a
JOIN data.movimiento_bancario b
  ON a.empresa_id = b.empresa_id
 AND a.cuenta_bancaria_id <> b.cuenta_bancaria_id
 AND a.monto = -b.monto
 AND ABS(a.fecha_movimiento - b.fecha_movimiento) <= 2
WHERE a.monto < 0 AND b.monto > 0
  AND a.estado_conciliacion = 'PENDIENTE'
  AND b.estado_conciliacion = 'PENDIENTE';
```

### 14.10. Botón "Congelar mes"

Cierre mensual:
- `data.extracto_lote.estado = 'CONGELADO'`
- Bloqueo de UPDATE/DELETE sobre movimientos del mes vía trigger
- PDF firmable del acta de conciliación archivado en governance de documentos
- Export batch de todos los comprobantes del mes

### 14.11. Reglas por lote — masivas

```
POST /rpc/regla_masiva
{
  "filtro": { "descripcion_contiene": "COMISION MANEJO" },
  "aplicar": { "concepto": "COMISION_BANCARIA", "cuenta_puc": "530595" },
  "solo_pendientes": true,
  "dry_run": false
}
```

Devuelve `{ afectados: 12, ids: [...] }`. Ejecución en transacción, registrado en `movimiento_log`.

### 14.12. Modo dual: Contai ↔ Siigo Nube

Como el `erp_proveedor_enum` ya contempla `SIIGO_NUBE`, la exportación tiene dos backends:
- **Contai** → plano tab-delimitado en `X:\iltda\Contai\import\`
- **Siigo Nube** → POST a `https://api.siigo.com/v1/vouchers`

Código de conciliación idéntico; solo cambia el adapter de export.

## 15. Casos límite

| Caso | Manejo |
|---|---|
| Extracto trae misma fila dos veces | UNIQUE `(cuenta, hash_linea)` lo bloquea |
| Movimiento sin factura identificable (anticipo) | Cuenta puente (135595 / 233595) y luego se traslada |
| Factura pagada en 3 abonos parciales | `estado_conciliacion = 'PARCIAL'` en cada mov; CxP abierta hasta último abono |
| Retención practicada por el cliente aparece días después | `RETENCION_PRACTICADA` con `documento_id` = factura original |
| Cheque devuelto | Movimiento de reverso; comprobante marcado `ANULADO`, se genera CE de reversión |
| Descuento por pronto pago | Línea `DESCUENTO_PP` con `−valor`; cta 421040 |
| Rendimientos financieros | Auto-clasificado si descripción contiene `RENDIMIENTO` / `INTERES CTA` |
| GMF exento sobre nómina | `cuenta_bancaria.aplica_gmf = FALSE` evita línea GMF |
| Pago en USD | `moneda = 'USD'`, requiere `TRM_conversion` del BR oficial |
| Movimiento marcado por error como personal | Reclasificable mientras mes no congelado; queda en `movimiento_log` |

## 16. Parámetros configurables (tabla `data.configuracion`)

| Parámetro | Default | Descripción |
|---|---|---|
| `conciliacion.tolerancia_cop` | 1 | Tolerancia de cuadre en pesos |
| `conciliacion.ventana_dias_match` | 15 | Días ± para buscar factura por fecha |
| `conciliacion.auto_match_confianza_min` | 0.90 | Confianza para auto-conciliar |
| `conciliacion.dias_mora_critico` | 30 | Umbral badge rojo tesorería |
| `gmf.tarifa` | 0.004 | Tarifa GMF (4x1000) |
| `gmf.cuenta_puc` | 530525 | Cuenta contable GMF |
| `comision.cuenta_puc_default` | 530595 | Cuenta contable comisiones |
| `uvt.valor_2026` | 49799 | UVT vigente 2026 |
| `retefuente.tope_compras_uvt` | 27 | Tope compras generales |

Todos editables desde la UI por empresa (multi-tenant).

---

# PARTE V · Principios y convenciones

## 17. Principios que preservar

1. **La única fuente de verdad del banco es `movimiento_bancario`.** Todo lo demás son vistas o derivadas.
2. **El log `movimiento_log` es sagrado.** Nunca UPDATE, nunca DELETE. Trigger + REVOKE.
3. **Idempotencia por hash del archivo y hash de línea.** Re-subir el mismo extracto no daña nada.
4. **Cuadre validado por trigger,** no por convención. El BD rechaza escrituras que descuadren al conciliar.
5. **Toda regla de negocio vive en el backend o en vistas SQL.** El frontend solo pinta.
6. **`sin_relacionar` debe tender a cero.** Un mes con `sin_relacionar > 0` no se puede congelar.
7. **Multi-tenant estricto por RLS.** Ningún endpoint puede ver datos de otra empresa aunque el JWT esté mal formado.
8. **Los cálculos "en vivo"** (moras, alertas) se hacen a demanda; la única caché es la vista materializada de tesorería.

## 18. Convenciones de código frontend

- Un archivo HTML monolítico (`extractor.html`) mientras esté en fase prototipo
- Tokens CSS en `:root`, temas via `[data-theme]` + media query
- Sin frameworks JS — vanilla + `DOMParser` nativo
- Todo el estado en variables `let` cerradas en el IIFE — no globals
- Storage local vía `localStorage` con try/catch en cada acceso
- Naming: camelCase en JS, kebab-case en CSS, snake_case en IDs de datos

---

# ANEXOS

## A. Palabras clave del clasificador (por defecto)

```
REPUESTO, CILINDRO, PISTON, ANILLO, EMPAQUE, FILTRO, BANDA FRENO,
ACEITE, KIT ARRASTRE, CADENILLA, PIN PISTON, RETEN, VALVULA, GUIA,
PASADOR, TENSORA, CLUTCH, VOLANTE, CULATA, MERCANC        → 143520 / 519535 / 152405

PAPEL, IMPRESION, TONER, CARTUCHO, TINTA, LAPIZ, ESFERO,
FOLDER, CARPETA, ARCHIVADOR                              → 143515 / 519515

GASOLINA, ACPM, DIESEL, COMBUSTIBLE, LUBRICANTE          → 143530 / 513095

ENERGIA, ELECTRIC, ACUEDUCTO, AGUA, GAS NATURAL,
INTERNET, TELEFON                                        → 513525

HONORARIO, ASESORIA, CONSULTORIA, CONTABLE, JURIDIC      → 511010

ARRENDAMIENTO, ARRIENDO, CANON, ALQUILER                 → 511510

SEGURO, POLIZA, SOAT, ARL                                → 512505

MANTENIMIENTO, REPARACION, SERVICIO TECNICO              → 513525

COMPUTADOR, LAPTOP, MONITOR, SERVIDOR, IMPRESORA,
MUEBLE, ESCRITORIO, SILLA                                → 152805 / 519530 / 152805
```

## B. Estructura del código single-file

```
extractor.html (~2.700 líneas)
├─ <title>Gravimentes · Conciliación</title>
├─ <link> Google Fonts (Source Serif 4, Inter, IBM Plex Mono)
├─ <style>
│    ├─ Tokens :root (paleta, tipografía, sombras)
│    ├─ Temas: bare + dark media + [data-theme="dark"]
│    ├─ App shell (grid topbar + sidebar + main)
│    ├─ Componentes (btn, card, kpi, chip, tabla, upload-zone, modal-overlay)
│    └─ Vistas específicas (intro, extracto-split, concil-split, balde-strip)
├─ <div class="app">
│    ├─ Topbar (brand, empresa switch, theme, user)
│    ├─ Sidebar (nav 10 items)
│    └─ Main (10 sections como views swappable)
├─ Modal parametrización factura
├─ Modal plano Contai
├─ <script src="pdf.js 3.11.174">
├─ <script src="jszip 3.10.1">
└─ <script>
     ├─ Utilidades (fmt, escapeHtml, parseCOP con detección es-CO/en-US)
     ├─ Sample data (movs, facturas, FV1563546_LINES)
     ├─ Motor retenciones (UVT 2026, REGIMENES, computeRetenciones)
     ├─ Parser XML DIAN (tagLocal, tagsLocal, parseInvoiceXml)
     ├─ Clasificador productos (CLASSIFIER_RULES, classifyItem, teachClassifier)
     ├─ Modal parametrización (openParametrizarModal, renderModalLineas/Asiento/Learned)
     ├─ Generador plano Contai (toDMA, generatePlanoContai, openPlanoModal)
     ├─ Render tablas (renderFacturasTable, renderMovTable, renderConcilTable)
     ├─ Handlers upload (handleFacturaFiles con JSZip)
     ├─ Routing por hash (showView)
     └─ Init (aplicar tema, render inicial)
```

## C. Módulos SQL a implementar (esquema `data`)

```
├─ 01_terceros_y_parametrizacion.sql       (Clientes, Proveedores, PUC)
├─ 02_retencion_por_responsabilidad.sql    (motor retenciones)
├─ 03_learning_engine.sql                   (patron_movimiento, patron_historico_pago_tercero)
├─ 04_multi_empresa_y_mailbox.sql           (webhook OFX/CSV bancarios opcional)
├─ 05_reglas_explicitas.sql                 (operador 'descripcion_regex' para movimientos)
├─ 06_nomina.sql                            (nómina_periodo, nomina_empleado, PILA)
├─ 07_conciliacion_dian.sql                 (patrón sin_clasificar=0)
├─ 08_governance_documentos.sql             (tipo documental 'acta_conciliacion_bancaria')
├─ 09_contai_adapter.sql                    (generador plantillas 0001, 0002, 0003, 3220)
└─ 10_conciliacion_bancaria.sql             (movimiento_bancario, movimiento_documento, comprobante_pago, log, triggers, RLS)
```

---

**Última revisión:** Septiembre 2026
**Versión del producto (artifact):** v1.1
**Versión del backend (spec):** v1.0
**Compilación:** local · sin telemetría · multi-tenant-ready
**Fuentes fusionadas:**
- `10_conciliacion_bancaria.md` (spec backend Módulo 10 · Gravimentes SQL)
- `gravimentes_proyecto.md` (product spec del artifact web)
- Guía Consolidada de Contai (Siigo + ilimitada)
- Extracción real FV1563546 (MUNDIAL DE REPUESTOS DE MOTOS SAS)
