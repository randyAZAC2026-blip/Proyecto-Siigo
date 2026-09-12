# Sistema Natillera — Panorama del proyecto

> Migración de una planilla Excel de 11 hojas rota en $22 M de descuadres
> a un sistema web local con dashboards, conciliación bancaria automática
> y cálculo de moras en tiempo real.

**Autor:** Randy Hernández (contador público, tesorero de la natillera)
**Repositorio:** `randyAZAC2026-blip/Proyecto-Siigo`
**Rama:** `claude/natillera-monthly-payments-f1kdo8`

---

## 🎯 Qué resuelve

Una natillera colombiana con **56 socios activos** manejando **~$61 M al año** en aportes, préstamos entre socios y rifas, controlada hasta ahora en un Excel `.xlsm` de 11 hojas donde:

- La hoja de "resumen" mostraba **la mitad** de los ingresos reales (fórmulas rotas).
- 3 hojas mostraban 3 cifras distintas del mismo dato ("actividades").
- 2 hojas de liquidación estaban completamente rotas (700+ errores `#N/A`, `#REF!`, `#DIV/0!`).
- No había forma de conciliar los extractos bancarios (Bancolombia + Nequi) contra los aportes.
- Cobrar mora ($500/día) requería contar días a mano cada mes.

**El sistema reemplaza todo eso** con una BD relacional que garantiza una única fuente de verdad, un dashboard visual, y automatización de todos los cálculos.

---

## 🏗 Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│  Excel .xlsm (opcional, para importación inicial histórica)  │
└─────────────────────┬────────────────────────────────────────┘
                      │  node importador.js
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  SQLite  (natillera.db)                                       │
│  8 tablas + 7 vistas SQL + triggers de auditoría inmutable   │
└─────────────────────┬────────────────────────────────────────┘
                      │  node:sqlite (built-in Node 22+)
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  Express API  (http://localhost:4000)                         │
│  25+ endpoints REST, CORS restringido a localhost             │
└─────────────────────┬────────────────────────────────────────┘
                      │  fetch()
                      ▼
┌──────────────────────────────────────────────────────────────┐
│  React 19 + Vite + Tailwind v4 + shadcn/ui                    │
│  http://localhost:5173  · 14 vistas en sidebar de 6 grupos    │
└──────────────────────────────────────────────────────────────┘
```

**Todo corre local.** Cero costos de hosting, cero base remota, cero deps de red. El archivo `natillera.db` de ~2MB tiene toda la información — se respalda copiándolo a Drive/USB.

---

## 📊 Datos reales al día de hoy

Migrados desde el Excel actual de la natillera:

| Métrica | Valor |
|---|---:|
| Socios activos | **56** |
| Cuentas administrativas | 3 |
| Transacciones registradas | 1.067 |
| Movimientos bancarios importados | 1.235 |
| Periodos del ciclo | 12 (Dic → Nov) |

| Flujo | Valor |
|---|---:|
| Ahorros acumulados | $41.133.000 |
| Actividades | $6.295.000 |
| Rifa chance | $2.315.000 |
| Intereses de préstamo cobrados | $1.953.000 |
| Multas cobradas | $329.208 |
| Préstamos vigentes (por cobrar) | **$18.222.000** |
| **Mora ahorros pendiente** ⚠️ | **$9.076.000** |
| **Mora intereses pendiente** ⚠️ | **$13.619.000** |
| **Utilidad del ciclo** ✅ | **$4.597.208** |

Los **$22.7 M en mora pendiente** son plata que la natillera puede cobrar aplicando las reglas ya definidas ($500/día de atraso). Antes eran invisibles porque nadie contaba los días.

---

## 🎛 14 vistas organizadas en sidebar

### INICIO
- **Panel** — 6 KPIs + accesos rápidos con clic a cada módulo.

### SOCIOS
- **Socios y aportes** — tabla ordenable con buscador, saldos por concepto.
- **Estado de cuenta** — vista detallada por socio, historial filtrable, botones **Imprimir/PDF**, **WhatsApp** y **Copiar** para compartir el estado individual.

### AHORROS
- **Matriz de ahorros** — socios × meses, solo lectura.
- **Control de pagos** — misma matriz pero clicable, cada celda abre modal para registrar/editar.
- **Mora ahorros** — cálculo automático $500/día contra fecha de corte. Deudores con detalle mes a mes expansible.

### PRÉSTAMOS
- **Préstamos activos** — deudores + saldo pendiente + intereses ya pagados.
- **Matriz de préstamos** — socios × meses, con toggle "Capital / Intereses / Total".
- **Mora intereses** — cálculo automático $500/día contra aniversario mensual del préstamo (FIFO).
- **Liquidación** — cuánto recibe cada socio hoy: `(ahorro + activ. + rifa + int.pagados) − (saldo préstamo + multas + mora ahorro + mora intereses)`.

### BANCO
- **Conciliación** — resumen Bancolombia + Nequi (ingresos totales vs. natillera).
- **Extracto detallado** — 1.235 movimientos con filtros; **clic en el monto** abre modal de desglose para registrar como pago (100 ahorro + 50 abono + 20 intereses…). Botones para agregar movimiento manual o importar batch desde Excel/CSV del banco.

### OTROS
- **Local (offline)** — versión localStorage sin backend, funciona sin conexión al servidor local.

---

## 🔒 Principios de diseño

1. **Todo local, cero nube.** Ninguna cuenta, ninguna clave, ninguna suscripción. La BD vive en tu disco.
2. **Una única fuente de verdad.** La tabla `transacciones` es el libro diario. Todo lo demás son vistas SQL.
3. **Auditoría inmutable.** Cada movimiento monetario deja huella en `movimientos` con triggers SQL que rechazan UPDATE y DELETE.
4. **Idempotencia en la importación.** Re-migrar el Excel no duplica registros ni destruye pagos manuales.
5. **Cálculos "en vivo".** Las moras se calculan al momento de consultar — nunca hay valores desactualizados.
6. **Backup automático.** Cada re-migración guarda una copia con timestamp; se conservan los últimos 10.
7. **Transaccional al centavo.** Cada operación va en `BEGIN/COMMIT/ROLLBACK`. Si algo falla, no queda a mitad.

---

## 🧰 Stack técnico

| Capa | Tecnología | Por qué |
|---|---|---|
| Base de datos | SQLite via `node:sqlite` | Cero compilación nativa, Node 22+ lo incluye |
| Backend | Express minimalista | Sin frameworks pesados, 200 líneas efectivas |
| Frontend | React 19 + Vite 8 | Build < 1 seg, dev server instantáneo |
| Estilos | Tailwind v4 + shadcn/ui | Look profesional sin diseñar CSS |
| Validación | Zod | Errores claros en runtime |
| ETL Excel | ExcelJS | Streaming, sin depender de LibreOffice |
| Import banco | SheetJS (xlsx) | Corre en el navegador, sin backend |

**Cero dependencias nativas** — funciona idéntico en Windows, Mac y Linux. No requiere Visual Studio ni compilador C++.

---

## 🚦 Cómo arrancar

```powershell
# Primera vez
git clone https://github.com/randyAZAC2026-blip/Proyecto-Siigo.git
cd Proyecto-Siigo
git checkout claude/natillera-monthly-payments-f1kdo8
pnpm install

# Migrar el Excel a SQLite
cd scripts\natillera-migracion
npm install
node importador.js "C:\ruta\a\tu\PLANTILLA_NATILLERA.xlsm"
cd ..\..

# Correr los 2 servidores en paralelo (2 terminales)
cd natillera-backend    ; pnpm dev
cd natillera-app         ; pnpm dev
```

Abre http://localhost:5173.

---

## 📅 Estado y roadmap

### ✅ Completado

- Migración validada al centavo ($61.357.000)
- BD relacional con auditoría inmutable
- 14 vistas navegables en sidebar agrupado
- Cálculo automático de moras (ahorros e intereses)
- Conciliación bancaria con filtros
- Desglose multi-concepto desde extracto (un movimiento → varias transacciones)
- Import batch de extractos Bancolombia / Nequi
- Estado de cuenta imprimible + compartible por WhatsApp
- Backup automático con rotación de 10 copias
- Reglas configurables en un solo lugar ($500/día, 12 meses, etc.)

### 🚧 Pendiente

- **Clic en conciliación → detalle de movimientos** (siguiente en la lista)
- Formulario "Nuevo socio" para no tener que editar Excel
- Cierre mensual — congelar el mes y arrancar el siguiente
- Exportar SQLite → Excel para volver al formato original si algún día se necesita
- Mensajes de cobro batch (WhatsApp masivo a todos los morosos)
- Modo multi-usuario (opcional, si algún día se sube a Supabase)

---

## 📚 Documentación relacionada

- **NATILLERA.md** — guía práctica de uso paso a paso.
- **ESQUEMA_NATILLERA.md** — especificación técnica portable para replicar el sistema en cualquier stack (Postgres, MySQL, otro lenguaje).
- **scripts/natillera-migracion/README.md** — detalle del ETL Excel → SQLite.
- **natillera-backend/README.md** — endpoints del API HTTP local.

---

## 🏆 Diferenciales

- **Aditividad al centavo:** cada corrida del importador se valida contra el Excel original. Si difiere en $1, ROLLBACK.
- **No confía en Excel roto:** las hojas con `#DIV/0!` y `#REF!` del Excel original se convierten a 0 en la importación; los cálculos se rehacen desde cero en SQL.
- **PDF profesional:** el botón "Imprimir" en Estado de cuenta genera un PDF listo para firmar y mandar por WhatsApp.
- **Trazabilidad completa:** cada pago tiene ID único, socio, periodo, concepto, fecha, notas. La tabla `movimientos` guarda todo con `metadata` JSON.

---

## 📞 Contacto

Randy Hernández — randytoby2000@gmail.com

Construido con Claude Code (Sonnet 4.5) durante septiembre de 2026.
