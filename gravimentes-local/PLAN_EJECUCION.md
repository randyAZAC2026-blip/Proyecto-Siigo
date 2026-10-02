# Plan de Ejecución · Gravimentes

> Documento de trabajo: cómo se ejecuta el roadmap, con foco explícito en **simplificación visual** para que un contador cualquiera lo entienda sin capacitación.

*Fecha: 2026-09-27*

## Avance local implementado

La aplicación activa es **`Iniciar conversor.cmd`**, con motor Python y SQLite en `conversor/`. Se integraron navegación, filtros/revisión, cuenta habitual por tercero, vista previa de factura y consolidado del lote con el motor de exportación, ajustes de CxP/retenciones, revisión tabular Excel con filtros avanzados, sugerencias de cuentas, panel de aprendizaje depurable, historial reversible de facturas/terceros/exclusiones, descargas laterales, búsqueda y tema.

**[Estado completo y brechas verificadas del plan CMD](ESTADO_PLAN_CMD.md)**. Ese documento distingue lo implementado de funciones parciales y dependencias pendientes. Las metas de UX y los hitos SaaS siguientes siguen siendo el roadmap, no una declaración de trabajo terminado.

Referencia visual: [PLAN_VISUAL.md](PLAN_VISUAL.md).

---

## 1. Principio rector

> **Un contador debe usar Gravimentes sin haber leído nunca un manual.**

Si un botón, un modal o un flujo requiere explicación → está mal diseñado. La app debe ser tan obvia que se aprenda usándola en 15 minutos.

De ahí salen 3 reglas duras:

1. **Máximo 3 botones primarios visibles en cualquier pantalla.**
2. **Un solo call-to-action fuerte por vista.** Todo lo demás es secundario/terciario.
3. **Terminología del contador, no del programador.** "Causar factura" no "Persistir asiento". "Bajar plano" no "Export xlsx".

---

## 2. Principios de UX (aplicables a Fase 1.5 y Fase 2)

### 2.1 Reducción visual

- **Pocos botones, más contextuales.** En vez de 8 botones en la barra superior, 2 primarios + un menú "⋯ Más acciones" que despliega los avanzados (conciliar, auditar, corregir, quitar duplicadas, exportar, reclasificar).
- **Modales que hacen una sola cosa.** El modal detalle factura hoy tiene 5 tabs (cabecera, líneas, retenciones, asiento, acuse). Convertir en **una sola vista scrollable** con secciones colapsables — menos click, más lectura lineal.
- **Colores con significado, no decorativos.** Verde = OK. Amarillo = revisar. Rojo = error. Gris = neutro. Nada más.
- **Cero jerga técnica en UI.** Reemplazar `CUFE`, `UBL`, `Percent`, `TaxAmount`, `RLS` por lenguaje contable.

### 2.2 Flujo por defecto (happy path)

Randy o cualquier contador debería poder:

1. Abrir la app.
2. Pegar el token DIAN o soltar el ZIP de XMLs.
3. Ver una tabla con las facturas ya clasificadas.
4. Aprobar todo (botón único "Aprobar 47 facturas") o corregir las que están en rojo.
5. Bajar el plano.

**Total: 5 pasos, ~5 minutos, sin abrir ningún menú avanzado.**

Todo lo demás (parametrización PUC, aprendizaje, maestro, conciliación DIAN, auditor) queda en un panel lateral que solo aparece cuando el usuario lo pide.

### 2.3 Estados visibles

Cada factura muestra 1 chip de estado (nunca más):

- 🟢 **Lista** — motor aprobó, todo cuadra.
- 🟡 **Revisar** — motor detectó algo (tarifa, régimen sin clasificar, base ≥ 27 UVT).
- 🔴 **Error** — no se puede causar (falta cuenta, IVA no cuadra, XML corrupto).

Ni "importada", ni "parametrizada", ni "causada", ni "acuse expreso". El contador no piensa en esos estados — piensa en "¿ya la puedo mandar a Contai o no?".

### 2.4 Feedback inmediato

- Al cambiar una tarifa de retención en el dropdown → el asiento se recalcula visible en la misma pantalla, sin recargar.
- Al forzar una cuenta CxP → el plano preview se actualiza.
- Al chulear "aplica retención" → el chip pasa de amarillo a verde en tiempo real.
- Nada que se guarde "en segundo plano". Todo cambio tiene su reacción visual.

### 2.5 Undo global

`Ctrl+Z` deshace la última acción, sea cambio de tarifa, override de CxP, aprendizaje, o forzado de retención. **Nunca un cambio destructivo sin ruta de reversión.**

### 2.6 Búsqueda global (Ctrl+K)

Command palette al estilo VS Code / Slack. En cualquier pantalla, `Ctrl+K` abre buscador que resuelve:
- "FE1003" → abre esa factura.
- "Cozzzy" → cambia NIT activo.
- "Nueva empresa" → onboarding.
- "Descargar plano de julio" → ejecuta.
- "Aprender de plano" → abre input file.

Reduce a la mitad los clicks para usuarios avanzados sin invadir la UI de los novatos.

---

## 3. Optimizaciones de procesos actuales (V82 → V82+)

### 3.1 Import unificado

**Hoy:** Randy tiene que decidir si va al importador de facturas o al de nómina, sube el archivo, y a veces se equivoca (12 XMLs de nómina cayeron en el importador de compras).

**Mejora:** un solo botón grande **"📥 Importar"** (drag&drop o click). El sistema detecta:
- XML factura → va al pipeline de facturas.
- XML nómina → va al pipeline de nómina.
- JSON token → va al pipeline de token.
- xlsx plano histórico → va al aprendizaje.
- xlsx maestro cuentas → va al PUC.
- ZIP → recursivo, clasifica cada archivo interior.

Ya hicimos el auto-redirect XML factura/nómina (V82). Falta consolidar el resto en un solo input.

### 3.2 Pipeline por lote automático

**Hoy:** import → parametrizar cada factura → generar plano → auditar → descargar. 5 pasos + revisión por factura.

**Mejora:** un flujo por lote **"Procesar todo el mes"**:
1. Import token DIAN del mes.
2. Motor clasifica automáticamente todas las facturas.
3. **Las que quedan 🟢 se marcan aprobadas por defecto** (no requieren click).
4. Se muestra solo un panel con las 🟡 y 🔴 para revisión (~5-15% típicamente).
5. Botón **"✓ Aprobar 47 verdes + revisar 5 amarillas"** que abre las amarillas en secuencia (asistente wizard).
6. Al terminar → botón único **"⬇ Bajar plano de septiembre"**.

Reducción esperada: 5 min → 90 seg si todas están verdes.

### 3.3 Sugerencias inline

Cuando aparece una factura en 🟡 (revisar), en el mismo card se muestra la sugerencia del motor en 1 línea + 2 botones:
- **✓ Aceptar sugerencia** (aplica y pasa a la siguiente).
- **✏ Ajustar** (abre el modal detalle solo si es necesario).

Nada de "clickeá aquí para ver detalles" ni tabs. La sugerencia se aprueba sin dejar la lista.

### 3.4 Onboarding automático

**Hoy:** el contador nuevo tiene que configurar NIT, régimen, ciudad, comprobantes, cuentas PUC manualmente.

**Mejora:** el primer plano histórico que suba **aprende automáticamente** el 80-90% de la configuración:
- Cuenta CxP default.
- Cuenta IVA descontable.
- Cuentas retefte por concepto.
- Comprobantes por tipo (FE, NC, ND, DS).
- Centro de costo dominante.
- Terceros conocidos con régimen.

El wizard solo pregunta: NIT, ciudad y "¿sos agente retenedor de IVA?". El resto se deduce.

### 3.5 Preview siempre visible

**Hoy:** el preview del plano se abre en un modal aparte.

**Mejora:** panel lateral derecho **siempre visible con el plano en tiempo real**. A medida que el contador cambia cosas en la lista, el panel refleja el asiento. Cuadre DB/CR arriba, líneas debajo, botón de descarga al pie. Nunca hay que "abrir el preview" — está ahí.

### 3.6 Historia local con línea de tiempo

**Hoy:** los cambios se guardan en `localStorage` sin trazabilidad visual.

**Mejora:** timeline colapsable en el panel derecho con las últimas 20 acciones: "Aceptaste retención 4% en FE1003 · hace 2 min · ⤺ deshacer". Un click revierte esa acción específica.

### 3.7 Alertas normativas contextuales

Cuando el motor detecta algo raro, muestra un banner arriba **con la referencia legal en 1 línea**:

> ⚠ FE1003 marca "Gran Contribuyente" pero le practicaste retefuente. Los GC son autoretenedores (Art 368 ET). ¿Quitar retención?

Y 2 botones: **"Sí, quitar"** / **"No, tengo razón"**. Educación pasiva sin cortar el flujo.

---

## 4. Rediseño visual concreto

### 4.1 Layout target (post-Fase 1.5)

```
┌────────────────────────────────────────────────────────────┐
│  Gravimentes    [NIT activo: Cozzzy SAS ▾]      🔔  👤   │  ← barra superior mínima
├──────────┬─────────────────────────────────┬───────────────┤
│          │                                 │               │
│ 📥 Import│  Facturas del mes               │  Plano actual │
│ 📊 Nómina│  ┌───────────────────────────┐  │  DB $47M      │
│ ⋯ Más    │  │ FE1003  Prov X  $1.2M 🟢 │  │  CR $47M ✓    │
│          │  │ FE1004  Prov Y  $850K 🟡 │  │               │
│          │  │ FE1005  Prov Z  $340K 🔴 │  │  [líneas]     │
│          │  └───────────────────────────┘  │               │
│          │  [✓ Aprobar 47 · Revisar 5]     │  [⬇ Bajar]    │
│          │                                 │               │
└──────────┴─────────────────────────────────┴───────────────┘
```

**3 zonas:**
- **Sidebar izquierda** — 2 botones primarios (Import, Nómina) + menú ⋯ para lo avanzado.
- **Centro** — la lista de facturas del mes activo, con estados a la derecha.
- **Panel derecho** — plano preview en vivo, siempre visible.

Cero tabs, cero modales inútiles. Todo lo importante en una vista.

### 4.2 Modal detalle factura simplificado

Cuando el contador clickea una factura, se abre un modal **con una sola vista lineal scrollable**:

```
FE1003 · Proveedor X · $1,242,000 · 🟢 Lista

CABECERA
├ Fecha:      2026-08-31
├ Régimen:    O-15 Autoretenedor
├ Tratamiento: Gasto directo

LÍNEAS (3)
├ Servicio limpieza    $500,000  → 519530 Servicios ✏
├ Materiales           $563,496  → 143505 Inventario ✏
└ IVA 19%              $178,504  → 24081001

RETENCIONES
└ ReteFuente 4% servicios  $20,000 → 23652505 ✏ [dropdown tarifa]

ASIENTO PROPUESTO
DB 519530     $500,000
DB 143505     $563,496
DB 24081001   $178,504
CR 23652505    $20,000
CR 220505   $1,222,000  ✏ [cambiar CxP]
────────────────────────
DB = CR      $1,242,000  ✓

[✓ Aprobar]  [Cerrar]
```

Sin tabs. Todo en una columna. Cada campo editable con ícono ✏ inline.

### 4.3 Sistema de diseño mínimo

- **1 color primario** (accento) para call-to-action y estado 🟢.
- **1 color de alerta** (naranja/amarillo) para 🟡 y warnings.
- **1 color de error** (rojo) para 🔴 y descuadres.
- **Grises** para todo lo demás.
- **1 tipografía** (Inter, IBM Plex Sans, o similar) — cero variaciones.
- **1 tamaño de sombra** (subtle).
- **1 radio de borde** (6-8px).
- **1 unidad de espaciado** (4px base, múltiplos).

Menos variables = más consistencia = más entendibilidad.

---

## 5. Timeline de ejecución consolidado

### Fase 1.5 · Cerrar V82 + rediseño visual (oct-nov 2026)

| Semana | Foco | Entregable |
|---|---|---|
| 1 | Rediseño visual layout target | Wireframe aprobado + primera pantalla (lista de facturas) refactorizada |
| 2 | Modal detalle simplificado | Modal en una sola vista lineal reemplaza los 5 tabs |
| 3 | Import unificado | Un botón "📥 Importar" que detecta tipo automáticamente |
| 4 | Pipeline por lote | "Aprobar X · Revisar Y" con wizard secuencial |
| 5 | Panel plano preview lateral siempre visible | Reemplaza el modal actual |
| 6 | Módulo Revisión tabular con prorrateo IVA 5%/19% | Tabla completa por factura |
| 7 | Predictor de cuenta por similitud | Chip 🤖 X% en cada línea |
| 8 | Terceros compartidos en Supabase (fase 1B) | Upsert fire-and-forget desde XML |
| Buffer | Testing con Randy + 2-3 clientes reales | V82+ candidato a "cerrada" |

### Fase 2 · MVP SaaS (dic 2026 - may 2027)

Ver `OUTLINE_GRAVIMENTES.md` sección "Hitos y checkpoints". Cada mes tiene entregable concreto. La UX diseñada en Fase 1.5 se reimplementa en Next.js.

### Fase 3-6 · Post launch

Ver `PLAN_MODULOS.md`. Cada nuevo módulo (cierres DIAN, cartera, tesorería, etc.) sigue los mismos principios de UX de este documento: pocos botones, un CTA por vista, terminología del contador.

---

## 6. Métricas de éxito UX

Se validan con los primeros 10 contadores beta y se auto-reportan en analytics (PostHog / Plausible).

| Métrica | Actual (V82) | Target Fase 1.5 | Target Fase 2 |
|---|---:|---:|---:|
| Tiempo hasta primer plano generado | ~60 min | **< 20 min** | **< 10 min** |
| Clicks para causar 1 factura estándar | ~12 | **< 6** | **< 4** |
| Errores por sesión (motor sugiere mal) | ~5% | **< 2%** | **< 1%** |
| Tasa de completar onboarding | N/A | 70% | **> 85%** |
| NPS (promotores – detractores) | N/A | +30 | **+50** |
| Tiempo hasta pedir soporte por primera vez | ~5 min | > 30 min | **> 2 horas** |
| Tasa de descargas de plano sin descuadre | ~85% | 95% | **> 99%** |

---

## 7. Anti-patrones a evitar

- ❌ **Modales anidados** (modal dentro de modal). Ya lo tenemos con "PUC personalizado" dentro del modal factura — quitar.
- ❌ **Configuración obligatoria antes de empezar.** Cero pantallas de config vacías. El primer flujo debe ser productivo con defaults inteligentes.
- ❌ **Diccionarios de códigos.** Nunca mostrar "23652505" sin acompañar de "Retefuente servicios 4% PJ". La cuenta es un dato, no un símbolo místico.
- ❌ **Botones destructivos sin confirmación.** "Eliminar factura" sin diálogo = pérdida de datos = churn.
- ❌ **Colores decorativos.** Si un elemento es azul solo "porque quedaba bonito", quitarlo. El color transmite significado.
- ❌ **Textos largos en botones.** Máximo 3 palabras. "Aprobar" no "Aprobar y causar contablemente".
- ❌ **Wait states silenciosos.** Toda operación > 500ms muestra spinner + texto ("Consolidando 12 XMLs de nómina…").
- ❌ **Errores técnicos crudos.** Nunca `TypeError: Cannot read property 'iva' of undefined`. Traducir a: "No pude leer el IVA de esta factura. ¿Está corrupto el XML?"

---

## 8. Cómo se decide (design principles)

Cada nueva feature pasa por 3 preguntas antes de construirse:

1. **¿Randy podría hacer esto sin abrir un menú?** Si sí → botón visible. Si no → menú avanzado ⋯.
2. **¿Un contador nuevo entiende qué hace en < 3 segundos?** Si no → cambiar el texto/ícono. Si sigue sin entenderse → no ir.
3. **¿Se puede volver atrás con Ctrl+Z?** Si no → agregar undo o quitar la feature.

Si una feature no pasa las 3, no entra en el roadmap.

---

## 9. Riesgo y contramedidas

| Riesgo | Mitigación |
|---|---|
| Randy quiere más botones "por si acaso" | Vetar en la revisión de diseño. Cada botón nuevo tiene que reemplazar otro o justificarse contra métrica. |
| Curva de aprendizaje del equipo (Ronny frontend, Eliel backend) atrasa Fase 1.5 | Priorizar módulos que no dependen de Next.js aún (V82 sigue siendo HTML puro). |
| Contadores conservadores rechazan interfaz "moderna" | Modo compatibilidad: opción "Vista clásica" con más botones visibles, en un toggle. Default siempre es el minimal. |
| Sobre-simplificar oculta funcionalidad importante | Menú ⋯ organizado por categorías con tooltips. Ctrl+K para poder saltarse el sidebar. |

---

## 10. Preguntas abiertas

1. **Wireframes concretos** — ¿los hacemos en Figma, en boceto papel, o directo en código HTML? Recomiendo Figma Free para tener referencia visual antes de tocar código.
2. **Sistema de diseño** — ¿shadcn/ui (Radix + Tailwind) o Tailwind UI templates? shadcn es gratis y accesible por defecto.
3. **Testing con contadores beta** — ¿tenés 5 contadores conocidos que puedan probar la V82+ en noviembre y darte feedback?
4. **Idioma en la UI** — ¿solo español o también inglés? Para Fase 6 (expansión a otros mercados) sería relevante.
5. **Modo oscuro** — ¿lo priorizamos en Fase 1.5 o queda para Fase 2? Randy usa modo oscuro; los contadores mayores suelen preferir claro.

---

*Este documento es la brújula de UX y ejecución. Se revisa cada 4 semanas y se ajusta con lo aprendido de los usuarios reales.*
