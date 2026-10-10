-- ============================================================
-- Acceso por socio a la natillera (Supabase)
--
-- Ejecutar en Supabase → SQL Editor → New query, DESPUÉS de
-- supabase-vistas.sql. Es idempotente: se puede correr varias veces.
--
-- Qué hace:
--   1. Crea perfiles_natillera: une cada usuario de Supabase Auth con su
--      socio y su rol ('admin' o 'socio'). Las cuentas las crea
--      crear-accesos.js (cédula + PIN); nunca se crean desde el navegador.
--   2. Reemplaza las políticas públicas de supabase-vistas.sql (que dejaban
--      leer y borrar a cualquiera con la anon key) por:
--        · admin  → todo
--        · socio  → solo lectura de SUS filas
--        · anónimo → nada
--   3. Hace que las vistas vw_* respeten RLS (security_invoker).
--   4. Expone nat_totales_generales(): totales de la natillera sin nombres,
--      para que el socio vea cómo va el fondo común.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Perfiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perfiles_natillera (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  socio_id   integer REFERENCES public.socios(id) ON DELETE SET NULL,
  rol        text NOT NULL DEFAULT 'socio' CHECK (rol IN ('admin', 'socio')),
  cedula     text NOT NULL UNIQUE,
  creado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perfiles_natillera_socio ON public.perfiles_natillera(socio_id);

-- Quién es el usuario actual. SECURITY DEFINER para poder leer perfiles
-- dentro de las políticas sin recursión de RLS.
CREATE OR REPLACE FUNCTION public.nat_es_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles_natillera
    WHERE user_id = auth.uid() AND rol = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.nat_socio_id()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT socio_id FROM public.perfiles_natillera WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.nat_es_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nat_socio_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nat_es_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nat_socio_id() TO authenticated;

ALTER TABLE public.perfiles_natillera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perfil propio" ON public.perfiles_natillera;
CREATE POLICY "perfil propio" ON public.perfiles_natillera
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.nat_es_admin());
-- Sin políticas de escritura: los perfiles solo se crean con la service_role
-- (crear-accesos.js), que salta RLS.

-- ------------------------------------------------------------
-- 2 · Políticas de las tablas
-- ------------------------------------------------------------
ALTER TABLE public.socios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periodos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestamos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonos_prestamos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_banco ENABLE ROW LEVEL SECURITY;

-- Fuera las políticas abiertas de supabase-vistas.sql.
DROP POLICY IF EXISTS "lectura publica socios"          ON public.socios;
DROP POLICY IF EXISTS "lectura publica periodos"        ON public.periodos;
DROP POLICY IF EXISTS "lectura publica transacciones"   ON public.transacciones;
DROP POLICY IF EXISTS "lectura publica prestamos"       ON public.prestamos;
DROP POLICY IF EXISTS "lectura publica abonos"          ON public.abonos_prestamos;
DROP POLICY IF EXISTS "lectura publica multas"          ON public.multas;
DROP POLICY IF EXISTS "lectura publica banco"           ON public.movimientos_banco;
DROP POLICY IF EXISTS "escritura publica transacciones" ON public.transacciones;
DROP POLICY IF EXISTS "borrado publico transacciones"   ON public.transacciones;
DROP POLICY IF EXISTS "escritura publica banco"         ON public.movimientos_banco;
DROP POLICY IF EXISTS "update publica banco"            ON public.movimientos_banco;

-- Admin: todo, en todas las tablas.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['socios','periodos','transacciones','prestamos','abonos_prestamos','multas','movimientos_banco']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin todo" ON public.%I', t);
    EXECUTE format('CREATE POLICY "admin todo" ON public.%I FOR ALL TO authenticated USING (public.nat_es_admin()) WITH CHECK (public.nat_es_admin())', t);
  END LOOP;
END $$;

-- Socio: solo lectura de lo suyo.
DROP POLICY IF EXISTS "socio lee su ficha" ON public.socios;
CREATE POLICY "socio lee su ficha" ON public.socios
  FOR SELECT TO authenticated USING (id = public.nat_socio_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transacciones','prestamos','abonos_prestamos','multas']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "socio lee lo suyo" ON public.%I', t);
    EXECUTE format('CREATE POLICY "socio lee lo suyo" ON public.%I FOR SELECT TO authenticated USING (socio_id = public.nat_socio_id())', t);
  END LOOP;
END $$;

-- El calendario del ciclo no es privado.
DROP POLICY IF EXISTS "autenticados leen periodos" ON public.periodos;
CREATE POLICY "autenticados leen periodos" ON public.periodos
  FOR SELECT TO authenticated USING (true);

-- movimientos_banco: solo admin (ya cubierto por "admin todo").

-- Log de auditoría, si existe en este proyecto: solo admin lo lee.
DO $$
BEGIN
  IF to_regclass('public.movimientos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "admin lee auditoria" ON public.movimientos';
    EXECUTE 'CREATE POLICY "admin lee auditoria" ON public.movimientos FOR SELECT TO authenticated USING (public.nat_es_admin())';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3 · Vistas: que respeten el RLS de quien consulta
-- ------------------------------------------------------------
-- Sin esto, una vista corre con los permisos de su dueño y le mostraría
-- al socio las filas de todos.
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['vw_saldo_por_socio','vw_matriz_ahorro','vw_matriz_actividades','vw_totales_globales',
                           'vw_liquidacion_anual','vw_matriz_prestamos','vw_conciliacion_bancaria']
  LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4 · Totales generales (sin nombres) para cualquier socio
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nat_totales_generales()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM perfiles_natillera WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sin acceso a la natillera' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'socios_activos',   (SELECT count(*) FROM socios WHERE tipo = 'persona' AND estado = 'activo'),
    'total_ahorrado',   COALESCE((SELECT sum(valor) FROM transacciones WHERE concepto = 'AHORRO'), 0),
    'total_actividades', COALESCE((SELECT sum(valor) FROM transacciones WHERE concepto IN ('ACTIVIDADES','RIFA_CHANCE')), 0),
    'intereses_cobrados', COALESCE((SELECT sum(valor) FROM transacciones WHERE concepto = 'INTERESES_PRESTAMO'), 0),
    'capital_prestado', COALESCE((
      SELECT sum(p.monto_prestado - COALESCE((SELECT sum(a.capital_pagado) FROM abonos_prestamos a WHERE a.prestamo_id = p.id), 0))
      FROM prestamos p WHERE p.estado = 'activo'), 0),
    'fondo_disponible', COALESCE((SELECT sum(CASE WHEN tipo = 'ingreso' THEN valor ELSE -valor END) FROM transacciones), 0),
    'ultimo_movimiento', (SELECT max(fecha_pago) FROM transacciones)
  ) INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.nat_totales_generales() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nat_totales_generales() TO authenticated;

-- Que la API vea de inmediato los cambios.
NOTIFY pgrst, 'reload schema';
