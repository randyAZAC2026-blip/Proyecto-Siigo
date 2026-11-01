-- Optimización de RLS: envolver auth.uid() en (select auth.uid()) para que
-- Postgres lo evalúe una vez por query (initplan) en lugar de por cada fila.
-- Mejora performance al escalar; no cambia el comportamiento. Fix recomendado
-- por el linter de Supabase (auth_rls_initplan).

drop policy "cuentas: owner all" on cuentas;
drop policy "categorias: owner all" on categorias;
drop policy "movimientos: owner all" on movimientos;
drop policy "cuentas_por_pagar: owner all" on cuentas_por_pagar;
drop policy "cuentas_por_cobrar: owner all" on cuentas_por_cobrar;

create policy "cuentas: owner all" on cuentas
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categorias: owner all" on categorias
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "movimientos: owner all" on movimientos
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cuentas_por_pagar: owner all" on cuentas_por_pagar
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cuentas_por_cobrar: owner all" on cuentas_por_cobrar
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
