-- =============================================================================
-- RASCUNHO — Fase 3 (cutover). Só rodar DEPOIS de:
--   1) todos os alunos e o admin existirem em auth.users (script de importação);
--   2) o front novo (Supabase Auth) estar publicado e validado;
--   3) a matriz de testes de RLS (docs/migracao-supabase-auth-rls.md §7) passar.
-- A partir daqui a chave anônima deixa de ler/escrever qualquer dado.
-- =============================================================================

begin;

-- 1. Remove o acesso anônimo
drop policy if exists legacy_anon_all     on public.perfis;
drop policy if exists legacy_anon_all     on public.inscricoes;
drop policy if exists legacy_anon_all     on public.cursos;
drop policy if exists legacy_anon_all     on public.modulos;
drop policy if exists legacy_anon_all     on public.aulas;
drop policy if exists legacy_anon_all     on public.progresso;
drop policy if exists legacy_anon_all     on public.configuracoes;
drop policy if exists legacy_anon_covers  on storage.objects;

-- 2. Perfil passa a ser 1:1 com o usuário do Auth
alter table public.perfis
  add constraint perfis_id_fkey foreign key (id) references auth.users(id) on delete cascade;

-- 3. Fim das senhas em texto puro
alter table public.perfis drop column if exists senha;

commit;

-- Depois do cutover:
--  - rotacionar a anon key e a service_role (Settings > API) e atualizar o deploy;
--  - remover VITE_ADMIN_MASTER_PASSWORD, src/lib/adminAuth.js e o login por localStorage.
