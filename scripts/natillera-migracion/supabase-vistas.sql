-- ============================================================
-- Vistas SQL de la natillera para Supabase (Postgres)
--
-- Ejecutar en Supabase → SQL Editor → New query.
-- Espejo de las vistas que crea scripts/natillera-migracion/database.js
-- para la BD local SQLite. Necesarias para que natillera-app funcione
-- con VITE_NAT_DATA_SOURCE=supabase.
--
-- Las vistas usan security_invoker: respetan el RLS de quien consulta,
-- así un socio solo ve sus propias filas. Después de este archivo corre
-- supabase-acceso.sql (perfiles, permisos y totales).
-- ============================================================

DROP VIEW IF EXISTS vw_saldo_por_socio;
CREATE VIEW vw_saldo_por_socio WITH (security_invoker = true) AS
SELECT
  s.id,
  s.nombre,
  s.tipo,
  s.estado,
  s.cuota_sostenimiento,
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

DROP VIEW IF EXISTS vw_matriz_ahorro;
CREATE VIEW vw_matriz_ahorro WITH (security_invoker = true) AS
SELECT
  s.id AS socio_id,
  s.nombre,
  p.nombre AS periodo,
  p.orden  AS orden_periodo,
  COALESCE(SUM(t.valor), 0) AS valor
FROM socios s
CROSS JOIN periodos p
LEFT JOIN transacciones t
  ON t.socio_id = s.id
 AND t.periodo_id = p.id
 AND t.concepto = 'AHORRO'
WHERE s.tipo = 'persona'
GROUP BY s.id, p.id;

DROP VIEW IF EXISTS vw_matriz_actividades;
CREATE VIEW vw_matriz_actividades WITH (security_invoker = true) AS
SELECT
  s.id AS socio_id,
  s.nombre,
  p.nombre AS periodo,
  p.orden  AS orden_periodo,
  COALESCE(SUM(t.valor), 0) AS valor
FROM socios s
CROSS JOIN periodos p
LEFT JOIN transacciones t
  ON t.socio_id = s.id
 AND t.periodo_id = p.id
 AND t.concepto = 'ACTIVIDADES'
WHERE s.tipo = 'persona'
GROUP BY s.id, p.id;

DROP VIEW IF EXISTS vw_totales_globales;
CREATE VIEW vw_totales_globales WITH (security_invoker = true) AS
SELECT
  concepto,
  tipo,
  COUNT(*)     AS n_transacciones,
  SUM(valor)   AS total,
  MIN(fecha_pago) AS primera_fecha,
  MAX(fecha_pago) AS ultima_fecha
FROM transacciones
GROUP BY concepto, tipo;

DROP VIEW IF EXISTS vw_liquidacion_anual;
CREATE VIEW vw_liquidacion_anual WITH (security_invoker = true) AS
SELECT
  s.id,
  s.nombre,
  s.cuota_sostenimiento,
  COALESCE(SUM(CASE WHEN t.concepto = 'AHORRO' THEN t.valor END), 0) AS ahorro,
  COALESCE(SUM(CASE WHEN t.concepto = 'ACTIVIDADES' THEN t.valor END), 0) AS actividades,
  COALESCE(SUM(CASE WHEN t.concepto = 'RIFA_CHANCE' THEN t.valor END), 0) AS rifa_chance,
  COALESCE(SUM(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0) AS intereses_pagados,
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
  0 AS deducc_mora_intereses,
  0 AS deducc_mora_ahorro,
  (
    COALESCE(SUM(CASE WHEN t.concepto IN ('AHORRO','ACTIVIDADES','RIFA_CHANCE','INTERESES_PRESTAMO')
                      THEN t.valor END), 0)
    - COALESCE((
        SELECT SUM(monto_prestado - (
          SELECT COALESCE(SUM(capital_pagado), 0)
          FROM abonos_prestamos WHERE prestamo_id = p.id
        ))
        FROM prestamos p WHERE p.socio_id = s.id AND p.estado = 'activo'
      ), 0)
    - COALESCE((SELECT SUM(m.valor) FROM multas m
                WHERE m.socio_id = s.id AND m.estado = 'pendiente'), 0)
  ) AS neto_a_recibir
FROM socios s
LEFT JOIN transacciones t ON t.socio_id = s.id
WHERE s.tipo = 'persona'
GROUP BY s.id;

DROP VIEW IF EXISTS vw_matriz_prestamos;
CREATE VIEW vw_matriz_prestamos WITH (security_invoker = true) AS
SELECT
  s.id AS socio_id,
  s.nombre,
  p.nombre AS periodo,
  p.orden  AS orden_periodo,
  COALESCE(SUM(CASE WHEN t.concepto = 'ABONO_PRESTAMO'     THEN t.valor END), 0) AS abono,
  COALESCE(SUM(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0) AS intereses,
  COALESCE(SUM(CASE WHEN t.concepto IN ('ABONO_PRESTAMO','INTERESES_PRESTAMO')
                    THEN t.valor END), 0) AS total
FROM socios s
CROSS JOIN periodos p
LEFT JOIN transacciones t
  ON t.socio_id = s.id
 AND t.periodo_id = p.id
 AND t.concepto IN ('ABONO_PRESTAMO', 'INTERESES_PRESTAMO')
WHERE s.tipo = 'persona'
GROUP BY s.id, p.id;

DROP VIEW IF EXISTS vw_conciliacion_bancaria;
CREATE VIEW vw_conciliacion_bancaria WITH (security_invoker = true) AS
SELECT
  banco,
  COUNT(*) AS n_movs,
  SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END)   AS ingresos_totales,
  SUM(CASE WHEN monto < 0 THEN -monto ELSE 0 END)  AS egresos_totales,
  SUM(CASE WHEN monto > 0 AND (detalle_origen IS NULL OR detalle_origen != 'PERSONAL')
           THEN monto ELSE 0 END) AS ingresos_natillera,
  SUM(CASE WHEN transaccion_id IS NOT NULL THEN monto ELSE 0 END) AS monto_conciliado
FROM movimientos_banco
GROUP BY banco;

-- ============================================================
-- RLS: tablas cerradas por defecto
--
-- Antes aquí había políticas públicas (cualquiera con la anon key podía
-- leer, insertar y borrar). Los permisos ahora viven en
-- supabase-acceso.sql (admin / socio / anónimo): córrelo después de este.
-- ============================================================

ALTER TABLE socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestamos ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonos_prestamos ENABLE ROW LEVEL SECURITY;
ALTER TABLE multas ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_banco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lectura publica socios" ON socios;
DROP POLICY IF EXISTS "lectura publica periodos" ON periodos;
DROP POLICY IF EXISTS "lectura publica transacciones" ON transacciones;
DROP POLICY IF EXISTS "lectura publica prestamos" ON prestamos;
DROP POLICY IF EXISTS "lectura publica abonos" ON abonos_prestamos;
DROP POLICY IF EXISTS "lectura publica multas" ON multas;
DROP POLICY IF EXISTS "lectura publica banco" ON movimientos_banco;
DROP POLICY IF EXISTS "escritura publica transacciones" ON transacciones;
DROP POLICY IF EXISTS "borrado publico transacciones" ON transacciones;
DROP POLICY IF EXISTS "escritura publica banco" ON movimientos_banco;
DROP POLICY IF EXISTS "update publica banco" ON movimientos_banco;
