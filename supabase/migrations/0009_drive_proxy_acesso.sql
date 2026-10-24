-- Regra usada pela função `drive-proxy`: o arquivo do Google Drive só é entregue a quem tem acesso a uma aula que o referencia.
-- Roda como o próprio usuário (JWT dele): auth.uid() / is_admin() / has_lesson_access() valem como nas demais regras.
-- Reexecutável.

create or replace function public.drive_file_allowed(p_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_id ~ '^[A-Za-z0-9_-]{10,}$'
    and (
      public.is_admin()
      or exists (
        select 1 from public.aulas a
        where public.has_lesson_access(a.id)
          and (
            coalesce(a.materiais_pdf::text, '')   like '%' || p_id || '%'
            or coalesce(a.materiais_audio::text, '') like '%' || p_id || '%'
            or coalesce(a.materiais_pdf_url, '')   like '%' || p_id || '%'
            or coalesce(a.materiais_audio_url, '') like '%' || p_id || '%'
          )
      )
    );
$$;

-- só quem está logado; o visitante sem login (anon) não chama
revoke all on function public.drive_file_allowed(text) from public, anon;
grant execute on function public.drive_file_allowed(text) to authenticated;
