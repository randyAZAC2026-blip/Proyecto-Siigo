-- ============================================================
-- Desglose por NETO y préstamos en la cartera (2026-10-31)
--
-- Caso real: préstamo de $450.000 con $50.000 de intereses descontados
-- por adelantado → al banco solo salen $400.000. El desglose es:
--     Préstamo 450.000 (sale) − Intereses 50.000 (entra) = 400.000 (sale)
--
-- 1. vw_extracto_estado: lo conciliado de un movimiento es el NETO: los
--    pagos en el mismo sentido del movimiento suman y los del sentido
--    contrario restan.
-- 2. natillera_conciliar_extracto acepta conceptos en ambos sentidos
--    (antes los rechazaba) y valida el neto. Debe haber al menos un
--    concepto en el sentido del movimiento.
-- 3. Los pagos creados desde la app ahora alimentan la cartera:
--      PRESTAMO            → fila en prestamos (saldo = monto)
--      INTERESES_PRESTAMO  → abono con intereses_pagados
--      ABONO_PRESTAMO      → abono con capital_pagado y baja el saldo
--    Los abonos van al préstamo creado en el mismo desglose o, si no hay,
--    al préstamo activo más reciente del socio.
--
-- Requiere supabase-conciliaciones.sql y -fase2.sql. Idempotente.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_extracto_estado WITH (security_invoker = true) AS
SELECT
  b.id, b.banco, b.fecha, b.descripcion, b.monto, b.saldo_cuenta,
  b.detalle_origen, b.dependencia, b.socio_id, s.nombre AS socio_nombre,
  COALESCE(c.valor_conciliado, 0)                  AS valor_conciliado,
  abs(b.monto) - COALESCE(c.valor_conciliado, 0)   AS valor_pendiente,
  COALESCE(c.n_transacciones, 0)                   AS n_transacciones,
  COALESCE(c.transaccion_ids, '{}'::bigint[])      AS transaccion_ids,
  CASE
    WHEN COALESCE(c.n_transacciones, 0) = 0
     AND (b.categoria = 'personal' OR b.detalle_origen = 'PERSONAL')                 THEN 'personal'
    WHEN COALESCE(c.n_transacciones, 0) = 0
     AND b.categoria IN ('gasto_bancario', 'rendimiento_bancario')                    THEN 'banco'
    WHEN COALESCE(c.n_transacciones, 0) = 0            THEN 'pendiente'
    WHEN c.valor_conciliado <  abs(b.monto)            THEN 'parcial'
    WHEN c.valor_conciliado =  abs(b.monto)            THEN 'conciliado'
    ELSE 'excedido'
  END AS estado,
  b.categoria
FROM public.movimientos_banco b
LEFT JOIN public.socios s ON s.id = b.socio_id
LEFT JOIN (
  SELECT c.extracto_id,
         -- Neto: mismo sentido del movimiento suma, sentido contrario resta.
         sum(CASE WHEN t.tipo = CASE WHEN mb.monto > 0 THEN 'ingreso' ELSE 'egreso' END
                  THEN c.valor ELSE -c.valor END)::bigint AS valor_conciliado,
         count(*)::int AS n_transacciones,
         array_agg(c.transaccion_id ORDER BY c.transaccion_id) AS transaccion_ids
    FROM public.conciliaciones c
    JOIN public.transacciones t      ON t.id = c.transaccion_id
    JOIN public.movimientos_banco mb ON mb.id = c.extracto_id
   GROUP BY c.extracto_id
) c ON c.extracto_id = b.id;

CREATE OR REPLACE FUNCTION public.natillera_conciliar_extracto(p_extracto_id bigint, p_lineas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_b          public.movimientos_banco%ROWTYPE;
  v_l          jsonb;
  v_i          int := 0;
  v_tipo       text;      -- sentido del movimiento del banco
  v_tipo_l     text;      -- sentido de la línea
  v_valor      bigint;
  v_ya         bigint;
  v_neto       bigint := 0;
  v_mismo      int := 0;  -- líneas en el sentido del movimiento
  v_usado      bigint;
  v_t          record;
  v_tx_id      bigint;
  v_socio      bigint;
  v_concepto   text;
  v_fecha      date;
  v_base       bigint;
  v_creadas    jsonb := '[]'::jsonb;
  v_vinc       int := 0;
  v_socios     bigint[];
  v_estado     text;
  v_prest_nuevo bigint;
  v_prest_socio bigint;
  v_prest      record;
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

  SELECT COALESCE(valor_conciliado, 0) INTO v_ya FROM public.vw_extracto_estado WHERE id = p_extracto_id;
  v_base := -(floor(extract(epoch FROM clock_timestamp()) * 1000000))::bigint;

  -- Los préstamos van primero: así un interés o abono del mismo desglose
  -- queda en el préstamo recién creado.
  FOR v_l IN
    SELECT e FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS x(e, ord)
     ORDER BY (upper(COALESCE(e->>'concepto', '')) = 'PRESTAMO') DESC, ord
  LOOP
    v_i := v_i + 1;
    IF NOT pg_input_is_valid(COALESCE(v_l->>'valor', ''), 'bigint') OR (v_l->>'valor')::bigint <= 0 THEN
      RAISE EXCEPTION 'Línea %: el valor debe ser un entero mayor a cero', v_i;
    END IF;
    v_valor := (v_l->>'valor')::bigint;

    IF v_l ? 'transaccion_id' THEN
      -- Vincular un pago que ya existe
      SELECT id, tipo, valor INTO v_t FROM public.transacciones
       WHERE id = (v_l->>'transaccion_id')::bigint FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Línea %: la transacción % no existe', v_i, v_l->>'transaccion_id';
      END IF;
      IF EXISTS (SELECT 1 FROM public.conciliaciones WHERE extracto_id = p_extracto_id AND transaccion_id = v_t.id) THEN
        RAISE EXCEPTION 'Línea %: la transacción % ya está unida a este movimiento', v_i, v_t.id;
      END IF;
      SELECT COALESCE(sum(valor), 0) INTO v_usado FROM public.conciliaciones WHERE transaccion_id = v_t.id;
      IF v_usado + v_valor > v_t.valor THEN
        RAISE EXCEPTION 'Línea %: la transacción % vale % y ya tiene % conciliado', v_i, v_t.id, v_t.valor, v_usado;
      END IF;
      v_tipo_l := v_t.tipo;
      INSERT INTO public.conciliaciones (extracto_id, transaccion_id, valor) VALUES (p_extracto_id, v_t.id, v_valor);
      v_vinc := v_vinc + 1;
    ELSE
      -- Crear el pago
      v_concepto := upper(NULLIF(btrim(v_l->>'concepto'), ''));
      IF v_concepto IS NULL THEN
        RAISE EXCEPTION 'Línea %: falta el concepto', v_i;
      END IF;
      v_tipo_l := CASE WHEN v_concepto = 'PRESTAMO' THEN 'egreso' ELSE 'ingreso' END;
      v_socio := COALESCE(NULLIF(v_l->>'socio_id', '')::bigint, v_b.socio_id);
      IF v_socio IS NULL THEN
        RAISE EXCEPTION 'Línea %: falta el socio', v_i;
      END IF;
      v_fecha := COALESCE(NULLIF(v_l->>'fecha_pago', '')::date, v_b.fecha);

      INSERT INTO public.transacciones (socio_id, periodo_id, concepto, tipo, valor, fecha_pago, notas, fila_origen)
      VALUES (v_socio, NULLIF(v_l->>'periodo_id', '')::bigint, v_concepto, v_tipo_l, v_valor, v_fecha,
              NULLIF(btrim(v_l->>'notas'), ''), v_base - v_i)
      RETURNING id INTO v_tx_id;

      -- Cartera de préstamos
      IF v_concepto = 'PRESTAMO' THEN
        INSERT INTO public.prestamos (socio_id, transaccion_id, monto_prestado, saldo_pendiente, fecha_desembolso, estado)
        VALUES (v_socio, v_tx_id, v_valor, v_valor, v_fecha, 'activo')
        RETURNING id INTO v_prest_nuevo;
        v_prest_socio := v_socio;
      ELSIF v_concepto IN ('INTERESES_PRESTAMO', 'ABONO_PRESTAMO') THEN
        IF v_prest_nuevo IS NOT NULL AND v_prest_socio = v_socio THEN
          SELECT * INTO v_prest FROM public.prestamos WHERE id = v_prest_nuevo FOR UPDATE;
        ELSE
          SELECT * INTO v_prest FROM public.prestamos
           WHERE socio_id = v_socio AND estado = 'activo'
           ORDER BY fecha_desembolso DESC NULLS LAST, id DESC LIMIT 1 FOR UPDATE;
        END IF;
        IF v_prest.id IS NULL THEN
          RAISE EXCEPTION 'Línea %: el socio no tiene un préstamo activo al cual aplicar %', v_i,
            CASE WHEN v_concepto = 'ABONO_PRESTAMO' THEN 'el abono' ELSE 'los intereses' END;
        END IF;
        IF v_concepto = 'ABONO_PRESTAMO' AND v_valor > v_prest.saldo_pendiente THEN
          RAISE EXCEPTION 'Línea %: el abono (%) es mayor que el saldo del préstamo (%)', v_i, v_valor, v_prest.saldo_pendiente;
        END IF;
        INSERT INTO public.abonos_prestamos (prestamo_id, transaccion_id, socio_id, monto_abono,
                                             intereses_pagados, capital_pagado, fecha_abono)
        VALUES (v_prest.id, v_tx_id, v_socio, v_valor,
                CASE WHEN v_concepto = 'INTERESES_PRESTAMO' THEN v_valor ELSE 0 END,
                CASE WHEN v_concepto = 'ABONO_PRESTAMO' THEN v_valor ELSE 0 END,
                v_fecha);
        IF v_concepto = 'ABONO_PRESTAMO' THEN
          UPDATE public.prestamos
             SET saldo_pendiente = saldo_pendiente - v_valor,
                 estado = CASE WHEN saldo_pendiente - v_valor <= 0 THEN 'pagado' ELSE estado END
           WHERE id = v_prest.id;
        END IF;
        v_prest := NULL;
      END IF;

      INSERT INTO public.conciliaciones (extracto_id, transaccion_id, valor) VALUES (p_extracto_id, v_tx_id, v_valor);
      v_creadas := v_creadas || jsonb_build_object(
        'id', v_tx_id, 'socio_id', v_socio, 'concepto', v_concepto, 'tipo', v_tipo_l, 'valor', v_valor);
    END IF;

    IF v_tipo_l = v_tipo THEN
      v_neto := v_neto + v_valor;
      v_mismo := v_mismo + 1;
    ELSE
      v_neto := v_neto - v_valor;
    END IF;
  END LOOP;

  IF v_mismo = 0 THEN
    RAISE EXCEPTION 'Debe haber al menos un concepto que % (el movimiento es un %)',
      CASE WHEN v_tipo = 'ingreso' THEN 'entre' ELSE 'salga' END, v_tipo;
  END IF;
  IF v_neto <= 0 THEN
    RAISE EXCEPTION 'El neto del desglose (%) debe ser mayor a cero', v_neto;
  END IF;
  IF v_ya + v_neto > abs(v_b.monto) THEN
    RAISE EXCEPTION 'El neto conciliado (%) supera el valor del movimiento (%)', v_ya + v_neto, abs(v_b.monto);
  END IF;

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
    'valor_conciliado', v_ya + v_neto,
    'valor_pendiente', abs(v_b.monto) - (v_ya + v_neto),
    'estado', v_estado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.natillera_conciliar_extracto(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.natillera_conciliar_extracto(bigint, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
