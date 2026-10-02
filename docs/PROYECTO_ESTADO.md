# Estado del proyecto — Ancla de memoria

> Este documento es el punto de partida canónico. Cualquier persona (o sesión futura) que abra el repositorio sin contexto previo debe poder retomar el trabajo leyendo este archivo primero. Está diseñado para reemplazar la reconstrucción por historial de conversación.

**Actualizado:** septiembre 2026
**Rama de trabajo activa:** `claude/artifacts-webpage-creation-7p87ez`
**PR abierto:** [randyAZAC2026-blip/Proyecto-Siigo#3](https://github.com/randyAZAC2026-blip/Proyecto-Siigo/pull/3)

---

## Qué es este repositorio

**Proyecto-Siigo** contiene dos productos superpuestos que comparten stack de Supabase pero con propósitos distintos:

1. **Asesor Tributario IA** *(base histórica, en `src/`)* — app React 19 + Vite 8 + shadcn/ui que clasifica actividad económica en lenguaje natural y calcula IVA, ReteFuente e ICA (Medellín) usando Claude API vía Edge Function. Descrita completamente en `CLAUDE.md` de la raíz.

2. **Gravimentes** *(módulo en construcción)* — ERP contable Contai-compatible para pyme colombiana. Digitaliza el ciclo contable completo (facturas DIAN, retenciones, conciliación bancaria, comprobantes Contai). Existe como:
   - **Frontend:** artifact web publicado en `https://claude.ai/code/artifact/eec4fd9a-a2cc-4116-a5e3-e845e2ece558` — single-file HTML/CSS/JS vanilla, sin backend.
   - **Backend:** especificación SQL/RLS en `docs/gravimentes_consolidado.md` + migración inicial `supabase/migrations/0002_conciliacion_bancaria.sql`.

Ambos productos usan la misma instancia Supabase pero tablas separadas. El artifact de Gravimentes está diseñado para migrar a este backend cuando se despliegue.

---

## Estructura relevante

```
Proyecto-Siigo/
├─ CLAUDE.md                                # Guía del Asesor Tributario IA (histórico)
├─ docs/
│  ├─ PROYECTO_ESTADO.md                    # ← ESTE archivo (ancla)
│  └─ gravimentes_consolidado.md            # Spec fusionada Gravimentes (producto + backend + integración)
├─ src/                                     # React app del Asesor Tributario IA
│  ├─ pages/{LoginPage, CalculatorPage, admin/}
│  ├─ hooks/useAuth.tsx                     # Supabase Auth wrapper (reutilizable por Gravimentes)
│  └─ lib/supabase/{client, database.types}
├─ supabase/
│  ├─ functions/classify-tax/               # Edge Function del Asesor Tributario
│  └─ migrations/
│     ├─ 0001_init.sql                      # Schema Asesor Tributario (profiles, uvt_rates, retefte_concepts, iva, ica, regímenes)
│     └─ 0002_conciliacion_bancaria.sql     # Módulo 10 Gravimentes (empresas, cuenta_bancaria, movimientos, comprobantes, log inmutable, RLS)
└─ scripts/seed.ts                          # Poblado de tablas fiscales del Asesor
```

El artifact de Gravimentes **no está en este repo**. Es un HTML monolítico publicado como Artifact de Claude. Para editarlo, se reabre el URL del artifact y se despliega desde ahí.

---

## Estado de Gravimentes (frontend / artifact)

### Módulos implementados

| Módulo | Ruta hash | Funcionalidad |
|---|---|---|
| Panel general | `#dashboard` | KPIs consolidados + tabla cuentas bancarias + actividad reciente + card de introducción con 4 pilares |
| Facturas | `#facturas` | Carga ZIP (PDF+XML DIAN), parser UBL 2.1, tabla con régimen fiscal, retención sugerida, botón PDF por fila |
| Clientes | `#clientes` | 8 clientes tipo C con NIT, actividad DIAN, cartera |
| Proveedores | `#proveedores` | 6 proveedores con responsabilidades DIAN (chips R-01/O-13/O-15/O-23/R-99-PN/R-04) |
| Nómina | `#nomina` | Quincena sep 2026, 8 empleados, KPIs + PILA |
| Extractos | `#extractos` | 4 lotes (Bancolombia/Davivienda/Nequi/BBVA), tabla de movs con estado |
| Conciliación | `#conciliacion` | Split pendientes + panel de asociar factura con Learning Engine sugerido |
| Cartera | `#cartera` | 5 baldes de edad + tabla CxC |
| Comprobantes Contai | `#comprobantes` | CI/CE generados con estado y export |
| Parametrización Contai | `#parametrizacion` | 8 sub-tabs: comprobantes, PUC, tipos S/C/B/A, plantillas, Ficha 17, TrB, retenciones, regímenes |
| Configuración | `#configuracion` | 4 sub-tabs: cuentas bancarias, reglas, parámetros, usuarios |

### Motores principales

- **Parser XML DIAN** (`parseInvoiceXml`) — extrae de UBL 2.1 emisor, adquiriente, régimen fiscal, totales, líneas, CUFE
- **Clasificador de productos** (`classifyItem` + `teachClassifier`) — 9 familias por defecto con matriz Inventario/Gasto/Activo, aprendizaje en localStorage por keyword
- **Motor de retenciones** (`computeRetenciones`) — UVT 2026 $49.799, evalúa retefuente/ReteIVA/ReteICA según régimen del adquiriente y tope
- **Generador plano Contai** (`generatePlanoContai`) — plantilla 0001 tab-delimitada, 18 campos, fecha D/M/A, CUFE en campo 18
- **Login local** — hash DJB2 en localStorage, credenciales demo `randy@atn-consultores.co` / `gravimentes`
- **PDF binario** (`facturasPdf` Map + `openFacturaPdf`) — Blob en memoria por factura, apertura en pestaña nueva vía `window.open`

### Sistema de diseño

- **Paleta corporativa** (tokens en `:root`): `#1E3A6E` navy, `#0F6B52` verde forestal, `#A16207` ámbar, `#9F2626` rojo apagado. Neutros cálidos, saturaciones bajas
- **Tipografía**: Source Serif 4 (titulares) · Inter (UI) · IBM Plex Mono (números)
- **Temas**: Auto / Claro / Oscuro con toggle en topbar, persistencia en localStorage

---

## Estado del backend (spec)

`supabase/migrations/0002_conciliacion_bancaria.sql` implementa el Módulo 10 completo:

- **Multi-tenant**: `empresas` + `empresa_usuario` + helper `current_empresa_ids()` para RLS
- **Fuente de verdad**: `movimiento_bancario` conserva signo, `hash_linea` deduplica, índice GIN español para búsqueda
- **Relación N:M**: `movimiento_documento` con 13 conceptos (PAGO_FACTURA_COMPRA/VENTA, RETENCION_PRACTICADA, GMF, COMISION_BANCARIA, RENDIMIENTOS, ...)
- **Trigger de cuadre** `trg_movdoc_cuadre`: rechaza escrituras que descuadren `SUM(valor·signo) ≠ ABS(monto_banco)` con tolerancia $1
- **Log inmutable** `movimiento_log`: REVOKE UPDATE/DELETE + triggers que lanzan excepción
- **Comprobantes de pago** (CI/CE) con validación ficha-17 en JSONB
- **Learning Engine**: `patron_movimiento` con confianza Laplace-smoothed `(aciertos+1)/(hits+2)` como columna calculada
- **Vista `vw_tesoreria`** para el Panel general
- **`conciliacion_config`** con UVT 2026, topes, tarifa GMF, tolerancia

FKs diferidas: `documento_id`, `tercero_id`, `export_lote_id` quedan como `bigint` sin constraint; se completarán en migraciones 0003-0005.

---

## Decisiones clave y sus razones

1. **Artifact single-file en vez de app React** — velocidad de iteración con Claude Artifacts, cero setup, todo el procesamiento local. La migración a React sobre `src/` está planeada pero no ejecutada.

2. **Parser XML antes que PDF** — el XML DIAN UBL 2.1 es 100% preciso; el PDF requiere heurísticas frágiles. Cuando el ZIP trae ambos, se prioriza XML y se guarda el PDF solo como binario para "Ver PDF original".

3. **Clasificador con aprendizaje local** — `localStorage['gv-classifier-learned']` en formato `[{keyword, cuenta, nombre, hits, at}]`. Prioridad `aprendido > regla > default`. Diseñado para migrar a `patron_movimiento` cuando exista backend.

4. **Ficha 17 modelada como reglas de validación** — 20 códigos, cada uno con severidad `bloquea`/`advierte`. Se aplican antes de exportar el plano 0001.

5. **Formato de fecha por contexto** — captura mm/dd/aaaa, importación D/M/A, extracto aaaammdd, export mm/dd/yyyy. Es la causa #1 de errores en Contai. Documentado en Parametrización → Plantillas.

6. **Paleta refinada, sin visualizaciones cargadas** — el usuario pidió explícitamente "más limpio mejor" y "no visualizaciones innecesarias". Se removieron: bitácora de archivos procesados, panel de detalle de retenciones (redundante con la tabla), sección "Facturas cargadas desde ZIP" en Cartera (duplicaba Facturas), tablas de comparativas iniciales.

7. **PDF via `window.open` con Blob URL** — el sandbox del artifact bloquea `<a download>` directo; abrir en pestaña nueva funciona y el navegador maneja la descarga con Ctrl+S.

---

## Cómo continuar

### Si es una sesión nueva sin contexto

1. Lee este archivo.
2. Lee `docs/gravimentes_consolidado.md` para el detalle producto + backend + integración.
3. Abre el artifact: `https://claude.ai/code/artifact/eec4fd9a-a2cc-4116-a5e3-e845e2ece558`
4. Login demo: `randy@atn-consultores.co` / `gravimentes`

### Si quieres modificar el artifact

- No está en este repo. Es un HTML monolítico publicado. Se re-edita desde una sesión de Claude que lo tenga como referencia.
- El archivo local vive en el scratchpad de la sesión que lo publicó. Republicar reemplaza la versión en el URL.

### Si quieres avanzar el backend

- Siguiente migración sugerida: `0003_documentos_terceros.sql` — tablas `documentos` y `terceros` para completar los FKs diferidos de 0002.
- Después: `0004_learning_engine_rpc.sql` (funciones RPC), `0005_export_contai.sql` (plantillas 0001/0002/0003 + workers).

### Si quieres conectar el frontend al backend

- Sustituir `localStorage` de auth por Supabase Auth (`src/hooks/useAuth.tsx` ya está listo).
- Sustituir `currentFacs`/`facturasPdf` en memoria por PostgREST calls (`GET /documento`, `GET /movimiento_bancario`).
- Sustituir `computeRetenciones` local por SQL function `api.calcular_retenciones(documento_id)`.

---

## Convenciones no negociables

Heredadas del spec del Módulo 10:

1. `movimiento_bancario` es la única fuente de verdad del banco.
2. `movimiento_log` es sagrado — nunca UPDATE, nunca DELETE.
3. Idempotencia por hash de archivo y hash de línea.
4. Cuadre validado por trigger, no por convención.
5. Reglas de negocio en backend/SQL, no en frontend.
6. Multi-tenant estricto por RLS con `empresa_id`.
7. `sin_relacionar` debe tender a cero — un mes con pendientes no se congela.
8. Cálculos live sin caché; la única MV permitida es `vw_tesoreria`.

---

**Fin del ancla.** Cualquier expansión importante se documenta primero aquí y luego se refleja en `gravimentes_consolidado.md`.
