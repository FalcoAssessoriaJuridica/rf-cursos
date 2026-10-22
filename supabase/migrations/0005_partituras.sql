-- Biblioteca de partituras por curso e por aula. Rodar no SQL Editor do Supabase.
--
-- Uma única tabela serve a TODOS os cursos e aulas (os que já existem e os que forem criados): não há nada para
-- "criar" por curso. Uma partitura de curso tem aula_id vazio; a de aula aponta para a aula. Ao excluir o curso ou a aula,
-- as partituras dela somem junto (on delete cascade). Os arquivos ficam no Storage (course-materials, ou course-covers/materiais).
create table if not exists public.partituras (
  id               uuid primary key default gen_random_uuid(),
  curso_id         uuid not null references public.cursos(id) on delete cascade,
  aula_id          uuid references public.aulas(id) on delete cascade,
  titulo           text not null,
  origem           text not null default 'musicxml' check (origem in ('musicxml', 'pdf')),
  arquivo_url      text not null,   -- MusicXML (.mxl/.musicxml) que o leitor toca
  arquivo_bucket   text,
  arquivo_path     text,
  original_url     text,            -- PDF/imagem de origem (quando a partitura foi lida de um PDF)
  original_bucket  text,
  original_path    text,
  compasso         text,            -- ex.: 3/4 (a leitura de PDF às vezes não reconhece a fórmula de compasso)
  limpar_anotacoes boolean not null default false,  -- remove dinâmicas/ornamentos que a leitura de PDF inventa
  ordem            integer not null default 0,
  criado_em        timestamptz not null default now()
);

create index if not exists partituras_curso_idx on public.partituras (curso_id, ordem);
create index if not exists partituras_aula_idx  on public.partituras (aula_id);

alter table public.partituras enable row level security;

-- TRANSITÓRIO: o app ainda usa a chave anônima, como nas demais tabelas. Ao migrar para Supabase Auth + RLS
-- (docs/migracao-supabase-auth-rls.md) estas políticas viram "aluno lê só os cursos em que está matriculado; só admin escreve".
drop policy if exists partituras_legacy_anon_all on public.partituras;
create policy partituras_legacy_anon_all on public.partituras for all to anon, authenticated using (true) with check (true);
