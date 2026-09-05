-- Asesor Tributario IA — módulo Agenda / Programador de Impuestos
-- Multi-cliente + catálogo DIAN + tareas propias por usuario

-- ============================================================
-- Clientes (multi-tenant por owner_id)
-- ============================================================
create table clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  razon_social text not null,
  nit text,
  ultimo_digito_nit int check (ultimo_digito_nit between 0 and 9),
  tipo_persona text not null default 'juridica' check (tipo_persona in ('natural','juridica')),
  regimen text,
  responsabilidades text[] not null default '{}'::text[],
  notas text,
  created_at timestamptz not null default now()
);

create index idx_clientes_owner on clientes(owner_id);

-- ============================================================
-- Catálogo DIAN de obligaciones (compartido, superuser lo mantiene)
-- ============================================================
create table obligaciones_dian (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  entidad text not null default 'DIAN',
  frecuencia text not null check (frecuencia in ('mensual','bimestral','trimestral','cuatrimestral','semestral','anual','unica')),
  descripcion text,
  activo boolean not null default true
);

-- Vencimientos (año + periodo + último dígito NIT → fecha)
-- ultimo_digito = -1 significa "aplica a todos los dígitos"
create table obligaciones_vencimientos (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid not null references obligaciones_dian(id) on delete cascade,
  year int not null,
  periodo int,
  ultimo_digito int not null check (ultimo_digito between -1 and 9),
  fecha_vencimiento date not null,
  unique (obligacion_id, year, periodo, ultimo_digito)
);

create index idx_venc_obligacion on obligaciones_vencimientos(obligacion_id);
create index idx_venc_year on obligaciones_vencimientos(year);

-- ============================================================
-- Tareas (checklist del contador, por owner_id)
-- ============================================================
create table tareas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  obligacion_id uuid references obligaciones_dian(id) on delete set null,
  titulo text not null,
  descripcion text,
  periodo_year int,
  periodo_numero int,
  fecha_vencimiento date,
  fecha_entrega_interna date,
  prioridad text not null default 'media' check (prioridad in ('baja','media','alta','urgente')),
  estado text not null default 'pendiente' check (estado in ('pendiente','en_proceso','en_revision','entregada','no_aplica')),
  notas text,
  completada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tareas_owner on tareas(owner_id);
create index idx_tareas_cliente on tareas(cliente_id);
create index idx_tareas_estado on tareas(estado);
create index idx_tareas_fecha on tareas(fecha_vencimiento);

-- Trigger para mantener updated_at
create function public.tareas_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_tareas_updated_at
  before update on tareas
  for each row execute procedure public.tareas_touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table clientes enable row level security;
alter table obligaciones_dian enable row level security;
alter table obligaciones_vencimientos enable row level security;
alter table tareas enable row level security;

-- Clientes: solo el owner ve/edita los suyos
create policy "clientes: owner select" on clientes
  for select using (auth.uid() = owner_id);
create policy "clientes: owner insert" on clientes
  for insert with check (auth.uid() = owner_id);
create policy "clientes: owner update" on clientes
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "clientes: owner delete" on clientes
  for delete using (auth.uid() = owner_id);

-- Obligaciones DIAN: cualquier autenticado lee; superuser edita
create policy "obligaciones_dian: authenticated read" on obligaciones_dian
  for select using (auth.role() = 'authenticated');
create policy "obligaciones_dian: superuser write" on obligaciones_dian
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'));

create policy "obligaciones_vencimientos: authenticated read" on obligaciones_vencimientos
  for select using (auth.role() = 'authenticated');
create policy "obligaciones_vencimientos: superuser write" on obligaciones_vencimientos
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'superuser'));

-- Tareas: solo el owner ve/edita las suyas
create policy "tareas: owner select" on tareas
  for select using (auth.uid() = owner_id);
create policy "tareas: owner insert" on tareas
  for insert with check (auth.uid() = owner_id);
create policy "tareas: owner update" on tareas
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "tareas: owner delete" on tareas
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- Seed del catálogo base de obligaciones DIAN + Medellín
-- (Las fechas exactas por dígito NIT las carga el superuser
--  en obligaciones_vencimientos según decreto anual.)
-- ============================================================
insert into obligaciones_dian (codigo, nombre, entidad, frecuencia, descripcion) values
  ('iva-bim',        'IVA bimestral',                  'DIAN',              'bimestral',    'Declaración y pago del IVA para responsables con ingresos ≥ 92.000 UVT del año anterior.'),
  ('iva-cuat',       'IVA cuatrimestral',              'DIAN',              'cuatrimestral','Declaración y pago del IVA para responsables con ingresos < 92.000 UVT.'),
  ('retefuente',     'Retención en la fuente',         'DIAN',              'mensual',      'Declaración y pago mensual de retención en la fuente (renta, IVA, timbre).'),
  ('reteica-med',    'ReteICA Medellín',               'Alcaldía Medellín', 'bimestral',    'Declaración y pago de ReteICA en Medellín.'),
  ('ica-med',        'ICA Medellín',                   'Alcaldía Medellín', 'anual',        'Declaración anual del impuesto de Industria y Comercio en Medellín.'),
  ('renta-pj',       'Renta y complementarios PJ',     'DIAN',              'anual',        'Declaración de renta personas jurídicas.'),
  ('renta-pn',       'Renta y complementarios PN',     'DIAN',              'anual',        'Declaración de renta personas naturales.'),
  ('exogena-dian',   'Información exógena DIAN',       'DIAN',              'anual',        'Reporte de información exógena tributaria a la DIAN.'),
  ('exogena-med',    'Información exógena Medellín',   'Alcaldía Medellín', 'anual',        'Reporte de medios magnéticos municipales de Medellín.'),
  ('activos-ext',    'Declaración de activos en el exterior', 'DIAN',       'anual',        'Declaración anual para contribuyentes con activos poseídos en el exterior.'),
  ('patrimonio',     'Impuesto al patrimonio',         'DIAN',              'anual',        'Impuesto al patrimonio para sujetos obligados.'),
  ('gmf',            'Gravamen a los movimientos financieros (agentes)', 'DIAN', 'semanal', 'Declaración semanal del GMF por agentes retenedores.'),
  ('nomina-elect',   'Nómina electrónica',             'DIAN',              'mensual',      'Transmisión mensual del documento soporte de nómina electrónica.'),
  ('fac-elect',      'Factura electrónica',            'DIAN',              'mensual',      'Emisión y transmisión de factura electrónica.'),
  ('seg-social',     'Pago seguridad social (PILA)',   'Operador PILA',     'mensual',      'Pago mensual de aportes a seguridad social y parafiscales.');
