-- =============================================================================
-- RASCUNHO — NÃO APLICAR sem conferir o schema real (tipos, nomes, RLS atual).
-- Fase 1 (preparação): cria funções, liga RLS e define as políticas novas, mantendo
-- políticas "legacy" para o papel `anon`, de modo que o app ATUAL continue funcionando
-- até o front novo (Supabase Auth) ser publicado. Tudo é reversível (ver ROLLBACK ao final).
-- Premissas: ids são uuid; inscricoes.data_expiracao é date/timestamptz; status ∈ ('ativo','bloqueado').
-- =============================================================================

begin;

-- ── 0. Funções auxiliares (security definer: evitam recursão de RLS entre tabelas) ──────────

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- Acesso ativo a um curso: admin, ou matrícula não bloqueada e dentro do prazo.
-- O bloqueio manual e a expiração passam a valer NO BANCO, a cada consulta.
create or replace function public.has_course_access(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.inscricoes i
    where i.curso_id = p_curso
      and i.perfil_id = auth.uid()
      and i.status is distinct from 'bloqueado'
      and (i.data_expiracao is null or i.data_expiracao::timestamptz > now())
  );
$$;

create or replace function public.has_lesson_access(p_aula uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.aulas a
    join public.modulos m on m.id = a.modulo_id
    where a.id = p_aula and public.has_course_access(m.curso_id)
  );
$$;

revoke all on function public.is_admin(), public.has_course_access(uuid), public.has_lesson_access(uuid) from public;
grant execute on function public.is_admin(), public.has_course_access(uuid), public.has_lesson_access(uuid) to authenticated, anon;

-- ── 1. Liga RLS em todas as tabelas ──────────────────────────────────────────────────────────

alter table public.perfis         enable row level security;
alter table public.inscricoes     enable row level security;
alter table public.cursos         enable row level security;
alter table public.modulos        enable row level security;
alter table public.aulas          enable row level security;
alter table public.progresso      enable row level security;
alter table public.configuracoes  enable row level security;

-- ── 2. Políticas novas (papel `authenticated`) ───────────────────────────────────────────────

-- perfis: cada pessoa lê o próprio; admin lê/escreve todos. Aluno só edita nome/telefone.
create policy perfis_select on public.perfis for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy perfis_update_own on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy perfis_admin_write on public.perfis for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke update on public.perfis from authenticated;
grant  update (nome_completo, telefone) on public.perfis to authenticated;

-- inscricoes: aluno só lê as próprias; só admin cria/altera/remove (status e expiração!)
create policy inscricoes_select on public.inscricoes for select to authenticated
  using (perfil_id = auth.uid() or public.is_admin());
create policy inscricoes_admin_write on public.inscricoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- cursos / modulos / aulas: só quem tem acesso ativo ao curso (inclui URLs de vídeo e materiais)
create policy cursos_select on public.cursos for select to authenticated
  using (public.has_course_access(id));
create policy cursos_admin_write on public.cursos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy modulos_select on public.modulos for select to authenticated
  using (public.has_course_access(curso_id));
create policy modulos_admin_write on public.modulos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy aulas_select on public.aulas for select to authenticated
  using (public.has_lesson_access(id));
create policy aulas_admin_write on public.aulas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- progresso: o aluno lê/grava só o próprio e só de aulas a que ainda tem acesso
create policy progresso_select on public.progresso for select to authenticated
  using (perfil_id = auth.uid() or public.is_admin());
create policy progresso_insert_own on public.progresso for insert to authenticated
  with check (perfil_id = auth.uid() and public.has_lesson_access(aula_id));
create policy progresso_update_own on public.progresso for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and public.has_lesson_access(aula_id));
create policy progresso_admin_delete on public.progresso for delete to authenticated
  using (public.is_admin());

-- configuracoes: somente admin
create policy configuracoes_admin on public.configuracoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── 3. Storage (capas): leitura pública, escrita só admin ────────────────────────────────────

create policy covers_read on storage.objects for select
  using (bucket_id = 'course-covers');
create policy covers_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'course-covers' and public.is_admin());
create policy covers_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'course-covers' and public.is_admin());
create policy covers_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'course-covers' and public.is_admin());

-- ── 4. TRANSITÓRIO: políticas legacy para `anon` (app atual segue igual até o cutover) ──────
-- Removidas em 0002. Enquanto existirem, a segurança AINDA NÃO está ativa.

create policy legacy_anon_all on public.perfis        for all to anon using (true) with check (true);
create policy legacy_anon_all on public.inscricoes    for all to anon using (true) with check (true);
create policy legacy_anon_all on public.cursos        for all to anon using (true) with check (true);
create policy legacy_anon_all on public.modulos       for all to anon using (true) with check (true);
create policy legacy_anon_all on public.aulas         for all to anon using (true) with check (true);
create policy legacy_anon_all on public.progresso     for all to anon using (true) with check (true);
create policy legacy_anon_all on public.configuracoes for all to anon using (true) with check (true);
create policy legacy_anon_covers on storage.objects   for all to anon using (bucket_id = 'course-covers') with check (bucket_id = 'course-covers');

-- Coluna opcional para o zoom da capa (já criada manualmente; mantida idempotente)
alter table public.cursos add column if not exists capa_zoom numeric default 1;

commit;

-- ROLLBACK da fase 1 (se necessário):
--   drop policy ... (as de 2 e 3) ; alter table ... disable row level security ; drop function ...
