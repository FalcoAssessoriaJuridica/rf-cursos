-- Esquema base SÓ PARA O ENSAIO LOCAL: reproduz as tabelas que em produção foram criadas à mão (antes das migrações).
-- Reconstruído a partir das colunas que o app usa; não é aplicado em produção.
create extension if not exists pgcrypto;

create table if not exists public.perfis (
  id uuid primary key default gen_random_uuid(),
  nome_completo text, email text, telefone text,
  data_cadastro timestamptz default now(),
  senha text
);
create table if not exists public.cursos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null, descricao text, capa_url text, tipo_acesso text,
  capa_posicao_y int, capa_posicao_x int, capa_zoom numeric default 1
);
create table if not exists public.modulos (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos(id) on delete cascade,
  titulo text, ordem int
);
create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references public.modulos(id) on delete cascade,
  titulo text, url_video_drive text, id_video_profissional text, ordem int,
  materiais_pdf_url text, materiais_audio_url text,
  materiais_pdf jsonb default '[]', materiais_audio jsonb default '[]'
);
create table if not exists public.inscricoes (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  curso_id uuid not null references public.cursos(id) on delete cascade,
  data_expiracao date, status text default 'ativo'
);
create table if not exists public.progresso (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references public.perfis(id) on delete cascade,
  aula_id uuid not null references public.aulas(id) on delete cascade,
  concluida boolean default false, porcentagem_concluida int default 0, segundos_assistidos int default 0,
  unique (perfil_id, aula_id)
);
create table if not exists public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  chave text unique, valor text, descricao text, updated_at timestamptz default now()
);

-- buckets que em produção já existem
insert into storage.buckets (id, name, public) values ('course-covers', 'course-covers', true) on conflict (id) do nothing;
