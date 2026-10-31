-- ============================================================
-- Cierra el acceso público al módulo Actividades y a las vistas
-- SECURITY DEFINER (auditoría 2026-10-31).
--
-- Antes: cualquiera con la anon key (va en el JS del sitio) podía leer
-- todas las boletas con nombres de socios, marcarlas pagadas/ganadoras y
-- crear actividades; vw_dependencia_socio y vw_actividades_resumen
-- saltaban el RLS.
--
-- Después (decisión 2026-10-31: por ahora solo tesorería tiene acceso):
--   · lee y escribe → natillera_puede_escribir() (rol admin o tesorero en natillera_usuarios)
--   · anon          → nada
-- Cuando entren los socios, cambiar el SELECT a natillera_es_usuario() o a
-- un filtro por socio, según se decida.
--
-- Idempotente. Todo en una transacción: si algo falla, no cambia nada.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1 · actividades / actividad_boletas
-- ------------------------------------------------------------
ALTER TABLE public.actividades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actividad_boletas ENABLE ROW LEVEL SECURITY;

-- Fuera las políticas públicas de supabase-actividades.sql
DROP POLICY IF EXISTS "lectura publica actividades"   ON public.actividades;
DROP POLICY IF EXISTS "escritura publica actividades" ON public.actividades;
DROP POLICY IF EXISTS "update publica actividades"    ON public.actividades;
DROP POLICY IF EXISTS "lectura publica act_boletas"   ON public.actividad_boletas;
DROP POLICY IF EXISTS "escritura publica act_boletas" ON public.actividad_boletas;
DROP POLICY IF EXISTS "update publica act_boletas"    ON public.actividad_boletas;

-- Mismas 4 políticas (y misma convención de nombres) que socios, transacciones, etc.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['actividades', 'actividad_boletas']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_natillera', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_natillera', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_natillera', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_natillera', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.natillera_puede_escribir())',
                   t || '_select_natillera', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.natillera_puede_escribir())',
                   t || '_insert_natillera', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.natillera_puede_escribir()) WITH CHECK (public.natillera_puede_escribir())',
                   t || '_update_natillera', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.natillera_puede_escribir())',
                   t || '_delete_natillera', t);

    -- Defensa en profundidad: anon sin ningún privilegio sobre la tabla.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2 · Vistas: que respeten el RLS de quien consulta
-- ------------------------------------------------------------
ALTER VIEW public.vw_actividades_resumen SET (security_invoker = true);
ALTER VIEW public.vw_dependencia_socio   SET (security_invoker = true);

-- anon fuera de todas las vistas vw_* (las demás ya filtraban por RLS,
-- pero no tiene por qué verlas).
DO $$
DECLARE v text;
BEGIN
  FOR v IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname LIKE 'vw\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Verificación (correr después; no cambia nada)
-- ------------------------------------------------------------
-- 1) No debe quedar ninguna política para el rol public / anon:
--    SELECT tablename, policyname, roles FROM pg_policies
--    WHERE schemaname = 'public' AND tablename IN ('actividades','actividad_boletas');
-- 2) Ninguna vista sin security_invoker:
--    SELECT relname, reloptions FROM pg_class
--    WHERE relnamespace = 'public'::regnamespace AND relkind = 'v';
-- 3) anon sin privilegios:
--    SELECT table_name, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND grantee = 'anon'
--      AND table_name IN ('actividades','actividad_boletas','vw_actividades_resumen','vw_dependencia_socio');
