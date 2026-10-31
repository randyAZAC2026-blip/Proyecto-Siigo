-- Deshacer el desglose de un movimiento del banco para poder corregirlo.
--
-- natillera_desconciliar_extracto solo quita la unión: si el desglose había
-- creado un préstamo (o intereses/abonos), esos registros quedaban vivos, por
-- ejemplo un préstamo a nombre de la persona equivocada.
--
-- natillera_deshacer_desglose deja el movimiento como si nunca se hubiera
-- desglosado:
--   * Pagos creados desde la app (fila_origen < 0) y unidos solo a este
--     movimiento: se borran, junto con su préstamo o su abono/interés. Un abono
--     devuelve su capital al saldo del préstamo.
--   * Pagos que venían del Excel (fila_origen >= 0) o que también están unidos
--     a otro movimiento: solo se quita la unión; el pago se conserva.
--   * Si el préstamo creado ya tiene abonos o intereses registrados en OTROS
--     movimientos, no se toca nada y se avisa cuáles hay que deshacer primero.
--   * Si el socio del movimiento lo había puesto este desglose, se quita.
--   * Se quita la marca conciliado_excel para que el movimiento quede pendiente.

-- El historial (movimientos) guarda el id del pago como referencia histórica.
-- Con ON DELETE SET NULL, borrar un pago intentaba modificar el historial y el
-- trigger movs_no_update lo rechazaba ("movimientos es un log inmutable").
alter table public.movimientos drop constraint if exists movimientos_transaccion_id_fkey;

create or replace function public.natillera_deshacer_desglose(p_extracto_id bigint)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_b          public.movimientos_banco%rowtype;
  v_txs        bigint[];
  v_propias    bigint[];
  v_creado     timestamptz[];
  v_t          record;
  v_p          record;
  v_otros      text;
  v_borradas   int := 0;
  v_prestamos  int := 0;
  v_uniones    int := 0;
begin
  if not public.natillera_puede_escribir() then
    raise exception 'Sin permiso para conciliar' using errcode = '42501';
  end if;

  select * into v_b from public.movimientos_banco where id = p_extracto_id for update;
  if not found then
    raise exception 'Movimiento bancario % no encontrado', p_extracto_id;
  end if;

  select array_agg(transaccion_id), array_agg(creado_en)
    into v_txs, v_creado
    from public.conciliaciones where extracto_id = p_extracto_id;

  if v_txs is null then
    if v_b.conciliado_excel then
      update public.movimientos_banco set conciliado_excel = false where id = p_extracto_id;
      return jsonb_build_object('ok', true, 'borradas', 0, 'prestamos', 0, 'uniones', 0, 'excel', true,
                                'socio_id', v_b.socio_id);
    end if;
    raise exception 'Este movimiento no tiene desglose para deshacer';
  end if;

  -- Pagos creados desde la app que solo pertenecen a este movimiento.
  select array_agg(t.id) into v_propias
    from public.transacciones t
   where t.id = any (v_txs)
     and t.fila_origen < 0
     and not exists (select 1 from public.conciliaciones c
                      where c.transaccion_id = t.id and c.extracto_id <> p_extracto_id);
  v_propias := coalesce(v_propias, '{}');

  -- Un préstamo creado aquí no se borra si ya tiene pagos de otros movimientos.
  for v_p in
    select p.id from public.prestamos p where p.transaccion_id = any (v_propias) for update
  loop
    select string_agg(format('%s por %s del %s', lower(replace(t.concepto, '_', ' ')),
                             replace(to_char(a.monto_abono, 'FM999,999,999'), ',', '.'), to_char(a.fecha_abono, 'DD/MM/YYYY')), '; ')
      into v_otros
      from public.abonos_prestamos a join public.transacciones t on t.id = a.transaccion_id
     where a.prestamo_id = v_p.id and not (a.transaccion_id = any (v_propias));
    if v_otros is not null then
      raise exception 'El préstamo de este movimiento ya tiene pagos registrados en otros movimientos (%). Deshaz esos primero.', v_otros;
    end if;
  end loop;

  -- Abonos de este desglose a préstamos que no se borran: devolver el capital.
  for v_t in
    select a.prestamo_id, sum(a.capital_pagado) capital
      from public.abonos_prestamos a
     where a.transaccion_id = any (v_propias)
       and a.capital_pagado > 0
       and not exists (select 1 from public.prestamos p
                        where p.id = a.prestamo_id and p.transaccion_id = any (v_propias))
     group by a.prestamo_id
  loop
    update public.prestamos
       set saldo_pendiente = saldo_pendiente + v_t.capital,
           estado = case when estado = 'pagado' then 'activo' else estado end
     where id = v_t.prestamo_id;
  end loop;

  delete from public.prestamos where transaccion_id = any (v_propias);
  get diagnostics v_prestamos = row_count;

  delete from public.conciliaciones where extracto_id = p_extracto_id;
  get diagnostics v_uniones = row_count;

  -- Borra los pagos propios (abonos_prestamos se va en cascada).
  -- movimientos es un historial inmutable: en vez de tocar sus filas se deja
  -- constancia de la anulación con un movimiento en sentido contrario.
  insert into public.movimientos (socio_id, transaccion_id, tipo, concepto, valor, fecha, metadata)
  select t.socio_id, t.id,
         case when t.tipo = 'ingreso' then 'egreso' else 'ingreso' end,
         'ANULACION', t.valor, current_date,
         jsonb_build_object('motivo', 'deshacer_desglose', 'extracto_id', p_extracto_id,
                            'anula_concepto', t.concepto, 'anula_tipo', t.tipo,
                            'fecha_pago', t.fecha_pago, 'usuario', auth.uid(), 'fecha_anulacion', now())
    from public.transacciones t
   where t.id = any (v_propias);

  delete from public.transacciones where id = any (v_propias);
  get diagnostics v_borradas = row_count;

  update public.movimientos_banco
     set conciliado_excel = false,
         socio_id = case when asociado_manual and asociado_manual_fecha = any (v_creado) then null else socio_id end,
         asociado_manual = case when asociado_manual and asociado_manual_fecha = any (v_creado) then false else asociado_manual end,
         asociado_manual_fecha = case when asociado_manual and asociado_manual_fecha = any (v_creado) then null else asociado_manual_fecha end
   where id = p_extracto_id;

  return jsonb_build_object(
    'ok', true,
    'borradas', v_borradas,
    'prestamos', v_prestamos,
    'uniones', v_uniones,
    'conservadas', v_uniones - v_borradas,
    'socio_id', (select socio_id from public.movimientos_banco where id = p_extracto_id)
  );
end;
$function$;

revoke all on function public.natillera_deshacer_desglose(bigint) from public, anon;
grant execute on function public.natillera_deshacer_desglose(bigint) to authenticated;
