-- Controle de uso do leitor de partituras (OMR): cada bilhete emitido pela função omr-convert conta 1 uso do usuário.
-- Gravado só pela função (service_role). Reexecutável.
create table if not exists public.omr_uso (
  id bigint generated always as identity primary key,
  usuario_id uuid not null,            -- sem FK de propósito: o administrador não tem linha em perfis
  criado_em timestamptz not null default now()
);
create index if not exists omr_uso_idx on public.omr_uso (usuario_id, criado_em);
alter table public.omr_uso enable row level security;   -- sem políticas: ninguém lê/escreve pelo navegador
