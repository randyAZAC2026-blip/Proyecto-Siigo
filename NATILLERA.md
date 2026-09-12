# Sistema Natillera — Guía completa

Sistema local (sin nube, sin costos, sin dependencias externas) para gestionar una natillera colombiana: aportes mensuales, préstamos, intereses, rifas, actividades, multas, conciliación bancaria y liquidación anual.

Tres componentes que trabajan juntos:

```
┌──────────────────────────────────────────────────────────┐
│  1. scripts/natillera-migracion/   ETL Excel → SQLite    │
│     • importador.js   (lee .xlsm, valida, migra)         │
│     • explorar.js     (CLI para consultar la BD)         │
│     • queries.sql     (consultas SQL listas)             │
└────────────────────────┬─────────────────────────────────┘
                         │ escribe natillera.db
                         ▼
┌──────────────────────────────────────────────────────────┐
│  2. natillera-backend/             API HTTP local        │
│     • Express en http://localhost:4000                   │
│     • Lee/escribe natillera.db                            │
│     • Endpoints REST para el frontend                    │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP JSON
                         ▼
┌──────────────────────────────────────────────────────────┐
│  3. natillera-app/                 UI web React          │
│     • Vite en http://localhost:5173                      │
│     • 6 vistas: Dashboard, Control pagos, Estado cuenta, │
│       Extracto, Registrar pago, Local (localStorage)     │
└──────────────────────────────────────────────────────────┘
```

## Requisitos

- **Node.js ≥ 22** (usa `node:sqlite` built-in — sin compilar código nativo, sin Visual Studio)
- **pnpm** (`npm install -g pnpm`)
- El archivo `.xlsm` de la natillera con las hojas `BD`, `BASE DE DATOS`, `Datos`, `Bancolombia`, `Nequi`
- Opcional: [DB Browser for SQLite](https://sqlitebrowser.org) para explorar la BD con GUI

## Setup desde cero

```powershell
# 1. Clonar el repo y entrar
git clone https://github.com/randyAZAC2026-blip/Proyecto-Siigo.git
cd Proyecto-Siigo
git checkout claude/natillera-monthly-payments-f1kdo8

# 2. Instalar todas las dependencias del workspace
pnpm install

# 3. Instalar el subpaquete natillera-migracion (usa npm porque es standalone)
cd scripts\natillera-migracion
npm install
cd ..\..

# 4. Migrar el Excel a SQLite
cd scripts\natillera-migracion
node importador.js "C:\ruta\a\tu\PLANTILLA_NATILLERA.xlsm"
cd ..\..
```

Debe salir:
```
📖 Leyendo …\PLANTILLA_NATILLERA.xlsm…
   Socios: 59   Periodos: 12   Transacciones: 1067   Movs banco: 1235   Errores: 0
💾 SQLite: …\natillera.db

✅ Migración validada al centavo. Total ingresos (aportes): 61.357.000
```

## Uso diario

Necesitas **dos terminales abiertas** en paralelo:

**Terminal #1 — Backend:**
```powershell
cd natillera-backend
pnpm dev
```

**Terminal #2 — Frontend:**
```powershell
cd natillera-app
pnpm dev
```

Abre **http://localhost:5173** en el navegador.

## Las 6 vistas de la app

| Vista | Qué hace |
| --- | --- |
| 📊 **Dashboard** | KPIs consolidados: total en caja, ahorros, utilidad, deuda, tabla de socios con buscador, matriz de ahorros mes × socio, liquidación estimada, préstamos activos, conciliación bancaria |
| ✅ **Control pagos** | Matriz socio × mes de AHORROS o ACTIVIDADES. Clic en cualquier celda abre modal para registrar/editar. Verde = pagó completo, ámbar = parcial, — = pendiente. Fila TOTAL con suma por mes |
| 📄 **Estado cuenta** | Selector de socio + 6 KPIs personales + total aportado destacado + historial detallado con filtros por concepto. Botones **Copiar** (resumen al portapapeles) / **WhatsApp** (mensaje prellenado) / **Imprimir** (PDF profesional vía diálogo del navegador) |
| 🏦 **Extracto** | Los 1.235 movimientos de Bancolombia + Nequi con filtros (banco, origen, conciliado, fecha, búsqueda libre). Dropdown inline para marcar NATILLERA/PERSONAL. **Clic en el monto** abre modal pre-llenado para registrar la transacción y vincular en una sola operación |
| ✍️ **Registrar pago** | Formulario completo con buscador de socios, conceptos agrupados en cards (Aportes / Préstamos / Otros), auto-selección del periodo del mes actual, sugerencia de cuota base, historial de las últimas 30 transacciones del socio con badges `manual` vs `excel` |
| 🐷 **Local** | La app original con `localStorage` — funciona sin backend, útil como backup rápido o si la BD SQLite no está disponible |

## Actualizar la BD con Excel nuevo

Cada vez que actualices el Excel:

```powershell
cd scripts\natillera-migracion
npm run reset
node importador.js "C:\ruta\a\tu\PLANTILLA_NATILLERA.xlsm"
```

**Se guarda automáticamente un backup** de la BD anterior en `scripts\natillera-migracion\backups\natillera-YYYY-MM-DD_HH-MM-SS.db` antes de sobrescribirla. Se retienen los últimos 10 backups.

Los pagos registrados manualmente desde la app (marca `manual`) **se pierden** al hacer reset, porque la BD se reconstruye desde el Excel. Alternativa: agrega esos pagos al Excel también antes de re-migrar.

## Sin re-migrar — operar solo con la app

Si prefieres nunca volver a tocar Excel:

1. Migra una vez desde Excel para tener los datos históricos.
2. Cada nuevo pago lo registras en **Registrar pago** o **Control pagos** o **Extracto**.
3. Todos quedan marcados como `manual` en el log de auditoría.
4. Si necesitas exportar a Excel de nuevo, hay que escribir un exportador (no está implementado — dime si lo necesitas).

## Explorar la BD sin la app (CLI)

```powershell
cd scripts\natillera-migracion

# Menú interactivo
node explorar.js

# O comandos directos
node explorar.js resumen
node explorar.js top 20
node explorar.js deudores
node explorar.js liquidacion
node explorar.js morosos
node explorar.js socio Randy
node explorar.js sql "SELECT * FROM vw_saldo_por_socio LIMIT 5"
```

Opciones del menú:
1. Resumen general
2. Top 15 aportantes
3. Deudores (préstamos activos)
4. Ahorros mes a mes
5. Liquidación estimada
6. Conciliación bancaria
7. Morosos (60 días sin pagar)
8. Historial de un socio
9. SQL libre

## Consultas SQL útiles

En **DB Browser for SQLite** o vía `explorar.js sql "..."`:

```sql
-- Estado real de todos los socios
SELECT * FROM vw_saldo_por_socio WHERE tipo='persona' ORDER BY total_aportado DESC;

-- Liquidación estimada al día de hoy
SELECT nombre, ahorro_socio, ROUND(proporcion * 100, 2) || '%' AS pct,
       utilidad_estimada, neto_a_pagar_estimado
FROM vw_liquidacion_anual ORDER BY neto_a_pagar_estimado DESC;

-- Saldos vigentes de préstamos
SELECT s.nombre, p.monto_prestado,
       p.monto_prestado - COALESCE(SUM(a.capital_pagado), 0) AS saldo
FROM prestamos p
JOIN socios s ON s.id = p.socio_id
LEFT JOIN abonos_prestamos a ON a.prestamo_id = p.id
WHERE p.estado = 'activo'
GROUP BY p.id ORDER BY saldo DESC;

-- Matriz de ahorros socios × meses (Ene–Ago)
SELECT nombre,
  SUM(CASE WHEN periodo='DICIEMBRE' THEN valor END) AS dic,
  SUM(CASE WHEN periodo='ENERO'     THEN valor END) AS ene,
  SUM(CASE WHEN periodo='FEBRERO'   THEN valor END) AS feb,
  SUM(CASE WHEN periodo='MARZO'     THEN valor END) AS mar,
  SUM(CASE WHEN periodo='ABRIL'     THEN valor END) AS abr,
  SUM(CASE WHEN periodo='MAYO'      THEN valor END) AS may,
  SUM(CASE WHEN periodo='JUNIO'     THEN valor END) AS jun,
  SUM(CASE WHEN periodo='JULIO'     THEN valor END) AS jul,
  SUM(CASE WHEN periodo='AGOSTO'    THEN valor END) AS ago
FROM vw_matriz_ahorro GROUP BY nombre ORDER BY nombre;
```

Ver más consultas en `scripts/natillera-migracion/queries.sql`.

## Esquema de la BD

7 tablas + 6 vistas SQL. Ver detalle en `scripts/natillera-migracion/README.md`.

**Tablas:**
- `socios` — personas + cuentas administrativas (tipo distinto)
- `periodos` — 12 meses del ciclo con fechas de corte
- `transacciones` — libro diario (fuente de verdad)
- `prestamos` — desembolsos activos y pagados
- `abonos_prestamos` — cada abono a capital o intereses
- `multas` — por mora en ahorro o intereses
- `movimientos_banco` — extractos crudos Bancolombia + Nequi
- `movimientos` — log de auditoría inmutable (triggers rechazan UPDATE/DELETE)

**Vistas (reemplazan hojas rotas del Excel):**
- `vw_saldo_por_socio` — reemplaza `BD` y `Estado Socios`
- `vw_matriz_ahorro` / `vw_matriz_actividades` — reemplazan `Hoja 1` y `Actividades`
- `vw_liquidacion_anual` — reemplaza `Liquidacion` y `Resumen liquidacion`
- `vw_conciliacion_bancaria` — cruce banco vs. natillera
- `vw_totales_globales` — tiles del dashboard

## Endpoints del backend

Ver detalle en `natillera-backend/README.md`.

**GET:**
- `/api/health` `/api/resumen` `/api/socios[/:id]`
- `/api/matriz-ahorro` `/api/matriz-actividades` `/api/liquidacion`
- `/api/bancos` `/api/ahorros-por-periodo` `/api/deudores`
- `/api/morosos?dias=60` `/api/periodos`
- `/api/extractos?banco&origen&conciliado&desde&hasta&q&socio_id&limit&offset`
- `/api/transacciones?socio_id&concepto&desde&hasta&limit`

**POST:**
- `/api/transacciones` `{socio_id, concepto, valor, fecha_pago, periodo_id, notas, extracto_id?}`
- `/api/extractos/:id/vincular` `{transaccion_id}`
- `/api/extractos/:id/origen` `{detalle_origen}`

**DELETE:**
- `/api/transacciones/:id` (solo manuales — las importadas del Excel están protegidas)

## Seguridad

- Backend solo escucha `127.0.0.1` — no accesible desde la red.
- CORS restringido a `http://localhost:*`.
- Ningún dato sale de tu computadora.
- Las transacciones importadas del Excel no se pueden borrar desde la UI (protege el histórico).
- Cada modificación queda en `movimientos` — log de auditoría inmutable con triggers SQL que bloquean UPDATE y DELETE.

## Estructura del repo

```
Proyecto-Siigo/
├── natillera-app/                  # Frontend React + Vite
│   ├── src/
│   │   ├── App.tsx                 # Nav con 6 vistas
│   │   ├── pages/                  # Cada vista
│   │   ├── components/
│   │   │   ├── dashboard/          # Tiles, tablas, modal
│   │   │   └── natillera/          # Componentes de la vista local
│   │   └── lib/
│   │       ├── dashboard/api.ts    # Cliente HTTP tipado
│   │       └── natillera/          # Storage localStorage + types
│   └── package.json
│
├── natillera-backend/              # API Express + node:sqlite
│   ├── server.js
│   └── package.json
│
├── scripts/natillera-migracion/    # ETL + explorador
│   ├── importador.js               # Excel → SQLite
│   ├── explorar.js                 # CLI de consultas
│   ├── database.js                 # Schema + vistas
│   ├── queries.sql                 # 15 consultas de referencia
│   ├── backups/                    # Auto: últimos 10 .db previos
│   └── package.json
│
└── NATILLERA.md                    # Este archivo
```

## Preguntas frecuentes

**¿Puedo compartir la app con otros miembros de la natillera?**
Sí. Sube el frontend a Vercel o Netlify (gratis) apuntando a `natillera-app/`, pero el backend tendría que estar accesible desde internet — hoy solo escucha localhost. Como el `localStorage` es por navegador, cada persona vería solo lo suyo, no la BD compartida. Si necesitas verdadera sincronización multi-usuario, hay que migrar a Supabase — dime y armamos ese puente.

**¿Los cambios en la app se pierden al re-migrar?**
Sí, `npm run reset` borra la BD y el importador la recrea desde el Excel. Los pagos manuales se pierden. El backup automático te deja recuperar la anterior si te equivocaste. Para no perder los manuales: exporta primero (o duplica al Excel).

**¿Cómo agrego un socio nuevo?**
Hoy solo desde el Excel + re-migrar. Falta el formulario "Nuevo socio" en la app — si lo necesitas, lo agrego.

**¿Cierre mensual automatizado?**
No implementado. Hoy los meses son abiertos indefinidamente. Fase 3 pendiente.

**¿Cómo hago backup manual?**
Copia `scripts\natillera-migracion\natillera.db` a otra carpeta (o Google Drive, USB, lo que uses). O deja que el importador lo haga automáticamente cada vez que re-migres.

## Créditos y contexto

Construido con Claude Code sobre el proyecto Asesor Tributario IA (rama `claude/natillera-monthly-payments-f1kdo8`). El módulo de la calculadora tributaria vive en la misma raíz pero es un app aparte que no interactúa con la natillera.
