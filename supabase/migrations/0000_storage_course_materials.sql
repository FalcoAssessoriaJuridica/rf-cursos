-- Bucket para materiais de aula (PDF, DOCX, XLSX, PPTX, ZIP, áudio). Rodar no SQL Editor do Supabase.
-- Sem ele o app usa o bucket de capas (course-covers/materiais/), que pode recusar esses tipos.

insert into storage.buckets (id, name, public, file_size_limit)
values ('course-materials', 'course-materials', true, 52428800)   -- 50 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- TRANSITÓRIO: o app ainda usa a chave anônima (igual às capas). Ao migrar para Supabase Auth + RLS
-- (docs/migracao-supabase-auth-rls.md) estas políticas viram "somente admin escreve".
create policy "materials_read"   on storage.objects for select to anon, authenticated using (bucket_id = 'course-materials');
create policy "materials_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'course-materials');
create policy "materials_update" on storage.objects for update to anon, authenticated using (bucket_id = 'course-materials');
create policy "materials_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'course-materials');
