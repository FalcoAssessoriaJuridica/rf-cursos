-- Comunidade MAC, fase 3: o `drive-proxy` passa a entregar também o PDF de uma publicação do mural, só a quem é membro ativo da comunidade
-- (ou admin). Mantém as regras anteriores das aulas (migração 0009). Exige 0017 aplicado. Reexecutável.

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
      or exists (
        select 1 from public.comunidade_posts p
        where p.pdf_ref = p_id and public.comunidade_espaco_membro(p.espaco_id)
      )
    );
$$;

revoke all on function public.drive_file_allowed(text) from public, anon;
grant execute on function public.drive_file_allowed(text) to authenticated;
