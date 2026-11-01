-- Billetera personal — módulo de control de ingresos/egresos y cartera.
-- Agrega: cuentas, categorias, movimientos, cuentas_por_pagar, cuentas_por_cobrar.
-- RLS: cada usuario ve y modifica únicamente sus propios registros.

create table cuentas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('efectivo', 'banco', 'billetera_digital', 'otro')),
  saldo_inicial numeric(14, 2) not null default 0,
  fecha_saldo_inicial date not null default current_date,
  color text,
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, nombre)
);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  icono text,
  created_at timestamptz not null default now(),
  unique (user_id, tipo, nombre)
);

create table cuentas_por_pagar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  acreedor text not null,
  concepto text not null,
  monto_total numeric(14, 2) not null check (monto_total > 0),
  monto_pagado numeric(14, 2) not null default 0 check (monto_pagado >= 0),
  fecha_registro date not null default current_date,
  fecha_vencimiento date,
  nota text,
  created_at timestamptz not null default now(),
  check (monto_pagado <= monto_total)
);

create table cuentas_por_cobrar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deudor text not null,
  concepto text not null,
  monto_total numeric(14, 2) not null check (monto_total > 0),
  monto_cobrado numeric(14, 2) not null default 0 check (monto_cobrado >= 0),
  fecha_registro date not null default current_date,
  fecha_vencimiento date,
  nota text,
  created_at timestamptz not null default now(),
  check (monto_cobrado <= monto_total)
);

create table movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cuenta_id uuid not null references cuentas(id) on delete restrict,
  cuenta_destino_id uuid references cuentas(id) on delete restrict,
  tipo text not null check (tipo in ('ingreso', 'egreso', 'transferencia')),
  monto numeric(14, 2) not null check (monto > 0),
  fecha date not null default current_date,
  descripcion text,
  categoria_id uuid references categorias(id) on delete set null,
  contraparte text,
  cxp_id uuid references cuentas_por_pagar(id) on delete set null,
  cxc_id uuid references cuentas_por_cobrar(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (tipo = 'transferencia'
      and cuenta_destino_id is not null
      and cuenta_destino_id <> cuenta_id
      and categoria_id is null
      and cxp_id is null
      and cxc_id is null)
    or (tipo in ('ingreso', 'egreso') and cuenta_destino_id is null)
  ),
  check (not (cxp_id is not null and cxc_id is not null)),
  check (cxp_id is null or tipo = 'egreso'),
  check (cxc_id is null or tipo = 'ingreso')
);

create index idx_movimientos_user_fecha on movimientos (user_id, fecha desc);
create index idx_movimientos_cuenta on movimientos (cuenta_id);
create index idx_movimientos_cuenta_destino on movimientos (cuenta_destino_id);
create index idx_movimientos_categoria on movimientos (categoria_id);
create index idx_movimientos_cxp on movimientos (cxp_id) where cxp_id is not null;
create index idx_movimientos_cxc on movimientos (cxc_id) where cxc_id is not null;
create index idx_cuentas_user on cuentas (user_id);
create index idx_categorias_user on categorias (user_id);
create index idx_cxp_user on cuentas_por_pagar (user_id);
create index idx_cxc_user on cuentas_por_cobrar (user_id);

-- Vista: saldo actual por cuenta = saldo_inicial + ingresos − egresos + transferencias_in − transferencias_out.
-- security_invoker=true hace que la vista respete el RLS del usuario que consulta.
create view saldos_cuentas
with (security_invoker = true)
as
select
  c.id as cuenta_id,
  c.user_id,
  c.nombre,
  c.tipo,
  c.color,
  c.archivada,
  c.saldo_inicial,
  c.saldo_inicial
    + coalesce((select sum(monto) from movimientos m
                where m.cuenta_id = c.id and m.tipo = 'ingreso'), 0)
    - coalesce((select sum(monto) from movimientos m
                where m.cuenta_id = c.id and m.tipo = 'egreso'), 0)
    + coalesce((select sum(monto) from movimientos m
                where m.cuenta_destino_id = c.id and m.tipo = 'transferencia'), 0)
    - coalesce((select sum(monto) from movimientos m
                where m.cuenta_id = c.id and m.tipo = 'transferencia'), 0)
    as saldo_actual
from cuentas c;

-- Trigger: al registrar un movimiento ligado a una CxP/CxC, mantener en sync monto_pagado/cobrado.
-- Así marcar "pagada parcialmente" desde el frontend es una sola inserción de movimiento.
create function public.handle_movimiento_cxp_cxc_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.cxp_id is not null then
    update cuentas_por_pagar
      set monto_pagado = monto_pagado + new.monto
      where id = new.cxp_id and user_id = new.user_id;
  end if;
  if new.cxc_id is not null then
    update cuentas_por_cobrar
      set monto_cobrado = monto_cobrado + new.monto
      where id = new.cxc_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger movimientos_cxp_cxc_insert
  after insert on movimientos
  for each row execute function public.handle_movimiento_cxp_cxc_insert();

-- Y simétrico al borrar: devolver el monto a la CxP/CxC.
create function public.handle_movimiento_cxp_cxc_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.cxp_id is not null then
    update cuentas_por_pagar
      set monto_pagado = greatest(monto_pagado - old.monto, 0)
      where id = old.cxp_id and user_id = old.user_id;
  end if;
  if old.cxc_id is not null then
    update cuentas_por_cobrar
      set monto_cobrado = greatest(monto_cobrado - old.monto, 0)
      where id = old.cxc_id and user_id = old.user_id;
  end if;
  return old;
end;
$$;

create trigger movimientos_cxp_cxc_delete
  before delete on movimientos
  for each row execute function public.handle_movimiento_cxp_cxc_delete();

-- RLS: cada usuario sólo ve/modifica sus propios registros.
alter table cuentas enable row level security;
alter table categorias enable row level security;
alter table movimientos enable row level security;
alter table cuentas_por_pagar enable row level security;
alter table cuentas_por_cobrar enable row level security;

create policy "cuentas: owner all" on cuentas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categorias: owner all" on categorias
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "movimientos: owner all" on movimientos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cuentas_por_pagar: owner all" on cuentas_por_pagar
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cuentas_por_cobrar: owner all" on cuentas_por_cobrar
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
