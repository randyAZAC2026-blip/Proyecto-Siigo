-- ============================================================
-- Préstamos a referidos (2026-10-31)
--
-- Un socio (p. ej. Lina) recomienda a una persona externa para que la
-- natillera le preste. Reglas acordadas con tesorería:
--   · Si el referido no paga, responde el socio que lo recomendó: el saldo
--     pendiente de sus referidos se le descuenta en la liquidación.
--   · Tasa fija: socios 5% mensual, referidos 10% mensual (configurable).
--   · El socio que recomienda no recibe comisión.
--
-- 1. socios.tipo admite 'referido' + socios.referido_por (quién lo
--    recomendó). Los referidos NO son socios: las vistas que filtran
--    tipo = 'persona' (ahorros, liquidación, panel) no los cuentan.
-- 2. prestamos.responsable_socio_id.
-- 3. configuracion_natillera: tasas de préstamo de socios y referidos.
-- 4. Trigger: todo préstamo nuevo toma la tasa según el tipo de deudor y,
--    si es referido, el responsable.
-- 5. natillera_crear_prestamo(): préstamo entregado sin movimiento del
--    banco (efectivo), con intereses descontados opcionales.
-- 6. vw_prestamos_referidos y deducción en vw_liquidacion_anual /
--    vw_saldo_por_socio del socio responsable.
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Referidos en socios
-- ------------------------------------------------------------
ALTER TABLE public.socios ADD COLUMN IF NOT EXISTS referido_por bigint REFERENCES public.socios(id);
ALTER TABLE public.socios DROP CONSTRAINT IF EXISTS socios_tipo_check;
ALTER TABLE public.socios ADD CONSTRAINT socios_tipo_check
  CHECK (tipo IN ('persona', 'cuenta_admin', 'referido'));
ALTER TABLE public.socios DROP CONSTRAINT IF EXISTS socios_referido_check;
ALTER TABLE public.socios ADD CONSTRAINT socios_referido_check
  CHECK ((tipo = 'referido') = (referido_por IS NOT NULL));
COMMENT ON COLUMN public.socios.referido_por IS
  'Solo para tipo = referido: socio que lo recomendó y que responde por sus préstamos.';

-- ------------------------------------------------------------
-- 2 · Responsable del préstamo
-- ------------------------------------------------------------
ALTER TABLE public.prestamos ADD COLUMN IF NOT EXISTS responsable_socio_id bigint REFERENCES public.socios(id);
CREATE INDEX IF NOT EXISTS idx_prestamos_responsable ON public.prestamos(responsable_socio_id);
COMMENT ON COLUMN public.prestamos.responsable_socio_id IS
  'Socio que responde si el deudor (un referido) no paga. NULL en préstamos a socios.';

-- ------------------------------------------------------------
-- 3 · Configuración (tasas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracion_natillera (
  clave          text PRIMARY KEY,
  valor          numeric NOT NULL CHECK (valor >= 0),
  descripcion    text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.configuracion_natillera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS configuracion_select ON public.configuracion_natillera;
DROP POLICY IF EXISTS configuracion_write  ON public.configuracion_natillera;
CREATE POLICY configuracion_select ON public.configuracion_natillera FOR SELECT TO authenticated
  USING (public.natillera_es_usuario());
CREATE POLICY configuracion_write ON public.configuracion_natillera FOR ALL TO authenticated
  USING (public.natillera_puede_escribir()) WITH CHECK (public.natillera_puede_escribir());
REVOKE ALL ON public.configuracion_natillera FROM anon;

INSERT INTO public.configuracion_natillera (clave, valor, descripcion) VALUES
  ('tasa_prestamo_socios',    0.05, 'Interés mensual de los préstamos a socios'),
  ('tasa_prestamo_referidos', 0.10, 'Interés mensual de los préstamos a referidos')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE public.prestamos ALTER COLUMN tasa_interes SET DEFAULT 0.05;

-- ------------------------------------------------------------
-- 4 · Tasa y responsable automáticos en cada préstamo nuevo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.natillera_prestamo_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_tipo text; v_ref bigint; v_tasa numeric;
BEGIN
  SELECT tipo, referido_por INTO v_tipo, v_ref FROM public.socios WHERE id = NEW.socio_id;
  IF v_tipo = 'referido' THEN
    NEW.responsable_socio_id := COALESCE(NEW.responsable_socio_id, v_ref);
    SELECT valor INTO v_tasa FROM public.configuracion_natillera WHERE clave = 'tasa_prestamo_referidos';
  ELSE
    SELECT valor INTO v_tasa FROM public.configuracion_natillera WHERE clave = 'tasa_prestamo_socios';
  END IF;
  IF v_tasa IS NULL THEN
    RAISE EXCEPTION 'Falta configurar la tasa de préstamos para %', CASE WHEN v_tipo = 'referido' THEN 'referidos' ELSE 'socios' END;
  END IF;
  NEW.tasa_interes := v_tasa;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prestamos_defaults ON public.prestamos;
CREATE TRIGGER prestamos_defaults BEFORE INSERT ON public.prestamos
  FOR EACH ROW EXECUTE FUNCTION public.natillera_prestamo_defaults();

-- ------------------------------------------------------------
-- 5 · Préstamo entregado sin movimiento del banco (efectivo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.natillera_crear_prestamo(
  p_socio_id bigint,
  p_monto bigint,
  p_fecha date,
  p_intereses_descontados bigint DEFAULT 0,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_base bigint; v_tx bigint; v_prest bigint; v_tx_int bigint;
BEGIN
  IF NOT public.natillera_puede_escribir() THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del préstamo debe ser mayor a cero'; END IF;
  IF COALESCE(p_intereses_descontados, 0) < 0 OR COALESCE(p_intereses_descontados, 0) >= p_monto THEN
    RAISE EXCEPTION 'Los intereses descontados deben estar entre 0 y el monto del préstamo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.socios WHERE id = p_socio_id AND estado = 'activo' AND tipo IN ('persona', 'referido')) THEN
    RAISE EXCEPTION 'El deudor no existe o no está activo';
  END IF;

  v_base := -(floor(extract(epoch FROM clock_timestamp()) * 1000000))::bigint;
  INSERT INTO public.transacciones (socio_id, concepto, tipo, valor, fecha_pago, notas, fila_origen)
  VALUES (p_socio_id, 'PRESTAMO', 'egreso', p_monto, p_fecha, NULLIF(btrim(p_notas), ''), v_base - 1)
  RETURNING id INTO v_tx;
  INSERT INTO public.prestamos (socio_id, transaccion_id, monto_prestado, saldo_pendiente, fecha_desembolso, estado)
  VALUES (p_socio_id, v_tx, p_monto, p_monto, p_fecha, 'activo')
  RETURNING id INTO v_prest;

  IF COALESCE(p_intereses_descontados, 0) > 0 THEN
    INSERT INTO public.transacciones (socio_id, concepto, tipo, valor, fecha_pago, notas, fila_origen)
    VALUES (p_socio_id, 'INTERESES_PRESTAMO', 'ingreso', p_intereses_descontados, p_fecha,
            'Intereses descontados al entregar el préstamo', v_base - 2)
    RETURNING id INTO v_tx_int;
    INSERT INTO public.abonos_prestamos (prestamo_id, transaccion_id, socio_id, monto_abono, intereses_pagados, capital_pagado, fecha_abono)
    VALUES (v_prest, v_tx_int, p_socio_id, p_intereses_descontados, p_intereses_descontados, 0, p_fecha);
  END IF;

  RETURN jsonb_build_object('ok', true, 'prestamo_id', v_prest, 'entregado', p_monto - COALESCE(p_intereses_descontados, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.natillera_crear_prestamo(bigint, bigint, date, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.natillera_crear_prestamo(bigint, bigint, date, bigint, text) TO authenticated;

-- ------------------------------------------------------------
-- 6 · Vistas
-- ------------------------------------------------------------
-- Cada préstamo a referido, con su responsable y saldo.
CREATE OR REPLACE VIEW public.vw_prestamos_referidos WITH (security_invoker = true) AS
SELECT p.id AS prestamo_id,
       r.id AS referido_id, r.nombre AS referido, r.identificacion, r.telefono,
       COALESCE(p.responsable_socio_id, r.referido_por) AS responsable_id,
       s.nombre AS responsable,
       p.monto_prestado, p.tasa_interes, p.fecha_desembolso, p.estado,
       (p.monto_prestado - COALESCE(a.capital, 0))::bigint AS saldo,
       COALESCE(a.intereses, 0)::bigint AS intereses_pagados
  FROM public.prestamos p
  JOIN public.socios r ON r.id = p.socio_id AND r.tipo = 'referido'
  LEFT JOIN public.socios s ON s.id = COALESCE(p.responsable_socio_id, r.referido_por)
  LEFT JOIN (SELECT prestamo_id, sum(capital_pagado) AS capital, sum(intereses_pagados) AS intereses
               FROM public.abonos_prestamos GROUP BY prestamo_id) a ON a.prestamo_id = p.id;
REVOKE ALL ON public.vw_prestamos_referidos FROM anon;
GRANT SELECT ON public.vw_prestamos_referidos TO authenticated;

-- Liquidación: al responsable se le descuenta el saldo de sus referidos.
-- deducc_prestamo = propio + referidos; deducc_prestamo_referidos = la parte de referidos.
CREATE OR REPLACE VIEW public.vw_liquidacion_anual WITH (security_invoker = true) AS
WITH saldos AS (
  SELECT p.socio_id, p.responsable_socio_id,
         (p.monto_prestado::numeric - COALESCE((SELECT sum(a.capital_pagado) FROM public.abonos_prestamos a
                                                 WHERE a.prestamo_id = p.id), 0)) AS saldo
    FROM public.prestamos p
   WHERE p.estado = 'activo'
), base AS (
  SELECT s.id, s.nombre, s.cuota_sostenimiento,
    COALESCE(sum(CASE WHEN t.concepto = 'AHORRO' THEN t.valor END), 0::numeric) AS ahorro,
    COALESCE(sum(CASE WHEN t.concepto = 'ACTIVIDADES' THEN t.valor END), 0::numeric) AS actividades,
    COALESCE(sum(CASE WHEN t.concepto = 'RIFA_CHANCE' THEN t.valor END), 0::numeric) AS rifa_chance,
    COALESCE(sum(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0::numeric) AS intereses_pagados,
    COALESCE(sum(CASE WHEN t.concepto IN ('AHORRO', 'ACTIVIDADES', 'RIFA_CHANCE', 'INTERESES_PRESTAMO') THEN t.valor END), 0::numeric) AS total_aportes,
    COALESCE((SELECT sum(x.saldo) FROM saldos x WHERE x.socio_id = s.id), 0::numeric) AS prestamo_propio,
    COALESCE((SELECT sum(x.saldo) FROM saldos x WHERE x.responsable_socio_id = s.id AND x.socio_id <> s.id), 0::numeric) AS prestamo_referidos,
    COALESCE((SELECT sum(m.valor) FROM public.multas m WHERE m.socio_id = s.id AND m.estado = 'pendiente'), 0::numeric) AS deducc_multas
  FROM public.socios s
  LEFT JOIN public.transacciones t ON t.socio_id = s.id
  WHERE s.tipo = 'persona'
  GROUP BY s.id
)
SELECT id, nombre, cuota_sostenimiento, ahorro, actividades, rifa_chance, intereses_pagados, total_aportes,
       prestamo_propio + prestamo_referidos AS deducc_prestamo,
       deducc_multas,
       0 AS deducc_mora_intereses,
       0 AS deducc_mora_ahorro,
       total_aportes - (prestamo_propio + prestamo_referidos) - deducc_multas AS neto_a_recibir,
       prestamo_referidos AS deducc_prestamo_referidos
  FROM base;

-- Saldo por socio: se agrega lo que debe por sus referidos (al final).
CREATE OR REPLACE VIEW public.vw_saldo_por_socio WITH (security_invoker = true) AS
SELECT s.id, s.nombre, s.tipo, s.estado, s.cuota_sostenimiento,
  COALESCE(sum(CASE WHEN t.concepto = 'AHORRO' THEN t.valor END), 0::numeric) AS ahorro,
  COALESCE(sum(CASE WHEN t.concepto = 'ACTIVIDADES' THEN t.valor END), 0::numeric) AS actividades,
  COALESCE(sum(CASE WHEN t.concepto = 'RIFA_CHANCE' THEN t.valor END), 0::numeric) AS rifa_chance,
  COALESCE(sum(CASE WHEN t.concepto = 'INTERESES_PRESTAMO' THEN t.valor END), 0::numeric) AS intereses_pagados,
  COALESCE(sum(CASE WHEN t.concepto = 'ABONO_PRESTAMO' THEN t.valor END), 0::numeric) AS abonado_a_prestamos,
  COALESCE(sum(CASE WHEN t.concepto = 'PRESTAMO' THEN t.valor END), 0::numeric) AS prestamos_recibidos,
  COALESCE(sum(CASE WHEN t.concepto = 'MULTA' THEN t.valor END), 0::numeric) AS multas_pagadas,
  COALESCE(sum(CASE WHEN t.tipo = 'ingreso' THEN t.valor END), 0::numeric) AS total_aportado,
  COALESCE((SELECT sum(p.monto_prestado::numeric - (SELECT COALESCE(sum(a.capital_pagado), 0::numeric)
                                                      FROM public.abonos_prestamos a WHERE a.prestamo_id = p.id))
              FROM public.prestamos p WHERE p.socio_id = s.id AND p.estado = 'activo'), 0::numeric) AS saldo_prestamos,
  COALESCE((SELECT sum(p.monto_prestado::numeric - (SELECT COALESCE(sum(a.capital_pagado), 0::numeric)
                                                      FROM public.abonos_prestamos a WHERE a.prestamo_id = p.id))
              FROM public.prestamos p
             WHERE p.responsable_socio_id = s.id AND p.socio_id <> s.id AND p.estado = 'activo'), 0::numeric) AS saldo_referidos
FROM public.socios s
LEFT JOIN public.transacciones t ON t.socio_id = s.id
GROUP BY s.id;

NOTIFY pgrst, 'reload schema';
