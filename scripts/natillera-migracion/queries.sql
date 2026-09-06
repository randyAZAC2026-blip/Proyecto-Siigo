-- =====================================================================
-- CONSULTAS ÚTILES SOBRE natillera.db
-- Copia y pega cualquier bloque en DB Browser for SQLite → "Execute SQL"
-- (https://sqlitebrowser.org — gratis)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RESUMEN GENERAL DE LA NATILLERA
-- ---------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM socios WHERE tipo = 'persona')                      AS socios_activos,
  (SELECT COUNT(*) FROM socios WHERE tipo = 'cuenta_admin')                 AS cuentas_admin,
  (SELECT COUNT(*) FROM transacciones)                                      AS n_transacciones,
  (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='AHORRO')          AS total_ahorros,
  (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='ACTIVIDADES')     AS total_actividades,
  (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='RIFA_CHANCE')     AS total_rifa,
  (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto='INTERESES_PRESTAMO') AS intereses_ganados,
  (SELECT COALESCE(SUM(valor),0) FROM multas)                               AS multas_totales,
  (SELECT COALESCE(SUM(valor),0) FROM transacciones WHERE concepto IN
     ('INTERESES_PRESTAMO','MULTA','RIFA_CHANCE'))                          AS utilidad_ciclo;


-- ---------------------------------------------------------------------
-- 2. TOP 15 SOCIOS POR APORTES TOTALES
-- ---------------------------------------------------------------------
SELECT
  nombre,
  '$' || printf('%,d', total_aportado) AS aportado,
  '$' || printf('%,d', ahorro)         AS ahorro,
  '$' || printf('%,d', actividades)    AS actividades,
  '$' || printf('%,d', rifa_chance)    AS rifa,
  '$' || printf('%,d', saldo_prestamos) AS deuda_actual
FROM vw_saldo_por_socio
WHERE tipo = 'persona'
ORDER BY total_aportado DESC
LIMIT 15;


-- ---------------------------------------------------------------------
-- 3. QUIÉNES DEBEN PLATA (préstamos vigentes)
-- ---------------------------------------------------------------------
SELECT
  s.nombre,
  '$' || printf('%,d', p.monto_prestado)                                    AS prestamo_original,
  '$' || printf('%,d',
    p.monto_prestado - COALESCE((SELECT SUM(capital_pagado)
                                 FROM abonos_prestamos
                                 WHERE prestamo_id = p.id), 0))              AS saldo_pendiente,
  '$' || printf('%,d', COALESCE((SELECT SUM(intereses_pagados)
                                 FROM abonos_prestamos
                                 WHERE prestamo_id = p.id), 0))              AS intereses_pagados,
  p.fecha_desembolso
FROM prestamos p
JOIN socios s ON s.id = p.socio_id
WHERE p.estado = 'activo'
  AND p.monto_prestado > 0
ORDER BY (p.monto_prestado - COALESCE((SELECT SUM(capital_pagado)
                                       FROM abonos_prestamos
                                       WHERE prestamo_id = p.id), 0)) DESC;


-- ---------------------------------------------------------------------
-- 4. MATRIZ DE AHORROS: SOCIOS × MESES
-- ---------------------------------------------------------------------
SELECT
  nombre,
  SUM(CASE WHEN periodo = 'DICIEMBRE'  THEN valor END) AS dic,
  SUM(CASE WHEN periodo = 'ENERO'      THEN valor END) AS ene,
  SUM(CASE WHEN periodo = 'FEBRERO'    THEN valor END) AS feb,
  SUM(CASE WHEN periodo = 'MARZO'      THEN valor END) AS mar,
  SUM(CASE WHEN periodo = 'ABRIL'      THEN valor END) AS abr,
  SUM(CASE WHEN periodo = 'MAYO'       THEN valor END) AS may,
  SUM(CASE WHEN periodo = 'JUNIO'      THEN valor END) AS jun,
  SUM(CASE WHEN periodo = 'JULIO'      THEN valor END) AS jul,
  SUM(CASE WHEN periodo = 'AGOSTO'     THEN valor END) AS ago,
  SUM(valor)                                            AS total_ahorrado
FROM vw_matriz_ahorro
GROUP BY nombre
HAVING total_ahorrado > 0
ORDER BY total_ahorrado DESC;


-- ---------------------------------------------------------------------
-- 5. AHORROS RECAUDADOS MES A MES
-- ---------------------------------------------------------------------
SELECT
  p.orden,
  p.nombre AS periodo,
  '$' || printf('%,d',
    COALESCE(SUM(t.valor), 0)) AS ahorro_mes,
  COUNT(t.id) AS n_socios_aportaron
FROM periodos p
LEFT JOIN transacciones t
  ON t.periodo_id = p.id AND t.concepto = 'AHORRO'
GROUP BY p.id
ORDER BY p.orden;


-- ---------------------------------------------------------------------
-- 6. LIQUIDACIÓN ESTIMADA AL DÍA DE HOY
--    (Cuánto le tocaría a cada socio si cerráramos ya)
-- ---------------------------------------------------------------------
SELECT
  nombre,
  '$' || printf('%,d', ahorro_socio)                       AS ahorro,
  ROUND(proporcion * 100, 2) || '%'                         AS "% del pot",
  '$' || printf('%,d', utilidad_estimada)                   AS ganancia,
  '$' || printf('%,d', neto_a_pagar_estimado)               AS neto_a_pagar
FROM vw_liquidacion_anual
WHERE ahorro_socio > 0
ORDER BY neto_a_pagar_estimado DESC;


-- ---------------------------------------------------------------------
-- 7. MOROSOS: SOCIOS QUE NO HAN APORTADO EN LOS ÚLTIMOS 2 MESES
-- ---------------------------------------------------------------------
SELECT
  s.nombre,
  s.cuota_sostenimiento AS cuota_mensual,
  MAX(t.fecha_pago) AS ultimo_ahorro
FROM socios s
LEFT JOIN transacciones t
  ON t.socio_id = s.id AND t.concepto = 'AHORRO'
WHERE s.tipo = 'persona' AND s.estado = 'activo'
GROUP BY s.id
HAVING ultimo_ahorro IS NULL OR ultimo_ahorro < date('now', '-60 days')
ORDER BY ultimo_ahorro ASC NULLS FIRST;


-- ---------------------------------------------------------------------
-- 8. HISTORIAL COMPLETO DE UN SOCIO (cambia el nombre)
-- ---------------------------------------------------------------------
SELECT
  t.fecha_pago AS fecha,
  t.concepto,
  t.tipo,
  '$' || printf('%,d', t.valor) AS valor,
  p.nombre AS periodo
FROM transacciones t
LEFT JOIN periodos p ON p.id = t.periodo_id
JOIN socios s ON s.id = t.socio_id
WHERE s.nombre LIKE '%Nilson%'   -- <<< CAMBIA AQUÍ
ORDER BY t.fecha_pago;


-- ---------------------------------------------------------------------
-- 9. CONCILIACIÓN BANCARIA: INGRESOS DE NATILLERA VS PERSONAL
-- ---------------------------------------------------------------------
SELECT
  banco,
  detalle_origen,
  COUNT(*) AS n_movs,
  '$' || printf('%,d',
    SUM(CASE WHEN monto > 0 THEN monto ELSE 0 END)) AS ingresos,
  '$' || printf('%,d',
    SUM(CASE WHEN monto < 0 THEN -monto ELSE 0 END)) AS egresos
FROM movimientos_banco
GROUP BY banco, detalle_origen
ORDER BY banco, detalle_origen;


-- ---------------------------------------------------------------------
-- 10. INGRESOS BANCARIOS SIN VÍNCULO A TRANSACCIÓN
--     (Movimientos que deberían estar registrados como aporte pero no lo están)
-- ---------------------------------------------------------------------
SELECT
  mb.banco,
  mb.fecha,
  mb.descripcion,
  s.nombre AS socio,
  '$' || printf('%,d', mb.monto) AS monto
FROM movimientos_banco mb
LEFT JOIN socios s ON s.id = mb.socio_id
WHERE mb.monto > 0
  AND mb.detalle_origen = 'NATILLERA'
  AND mb.transaccion_id IS NULL
ORDER BY mb.fecha
LIMIT 30;


-- ---------------------------------------------------------------------
-- 11. MULTAS PENDIENTES POR SOCIO
-- ---------------------------------------------------------------------
SELECT
  s.nombre,
  COUNT(m.id) AS n_multas,
  '$' || printf('%,d', SUM(m.valor)) AS total_multas,
  GROUP_CONCAT(DISTINCT m.tipo) AS tipos
FROM multas m
JOIN socios s ON s.id = m.socio_id
WHERE m.estado = 'pendiente'
GROUP BY s.id
ORDER BY SUM(m.valor) DESC;


-- ---------------------------------------------------------------------
-- 12. RIFA CHANCE ACUMULADO POR SOCIO
-- ---------------------------------------------------------------------
SELECT
  s.nombre,
  COUNT(t.id) AS n_boletas,
  '$' || printf('%,d', SUM(t.valor)) AS total_rifa
FROM transacciones t
JOIN socios s ON s.id = t.socio_id
WHERE t.concepto = 'RIFA_CHANCE' AND s.tipo = 'persona'
GROUP BY s.id
ORDER BY SUM(t.valor) DESC
LIMIT 20;


-- ---------------------------------------------------------------------
-- 13. DÍA DE PAGO MÁS COMÚN (¿cuándo cae la platica?)
-- ---------------------------------------------------------------------
SELECT
  CASE strftime('%w', fecha_pago)
    WHEN '0' THEN 'Domingo'
    WHEN '1' THEN 'Lunes'
    WHEN '2' THEN 'Martes'
    WHEN '3' THEN 'Miércoles'
    WHEN '4' THEN 'Jueves'
    WHEN '5' THEN 'Viernes'
    WHEN '6' THEN 'Sábado'
  END AS dia_semana,
  COUNT(*) AS n_pagos,
  '$' || printf('%,d', SUM(valor)) AS total
FROM transacciones
WHERE concepto = 'AHORRO' AND fecha_pago IS NOT NULL
GROUP BY strftime('%w', fecha_pago)
ORDER BY n_pagos DESC;


-- ---------------------------------------------------------------------
-- 14. SOCIOS QUE HAN APORTADO EN TODOS LOS MESES CERRADOS
-- ---------------------------------------------------------------------
WITH meses_cerrados AS (
  SELECT DISTINCT periodo_id FROM transacciones WHERE concepto = 'AHORRO'
),
socios_ahorro AS (
  SELECT socio_id, COUNT(DISTINCT periodo_id) AS meses_pagados
  FROM transacciones
  WHERE concepto = 'AHORRO'
  GROUP BY socio_id
)
SELECT
  s.nombre,
  sa.meses_pagados,
  (SELECT COUNT(*) FROM meses_cerrados) AS meses_totales
FROM socios_ahorro sa
JOIN socios s ON s.id = sa.socio_id
WHERE sa.meses_pagados = (SELECT COUNT(*) FROM meses_cerrados)
ORDER BY s.nombre;


-- ---------------------------------------------------------------------
-- 15. AUDITORÍA: ÚLTIMOS 20 MOVIMIENTOS REGISTRADOS
-- ---------------------------------------------------------------------
SELECT
  m.id,
  s.nombre AS socio,
  m.tipo,
  m.concepto,
  '$' || printf('%,d', m.valor) AS valor,
  m.fecha
FROM movimientos m
JOIN socios s ON s.id = m.socio_id
ORDER BY m.id DESC
LIMIT 20;
