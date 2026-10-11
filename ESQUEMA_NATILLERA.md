# Sistema Natillera — Especificación técnica

Documento único con todo lo necesario para replicar el modelo de datos, las reglas de negocio y el API de la natillera en cualquier stack (Node/Python/Go/PHP/Java, SQLite/Postgres/MySQL/SQL Server).

---

## 1. Modelo conceptual

Una **natillera** es una asociación informal (Colombia) donde varios socios ahorran mensualmente durante un ciclo anual (típicamente **diciembre a noviembre**). El pool de dinero acumulado se puede prestar entre socios cobrando interés. Al cerrar el ciclo, cada socio recibe lo que aportó más las utilidades generadas (intereses cobrados + multas + rifas).

**Actores:**
- **Socio (persona)** — miembro activo que aporta y puede pedir préstamos.
- **Cuenta administrativa** — cuenta contable interna (Ej: "Liquidados", "Gastos Bancarios", "Varios") — no recibe liquidación.
- **Administrador (tesorero)** — quien registra los pagos, cobra las moras y hace la liquidación anual.

**Conceptos de flujo monetario:**

| Concepto              | Tipo    | Descripción |
| --------------------- | ------- | --- |
| `AHORRO`              | ingreso | Cuota mensual del socio a la caja común. |
| `ACTIVIDADES`         | ingreso | Aportes por eventos, rifas especiales, ventas, etc. |
| `RIFA_CHANCE`         | ingreso | Compra de boletas de chance/rifa mensual. |
| `PRESTAMO`            | egreso  | Desembolso de un préstamo al socio. |
| `ABONO_PRESTAMO`      | ingreso | Abono a capital de un préstamo activo. |
| `INTERESES_PRESTAMO`  | ingreso | Pago mensual de intereses del préstamo. |
| `MULTA`               | ingreso | Cobro por mora u otras sanciones. |

**Regla crítica:** cada concepto contribuye al total aportado del socio (excepto `PRESTAMO` que es egreso), pero solo `AHORRO` + `ACTIVIDADES` + `RIFA_CHANCE` + `INTERESES_PRESTAMO` cuentan como base de la liquidación individual.

---

## 2. Modelo de datos (DDL portable)

DDL escrito para SQLite estándar. Notas de portabilidad:
- Postgres: reemplaza `INTEGER PRIMARY KEY AUTOINCREMENT` por `SERIAL PRIMARY KEY` o `GENERATED AS IDENTITY`.
- MySQL: reemplaza por `INT AUTO_INCREMENT PRIMARY KEY`, ajusta `TEXT` a `VARCHAR(N)` según necesites.
- Las fechas se guardan como `TEXT` en ISO `YYYY-MM-DD`. En Postgres/MySQL usa `DATE`.

### 2.1 Tabla `socios`

```sql
CREATE TABLE socios (
  id                  INTEGER PRIMARY KEY,          -- número de rifa/id del socio
  nombre              TEXT NOT NULL,
  identificacion      TEXT,
  correo              TEXT,
  telefono            TEXT,
  tipo                TEXT NOT NULL DEFAULT 'persona'
                        CHECK (tipo IN ('persona','cuenta_admin')),
  estado              TEXT NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo','inactivo')),
  cuota_sostenimiento INTEGER NOT NULL DEFAULT 0
                        CHECK (cuota_sostenimiento >= 0)
);
```

Solo los `tipo = 'persona'` cuentan como socios reales. Las cuentas administrativas están para poder registrar movimientos contables sin ensuciar los KPIs.

### 2.2 Tabla `periodos`

```sql
CREATE TABLE periodos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre                TEXT NOT NULL UNIQUE,       -- 'DICIEMBRE','ENERO',...
  orden                 INTEGER NOT NULL,           -- 1..12 (DIC=1, NOV=12)
  fecha_corte_ahorro    TEXT,                       -- ISO yyyy-mm-dd
  fecha_corte_actividad TEXT,
  estado                TEXT NOT NULL DEFAULT 'abierto'
                          CHECK (estado IN ('abierto','cerrado'))
);
```

12 filas fijas por ciclo. El `orden` empieza en DICIEMBRE=1 porque el ciclo natural de la natillera cierra en noviembre. `fecha_corte_ahorro` es la fecha límite mensual para pagar el ahorro sin generar mora.

### 2.3 Tabla `transacciones` (libro diario — fuente de verdad)

```sql
CREATE TABLE transacciones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  socio_id     INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  periodo_id   INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
  concepto     TEXT NOT NULL CHECK (
                 concepto IN ('AHORRO','ACTIVIDADES','RIFA_CHANCE',
                              'PRESTAMO','ABONO_PRESTAMO',
                              'INTERESES_PRESTAMO','MULTA')
               ),
  tipo         TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  valor        INTEGER NOT NULL CHECK (valor >= 0),
  fecha_pago   TEXT,
  notas        TEXT,
  fila_origen  INTEGER NOT NULL,     -- fila del Excel (positivo) o -timestamp (manual)
  UNIQUE (fila_origen, concepto)     -- idempotencia contra re-migraciones
);

CREATE INDEX idx_tx_socio    ON transacciones(socio_id);
CREATE INDEX idx_tx_periodo  ON transacciones(periodo_id);
CREATE INDEX idx_tx_concepto ON transacciones(concepto);
```

`fila_origen` sirve para:
- Positivo (>0): fila del Excel origen. Re-migrar el Excel no duplica registros (bloqueo por UNIQUE).
- Negativo (<0): timestamp negado (`-Date.now()`). Registros creados manualmente desde la UI.

### 2.4 Tabla `prestamos`

```sql
CREATE TABLE prestamos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  socio_id         INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  transaccion_id   INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
  monto_prestado   INTEGER NOT NULL CHECK (monto_prestado >= 0),
  tasa_interes     REAL    NOT NULL DEFAULT 0.03 CHECK (tasa_interes >= 0),
  saldo_pendiente  INTEGER NOT NULL CHECK (saldo_pendiente >= 0),
  fecha_desembolso TEXT,
  estado           TEXT NOT NULL DEFAULT 'activo'
                     CHECK (estado IN ('activo','pagado'))
);
```

Un préstamo con `monto_prestado = 0` es un **préstamo sombra** — creado automáticamente cuando aparece un `ABONO_PRESTAMO` sin `PRESTAMO` previo (deudas anteriores al arranque del ciclo).

### 2.5 Tabla `abonos_prestamos`

```sql
CREATE TABLE abonos_prestamos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  prestamo_id        INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  transaccion_id     INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
  socio_id           INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  monto_abono        INTEGER NOT NULL CHECK (monto_abono >= 0),
  intereses_pagados  INTEGER NOT NULL DEFAULT 0 CHECK (intereses_pagados >= 0),
  capital_pagado     INTEGER NOT NULL DEFAULT 0 CHECK (capital_pagado >= 0),
  fecha_abono        TEXT
);
```

Cada abono discrimina si va a capital, a intereses, o ambos.

### 2.6 Tabla `multas`

```sql
CREATE TABLE multas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  socio_id        INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  transaccion_id  INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
  periodo_id      INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL
                    CHECK (tipo IN ('MORA_AHORRO','MORA_INTERESES')),
  valor           INTEGER NOT NULL CHECK (valor >= 0),
  dias_atraso     INTEGER,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','pagada'))
);
```

Nota: aunque hay una tabla física de multas para las importadas del Excel, **la mora "en vivo" se calcula dinámicamente por endpoint** (ver sección 4). La tabla `multas` sirve para las multas históricas ya cobradas.

### 2.7 Tabla `movimientos_banco` (extractos para conciliación)

```sql
CREATE TABLE movimientos_banco (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  banco           TEXT NOT NULL CHECK (banco IN ('Bancolombia','Nequi')),
  fecha           TEXT,
  descripcion     TEXT,
  monto           INTEGER NOT NULL,        -- SIGNO preservado (+ ingreso, - egreso)
  saldo_cuenta    INTEGER,                 -- saldo tras el movimiento
  detalle_origen  TEXT,                    -- 'NATILLERA' | 'PERSONAL' | 'N/A'
  socio_id        INTEGER REFERENCES socios(id) ON DELETE SET NULL,
  transaccion_id  INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
  fila_origen     INTEGER NOT NULL,
  UNIQUE (banco, fila_origen)
);
```

**Diferencia importante:** `movimientos_banco.monto` **conserva el signo** (positivo o negativo). En `transacciones.valor` es siempre positivo — el signo se deduce de `tipo`.

### 2.8 Tabla `movimientos` (log de auditoría inmutable)

```sql
CREATE TABLE movimientos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  socio_id       INTEGER NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
  transaccion_id INTEGER REFERENCES transacciones(id) ON DELETE SET NULL,
  tipo           TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  concepto       TEXT NOT NULL,
  valor          INTEGER NOT NULL CHECK (valor >= 0),
  fecha          TEXT,
  metadata       TEXT              -- JSON con contexto de origen
);

-- Prohíbe UPDATE y DELETE (log inmutable)
CREATE TRIGGER movs_no_update
  BEFORE UPDATE ON movimientos
  BEGIN
    SELECT RAISE(ABORT, 'movimientos es un log inmutable: UPDATE no permitido');
  END;

CREATE TRIGGER movs_no_delete
  BEFORE DELETE ON movimientos
  BEGIN
    SELECT RAISE(ABORT, 'movimientos es un log inmutable: DELETE no permitido');
  END;
```

Cada `transaccion` insertada debe generar automáticamente una entrada en `movimientos` con el mismo tipo/concepto/valor + `metadata` JSON `{ origen: 'excel'|'manual', ... }`. La tabla nunca se puede modificar ni borrar — sirve como fuente para reconciliación y auditoría legal.

**En Postgres/MySQL:** los triggers usan `RAISE EXCEPTION` (Postgres) o `SIGNAL SQLSTATE` (MySQL). Alternativa: revocar UPDATE y DELETE de la tabla al rol de la aplicación.

---

## 3. Vistas SQL (lógica declarativa)

Las vistas evitan duplicación de cálculos y garantizan una sola fuente de verdad para saldos.

### 3.1 `vw_saldo_por_socio`

Reemplaza cualquier hoja de "estado por socio" del Excel. Todos los conceptos + total aportado + saldo de préstamos vigentes.

```sql
CREATE VIEW vw_saldo_por_socio AS
SELECT
  s.id, s.nombre, s.tipo, s.estado, s.cuota_sostenimiento,
  COALESCE(SUM(CASE WHEN t.concepto = 'AHORRO'             THEN t.valor END), 0) AS ahorro,
  COALESCE(SUM(CASE WHEN t.concepto = 'ACTIVIDADES'        THEN t.valor END), 0) AS actividades,
  COALESCE(SUM(CASE WHEN t.concepto = 'RIFA_CHANCE'        THEN t.valor END), 0) AS rifa_chance,
  COALESCE(SUM(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0) AS intereses_pagados,
  COALESCE(SUM(CASE WHEN t.concepto = 'ABONO_PRESTAMO'     THEN t.valor END), 0) AS abonado_a_prestamos,
  COALESCE(SUM(CASE WHEN t.concepto = 'PRESTAMO'           THEN t.valor END), 0) AS prestamos_recibidos,
  COALESCE(SUM(CASE WHEN t.concepto = 'MULTA'              THEN t.valor END), 0) AS multas_pagadas,
  COALESCE(SUM(CASE WHEN t.tipo = 'ingreso' THEN t.valor END), 0) AS total_aportado,
  COALESCE((
    SELECT SUM(monto_prestado - (
      SELECT COALESCE(SUM(capital_pagado),0) FROM abonos_prestamos WHERE prestamo_id = p.id
    ))
    FROM prestamos p WHERE p.socio_id = s.id AND p.estado = 'activo'
  ), 0) AS saldo_prestamos
FROM socios s
LEFT JOIN transacciones t ON t.socio_id = s.id
GROUP BY s.id;
```

### 3.2 `vw_matriz_ahorro` (socios × meses)

```sql
CREATE VIEW vw_matriz_ahorro AS
SELECT
  s.id AS socio_id, s.nombre,
  p.nombre AS periodo, p.orden AS orden_periodo,
  COALESCE(SUM(t.valor), 0) AS valor
FROM socios s
CROSS JOIN periodos p
LEFT JOIN transacciones t
  ON t.socio_id = s.id AND t.periodo_id = p.id AND t.concepto = 'AHORRO'
WHERE s.tipo = 'persona'
GROUP BY s.id, p.id;
```

Análoga: `vw_matriz_actividades` (cambia `AHORRO` → `ACTIVIDADES`).

### 3.3 `vw_matriz_prestamos`

```sql
CREATE VIEW vw_matriz_prestamos AS
SELECT
  s.id AS socio_id, s.nombre,
  p.nombre AS periodo, p.orden AS orden_periodo,
  COALESCE(SUM(CASE WHEN t.concepto = 'ABONO_PRESTAMO'     THEN t.valor END), 0) AS abono,
  COALESCE(SUM(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0) AS intereses,
  COALESCE(SUM(CASE WHEN t.concepto IN ('ABONO_PRESTAMO','INTERESES_PRESTAMO')
                    THEN t.valor END), 0) AS total
FROM socios s
CROSS JOIN periodos p
LEFT JOIN transacciones t
  ON t.socio_id = s.id AND t.periodo_id = p.id
 AND t.concepto IN ('ABONO_PRESTAMO', 'INTERESES_PRESTAMO')
WHERE s.tipo = 'persona'
GROUP BY s.id, p.id;
```

### 3.4 `vw_liquidacion_anual` (real, no proporcional)

Fórmula:

```
Neto = (ahorro + actividades + rifa_chance + intereses_pagados)     [aportes reales del socio]
     − saldo_préstamos_vigentes                                       [lo que aún debe]
     − multas_pendientes                                              [multas registradas]
     − mora_pendiente_ahorros                                         [calculado dinámicamente, sec. 4]
     − mora_pendiente_intereses                                       [calculado dinámicamente, sec. 4]
```

```sql
CREATE VIEW vw_liquidacion_anual AS
SELECT
  s.id, s.nombre, s.cuota_sostenimiento,
  COALESCE(SUM(CASE WHEN t.concepto = 'AHORRO' THEN t.valor END), 0)             AS ahorro,
  COALESCE(SUM(CASE WHEN t.concepto = 'ACTIVIDADES' THEN t.valor END), 0)         AS actividades,
  COALESCE(SUM(CASE WHEN t.concepto = 'RIFA_CHANCE' THEN t.valor END), 0)         AS rifa_chance,
  COALESCE(SUM(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0)  AS intereses_pagados,
  COALESCE(SUM(CASE WHEN t.concepto IN ('AHORRO','ACTIVIDADES','RIFA_CHANCE','INTERESES_PRESTAMO')
                    THEN t.valor END), 0) AS total_aportes,
  COALESCE((
    SELECT SUM(monto_prestado - (
      SELECT COALESCE(SUM(capital_pagado), 0)
      FROM abonos_prestamos WHERE prestamo_id = p.id
    ))
    FROM prestamos p WHERE p.socio_id = s.id AND p.estado = 'activo'
  ), 0) AS deducc_prestamo,
  COALESCE((SELECT SUM(m.valor) FROM multas m
            WHERE m.socio_id = s.id AND m.estado = 'pendiente'), 0) AS deducc_multas,
  (
    -- (fórmula completa arriba; código en el server.js)
    COALESCE(SUM(CASE WHEN t.concepto IN ('AHORRO','ACTIVIDADES','RIFA_CHANCE','INTERESES_PRESTAMO')
                      THEN t.valor END), 0)
    - COALESCE((
        SELECT SUM(monto_prestado - (SELECT COALESCE(SUM(capital_pagado),0)
                                     FROM abonos_prestamos WHERE prestamo_id = p.id))
        FROM prestamos p WHERE p.socio_id = s.id AND p.estado = 'activo'
      ), 0)
    - COALESCE((SELECT SUM(m.valor) FROM multas m
                WHERE m.socio_id = s.id AND m.estado = 'pendiente'), 0)
  ) AS neto_a_recibir
FROM socios s
LEFT JOIN transacciones t ON t.socio_id = s.id
WHERE s.tipo = 'persona'
GROUP BY s.id;
```

La mora dinámica (secciones 4.1 y 4.2) se resta en la capa de aplicación cuando se sirve el endpoint (no cabe en una vista sin agregar procedural SQL).

---

## 4. Reglas de negocio

### 4.1 Mora por ahorro tardío

**Regla:** cada periodo tiene una `fecha_corte_ahorro`. Si el socio paga el ahorro después de esa fecha, se cobra **$500 por día de atraso**. Si aún no ha pagado y ya pasó, la mora crece día a día.

**Pseudocódigo:**

```
para cada periodo P cuya fecha_corte_ahorro <= HOY:
    para cada socio S activo tipo persona:
        pago = MIN(fecha_pago) de transacciones donde socio=S, concepto='AHORRO', periodo=P
        si pago existe:
            días = MAX(0, pago - P.fecha_corte_ahorro)
            mora = días × 500                   → mora_pagada
        si no:
            días = MAX(0, HOY - P.fecha_corte_ahorro)
            mora = días × 500                   → mora_pendiente
```

Emparejamiento: **1 pago por socio × periodo**. Si un socio hace 2 pagos parciales en el mismo mes, se toma el primero.

### 4.2 Mora por intereses de préstamo

**Regla:** cada préstamo genera un vencimiento mensual en el **mismo día del mes que su fecha_desembolso**. Ejemplo: préstamo del 17-ago → vencimientos 17-sep, 17-oct, 17-nov, etc. **$500 por día de atraso**.

Emparejamiento: **FIFO** — el pago N cubre el vencimiento N.

**Pseudocódigo:**

```
para cada préstamo P activo con fecha_desembolso:
    generar vencimientos = [fecha_desembolso + 1 mes, +2 meses, ..., mientras <= HOY]
    pagos_int = abonos_prestamos donde prestamo=P y intereses_pagados > 0
                ORDER BY fecha_abono, id
    para i in range(len(vencimientos)):
        v = vencimientos[i]
        pago = pagos_int[i] si existe, si no NULL
        si pago:
            días = MAX(0, pago.fecha - v)
            mora = días × 500                   → mora_pagada
        si no:
            días = MAX(0, HOY - v)
            mora = días × 500                   → mora_pendiente
```

### 4.3 Detección de cuentas administrativas

Al importar del Excel, marca como `tipo = 'cuenta_admin'` cualquier nombre en el conjunto:

```
CUENTAS_ADMIN = { 'Liquidados', 'Gastos Bancarios', 'Varios' }
```

Estas quedan fuera de la matriz de ahorros, del conteo de "socios activos" y de la liquidación.

### 4.4 Idempotencia de la importación

- Al insertar transacciones desde el Excel: `fila_origen = <número de fila>` (positivo).
- Al insertar transacciones manuales desde la UI: `fila_origen = -Date.now()` (negativo, único por milisegundo).
- La UNIQUE `(fila_origen, concepto)` bloquea la re-importación duplicada.
- Regla de UI: solo transacciones con `fila_origen < 0` se pueden eliminar (las importadas del Excel están protegidas).

### 4.5 Préstamos sombra

Si aparece un `ABONO_PRESTAMO` sin `PRESTAMO` previo (socio ya tenía deuda antes del rango del Excel):

- Se crea automáticamente un `prestamos` con `monto_prestado = 0`, `estado = 'activo'`.
- Sirve para no romper la integridad referencial de `abonos_prestamos`.
- Estos préstamos NO generan mora de intereses (se filtran por `monto_prestado > 0` en el cálculo).

### 4.6 Concepto de "aportes" para liquidación

Solo estos 4 conceptos suman como "aportes reales del socio" en la liquidación:

```
AHORRO + ACTIVIDADES + RIFA_CHANCE + INTERESES_PRESTAMO
```

`ABONO_PRESTAMO` NO se cuenta como aporte porque solo devuelve algo que la caja ya le prestó al socio. `PRESTAMO` es egreso (sale de la caja hacia el socio).

### 4.7 Signo de los montos

- `transacciones.valor`: **siempre positivo**. El signo lo determina `tipo` (ingreso/egreso).
- `movimientos_banco.monto`: **conserva el signo**. Necesario para reproducir el saldo bancario cronológico.

---

## 5. Parámetros configurables

| Parámetro | Valor actual | Ubicación en el código |
| --- | --- | --- |
| `MORA_POR_DIA` | 500 | `natillera-backend/server.js` |
| Tasa de interés préstamos (default) | 3% mensual (0.03) | `prestamos.tasa_interes` |
| Meses del ciclo | 12 (DIC → NOV) | `ORDEN_MESES_DEFAULT` en `importador.js` |
| Cuentas administrativas | Liquidados, Gastos Bancarios, Varios | `CUENTAS_ADMIN` en `importador.js` |
| Máx. backups automáticos | 10 | `importador.js` (rotación FIFO) |
| Puerto del backend | 4000 | `NAT_PORT` env var |
| Base de datos | `natillera.db` (SQLite) | `NAT_DB` env var |

En una re-implementación, ponlos en una tabla `configuracion` para poder editarlos desde la UI sin re-desplegar.

---

## 6. Flujos operativos

### 6.1 Registrar un pago desde el extracto bancario

Un movimiento bancario puede corresponder a varios conceptos. Ejemplo: **$205.000** recibidos → 100 AHORRO + 30 ACTIVIDADES + 20 INT_PRESTAMO + 50 ABONO_PRESTAMO + 5 RIFA.

**Endpoint:** `POST /api/transacciones/desglose`

Body:
```json
{
  "socio_id": 17,
  "extracto_id": 428,
  "fecha_pago": "2026-09-06",
  "periodo_id": 10,
  "lineas": [
    { "concepto": "AHORRO", "valor": 100000 },
    { "concepto": "ACTIVIDADES", "valor": 30000 },
    { "concepto": "INTERESES_PRESTAMO", "valor": 20000 },
    { "concepto": "ABONO_PRESTAMO", "valor": 50000 },
    { "concepto": "RIFA_CHANCE", "valor": 5000 }
  ]
}
```

Comportamiento **atómico**:
1. `BEGIN`
2. Por cada línea: `INSERT` en `transacciones` + `INSERT` en `movimientos`
3. Para líneas `PRESTAMO`/`ABONO_PRESTAMO`/`INTERESES_PRESTAMO`: crear/actualizar filas en `prestamos`/`abonos_prestamos`
4. `UPDATE movimientos_banco SET transaccion_id = <primera_tx>` (vincula el extracto)
5. `COMMIT` (o `ROLLBACK` si algo falla)

### 6.2 Migración desde Excel

Hojas fuente del `.xlsm` original:
- `BD` — maestra de socios (id, nombre, cuota mensual)
- `Datos` — catálogo de periodos con fechas de corte
- `BASE DE DATOS` — libro diario de transacciones
- `Bancolombia`, `Nequi` — extractos bancarios

Validación **al centavo antes del COMMIT**:
```
SUM(valor) en Excel para AHORRO+ACTIVIDADES+RIFA+ABONO+INTERESES
  ==
SUM(valor) en SQLite para los mismos conceptos
```
Si difiere, `ROLLBACK` automático.

### 6.3 Conciliación bancaria

Cada `movimientos_banco` puede etiquetarse con `detalle_origen`:
- `NATILLERA` — ingreso/egreso relacionado con la natillera
- `PERSONAL` — movimiento personal del titular (se excluye de totales)
- `N/A` — no aplica (comisiones, intereses del banco, etc.)

Un movimiento etiquetado NATILLERA que aún no está vinculado a una `transaccion_id` es un ingreso "sin registrar" — quedan pendientes de que el administrador les asigne el concepto correcto.

---

## 7. API REST

Todos los endpoints están bajo `http://localhost:4000/api`.

### 7.1 Lectura

| Método | Ruta | Devuelve |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, db }` |
| GET | `/api/resumen` | KPIs globales (ahorros, deuda, utilidad, socios, etc.) |
| GET | `/api/socios[?tipo=todos]` | Lista con saldo por socio |
| GET | `/api/socios/:id` | `{ socio, historial }` |
| GET | `/api/periodos` | Catálogo de meses |
| GET | `/api/matriz-ahorro` | `{ meses, socios[{socio_id, nombre, celdas, total}] }` |
| GET | `/api/matriz-actividades` | Mismo formato |
| GET | `/api/matriz-prestamos` | `{ meses, socios }` con abono/intereses/total por celda |
| GET | `/api/liquidacion` | Fila por socio con aportes, deducciones y neto |
| GET | `/api/bancos` | Resumen agregado por banco |
| GET | `/api/ahorros-por-periodo` | Total por mes |
| GET | `/api/deudores` | Préstamos activos con saldo pendiente |
| GET | `/api/morosos[?dias=60]` | Socios sin aportar en N días |
| GET | `/api/mora-ahorros[?detalle=true]` | Reporte de mora por ahorros |
| GET | `/api/mora-intereses[?detalle=true]` | Reporte de mora por intereses de préstamo |
| GET | `/api/extractos[?filtros...]` | Movimientos bancarios paginados |
| GET | `/api/transacciones[?filtros...]` | Historial |

### 7.2 Escritura

| Método | Ruta | Body |
| --- | --- | --- |
| POST | `/api/transacciones` | `{socio_id, concepto, valor, fecha_pago, periodo_id, notas, extracto_id?}` |
| POST | `/api/transacciones/desglose` | `{socio_id, fecha_pago, periodo_id, extracto_id?, lineas:[{concepto,valor,notas?}]}` |
| POST | `/api/extractos/:id/vincular` | `{transaccion_id}` |
| POST | `/api/extractos/:id/origen` | `{detalle_origen:'NATILLERA'\|'PERSONAL'\|'N/A'\|null}` |
| DELETE | `/api/transacciones/:id` | (solo `fila_origen < 0`) |

---

## 8. Decisiones de diseño y casos límite

| Caso | Solución |
| --- | --- |
| Celda vacía en Excel | Se trata como `0`. |
| Errores de fórmula (`#DIV/0!`, `#REF!`, `#N/A`, `#NAME?`) | Se tratan como `0` durante la migración. |
| ID de socio con formato `"10.0"` (float) | Normalizar a `"10"` con truncado. |
| Valores negativos en el Excel | `Math.abs()`. El signo real lo determina `tipo`. |
| Socio en transacciones pero no en la maestra | Auto-crear con `cuota = 0`. |
| Abono a préstamo previo al Excel | Crear préstamo sombra `monto = 0`. |
| Fecha en formato serial Excel (número) | Convertir a ISO: `new Date((serial - 25569) * 86400 * 1000)`. |
| Re-corrida de la migración | UNIQUE `fila_origen` dispara ROLLBACK — BD original intacta. |
| Transacción manual con conceptos múltiples | Endpoint `desglose` — todo o nada. |
| Auditoría inmutable | Triggers `BEFORE UPDATE/DELETE` en `movimientos`. |
| Backup previo a re-migración | Copia automática a `backups/natillera-YYYY-MM-DD_HH-MM-SS.db`. |

---

## 9. Stack de referencia (implementación actual)

- **BD:** SQLite (via `node:sqlite` built-in de Node 22+, sin compilación nativa)
- **Backend:** Express minimalista + CORS solo localhost
- **Frontend:** React 19 + Vite + Tailwind v4 + shadcn/ui (subset)
- **Migración de Excel:** ExcelJS (streaming, sin depender de LibreOffice)
- **Sin nube, sin auth, sin base remota** — todo local

Los principios que hacen el sistema portable a cualquier stack:

1. **Toda regla de negocio vive en el backend o en vistas SQL.** El frontend solo pinta.
2. **Los cálculos "en vivo"** (moras) se hacen a demanda en cada request. No hay caché ni tabla materializada.
3. **La única fuente de verdad de flujos monetarios es la tabla `transacciones`.** Todo lo demás son vistas o derivadas.
4. **El log `movimientos` es sagrado** — nunca se toca, siempre crece.
5. **Idempotencia en la importación** — se puede re-migrar el Excel sin dañar la BD.

Con este documento y el DDL de arriba, un desarrollador competente puede replicar el sistema en Postgres + FastAPI, Supabase + Next.js, MySQL + Laravel, o cualquier combinación equivalente, en ~1 día de trabajo.
