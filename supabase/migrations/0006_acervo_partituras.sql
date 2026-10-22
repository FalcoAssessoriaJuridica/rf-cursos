-- Acervo central de partituras: pastas + vínculos com cursos e aulas. Rodar no SQL Editor do Supabase (depois do 0005).
--
-- A partitura passa a existir uma única vez no acervo (em uma pasta). Cursos e aulas só APONTAM para ela (partitura_vinculos),
-- então a mesma partitura pode aparecer em vários cursos/aulas sem duplicar arquivo. Excluir um curso ou uma aula remove só o
-- vínculo; a partitura continua no acervo. Idempotente: pode rodar mais de uma vez.

create table if not exists public.partitura_pastas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  pai_id    uuid references public.partitura_pastas(id) on delete cascade,
  ordem     integer not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists partitura_pastas_nome_uq
  on public.partitura_pastas (coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));

alter table public.partituras
  add column if not exists pasta_id  uuid references public.partitura_pastas(id) on delete set null,
  add column if not exists compositor text,
  add column if not exists fonte      text;   -- procedência / licença (ex.: "Domínio público — hymnary.org")
create index if not exists partituras_pasta_idx on public.partituras (pasta_id);

create table if not exists public.partitura_vinculos (
  id           uuid primary key default gen_random_uuid(),
  partitura_id uuid not null references public.partituras(id) on delete cascade,
  curso_id     uuid not null references public.cursos(id) on delete cascade,
  aula_id      uuid references public.aulas(id) on delete cascade,   -- vazio = disponível no curso inteiro
  ordem        integer not null default 0,
  criado_em    timestamptz not null default now()
);
create unique index if not exists partitura_vinculos_uq
  on public.partitura_vinculos (partitura_id, curso_id, coalesce(aula_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists partitura_vinculos_curso_idx on public.partitura_vinculos (curso_id);
create index if not exists partitura_vinculos_aula_idx  on public.partitura_vinculos (aula_id);

-- migra o que já foi cadastrado direto em curso/aula (modelo do 0005) e remove as colunas antigas
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'partituras' and column_name = 'curso_id') then
    insert into public.partitura_vinculos (partitura_id, curso_id, aula_id, ordem)
      select id, curso_id, aula_id, ordem from public.partituras where curso_id is not null
      on conflict do nothing;
    alter table public.partituras drop column curso_id;
    alter table public.partituras drop column if exists aula_id;
  end if;
end $$;

alter table public.partitura_pastas   enable row level security;
alter table public.partitura_vinculos enable row level security;

-- TRANSITÓRIO (igual ao 0005): o app ainda usa a chave anônima. Com Supabase Auth + RLS, o aluno passa a ler só o que está
-- vinculado a cursos em que está matriculado, e só o admin escreve.
drop policy if exists partitura_pastas_legacy_anon_all on public.partitura_pastas;
create policy partitura_pastas_legacy_anon_all on public.partitura_pastas for all to anon, authenticated using (true) with check (true);
drop policy if exists partitura_vinculos_legacy_anon_all on public.partitura_vinculos;
create policy partitura_vinculos_legacy_anon_all on public.partitura_vinculos for all to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
