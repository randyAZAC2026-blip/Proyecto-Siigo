-- Asesor Tributario IA — schema inicial
-- Ver blueprint: architect/asesor-tributario-ia-blueprint.md, Sección 4

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','superuser')),
  full_name text,
  created_at timestamptz not null default now()
);

create table uvt_rates (
  year int primary key,
  value_cop numeric not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table retefte_concepts (
  id uuid primary key default gen_random_uuid(),
  rubro text,
  concepto text not null,
  uvt_base numeric not null default 0,
  valor_base_cop numeric not null default 0,
  tarifa_persona_juridica numeric,
  tarifa_natural_declarante numeric,
  tarifa_natural_no_declarante numeric,
  year int not null references uvt_rates(year),
  created_at timestamptz not null default now()
);

create table iva_items (
  id uuid primary key default gen_random_uuid(),
  codigo_dane text,
  descripcion text not null,
  categoria text not null,
  tarifa numeric not null,
  tipo text not null check (tipo in ('gravado','exento','excluido')),
  fuente text not null
);

create table ica_medellin_activities (
  id uuid primary key default gen_random_uuid(),
  clase_ciiu text not null,
  descripcion text not null,
  grupo_ica text not null,
  sector text not null,
  tarifa_por_mil numeric not null
);

create table tax_regimes (
  code text primary key,
  label text not null,
  description text
);

-- Índices sobre columnas usadas para filtrar/unir
create index idx_retefte_concepts_year on retefte_concepts(year);
create index idx_ica_medellin_clase_ciiu on ica_medellin_activities(clase_ciiu);

-- Trigger: crear fila en profiles automáticamente al registrarse
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table profiles enable row level security;
alter table uvt_rates enable row level security;
alter table retefte_concepts enable row level security;
alter table iva_items enable row level security;
alter table ica_medellin_activities enable row level security;
alter table tax_regimes enable row level security;

create policy "profiles: user reads own row" on profiles
  for select using (auth.uid() = id);

create policy "reference tables: authenticated read" on uvt_rates
  for select using (auth.role() = 'authenticated');
create policy "reference tables: authenticated read" on retefte_concepts
  for select using (auth.role() = 'authenticated');
create policy "reference tables: authenticated read" on iva_items
  for select using (auth.role() = 'authenticated');
create policy "reference tables: authenticated read" on ica_medellin_activities
  for select using (auth.role() = 'authenticated');
create policy "reference tables: authenticated read" on tax_regimes
  for select using (auth.role() = 'authenticated');

create policy "reference tables: superuser write" on uvt_rates
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'));
create policy "reference tables: superuser write" on retefte_concepts
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'));
create policy "reference tables: superuser write" on iva_items
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'));
create policy "reference tables: superuser write" on ica_medellin_activities
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'));
create policy "reference tables: superuser write" on tax_regimes
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'));
