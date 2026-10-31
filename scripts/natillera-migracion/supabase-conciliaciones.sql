-- ============================================================
-- Fase 1 de la conciliación bancaria (2026-10-31)
--
-- Antes, un movimiento del banco se unía a sus pagos de 3 formas
-- distintas (movimientos_banco.transaccion_id, movimientos.metadata
-- ->extracto_id y movimientos_banco.distribucion_socios) y cada pantalla
-- leía una diferente. Además importar no detectaba duplicados y
-- desglosar hacía varios inserts sueltos desde el navegador.
--
-- Ahora:
--   1. conciliaciones(extracto_id, transaccion_id, valor): la ÚNICA unión.
--   2. vw_extracto_estado: estado de cada movimiento
--      (pendiente / parcial / conciliado / excedido / personal).
--   3. natillera_importar_extracto(): importa en bloque y omite duplicados.
--   4. natillera_conciliar_extracto(): crea/vincula pagos y los une al
--      movimiento en una sola transacción (todo o nada).
--   5. natillera_desconciliar_extracto(): quita uniones.
--
-- Permisos: solo natillera_puede_escribir() (admin / tesorero). anon nada.
-- Las columnas viejas (transaccion_id, distribucion_socios) se conservan
-- pero quedan obsoletas: no se borran datos.
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Tabla
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conciliaciones (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  extracto_id    bigint NOT NULL REFERENCES public.movimientos_banco(id) ON DELETE CASCADE,
  transaccion_id bigint NOT NULL REFERENCES public.transacciones(id)     ON DELETE CASCADE,
  valor          bigint NOT NULL CHECK (valor > 0),
  origen         text   NOT NULL DEFAULT 'app' CHECK (origen IN ('app', 'migracion')),
  creado_por     uuid   DEFAULT auth.uid(),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (extracto_id, transaccion_id)
);
CREATE INDEX IF NOT EXISTS idx_conciliaciones_tx ON public.conciliaciones(transaccion_id);

COMMENT ON TABLE public.conciliaciones IS
  'Única unión entre movimientos del banco y transacciones. Un movimiento puede cubrir varias transacciones (desglose) y una transacción puede repartirse en varios movimientos; valor = parte de la transacción cubierta por ese movimiento.';

ALTER TABLE public.conciliaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conciliaciones_select_natillera ON public.conciliaciones;
DROP POLICY IF EXISTS conciliaciones_insert_natillera ON public.conciliaciones;
DROP POLICY IF EXISTS conciliaciones_update_natillera ON public.conciliaciones;
DROP POLICY IF EXISTS conciliaciones_delete_natillera ON public.conciliaciones;
CREATE POLICY conciliaciones_select_natillera ON public.conciliaciones FOR SELECT TO authenticated USING (public.natillera_puede_escribir());
CREATE POLICY conciliaciones_insert_natillera ON public.conciliaciones FOR INSERT TO authenticated WITH CHECK (public.natillera_puede_escribir());
CREATE POLICY conciliaciones_update_natillera ON public.conciliaciones FOR UPDATE TO authenticated USING (public.natillera_puede_escribir()) WITH CHECK (public.natillera_puede_escribir());
CREATE POLICY conciliaciones_delete_natillera ON public.conciliaciones FOR DELETE TO authenticated USING (public.natillera_puede_escribir());
REVOKE ALL ON public.conciliaciones FROM anon;

-- ------------------------------------------------------------
-- 2 · Pasar las uniones que ya existían (sin perder ninguna)
--     a) movimientos_banco.transaccion_id
--     b) movimientos.metadata->extracto_id (desgloses de la app anterior)
--     c) movimientos_banco.distribucion_socios (hoy vacío, por si acaso)
-- ------------------------------------------------------------
INSERT INTO public.conciliaciones (extracto_id, transaccion_id, valor, origen)
SELECT p.extracto_id, p.transaccion_id, t.valor, 'migracion'
FROM (
  SELECT b.id AS extracto_id, b.transaccion_id
    FROM public.movimientos_banco b
   WHERE b.transaccion_id IS NOT NULL
  UNION
  SELECT (m.metadata->>'extracto_id')::bigint, m.transaccion_id
    FROM public.movimientos m
   WHERE m.metadata ? 'extracto_id'
     AND m.transaccion_id IS NOT NULL
     AND m.concepto NOT IN ('CORRECCION_SOCIO', 'DISTRIBUCION_SOCIOS')
  UNION
  SELECT b.id, (e->>'transaccion_id')::bigint
    FROM public.movimientos_banco b,
         jsonb_array_elements(CASE WHEN jsonb_typeof(b.distribucion_socios) = 'array'
                                   THEN b.distribucion_socios ELSE '[]'::jsonb END) e
   WHERE e ? 'transaccion_id'
) p
JOIN public.movimientos_banco b ON b.id = p.extracto_id
JOIN public.transacciones    t ON t.id = p.transaccion_id
WHERE t.valor > 0
ON CONFLICT (extracto_id, transaccion_id) DO NOTHING;

COMMENT ON COLUMN public.movimientos_banco.transaccion_id IS
  'OBSOLETA desde 2026-10-31: usar la tabla conciliaciones. Se conserva solo como histórico.';
COMMENT ON COLUMN public.movimientos_banco.distribucion_socios IS
  'OBSOLETA desde 2026-10-31: usar la tabla conciliaciones.';

-- ------------------------------------------------------------
-- 3 · Estado de cada movimiento
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_extracto_estado;
CREATE VIEW public.vw_extracto_estado WITH (security_invoker = true) AS
SELECT
  b.id, b.banco, b.fecha, b.descripcion, b.monto, b.saldo_cuenta,
  b.detalle_origen, b.dependencia, b.socio_id, s.nombre AS socio_nombre,
  COALESCE(c.valor_conciliado, 0)                  AS valor_conciliado,
  abs(b.monto) - COALESCE(c.valor_conciliado, 0)   AS valor_pendiente,
  COALESCE(c.n_transacciones, 0)                   AS n_transacciones,
  COALESCE(c.transaccion_ids, '{}'::bigint[])      AS transaccion_ids,
  CASE
    WHEN COALESCE(c.valor_conciliado, 0) = 0 AND b.detalle_origen = 'PERSONAL' THEN 'personal'
    WHEN COALESCE(c.valor_conciliado, 0) = 0           THEN 'pendiente'
    WHEN c.valor_conciliado <  abs(b.monto)            THEN 'parcial'
    WHEN c.valor_conciliado =  abs(b.monto)            THEN 'conciliado'
    ELSE 'excedido'
  END AS estado
FROM public.movimientos_banco b
LEFT JOIN public.socios s ON s.id = b.socio_id
LEFT JOIN (
  SELECT extracto_id,
         sum(valor)::bigint AS valor_conciliado,
         count(*)::int      AS n_transacciones,
         array_agg(transaccion_id ORDER BY transaccion_id) AS transaccion_ids
    FROM public.conciliaciones
   GROUP BY extracto_id
) c ON c.extracto_id = b.id;

REVOKE ALL ON public.vw_extracto_estado FROM anon;
GRANT SELECT ON public.vw_extracto_estado TO authenticated;

-- La vista de resumen por banco usa la misma definición de "conciliado".
CREATE OR REPLACE VIEW public.vw_conciliacion_bancaria WITH (security_invoker = true) AS
SELECT
  banco,
  count(*) AS n_movs,
  COALESCE(sum(CASE WHEN monto > 0 THEN monto ELSE 0 END), 0)::numeric  AS ingresos_totales,
  COALESCE(sum(CASE WHEN monto < 0 THEN -monto ELSE 0 END), 0)::numeric AS egresos_totales,
  COALESCE(sum(CASE WHEN monto > 0 AND detalle_origen IS DISTINCT FROM 'PERSONAL' THEN monto ELSE 0 END), 0)::numeric AS ingresos_natillera,
  COALESCE(sum(sign(monto) * valor_conciliado), 0)::numeric AS monto_conciliado
FROM public.vw_extracto_estado
GROUP BY banco;
REVOKE ALL ON public.vw_conciliacion_bancaria FROM anon;

-- ------------------------------------------------------------
-- 4 · Importar extracto en bloque, sin duplicados
--     p_filas: [{fecha, descripcion, monto, saldo_cuenta, detalle_origen, dependencia}]
--     Si alguna fila es inválida no se inserta nada y se devuelven los errores.
--     Duplicado = ya existe en la BD con el mismo banco, fecha, monto,
--     saldo y descripción. Sin saldo se cuentan repeticiones (2 filas
--     iguales en el archivo y 1 en la BD → se inserta 1).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.natillera_importar_extracto(p_banco text, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total   int;
  v_ins     int;
  v_errores jsonb;
  v_base    bigint;
BEGIN
  IF NOT public.natillera_puede_escribir() THEN
    RAISE EXCEPTION 'Sin permiso para importar extractos' USING ERRCODE = '42501';
  END IF;
  IF p_banco IS DISTINCT FROM 'Bancolombia' THEN
    RAISE EXCEPTION 'Banco no soportado: % (solo Bancolombia)', p_banco;
  END IF;
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Las filas deben venir en un arreglo';
  END IF;
  v_total := jsonb_array_length(p_filas);
  IF v_total = 0 THEN
    RETURN jsonb_build_object('insertados', 0, 'duplicados', 0, 'errores', '[]'::jsonb);
  END IF;
  IF v_total > 5000 THEN
    RAISE EXCEPTION 'Máximo 5000 filas por importación (llegaron %)', v_total;
  END IF;

  -- Dos importaciones al mismo tiempo no deben duplicar.
  PERFORM pg_advisory_xact_lock(hashtext('natillera_importar_extracto:' || p_banco));

  -- Validación: si una fila falla, no se importa nada.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('fila', fila, 'motivo', motivo) ORDER BY fila), '[]'::jsonb)
    INTO v_errores
    FROM (
      SELECT ord::int AS fila,
             CASE
               WHEN NULLIF(btrim(f->>'fecha'), '') IS NULL
                 OR NOT pg_input_is_valid(btrim(f->>'fecha'), 'date')       THEN 'Fecha inválida'
               WHEN NULLIF(btrim(f->>'monto'), '') IS NULL
                 OR NOT pg_input_is_valid(btrim(f->>'monto'), 'bigint')     THEN 'Monto inválido (debe ser un entero)'
               WHEN (btrim(f->>'monto'))::bigint = 0                        THEN 'Monto en cero'
               WHEN NULLIF(btrim(f->>'saldo_cuenta'), '') IS NOT NULL
                AND NOT pg_input_is_valid(btrim(f->>'saldo_cuenta'), 'bigint') THEN 'Saldo inválido'
             END AS motivo
        FROM jsonb_array_elements(p_filas) WITH ORDINALITY AS e(f, ord)
    ) x
   WHERE motivo IS NOT NULL;

  IF jsonb_array_length(v_errores) > 0 THEN
    RETURN jsonb_build_object('insertados', 0, 'duplicados', 0, 'errores', v_errores);
  END IF;

  v_base := -(floor(extract(epoch FROM clock_timestamp()) * 1000000))::bigint;

  WITH n AS (
    SELECT ord::int                                         AS fila,
           (btrim(f->>'fecha'))::date                        AS fecha,
           NULLIF(btrim(f->>'descripcion'), '')              AS descripcion,
           (btrim(f->>'monto'))::bigint                      AS monto,
           (NULLIF(btrim(f->>'saldo_cuenta'), ''))::bigint   AS saldo,
           NULLIF(btrim(f->>'detalle_origen'), '')           AS detalle,
           CASE WHEN lower(COALESCE(btrim(f->>'dependencia'), '')) IN ('', 'null')
                THEN NULL ELSE btrim(f->>'dependencia') END  AS dependencia
      FROM jsonb_array_elements(p_filas) WITH ORDINALITY AS e(f, ord)
  ), k AS (
    SELECT n.*,
           row_number() OVER (PARTITION BY fecha, monto, saldo, descripcion ORDER BY fila) AS rn,
           (SELECT count(*)
              FROM public.movimientos_banco b
             WHERE b.banco = p_banco
               AND b.fecha = n.fecha
               AND b.monto = n.monto
               AND b.saldo_cuenta IS NOT DISTINCT FROM n.saldo
               AND NULLIF(btrim(b.descripcion), '') IS NOT DISTINCT FROM n.descripcion) AS en_bd
      FROM n
  )
  INSERT INTO public.movimientos_banco (banco, fecha, descripcion, monto, saldo_cuenta, detalle_origen, dependencia, fila_origen)
  SELECT p_banco, fecha, descripcion, monto, saldo, detalle, dependencia, v_base - fila
    FROM k
   WHERE (saldo IS NOT NULL AND rn = 1 AND en_bd = 0)   -- con saldo: una sola vez
      OR (saldo IS NULL     AND rn > en_bd);            -- sin saldo: solo las que faltan
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  RETURN jsonb_build_object('insertados', v_ins, 'duplicados', v_total - v_ins, 'errores', '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- 5 · Conciliar un movimiento (todo o nada)
--     p_lineas: [
--       {"socio_id":1,"concepto":"AHORRO","valor":50000,"periodo_id":3,"fecha_pago":"2026-10-01","notas":"..."}  → crea la transacción
--       {"transaccion_id":123,"valor":50000}                                                                   → vincula una existente
--     ]
--     No permite conciliar más que el valor del movimiento ni más que el
--     valor de una transacción existente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.natillera_conciliar_extracto(p_extracto_id bigint, p_lineas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_b         public.movimientos_banco%ROWTYPE;
  v_l         jsonb;
  v_i         int := 0;
  v_tipo      text;
  v_valor     bigint;
  v_ya        bigint;
  v_suma      bigint := 0;
  v_usado     bigint;
  v_t         record;
  v_tx_id     bigint;
  v_socio     bigint;
  v_concepto  text;
  v_base      bigint;
  v_creadas   jsonb := '[]'::jsonb;
  v_vinc      int := 0;
  v_socios    bigint[];
  v_estado    text;
BEGIN
  IF NOT public.natillera_puede_escribir() THEN
    RAISE EXCEPTION 'Sin permiso para conciliar' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Debe haber al menos una línea';
  END IF;

  SELECT * INTO v_b FROM public.movimientos_banco WHERE id = p_extracto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento bancario % no encontrado', p_extracto_id;
  END IF;
  IF v_b.monto = 0 THEN
    RAISE EXCEPTION 'El movimiento tiene monto cero';
  END IF;
  v_tipo := CASE WHEN v_b.monto > 0 THEN 'ingreso' ELSE 'egreso' END;

  SELECT COALESCE(sum(valor), 0) INTO v_ya FROM public.conciliaciones WHERE extracto_id = p_extracto_id;
  v_base := -(floor(extract(epoch FROM clock_timestamp()) * 1000000))::bigint;

  FOR v_l IN SELECT e FROM jsonb_array_elements(p_lineas) e LOOP
    v_i := v_i + 1;
    IF NOT pg_input_is_valid(COALESCE(v_l->>'valor', ''), 'bigint') OR (v_l->>'valor')::bigint <= 0 THEN
      RAISE EXCEPTION 'Línea %: el valor debe ser un entero mayor a cero', v_i;
    END IF;
    v_valor := (v_l->>'valor')::bigint;

    IF v_l ? 'transaccion_id' THEN
      -- Vincular una transacción que ya existe
      SELECT id, tipo, valor INTO v_t
        FROM public.transacciones
       WHERE id = (v_l->>'transaccion_id')::bigint
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Línea %: la transacción % no existe', v_i, v_l->>'transaccion_id';
      END IF;
      IF v_t.tipo <> v_tipo THEN
        RAISE EXCEPTION 'Línea %: la transacción es un % y el movimiento es un %', v_i, v_t.tipo, v_tipo;
      END IF;
      IF EXISTS (SELECT 1 FROM public.conciliaciones WHERE extracto_id = p_extracto_id AND transaccion_id = v_t.id) THEN
        RAISE EXCEPTION 'Línea %: la transacción % ya está unida a este movimiento', v_i, v_t.id;
      END IF;
      SELECT COALESCE(sum(valor), 0) INTO v_usado FROM public.conciliaciones WHERE transaccion_id = v_t.id;
      IF v_usado + v_valor > v_t.valor THEN
        RAISE EXCEPTION 'Línea %: la transacción % vale % y ya tiene % conciliado', v_i, v_t.id, v_t.valor, v_usado;
      END IF;
      INSERT INTO public.conciliaciones (extracto_id, transaccion_id, valor) VALUES (p_extracto_id, v_t.id, v_valor);
      v_vinc := v_vinc + 1;
    ELSE
      -- Crear la transacción y unirla
      v_concepto := upper(NULLIF(btrim(v_l->>'concepto'), ''));
      IF v_concepto IS NULL THEN
        RAISE EXCEPTION 'Línea %: falta el concepto', v_i;
      END IF;
      IF (CASE WHEN v_concepto = 'PRESTAMO' THEN 'egreso' ELSE 'ingreso' END) <> v_tipo THEN
        RAISE EXCEPTION 'Línea %: % no corresponde a un % del banco', v_i, v_concepto, v_tipo;
      END IF;
      v_socio := COALESCE(NULLIF(v_l->>'socio_id', '')::bigint, v_b.socio_id);
      IF v_socio IS NULL THEN
        RAISE EXCEPTION 'Línea %: falta el socio', v_i;
      END IF;

      INSERT INTO public.transacciones (socio_id, periodo_id, concepto, tipo, valor, fecha_pago, notas, fila_origen)
      VALUES (
        v_socio,
        NULLIF(v_l->>'periodo_id', '')::bigint,
        v_concepto,
        v_tipo,
        v_valor,
        COALESCE(NULLIF(v_l->>'fecha_pago', '')::date, v_b.fecha),
        NULLIF(btrim(v_l->>'notas'), ''),
        v_base - v_i
      )
      RETURNING id INTO v_tx_id;

      INSERT INTO public.conciliaciones (extracto_id, transaccion_id, valor) VALUES (p_extracto_id, v_tx_id, v_valor);
      v_creadas := v_creadas || jsonb_build_object(
        'id', v_tx_id, 'socio_id', v_socio, 'concepto', v_concepto, 'tipo', v_tipo, 'valor', v_valor);
    END IF;

    v_suma := v_suma + v_valor;
  END LOOP;

  IF v_ya + v_suma > abs(v_b.monto) THEN
    RAISE EXCEPTION 'El total conciliado (%) supera el valor del movimiento (%)', v_ya + v_suma, abs(v_b.monto);
  END IF;

  -- Si el movimiento no tenía socio y todo quedó a nombre de uno solo, se le
  -- asigna (alimenta la sugerencia por número de cuenta).
  IF v_b.socio_id IS NULL THEN
    SELECT array_agg(DISTINCT t.socio_id) INTO v_socios
      FROM public.conciliaciones c JOIN public.transacciones t ON t.id = c.transaccion_id
     WHERE c.extracto_id = p_extracto_id;
    IF cardinality(v_socios) = 1 THEN
      UPDATE public.movimientos_banco
         SET socio_id = v_socios[1], asociado_manual = true, asociado_manual_fecha = now()
       WHERE id = p_extracto_id;
    END IF;
  END IF;

  SELECT estado INTO v_estado FROM public.vw_extracto_estado WHERE id = p_extracto_id;

  RETURN jsonb_build_object(
    'ok', true,
    'extracto_id', p_extracto_id,
    'creadas', v_creadas,
    'vinculadas', v_vinc,
    'valor_conciliado', v_ya + v_suma,
    'valor_pendiente', abs(v_b.monto) - (v_ya + v_suma),
    'estado', v_estado
  );
END;
$$;

-- ------------------------------------------------------------
-- 6 · Quitar uniones (no borra las transacciones)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.natillera_desconciliar_extracto(p_extracto_id bigint, p_transaccion_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.natillera_puede_escribir() THEN
    RAISE EXCEPTION 'Sin permiso para conciliar' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.conciliaciones
   WHERE extracto_id = p_extracto_id
     AND (p_transaccion_id IS NULL OR transaccion_id = p_transaccion_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'quitadas', v_n);
END;
$$;

-- ------------------------------------------------------------
-- 7 · Permisos de las funciones
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.natillera_importar_extracto(text, jsonb)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.natillera_conciliar_extracto(bigint, jsonb)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.natillera_desconciliar_extracto(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.natillera_importar_extracto(text, jsonb)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.natillera_conciliar_extracto(bigint, jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.natillera_desconciliar_extracto(bigint, bigint) TO authenticated;

-- Funciones viejas que leían las uniones antiguas: ninguna pantalla las usa
-- y darían resultados incompletos. Se desactivan (no se borran); para
-- reactivarlas: GRANT EXECUTE ... TO authenticated.
REVOKE EXECUTE ON FUNCTION public.natillera_corregir_socio_pago(bigint, bigint)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.natillera_distribuir_pago_socios(bigint, jsonb)  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
