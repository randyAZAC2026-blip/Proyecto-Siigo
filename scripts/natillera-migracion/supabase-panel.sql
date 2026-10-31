-- ============================================================
-- Vistas del Panel financiero (2026-10-31)
--
-- La API de Supabase devuelve como máximo 1000 filas por consulta y ya
-- hay más de 1000 transacciones y movimientos de banco: sumar en el
-- navegador daba totales cortos. Estas vistas suman en la base y
-- devuelven pocas filas.
--
-- Solo lectura, security_invoker (respetan el RLS de quien consulta),
-- anon sin acceso. Idempotente.
-- ============================================================

-- Totales generales: una sola fila.
CREATE OR REPLACE VIEW public.vw_panel_financiero WITH (security_invoker = true) AS
WITH t AS (
  SELECT
    COALESCE(sum(valor) FILTER (WHERE concepto = 'AHORRO'), 0)::bigint             AS ahorro,
    COALESCE(sum(valor) FILTER (WHERE concepto = 'ACTIVIDADES'), 0)::bigint        AS actividades,
    COALESCE(sum(valor) FILTER (WHERE concepto = 'RIFA_CHANCE'), 0)::bigint        AS rifa,
    COALESCE(sum(valor) FILTER (WHERE concepto = 'INTERESES_PRESTAMO'), 0)::bigint AS intereses,
    COALESCE(sum(valor) FILTER (WHERE concepto = 'MULTA'), 0)::bigint              AS multas,
    COALESCE(sum(valor) FILTER (WHERE concepto = 'PRESTAMO'), 0)::bigint           AS prestamos_desembolsados,
    COALESCE(sum(valor) FILTER (WHERE concepto = 'ABONO_PRESTAMO'), 0)::bigint     AS abonos_prestamos,
    COALESCE(sum(valor) FILTER (WHERE tipo = 'ingreso'), 0)::bigint                AS ingresos,
    COALESCE(sum(valor) FILTER (WHERE tipo = 'egreso'), 0)::bigint                 AS egresos,
    count(*)::int                                                                   AS n_transacciones,
    max(fecha_pago)                                                                 AS ultimo_pago
  FROM public.transacciones
), s AS (
  SELECT count(*) FILTER (WHERE tipo = 'persona' AND estado = 'activo')::int AS socios_activos,
         count(*) FILTER (WHERE tipo = 'cuenta_admin')::int                  AS cuentas_admin
    FROM public.socios
), b AS (
  -- Último saldo que trae el extracto de Bancolombia.
  SELECT saldo_cuenta AS saldo_banco, fecha AS fecha_saldo_banco
    FROM public.movimientos_banco
   WHERE banco = 'Bancolombia' AND saldo_cuenta IS NOT NULL AND fecha IS NOT NULL
   ORDER BY fecha DESC, id DESC
   LIMIT 1
)
SELECT
  s.socios_activos, s.cuentas_admin,
  t.ahorro, t.actividades, t.rifa, t.intereses, t.multas,
  t.prestamos_desembolsados, t.abonos_prestamos, t.ingresos, t.egresos,
  t.n_transacciones, t.ultimo_pago,
  (t.prestamos_desembolsados - t.abonos_prestamos)::bigint AS cartera,
  (t.ingresos - t.egresos)::bigint                         AS caja_libros,
  (t.intereses + t.multas + t.rifa)::bigint                AS rendimientos,
  b.saldo_banco, b.fecha_saldo_banco
FROM t CROSS JOIN s LEFT JOIN b ON true;

-- Ahorro recaudado por periodo del ciclo.
CREATE OR REPLACE VIEW public.vw_panel_ahorro_periodo WITH (security_invoker = true) AS
SELECT p.id, p.nombre, p.orden, p.fecha_corte_ahorro,
       COALESCE(sum(t.valor), 0)::bigint   AS ahorro,
       count(DISTINCT t.socio_id)::int     AS socios_pagaron
  FROM public.periodos p
  LEFT JOIN public.transacciones t ON t.periodo_id = p.id AND t.concepto = 'AHORRO'
 GROUP BY p.id, p.nombre, p.orden, p.fecha_corte_ahorro;

-- Conciliación por banco, tipo y estado.
CREATE OR REPLACE VIEW public.vw_panel_conciliacion WITH (security_invoker = true) AS
SELECT banco,
       CASE WHEN monto > 0 THEN 'ingreso' ELSE 'egreso' END AS tipo,
       estado,
       count(*)::int                 AS n,
       sum(abs(monto))::bigint       AS monto,
       sum(valor_pendiente)::bigint  AS pendiente
  FROM public.vw_extracto_estado
 GROUP BY 1, 2, 3;

-- Totales por banco para la página Banco (antes se sumaban 1000+ filas en el navegador).
CREATE OR REPLACE VIEW public.vw_banco_resumen WITH (security_invoker = true) AS
SELECT banco,
       count(*)::int                                                              AS n_movs,
       COALESCE(sum(monto) FILTER (WHERE monto >= 0), 0)::bigint                  AS ingresos,
       COALESCE(-sum(monto) FILTER (WHERE monto < 0), 0)::bigint                  AS egresos,
       COALESCE(sum(monto) FILTER (WHERE monto >= 0 AND detalle_origen = 'NATILLERA'), 0)::bigint AS ingresos_natillera
  FROM public.movimientos_banco
 GROUP BY banco;

REVOKE ALL ON public.vw_panel_financiero, public.vw_panel_ahorro_periodo,
              public.vw_panel_conciliacion, public.vw_banco_resumen FROM anon;
GRANT SELECT ON public.vw_panel_financiero, public.vw_panel_ahorro_periodo,
                public.vw_panel_conciliacion, public.vw_banco_resumen TO authenticated;

NOTIFY pgrst, 'reload schema';
