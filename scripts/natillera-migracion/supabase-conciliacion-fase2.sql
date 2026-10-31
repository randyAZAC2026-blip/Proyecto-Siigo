-- ============================================================
-- Fase 2 de la conciliación bancaria (2026-10-31)
--
--   1. Categorías para movimientos que NO llevan pago de un socio:
--      personal, gasto_bancario (4x1000, cuota de manejo…) y
--      rendimiento_bancario (intereses que paga la cuenta).
--      Nuevo estado 'banco' en vw_extracto_estado.
--   2. reglas_banco: patrones de descripción → categoría. Se aplican
--      solas al importar y con natillera_aplicar_reglas().
--   3. vw_sugerencias_conciliacion: emparejamientos seguros entre
--      movimientos pendientes y pagos ya registrados (mismo socio, mismo
--      monto, fecha a ±5 días; préstamos por monto y fecha). Solo
--      sugiere cuando hay UNA opción en ambos sentidos.
--   4. natillera_aceptar_sugerencias(): acepta en lote; cada una pasa por
--      natillera_conciliar_extracto (mismas validaciones). Si una falla,
--      se omite y se informa, las demás se guardan.
--   5. natillera_categorizar_extractos(): clasificar a mano.
--
-- Requiere supabase-conciliaciones.sql. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Categoría
-- ------------------------------------------------------------
ALTER TABLE public.movimientos_banco ADD COLUMN IF NOT EXISTS categoria text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimientos_banco_categoria_check') THEN
    ALTER TABLE public.movimientos_banco ADD CONSTRAINT movimientos_banco_categoria_check
      CHECK (categoria IN ('personal', 'gasto_bancario', 'rendimiento_bancario'));
  END IF;
END $$;
COMMENT ON COLUMN public.movimientos_banco.categoria IS
  'Movimientos que no son pagos de socios: personal, gasto_bancario, rendimiento_bancario. NULL = es de la natillera.';

-- Lo que ya estaba marcado como PERSONAL en el origen.
UPDATE public.movimientos_banco SET categoria = 'personal'
 WHERE categoria IS NULL AND detalle_origen = 'PERSONAL';

-- ------------------------------------------------------------
-- 2 · Estado (se agrega 'banco' y la columna categoria al final)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_extracto_estado WITH (security_invoker = true) AS
SELECT
  b.id, b.banco, b.fecha, b.descripcion, b.monto, b.saldo_cuenta,
  b.detalle_origen, b.dependencia, b.socio_id, s.nombre AS socio_nombre,
  COALESCE(c.valor_conciliado, 0)                  AS valor_conciliado,
  abs(b.monto) - COALESCE(c.valor_conciliado, 0)   AS valor_pendiente,
  COALESCE(c.n_transacciones, 0)                   AS n_transacciones,
  COALESCE(c.transaccion_ids, '{}'::bigint[])      AS transaccion_ids,
  CASE
    WHEN COALESCE(c.valor_conciliado, 0) = 0
     AND (b.categoria = 'personal' OR b.detalle_origen = 'PERSONAL')                 THEN 'personal'
    WHEN COALESCE(c.valor_conciliado, 0) = 0
     AND b.categoria IN ('gasto_bancario', 'rendimiento_bancario')                    THEN 'banco'
    WHEN COALESCE(c.valor_conciliado, 0) = 0           THEN 'pendiente'
    WHEN c.valor_conciliado <  abs(b.monto)            THEN 'parcial'
    WHEN c.valor_conciliado =  abs(b.monto)            THEN 'conciliado'
    ELSE 'excedido'
  END AS estado,
  b.categoria
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

-- ------------------------------------------------------------
-- 3 · Reglas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reglas_banco (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre     text NOT NULL,
  patron     text NOT NULL CHECK (length(btrim(patron)) >= 3),
  tipo       text NOT NULL DEFAULT 'ambos' CHECK (tipo IN ('ingreso', 'egreso', 'ambos')),
  categoria  text NOT NULL CHECK (categoria IN ('personal', 'gasto_bancario', 'rendimiento_bancario')),
  activa     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patron, tipo)
);
COMMENT ON TABLE public.reglas_banco IS
  'Si la descripción del movimiento contiene "patron" (sin importar mayúsculas), se clasifica con "categoria".';

ALTER TABLE public.reglas_banco ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reglas_banco_natillera ON public.reglas_banco;
CREATE POLICY reglas_banco_natillera ON public.reglas_banco FOR ALL TO authenticated
  USING (public.natillera_puede_escribir()) WITH CHECK (public.natillera_puede_escribir());
REVOKE ALL ON public.reglas_banco FROM anon;

INSERT INTO public.reglas_banco (nombre, patron, tipo, categoria) VALUES
  ('Intereses que paga la cuenta', 'ABONO INTERESES AHORROS', 'ingreso', 'rendimiento_bancario'),
  ('Ajuste de intereses',          'AJUSTE INTERES AHORROS',  'ambos',   'rendimiento_bancario'),
  ('Impuesto 4x1000',              'IMPTO GOBIERNO',          'egreso',  'gasto_bancario'),
  ('Cuota de manejo tarjeta',      'MANEJO',                  'egreso',  'gasto_bancario')
ON CONFLICT (patron, tipo) DO NOTHING;

-- Clasifica con las reglas activas los movimientos sin categoría y sin
-- pagos unidos. p_ids NULL = todos. Devuelve cuántos clasificó.
CREATE OR REPLACE FUNCTION public.natillera_aplicar_reglas(p_ids bigint[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.natillera_puede_escribir() THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  WITH match AS (
    SELECT DISTINCT ON (b.id) b.id, r.categoria
      FROM public.movimientos_banco b
      JOIN public.reglas_banco r
        ON r.activa
       AND upper(COALESCE(b.descripcion, '')) LIKE '%' || upper(btrim(r.patron)) || '%'
       AND (r.tipo = 'ambos' OR (r.tipo = 'ingreso' AND b.monto > 0) OR (r.tipo = 'egreso' AND b.monto < 0))
     WHERE b.categoria IS NULL
       AND (p_ids IS NULL OR b.id = ANY (p_ids))
       AND NOT EXISTS (SELECT 1 FROM public.conciliaciones c WHERE c.extracto_id = b.id)
     ORDER BY b.id, r.id
  )
  UPDATE public.movimientos_banco b SET categoria = m.categoria
    FROM match m WHERE b.id = m.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ------------------------------------------------------------
-- 4 · Clasificar a mano (NULL = quitar la categoría)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.natillera_categorizar_extractos(p_ids bigint[], p_categoria text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_n int; v_con int;
BEGIN
  IF NOT public.natillera_puede_escribir() THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  IF p_categoria IS NOT NULL AND p_categoria NOT IN ('personal', 'gasto_bancario', 'rendimiento_bancario') THEN
    RAISE EXCEPTION 'Categoría no válida: %', p_categoria;
  END IF;
  SELECT count(DISTINCT extracto_id) INTO v_con FROM public.conciliaciones WHERE extracto_id = ANY (p_ids);
  IF p_categoria IS NOT NULL AND v_con > 0 THEN
    RAISE EXCEPTION '% movimiento(s) ya tienen pagos unidos: quita la unión antes de clasificarlos', v_con;
  END IF;
  UPDATE public.movimientos_banco
     SET categoria = p_categoria,
         -- Se mantiene el origen viejo en sintonía para los filtros que aún lo usan.
         detalle_origen = CASE
           WHEN p_categoria = 'personal' THEN 'PERSONAL'
           WHEN detalle_origen = 'PERSONAL' THEN NULL
           ELSE detalle_origen END
   WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'actualizados', v_n);
END;
$$;

-- ------------------------------------------------------------
-- 5 · Sugerencias de emparejamiento
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_sugerencias_conciliacion WITH (security_invoker = true) AS
WITH libres AS (
  SELECT t.* FROM public.transacciones t
   WHERE t.fecha_pago IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.conciliaciones c WHERE c.transaccion_id = t.id)
), grupos AS (
  -- Un desglose = todos los pagos libres de un socio en una misma fecha.
  SELECT socio_id, fecha_pago, sum(valor)::bigint AS total,
         array_agg(id ORDER BY id) AS ids,
         string_agg(DISTINCT concepto, ',' ORDER BY concepto) AS conceptos
    FROM libres WHERE tipo = 'ingreso'
   GROUP BY socio_id, fecha_pago
), pend AS (
  SELECT * FROM public.vw_extracto_estado WHERE estado = 'pendiente' AND banco = 'Bancolombia'
), cand AS (
  SELECT p.id AS extracto_id, g.socio_id, g.ids, g.conceptos, g.fecha_pago,
         abs(g.fecha_pago - p.fecha) AS dias
    FROM pend p
    JOIN grupos g ON g.socio_id = p.socio_id AND g.total = p.monto AND abs(g.fecha_pago - p.fecha) <= 5
   WHERE p.monto > 0
  UNION ALL
  SELECT p.id, t.socio_id, ARRAY[t.id], t.concepto, t.fecha_pago, abs(t.fecha_pago - p.fecha)
    FROM pend p
    JOIN libres t ON t.concepto = 'PRESTAMO' AND t.valor = -p.monto AND abs(t.fecha_pago - p.fecha) <= 5
   WHERE p.monto < 0
), unicos AS (
  SELECT c.* FROM cand c
   WHERE (SELECT count(*) FROM cand c2 WHERE c2.extracto_id = c.extracto_id) = 1
     AND (SELECT count(*) FROM cand c3 WHERE c3.ids && c.ids) = 1
)
SELECT u.extracto_id, p.fecha, p.descripcion, p.monto, p.dependencia,
       u.socio_id, s.nombre AS socio_nombre,
       u.ids AS transaccion_ids, u.conceptos, u.fecha_pago, u.dias,
       CASE WHEN u.dias = 0 THEN 'alta' ELSE 'media' END AS confianza
  FROM unicos u
  JOIN pend p ON p.id = u.extracto_id
  JOIN public.socios s ON s.id = u.socio_id;

CREATE OR REPLACE FUNCTION public.natillera_aceptar_sugerencias(p_extracto_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_s       record;
  v_lineas  jsonb;
  v_ok      int := 0;
  v_omit    jsonb := '[]'::jsonb;
  v_id      bigint;
BEGIN
  IF NOT public.natillera_puede_escribir() THEN
    RAISE EXCEPTION 'Sin permiso para conciliar' USING ERRCODE = '42501';
  END IF;
  -- Las sugerencias se recalculan una sola vez, ahora: si alguna ya no
  -- aplica (alguien la concilió antes), se omite. Por construcción no
  -- comparten transacciones, así que aceptar una no invalida otra.
  FOR v_id IN
    SELECT x FROM unnest(COALESCE(p_extracto_ids, '{}')) x
     WHERE x NOT IN (SELECT extracto_id FROM public.vw_sugerencias_conciliacion)
  LOOP
    v_omit := v_omit || jsonb_build_object('extracto_id', v_id, 'motivo', 'La sugerencia ya no aplica');
  END LOOP;

  FOR v_s IN
    SELECT * FROM public.vw_sugerencias_conciliacion WHERE extracto_id = ANY (p_extracto_ids)
  LOOP
    SELECT jsonb_agg(jsonb_build_object('transaccion_id', t.id, 'valor', t.valor))
      INTO v_lineas
      FROM public.transacciones t WHERE t.id = ANY (v_s.transaccion_ids);
    BEGIN
      PERFORM public.natillera_conciliar_extracto(v_s.extracto_id, v_lineas);
      v_ok := v_ok + 1;
    EXCEPTION WHEN others THEN
      v_omit := v_omit || jsonb_build_object('extracto_id', v_s.extracto_id, 'motivo', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'aceptadas', v_ok, 'omitidas', v_omit);
END;
$$;

-- ------------------------------------------------------------
-- 6 · Importar: clasifica con las reglas lo recién importado
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
  v_ids     bigint[];
  v_reglas  int := 0;
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
    RETURN jsonb_build_object('insertados', 0, 'duplicados', 0, 'clasificados', 0, 'errores', '[]'::jsonb);
  END IF;
  IF v_total > 5000 THEN
    RAISE EXCEPTION 'Máximo 5000 filas por importación (llegaron %)', v_total;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('natillera_importar_extracto:' || p_banco));

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
    RETURN jsonb_build_object('insertados', 0, 'duplicados', 0, 'clasificados', 0, 'errores', v_errores);
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
  ), ins AS (
    INSERT INTO public.movimientos_banco (banco, fecha, descripcion, monto, saldo_cuenta, detalle_origen, dependencia, fila_origen)
    SELECT p_banco, fecha, descripcion, monto, saldo, detalle, dependencia, v_base - fila
      FROM k
     WHERE (saldo IS NOT NULL AND rn = 1 AND en_bd = 0)
        OR (saldo IS NULL     AND rn > en_bd)
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM ins;
  v_ins := COALESCE(cardinality(v_ids), 0);

  IF v_ins > 0 THEN
    v_reglas := public.natillera_aplicar_reglas(v_ids);
  END IF;

  RETURN jsonb_build_object('insertados', v_ins, 'duplicados', v_total - v_ins,
                            'clasificados', v_reglas, 'errores', '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- 7 · Permisos
-- ------------------------------------------------------------
REVOKE ALL ON public.vw_sugerencias_conciliacion FROM anon;
GRANT SELECT ON public.vw_sugerencias_conciliacion TO authenticated;
REVOKE ALL ON FUNCTION public.natillera_aplicar_reglas(bigint[])                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.natillera_categorizar_extractos(bigint[], text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.natillera_aceptar_sugerencias(bigint[])            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.natillera_importar_extracto(text, jsonb)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.natillera_aplicar_reglas(bigint[])              TO authenticated;
GRANT EXECUTE ON FUNCTION public.natillera_categorizar_extractos(bigint[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.natillera_aceptar_sugerencias(bigint[])         TO authenticated;
GRANT EXECUTE ON FUNCTION public.natillera_importar_extracto(text, jsonb)        TO authenticated;

NOTIFY pgrst, 'reload schema';
