# Migración Natillera (Excel → SQLite)

Script ETL en Node.js que migra la planilla mensual de la natillera (`.xlsm`) a una base de datos SQLite relacional, con validación exacta al centavo y `ROLLBACK` atómico si el checksum no cuadra.

> Este subproyecto vive aislado del bundle Vite del asesor tributario (tiene su propio `package.json`) para no meter `better-sqlite3` en el frontend.

## Requisitos

- Node.js ≥ 20
- El archivo Excel de la natillera (usa la hoja **BASE DE DATOS** como fuente de transacciones y la hoja **BD** como maestra de socios / cuotas mensuales).

## Instalación

```bash
cd scripts/natillera-migracion
npm install
```

## Uso

```bash
# Dry-run: lee el Excel y reporta socios/transacciones/errores sin tocar la BD
node importador.js /ruta/al/PLANTILLA_NATILLERA.xlsm --dry-run

# Migración real (crea/actualiza natillera.db en el directorio actual)
node importador.js /ruta/al/PLANTILLA_NATILLERA.xlsm

# Ruta de BD personalizada
node importador.js /ruta/al/PLANTILLA_NATILLERA.xlsm --db=/tmp/nat.db

# Reset (borra natillera.db para poder re-migrar)
npm run reset
```

## Salida esperada

```
📖 Leyendo …/natillera.xlsm…
   Socios: 58, transacciones: 1067, errores previos: 0
💾 SQLite: …/natillera.db
✅ Migración validada al centavo. Total ingresos: 61.357.000
```

## Esquema (7 tablas)

| Tabla              | Propósito |
| ------------------ | --- |
| `socios`           | 1 fila por miembro (id, nombre, cuota, estado). |
| `cuotas`           | Aportes mensuales — conceptos AHORRO y ACTIVIDADES. Idempotente por `(fila_origen, concepto)`. |
| `prestamos`        | Un préstamo por desembolso. Los abonos previos al rango del Excel generan un préstamo "sombra" con `monto_prestado = 0`. |
| `abonos_prestamos` | Cada ABONO PRESTAMO / INTERESES PRESTAMO se cuelga aquí, discriminando capital vs. intereses. |
| `rifas`            | RIFA CHANCE por socio × periodo. Idempotente por `fila_origen`. |
| `multas`           | Derivadas de las columnas `Valor Mora Ahorro` / `Valor Mora Int` de la hoja transaccional. |
| `movimientos`      | **Log de auditoría inmutable** — una fila por cada evento monetario. Triggers `BEFORE UPDATE / DELETE` prohíben modificarlo. |

## Cómo funciona la validación

La función `migrar(db, plan)` está envuelta en `db.transaction(...)` de `better-sqlite3`. Al final de la transacción, **antes del `COMMIT`**, `validarSaldos(db, plan)` compara:

- **Esperado (Excel)** — suma directa de `AHORRO + ACTIVIDADES + ABONO PRESTAMO + INTERESES PRESTAMO + RIFA CHANCE` sobre el plan en memoria.
- **Obtenido (SQLite)** — `SUM(valor)` en `movimientos` para los mismos conceptos ya insertados.

Si la diferencia es distinta de 0, se lanza `ErrorValidacion` y `better-sqlite3` ejecuta `ROLLBACK` automáticamente. **No queda nada persistido si el checksum no cuadra.**

## Casos límite manejados (edge cases)

| Caso                                     | Tratamiento |
| ---------------------------------------- | --- |
| Celda vacía / `null`                     | Se convierte a `0`. |
| Errores de fórmula (`#DIV/0!`, `#REF!`)  | `toMoney(...)` los detecta y devuelve `0`. |
| Texto con símbolos (`$`, `.`, espacios)  | Se limpia con `/[^\d.-]/g` antes de `Number(...)`. |
| Valores negativos en el Excel            | `Math.abs(...)` — el signo lo determina `tipo` (`ingreso`/`egreso`). |
| Identificadores tipo `"10.0"`            | `toSocioId(...)` normaliza a `"10"`. |
| Socio en transacciones pero no en la maestra | Se auto-crea con `cuota_sostenimiento = 0`. |
| Abono a préstamo previo al rango         | Se auto-crea un préstamo sombra con `monto_prestado = 0` para preservar integridad referencial. |
| Filas sin socio o sin concepto           | Se ignoran silenciosamente (totales, separadores). |
| Re-corrida sobre BD existente            | UNIQUE constraint sobre `fila_origen` dispara ROLLBACK — la BD original queda intacta. |

## Estructura de archivos

```
scripts/natillera-migracion/
├── database.js       # inicializarDB + esquema DDL + triggers de auditoría
├── importador.js     # procesarExcel + migrar + validarSaldos + CLI
├── package.json      # deps aisladas (better-sqlite3, exceljs)
└── README.md         # este archivo
```

## Notas de diseño

- **`better-sqlite3` vs `sqlite3` async.** Elegido `better-sqlite3` porque es sincrónico y su API de transacciones (`db.transaction(fn)`) hace `BEGIN` / `COMMIT` / `ROLLBACK` en un solo bloque atómico. Perfecto para un ETL de una sola pasada.
- **Auditoría inmutable.** Dos triggers (`movs_no_update`, `movs_no_delete`) rechazan cualquier `UPDATE` o `DELETE` sobre `movimientos`. Sirve como fuente de verdad legal / de reconciliación.
- **`WAL` mode.** Permite lecturas concurrentes desde un futuro backend Express mientras el importador reescribe.
- **Todo en pesos enteros.** Los montos se guardan como `INTEGER` (pesos, no centavos). Ningún cálculo intermedio usa `float` — evita descuadres de coma flotante.
