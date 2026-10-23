# Natillera API

Servidor HTTP local minimalista que expone `natillera.db` (SQLite) al frontend. Sin autenticación, sin base de datos remota — solo lee tu archivo `.db` local en modo read-only.

Usa **`node:sqlite`** built-in (Node 22+). Cero compilación nativa.

## Requisitos

- Node.js ≥ 22
- Que ya exista el archivo `../scripts/natillera-migracion/natillera.db` (correlo primero con el importador de Excel)

## Uso

```bash
cd natillera-backend
pnpm install      # (si aún no lo hiciste desde el workspace raíz)
pnpm dev          # arranca en http://localhost:4000 con --watch
```

El frontend de `natillera-app` (Vite en localhost:5173) lo consume automáticamente.

## Variables de entorno

| Variable | Descripción | Default |
| --- | --- | --- |
| `NAT_DB` | Ruta al archivo `natillera.db` | `../scripts/natillera-migracion/natillera.db` |
| `NAT_PORT` | Puerto de escucha | `4000` |

Ejemplo:
```bash
NAT_DB=/otra/ruta/natillera.db NAT_PORT=5000 pnpm start
```

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/health` | Verificación rápida — devuelve `{ok, db}` |
| GET | `/api/resumen` | KPIs del ciclo: ahorros, deuda, utilidad, etc. |
| GET | `/api/socios` | Saldo por socio (persona por defecto; `?tipo=todos`) |
| GET | `/api/socios/:id` | Historial completo de transacciones del socio |
| GET | `/api/matriz-ahorro` | Matriz socios × meses de ahorro |
| GET | `/api/matriz-actividades` | Matriz socios × meses de actividades |
| GET | `/api/liquidacion` | Liquidación estimada por socio |
| GET | `/api/bancos` | Conciliación Bancolombia + Nequi |
| GET | `/api/ahorros-por-periodo` | Total recaudado por mes |
| GET | `/api/deudores` | Préstamos activos con saldo pendiente |
| GET | `/api/morosos?dias=60` | Socios sin aportar en N días |

## Seguridad

- Escucha solo en `127.0.0.1` — no accesible desde la red.
- CORS restringido a `http://localhost:*` — solo el frontend local puede consumirlo.
- Conexión SQLite abierta en `readOnly: true` — imposible modificar la BD desde la API.
