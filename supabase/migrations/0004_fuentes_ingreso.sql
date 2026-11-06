-- Fuentes de ingreso: de dónde viene la plata y si es fija o variable.
-- "Fija" = recurrencia esperada mensual (salario, arriendo recibido, pensión).
-- "Variable" = sin recurrencia fija (ventas, comisiones, freelance, otros).
-- Un movimiento tipo 'ingreso' puede opcionalmente apuntar a una fuente;
-- los ingresos sin fuente siguen siendo válidos (no obliga a clasificar).

create table fuentes_ingreso (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  frecuencia text not null check (frecuencia in ('fijo', 'variable')),
  monto_esperado_mensual numeric(14, 2) check (monto_esperado_mensual is null or monto_esperado_mensual >= 0),
  activa boolean not null default true,
  nota text,
  created_at timestamptz not null default now(),
  unique (user_id, nombre)
);

create index idx_fuentes_ingreso_user on fuentes_ingreso (user_id);

alter table fuentes_ingreso enable row level security;

create policy "fuentes_ingreso: owner all" on fuentes_ingreso
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Agregar fuente_ingreso_id a movimientos. Sólo aplica a tipo='ingreso'.
alter table movimientos
  add column fuente_ingreso_id uuid references fuentes_ingreso(id) on delete set null;

alter table movimientos
  add constraint movimientos_fuente_solo_ingreso
  check (fuente_ingreso_id is null or tipo = 'ingreso');

create index idx_movimientos_fuente_ingreso on movimientos (fuente_ingreso_id) where fuente_ingreso_id is not null;
