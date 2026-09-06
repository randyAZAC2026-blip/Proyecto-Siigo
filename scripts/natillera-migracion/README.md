# Migración Natillera — Excel → SQLite estandarizado

Consolidamos las **11 hojas** del libro de la natillera en **una sola fuente de verdad** (SQLite), con validación al centavo y vistas SQL que reemplazan las hojas rotas del Excel.

## Por qué

Auditoría del Excel original detectó:
- `BD` (resumen consolidado) reportaba solo la **mitad** de los movimientos reales — fórmulas de acumulado rotas.
- `Liquidacion` y `Resumen liquidacion` casi completamente rotas (miles de `#N/A`, `#REF!`, `#DIV/0!`).
- `Hoja 1`, `Actividades` y `BASE DE DATOS` mantenían tres cifras distintas de "actividades" del mismo periodo.
- Cuentas administrativas (`Liquidados`, `Gastos Bancarios`, `Varios`) contadas como socios.

Esta migración reemplaza todo eso con un modelo relacional donde `transacciones` es la única fuente de verdad y las hojas de resumen son **VIEWs** calculadas al vuelo — no puede haber dos versiones del mismo total.

## Requisitos

- **Node.js ≥ 22** — este script usa `node:sqlite`, el driver SQLite built-in
  de Node 22+. No requiere compilar código nativo ni Visual Studio C++.
- El Excel `.xlsm` de la natillera con las hojas: `BD`, `BASE DE DATOS`, `Datos`, `Bancolombia`, `Nequi`.

## Instalación

```bash
cd scripts/natillera-migracion
npm install
```

## Uso

```bash
# Dry-run: lee y reporta sin tocar la BD
node importador.js /ruta/al/PLANTILLA_NATILLERA.xlsm --dry-run

# Migración real (crea/actualiza natillera.db)
node importador.js /ruta/al/PLANTILLA_NATILLERA.xlsm

# Reset para volver a migrar desde cero
npm run reset
```

## Esquema

### Tablas maestras

| Tabla | Propósito |
| --- | --- |
| `socios` | Personas + cuentas contables (`tipo` distingue `persona` de `cuenta_admin`). |
| `periodos` | 12 meses del ciclo anual (DIC → NOV) con fechas de corte de la hoja `Datos`. |

### Libro diario (fuente de verdad)

| Tabla | Propósito |
| --- | --- |
| `transacciones` | Cada AHORRO, ACTIVIDAD, PRÉSTAMO, ABONO, INTERESES, RIFA, MULTA. Idempotente por `fila_origen`. |

### Subtablas

| Tabla | Propósito |
| --- | --- |
| `prestamos` | Un desembolso vigente por fila. Los abonos previos al rango del Excel generan un préstamo sombra (monto 0). |
| `abonos_prestamos` | Cada `ABONO_PRESTAMO` / `INTERESES_PRESTAMO`, discriminando capital vs. intereses. |
| `multas` | Derivadas de las columnas `Valor Mora Ahorro` / `Valor Mora Int` de la hoja transaccional. |
| `movimientos_banco` | Extractos crudos de Bancolombia y Nequi, con `detalle_origen` (PERSONAL / NATILLERA / …) para conciliación futura. |
| `movimientos` | Log de auditoría inmutable — triggers `BEFORE UPDATE/DELETE` rechazan cualquier cambio. |

### Vistas (reemplazan las hojas del Excel)

| Vista SQL | Reemplaza |
| --- | --- |
| `vw_saldo_por_socio` | Hojas `BD` y `Estado Socios`. Recalcula al vuelo ahorro, actividades, rifa, intereses, multas, saldo de préstamos y total aportado. |
| `vw_matriz_ahorro` | Matriz socios × mes de ahorros. |
| `vw_matriz_actividades` | Matriz socios × mes de actividades (reemplaza `Hoja 1` y `Actividades`). |
| `vw_liquidacion_anual` | Reemplaza `Liquidacion` y `Resumen liquidacion`. Utilidad total = intereses + multas + rifas, repartida proporcional al ahorro de cada socio. |
| `vw_conciliacion_bancaria` | Ingresos y egresos por banco, separando "natillera" de "personal". |
| `vw_totales_globales` | Un tile por concepto: n_transacciones, total, primera y última fecha. |

## Salida esperada

```
📖 Leyendo …/natillera.xlsm…
   Socios: 59   Periodos: 12   Transacciones: 1067   Movs banco: 1235   Errores: 0
💾 SQLite: …/natillera.db

✅ Migración validada al centavo. Total ingresos (aportes): 61.357.000

════════════════════════════════════════════════════════════════════════
  RECONCILIACIÓN Y CONSOLIDADO
════════════════════════════════════════════════════════════════════════

▸ SOCIOS
    cuenta_admin    3
    persona         56

▸ TOTALES POR CONCEPTO (transacciones)
    AHORRO                 ingreso      376      $41.133.000
    PRESTAMO               egreso        53      $27.883.000
    ABONO_PRESTAMO         ingreso       91       $9.661.000
    ACTIVIDADES            ingreso      131       $6.295.000
    RIFA_CHANCE            ingreso      361       $2.315.000
    INTERESES_PRESTAMO     ingreso       55       $1.953.000

▸ AHORRO POR PERIODO
     1. DICIEMBRE          $2.745.000   (33 tx)
     …
     8. JULIO              $5.370.000   (101 tx)
     9. AGOSTO             $1.160.000   (11 tx)

▸ EXTRACTOS BANCARIOS
    Bancolombia   1118 movs   ingresos $147.750.550   natillera $84.788.421
    Nequi          117 movs   ingresos   $9.331.251   natillera  $4.429.951

▸ UTILIDAD DEL CICLO (intereses + multas + rifas): $4.268.000
════════════════════════════════════════════════════════════════════════
```

## Cómo validar la migración

El script hace la validación automáticamente **dentro de la transacción SQL**. Si el checksum no cuadra, ejecuta ROLLBACK y no persiste nada.

Para consultar manualmente:

```bash
sqlite3 natillera.db

# Top 10 socios por total aportado
SELECT nombre, total_aportado, ahorro, saldo_prestamos
FROM vw_saldo_por_socio
WHERE tipo = 'persona'
ORDER BY total_aportado DESC LIMIT 10;

# Ahorro mes a mes por socio (matriz)
SELECT nombre,
  SUM(CASE WHEN periodo='DICIEMBRE' THEN valor END) AS dic,
  SUM(CASE WHEN periodo='ENERO'     THEN valor END) AS ene,
  SUM(CASE WHEN periodo='FEBRERO'   THEN valor END) AS feb
FROM vw_matriz_ahorro GROUP BY nombre ORDER BY nombre;

# Liquidación estimada por socio
SELECT nombre, ahorro_socio, utilidad_estimada, neto_a_pagar_estimado
FROM vw_liquidacion_anual
ORDER BY neto_a_pagar_estimado DESC;
```

## Casos límite manejados

| Caso | Tratamiento |
| --- | --- |
| Celda vacía / null | `0`. |
| Errores `#DIV/0!`, `#REF!`, `#N/A`, `#NAME?` | `0`. |
| Texto con símbolos (`$`, `.`, espacios) | Limpiado con regex. |
| Valores negativos | `Math.abs` en aportes (el signo lo marca `tipo` ingreso/egreso); preservado en extractos bancarios. |
| IDs `"10.0"` | Normalizados a `"10"`. |
| Cuentas contables (Liquidados, Gastos Bancarios, Varios) | Se cargan con `tipo='cuenta_admin'` y quedan fuera de matrices y KPIs de socios. |
| Socio en transacciones pero no en la maestra | Se auto-crea. |
| Abono a préstamo previo al rango | Préstamo sombra con `monto_prestado = 0` para preservar integridad referencial. |
| Filas sin socio o sin concepto | Se ignoran silenciosamente. |
| Concepto desconocido | Se reporta y se omite (no aborta la migración). |
| Re-corrida sobre BD existente | UNIQUE constraint sobre `fila_origen` dispara ROLLBACK — BD original intacta. |

## Estructura de archivos

```
scripts/natillera-migracion/
├── database.js       # inicializarDB + esquema DDL + vistas + triggers
├── importador.js     # procesarExcel (5 hojas) + migrar + validar + reporte
├── package.json      # deps aisladas (better-sqlite3, exceljs)
└── README.md         # este archivo
```
