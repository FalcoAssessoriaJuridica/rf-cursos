-- =============================================================================
-- Fase 4 (cutover). SÓ RODAR DEPOIS de:
--   1) todos os alunos e o admin existirem em auth.users (scripts/import-auth-users.mjs);
--   2) o front novo (Supabase Auth) estar publicado e validado com contas reais;
--   3) a matriz de testes de RLS passar (supabase/local-test/rls_matrix.sql, ensaiada no Supabase local).
-- A partir daqui a chave anônima deixa de ler/escrever qualquer dado, e o front ANTIGO (login por senha em texto) para de funcionar.
-- Antes: backup (supabase/local-test/backup-producao.mjs). Reexecutável.
-- =============================================================================

begin;

-- 0. Trava de segurança: não apaga a coluna `senha` se alguém ainda não existe no Auth (ficaria sem como entrar)
do $$
begin
  if exists (select 1 from public.perfis p where not exists (select 1 from auth.users u where u.id = p.id)) then
    raise exception 'Há perfis sem usuário no Auth. Rode a importação (scripts/import-auth-users.mjs) antes do cutover.';
  end if;
end $$;

-- 1. Remove o acesso anônimo (todas as tabelas, inclusive o acervo de partituras)
drop policy if exists legacy_anon_all     on public.perfis;
drop policy if exists legacy_anon_all     on public.inscricoes;
drop policy if exists legacy_anon_all     on public.cursos;
drop policy if exists legacy_anon_all     on public.modulos;
drop policy if exists legacy_anon_all     on public.aulas;
drop policy if exists legacy_anon_all     on public.progresso;
drop policy if exists legacy_anon_all     on public.configuracoes;
drop policy if exists partituras_legacy_anon_all         on public.partituras;
drop policy if exists partitura_pastas_legacy_anon_all   on public.partitura_pastas;
drop policy if exists partitura_vinculos_legacy_anon_all on public.partitura_vinculos;
drop policy if exists legacy_anon_covers  on storage.objects;

-- 2. Perfil passa a ser 1:1 com o usuário do Auth
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_id_fkey') then
    alter table public.perfis add constraint perfis_id_fkey foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- 3. Fim das senhas em texto puro
alter table public.perfis drop column if exists senha;

commit;

-- Depois do cutover:
--  - rotacionar a anon key e a service_role (Settings > API) e atualizar o deploy;
--  - apagar os backups com senhas e este histórico de comandos; remover VITE_ADMIN_MASTER_PASSWORD do ambiente.
