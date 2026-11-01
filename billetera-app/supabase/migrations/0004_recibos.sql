-- Recibos de pago (PDF o foto) adjuntos a los movimientos.
-- Bucket privado «recibos»: cada archivo vive en <user_id>/<movimiento_id>/<archivo> y solo su dueño lo puede ver,
-- subir, cambiar o borrar (RLS sobre storage.objects por la primera carpeta = auth.uid()). Se abren con URL firmada.

alter table public.movimientos add column if not exists recibo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recibos', 'recibos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recibos: ver los propios" on storage.objects;
drop policy if exists "recibos: subir los propios" on storage.objects;
drop policy if exists "recibos: cambiar los propios" on storage.objects;
drop policy if exists "recibos: borrar los propios" on storage.objects;

create policy "recibos: ver los propios" on storage.objects for select to authenticated
  using (bucket_id = 'recibos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recibos: subir los propios" on storage.objects for insert to authenticated
  with check (bucket_id = 'recibos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recibos: cambiar los propios" on storage.objects for update to authenticated
  using (bucket_id = 'recibos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'recibos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recibos: borrar los propios" on storage.objects for delete to authenticated
  using (bucket_id = 'recibos' and (storage.foldername(name))[1] = (select auth.uid())::text);
