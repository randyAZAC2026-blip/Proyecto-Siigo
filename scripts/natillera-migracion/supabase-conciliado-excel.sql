-- Movimientos del banco que ya venían conciliados desde el Excel.
--
-- En el Excel, la tesorería escribía el socio en la columna "Socio" cuando ya
-- había cuadrado el movimiento. Esos movimientos llegaron a la app con socio_id
-- pero sin pagos unidos (conciliaciones), así que se veían "pendiente" en rojo.
-- Se marcan con conciliado_excel y la vista los muestra como "conciliado".
-- No se crean pagos: los del Excel ya están en transacciones, y crearlos de
-- nuevo duplicaría el ahorro.
--
-- Si un movimiento marcado recibe después pagos unidos desde la app, manda lo
-- unido (la marca solo aplica cuando no hay ninguna conciliación).

alter table public.movimientos_banco
  add column if not exists conciliado_excel boolean not null default false;

comment on column public.movimientos_banco.conciliado_excel is
  'Ya venía conciliado en el Excel (tenía socio en la columna Socio). Se muestra como conciliado sin pagos unidos.';

update public.movimientos_banco b
   set conciliado_excel = true
  from public.socios s
 where s.id = b.socio_id
   and s.nombre <> '#N/A'
   and coalesce(b.categoria, '') not in ('personal', 'gasto_bancario', 'rendimiento_bancario')
   and coalesce(b.detalle_origen, '') <> 'PERSONAL'
   and not exists (select 1 from public.conciliaciones c where c.extracto_id = b.id);

create or replace view public.vw_extracto_estado
with (security_invoker = true) as
 SELECT b.id,
    b.banco,
    b.fecha,
    b.descripcion,
    b.monto,
    b.saldo_cuenta,
    b.detalle_origen,
    b.dependencia,
    b.socio_id,
    s.nombre AS socio_nombre,
        CASE
            WHEN COALESCE(c.n_transacciones, 0) = 0 AND b.conciliado_excel THEN abs(b.monto)
            ELSE COALESCE(c.valor_conciliado, 0::bigint)
        END AS valor_conciliado,
        CASE
            WHEN COALESCE(c.n_transacciones, 0) = 0 AND b.conciliado_excel THEN 0::bigint
            ELSE abs(b.monto) - COALESCE(c.valor_conciliado, 0::bigint)
        END AS valor_pendiente,
    COALESCE(c.n_transacciones, 0) AS n_transacciones,
    COALESCE(c.transaccion_ids, '{}'::bigint[]) AS transaccion_ids,
        CASE
            WHEN COALESCE(c.n_transacciones, 0) = 0 AND (b.categoria = 'personal'::text OR b.detalle_origen = 'PERSONAL'::text) THEN 'personal'::text
            WHEN COALESCE(c.n_transacciones, 0) = 0 AND (b.categoria = ANY (ARRAY['gasto_bancario'::text, 'rendimiento_bancario'::text])) THEN 'banco'::text
            WHEN COALESCE(c.n_transacciones, 0) = 0 AND b.conciliado_excel THEN 'conciliado'::text
            WHEN COALESCE(c.n_transacciones, 0) = 0 THEN 'pendiente'::text
            WHEN c.valor_conciliado < abs(b.monto) THEN 'parcial'::text
            WHEN c.valor_conciliado = abs(b.monto) THEN 'conciliado'::text
            ELSE 'excedido'::text
        END AS estado,
    b.categoria,
    b.conciliado_excel
   FROM movimientos_banco b
     LEFT JOIN socios s ON s.id = b.socio_id
     LEFT JOIN ( SELECT c_1.extracto_id,
            sum(
                CASE
                    WHEN t.tipo =
                    CASE
                        WHEN mb.monto > 0 THEN 'ingreso'::text
                        ELSE 'egreso'::text
                    END THEN c_1.valor
                    ELSE - c_1.valor
                END)::bigint AS valor_conciliado,
            count(*)::integer AS n_transacciones,
            array_agg(c_1.transaccion_id ORDER BY c_1.transaccion_id) AS transaccion_ids
           FROM conciliaciones c_1
             JOIN transacciones t ON t.id = c_1.transaccion_id
             JOIN movimientos_banco mb ON mb.id = c_1.extracto_id
          GROUP BY c_1.extracto_id) c ON c.extracto_id = b.id;
