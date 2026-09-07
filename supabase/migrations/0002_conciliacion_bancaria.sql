-- Módulo 10 · Conciliación Bancaria — Gravimentes
-- Ver: docs/gravimentes_consolidado.md, Parte II · Backend (§6-§11)
--
-- Nota: adaptado al stack Supabase existente:
--   - Sin esquema `data.`, todo va a `public`.
--   - Reemplaza `data.usuario` → `auth.users` (o `profiles(id)` de 0001_init.sql).
--   - Multi-tenant vía tabla `empresas` + columna `empresa_id`, RLS por membresía.
--   - `data.tercero`/`data.documento`/`data.export_lote` se dejan como referencias
--     externas (tablas que otros módulos aportarán); aquí sólo las asumimos por FK.

-- =====================================================================
-- 1. Multi-tenant scaffolding (mínimo — pyme colombiana)
-- =====================================================================

create table empresas (
  id            bigserial primary key,
  razon_social  text not null,
  nit           text not null,
  digito_verif  int,
  ciudad        text,
  actividad_ciiu text,
  created_at    timestamptz not null default now(),
  unique (nit)
);

create table empresa_usuario (
  empresa_id bigint not null references empresas(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  rol        text   not null check (rol in ('contador','auxiliar','revisor','cliente','superuser')),
  created_at timestamptz not null default now(),
  primary key (empresa_id, user_id)
);

create index idx_empresa_usuario_user on empresa_usuario(user_id);

-- Helper: empresas a las que pertenece el usuario del JWT actual
create or replace function current_empresa_ids()
returns setof bigint
language sql stable security definer set search_path = public
as $$
  select empresa_id from empresa_usuario where user_id = auth.uid();
$$;

-- =====================================================================
-- 2. Cuentas bancarias registradas por empresa
-- =====================================================================

create table cuenta_bancaria (
  id                    bigserial primary key,
  empresa_id            bigint not null references empresas(id) on delete cascade,
  banco                 text not null,
  tipo                  text not null check (tipo in ('AHORROS','CORRIENTE','NEQUI','DAVIPLATA','FIDUCIA','TARJETA_CREDITO')),
  numero_cuenta         text not null,                   -- p.ej. '****3421' ofuscado
  numero_cuenta_hash    text not null,                   -- SHA-256 del número real
  moneda                char(3) not null default 'COP',
  cuenta_puc            text not null,                   -- 111005, 111010, 111505, ...
  centro_costo_default  text,
  aplica_gmf            boolean not null default true,   -- false = cuenta exenta 4x1000
  activa                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (empresa_id, numero_cuenta_hash)
);

alter table cuenta_bancaria enable row level security;
create policy cuenta_bancaria_tenant on cuenta_bancaria
  using (empresa_id in (select current_empresa_ids()));

-- =====================================================================
-- 3. Extractos bancarios importados (lote)
-- =====================================================================

create table extracto_lote (
  id                  bigserial primary key,
  empresa_id          bigint not null references empresas(id) on delete cascade,
  cuenta_bancaria_id  bigint not null references cuenta_bancaria(id) on delete restrict,
  archivo_nombre      text not null,
  archivo_hash        text not null,                     -- SHA-256 del binario original
  formato             text not null check (formato in ('BANCOLOMBIA_XLS','NEQUI_XLSX','BBVA_CSV','DAVIVIENDA_XLSX','OFX','MT940','PDF_OCR','GENERICO_CSV')),
  fecha_inicio        date not null,
  fecha_fin           date not null,
  saldo_inicial       numeric(18,2),
  saldo_final         numeric(18,2),
  total_ingresos      numeric(18,2),
  total_egresos       numeric(18,2),
  filas_leidas        int not null default 0,
  filas_insertadas    int not null default 0,
  estado              text not null default 'PROCESADO'
                        check (estado in ('PROCESANDO','PROCESADO','ERROR','REVERSADO','CONGELADO')),
  importado_por       uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  unique (empresa_id, cuenta_bancaria_id, archivo_hash)  -- idempotencia
);

alter table extracto_lote enable row level security;
create policy extracto_lote_tenant on extracto_lote
  using (empresa_id in (select current_empresa_ids()));

-- =====================================================================
-- 4. Movimientos bancarios — fuente de verdad del banco
-- =====================================================================

create table movimiento_bancario (
  id                   bigserial primary key,
  empresa_id           bigint not null references empresas(id) on delete cascade,
  cuenta_bancaria_id   bigint not null references cuenta_bancaria(id) on delete restrict,
  extracto_lote_id     bigint not null references extracto_lote(id) on delete cascade,
  fecha_movimiento     date not null,
  fecha_valor          date,
  descripcion_raw      text not null,
  descripcion_norm     text,                              -- upper + sin acentos + squeeze
  referencia_banco     text,
  monto                numeric(18,2) not null,            -- CONSERVA signo (+ ingreso, − egreso)
  saldo_despues        numeric(18,2),
  canal                text,                              -- PSE, ACH, EFECTIVO, CHEQUE, DEBITO_AUT, COMISION, GMF
  estado_conciliacion  text not null default 'PENDIENTE'
                         check (estado_conciliacion in ('PENDIENTE','PARCIAL','CONCILIADO','IGNORADO','EN_DISPUTA')),
  clasificacion        text check (clasificacion in ('OPERACIONAL','PERSONAL','NO_APLICA','AJUSTE_BANCO')),
  fila_origen          int not null,
  hash_linea           text not null,                     -- SHA-256(fecha||desc||monto||ref) → dedupe
  notas                text,
  created_at           timestamptz not null default now(),
  unique (cuenta_bancaria_id, hash_linea)
);

create index idx_mov_empresa_fecha on movimiento_bancario(empresa_id, fecha_movimiento);
create index idx_mov_estado on movimiento_bancario(empresa_id, estado_conciliacion)
  where estado_conciliacion in ('PENDIENTE','PARCIAL');
create index idx_mov_descripcion on movimiento_bancario using gin (to_tsvector('spanish', descripcion_norm));

alter table movimiento_bancario enable row level security;
create policy movimiento_bancario_tenant on movimiento_bancario
  using (empresa_id in (select current_empresa_ids()));

-- =====================================================================
-- 5. Relación N:M movimiento ↔ documento
-- Un movimiento puede vincularse a varias facturas; una factura puede
-- pagarse en varios movimientos.
-- Nota: `documentos` es la tabla que otro módulo (facturas) aportará.
--       Aquí referenciamos con FK diferida para permitir despliegue por partes.
-- =====================================================================

create table movimiento_documento (
  id                  bigserial primary key,
  empresa_id          bigint not null references empresas(id) on delete cascade,
  movimiento_id       bigint not null references movimiento_bancario(id) on delete cascade,
  documento_id        bigint,  -- FK a documentos(id) cuando exista ese módulo
  concepto            text not null check (concepto in (
                        'PAGO_FACTURA_COMPRA',
                        'PAGO_FACTURA_VENTA',
                        'ANTICIPO_PROVEEDOR',
                        'ANTICIPO_CLIENTE',
                        'NOTA_CREDITO_APLICADA',
                        'NOTA_DEBITO_APLICADA',
                        'DEVOLUCION',
                        'RETENCION_PRACTICADA',
                        'DESCUENTO_PP',
                        'AJUSTE_CAMBIARIO',
                        'GMF',
                        'COMISION_BANCARIA',
                        'RENDIMIENTOS'
                      )),
  valor               numeric(18,2) not null check (valor > 0),
  cuenta_puc          text not null,                     -- 220505, 130505, 236540, 511525, ...
  centro_costo        text,
  base_gravable       numeric(18,2),                     -- para líneas de retención
  tarifa_pct          numeric(6,3),                      -- para retenciones/GMF
  notas               text,
  origen              text not null default 'MANUAL'
                        check (origen in ('MANUAL','SUGERENCIA_ML','REGLA_EXPLICITA','AUTO_MATCH_EXACTO')),
  confianza           numeric(4,3),                      -- 0..1 si viene del Learning Engine
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now()
);

create index idx_movdoc_mov on movimiento_documento(movimiento_id);
create index idx_movdoc_doc on movimiento_documento(documento_id);

alter table movimiento_documento enable row level security;
create policy movimiento_documento_tenant on movimiento_documento
  using (empresa_id in (select current_empresa_ids()));

-- =====================================================================
-- 6. Trigger de cuadre — invariante crítica
--    SUM(valor · signo_por_concepto) == ABS(movimiento_bancario.monto)
-- =====================================================================

create or replace function trg_movdoc_cuadre()
returns trigger
language plpgsql
as $$
declare
  v_monto_banco   numeric(18,2);
  v_suma_asignada numeric(18,2);
  v_tolerancia   numeric(18,2) := 1.00;
  v_mov_id       bigint := coalesce(new.movimiento_id, old.movimiento_id);
begin
  select abs(monto) into v_monto_banco
  from movimiento_bancario
  where id = v_mov_id;

  select coalesce(sum(
      case
        when concepto in ('RETENCION_PRACTICADA','DESCUENTO_PP','NOTA_CREDITO_APLICADA')
          then -valor
        else valor
      end
    ), 0)
  into v_suma_asignada
  from movimiento_documento
  where movimiento_id = v_mov_id;

  if abs(v_suma_asignada - v_monto_banco) > v_tolerancia then
    raise exception 'Cuadre inválido: banco=%, asignado=% (dif=%)',
      v_monto_banco, v_suma_asignada, (v_suma_asignada - v_monto_banco);
  end if;

  return coalesce(new, old);
end;
$$;

-- El trigger se dispara sólo cuando el movimiento pasa a CONCILIADO o PARCIAL.
-- Durante la edición en borrador (PENDIENTE) se permite descuadre temporal.
-- Se puede refinar más adelante para validar sólo al conciliar; por ahora se ata a INSERT/UPDATE/DELETE.
create trigger check_movdoc_cuadre
  after insert or update or delete on movimiento_documento
  for each row execute function trg_movdoc_cuadre();

-- =====================================================================
-- 7. Log inmutable de auditoría
-- =====================================================================

create table movimiento_log (
  id              bigserial primary key,
  empresa_id      bigint not null references empresas(id) on delete cascade,
  usuario_id      uuid not null references auth.users(id),
  entidad         text not null,                        -- 'movimiento_bancario','movimiento_documento','comprobante_pago'
  entidad_id      bigint not null,
  accion          text not null check (accion in ('CREATE','UPDATE','DELETE','CONCILIAR','DESCONCILIAR','EXPORTAR')),
  payload_antes   jsonb,
  payload_despues jsonb,
  ip              inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index idx_mov_log_empresa on movimiento_log(empresa_id, created_at desc);
create index idx_mov_log_entidad on movimiento_log(entidad, entidad_id);

-- Bloquear UPDATE y DELETE — el log es sagrado
revoke update, delete on movimiento_log from public;

create or replace function trg_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'movimiento_log es inmutable: % no permitido', TG_OP;
end;
$$;

create trigger log_no_update before update on movimiento_log
  for each row execute function trg_log_immutable();
create trigger log_no_delete before delete on movimiento_log
  for each row execute function trg_log_immutable();

alter table movimiento_log enable row level security;
create policy movimiento_log_tenant on movimiento_log
  for select using (empresa_id in (select current_empresa_ids()));

-- =====================================================================
-- 8. Comprobantes de pago (CI/CE) — cabecera del asiento exportable a Contai
-- =====================================================================

create table comprobante_pago (
  id                bigserial primary key,
  empresa_id        bigint not null references empresas(id) on delete cascade,
  movimiento_id     bigint not null unique references movimiento_bancario(id) on delete restrict,
  tipo              text not null check (tipo in ('CI','CE')),  -- Comprobante Ingreso / Egreso
  consecutivo       bigint not null,
  fecha             date not null,
  tercero_id        bigint,                                     -- FK a terceros cuando exista
  concepto_general  text not null,
  valor_bruto       numeric(18,2) not null,
  valor_retenciones numeric(18,2) not null default 0,
  valor_gmf         numeric(18,2) not null default 0,
  valor_comision    numeric(18,2) not null default 0,
  valor_neto        numeric(18,2) not null,                     -- = |monto_bancario|
  estado            text not null default 'BORRADOR'
                      check (estado in ('BORRADOR','LISTO','EXPORTADO','ANULADO')),
  exportado_at      timestamptz,
  exportado_lote_id bigint,                                     -- FK a export_lote cuando exista
  ficha_17_ok       boolean,
  ficha_17_errores  jsonb,
  created_at        timestamptz not null default now(),
  unique (empresa_id, tipo, consecutivo)
);

alter table comprobante_pago enable row level security;
create policy comprobante_pago_tenant on comprobante_pago
  using (empresa_id in (select current_empresa_ids()));

-- =====================================================================
-- 9. Learning Engine — patrones por regex sobre descripción del banco
-- =====================================================================

create table patron_movimiento (
  id                    bigserial primary key,
  empresa_id            bigint not null references empresas(id) on delete cascade,
  cuenta_bancaria_id    bigint references cuenta_bancaria(id) on delete cascade,   -- null = todas
  patron_regex          text not null,                          -- '^PSE\s+FACTURA\s+.*XYZ.*'
  tercero_id_sugerido   bigint,
  concepto_sugerido     text,
  cuenta_puc_sugerida   text,
  centro_costo_sugerido text,
  hits                  int not null default 0,
  aciertos              int not null default 0,
  confianza             numeric(4,3) generated always as
                          ((aciertos + 1.0) / (hits + 2.0)) stored,  -- Laplace-smoothed
  prioridad             int not null default 100,
  activo                boolean not null default true,
  created_at            timestamptz not null default now()
);

create index idx_patron_empresa_prio on patron_movimiento(empresa_id, prioridad desc)
  where activo;

alter table patron_movimiento enable row level security;
create policy patron_movimiento_tenant on patron_movimiento
  using (empresa_id in (select current_empresa_ids()));

-- Historia de pagos por tercero (para el matcher por historia)
create table patron_historico_pago_tercero (
  id           bigserial primary key,
  empresa_id   bigint not null references empresas(id) on delete cascade,
  tercero_id   bigint not null,
  cuenta_puc   text not null,
  centro_costo text,
  concepto     text not null,
  veces_usado  int not null default 0,
  ultimo_uso   date,
  unique (empresa_id, tercero_id, cuenta_puc, centro_costo, concepto)
);

alter table patron_historico_pago_tercero enable row level security;
create policy patron_historico_tenant on patron_historico_pago_tercero
  using (empresa_id in (select current_empresa_ids()));

-- =====================================================================
-- 10. Vista de tesorería en vivo (para el Panel general)
-- =====================================================================

create or replace view vw_tesoreria as
select
  cb.empresa_id,
  cb.id            as cuenta_bancaria_id,
  cb.banco,
  cb.numero_cuenta,
  cb.tipo,
  (select saldo_despues
     from movimiento_bancario m
    where m.cuenta_bancaria_id = cb.id
    order by fecha_movimiento desc, id desc
    limit 1
  ) as saldo_actual,
  count(m.id) filter (where m.estado_conciliacion in ('PENDIENTE','PARCIAL'))
    as movimientos_pendientes,
  count(m.id) filter (where m.estado_conciliacion in ('PENDIENTE','PARCIAL')
                        and m.fecha_movimiento < current_date - 30)
    as pendientes_criticos
from cuenta_bancaria cb
left join movimiento_bancario m on m.cuenta_bancaria_id = cb.id
group by cb.empresa_id, cb.id, cb.banco, cb.numero_cuenta, cb.tipo;

-- =====================================================================
-- 11. Parámetros del módulo (por empresa)
-- =====================================================================

create table conciliacion_config (
  empresa_id                    bigint primary key references empresas(id) on delete cascade,
  tolerancia_cop                numeric(10,2) not null default 1.00,
  ventana_dias_match            int not null default 15,
  auto_match_confianza_min      numeric(4,3) not null default 0.90,
  dias_mora_critico             int not null default 30,
  gmf_tarifa                    numeric(6,4) not null default 0.004,
  gmf_cuenta_puc                text not null default '530525',
  comision_cuenta_puc_default   text not null default '530595',
  uvt_valor                     numeric(12,2) not null default 49799.00,   -- UVT 2026
  retefuente_tope_compras_uvt   int not null default 27,
  updated_at                    timestamptz not null default now()
);

alter table conciliacion_config enable row level security;
create policy conciliacion_config_tenant on conciliacion_config
  using (empresa_id in (select current_empresa_ids()));

-- =====================================================================
-- Fin del Módulo 10 · Conciliación Bancaria
-- Siguiente paso sugerido:
--   0003_documentos_terceros.sql — tablas `documentos` y `terceros`
--                                   (para completar los FK diferidos aquí)
--   0004_learning_engine_rpc.sql  — funciones api.sugerir_conciliacion,
--                                   api.aprender_patron, api.regla_masiva
--   0005_export_contai.sql        — plantillas 0001/0002/0003 + workers
-- =====================================================================
