-- Regras de acesso (RLS) do acervo de partituras e da sincronia com o vídeo. Rodar junto do 0001 (depois dele).
--
-- Aluno: lê a partitura SOMENTE se ela estiver ligada a um curso a que ele tem acesso ativo (matrícula não bloqueada e no prazo),
--        e os vínculos desses cursos. Não vê pastas, nem partituras de outros cursos, e não escreve nada.
-- Admin: lê e escreve tudo.
-- Enquanto as políticas legacy_anon_* existirem (até o cutover, 0002), o app atual segue funcionando como antes.

create or replace function public.has_score_access(p_partitura uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.partitura_vinculos v
    where v.partitura_id = p_partitura and public.has_course_access(v.curso_id)
  );
$$;
revoke all on function public.has_score_access(uuid) from public;
grant execute on function public.has_score_access(uuid) to authenticated, anon;

alter table public.partituras         enable row level security;
alter table public.partitura_pastas   enable row level security;
alter table public.partitura_vinculos enable row level security;

drop policy if exists partituras_select on public.partituras;
create policy partituras_select on public.partituras for select to authenticated using (public.has_score_access(id));
drop policy if exists partituras_admin_write on public.partituras;
create policy partituras_admin_write on public.partituras for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists vinculos_select on public.partitura_vinculos;
create policy vinculos_select on public.partitura_vinculos for select to authenticated using (public.has_course_access(curso_id));
drop policy if exists vinculos_admin_write on public.partitura_vinculos;
create policy vinculos_admin_write on public.partitura_vinculos for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists pastas_admin on public.partitura_pastas;
create policy pastas_admin on public.partitura_pastas for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- As políticas transitórias dos SQLs 0005, 0006 e 0007 valiam também para usuários logados ("anon, authenticated"), o que anularia as regras
-- acima. Passam a valer só para a chave anônima (como nas demais tabelas), até o cutover.
drop policy if exists partituras_legacy_anon_all on public.partituras;
create policy partituras_legacy_anon_all on public.partituras for all to anon using (true) with check (true);
drop policy if exists partitura_pastas_legacy_anon_all on public.partitura_pastas;
create policy partitura_pastas_legacy_anon_all on public.partitura_pastas for all to anon using (true) with check (true);
drop policy if exists partitura_vinculos_legacy_anon_all on public.partitura_vinculos;
create policy partitura_vinculos_legacy_anon_all on public.partitura_vinculos for all to anon using (true) with check (true);

-- no cutover (0002) também saem as políticas transitórias destas três tabelas:
--   partituras_legacy_anon_all, partitura_pastas_legacy_anon_all, partitura_vinculos_legacy_anon_all
