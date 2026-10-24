-- Pagamentos (Stripe): preços por curso e prazo, assinaturas e log de eventos.
-- O acesso continua sendo decidido pela matrícula (inscricoes.data_expiracao); o webhook do Stripe só renova/encerra essa data.
-- Escrita em assinaturas/stripe_eventos: somente service_role (funções). Reexecutável.

alter table public.perfis add column if not exists stripe_customer_id text;
alter table public.perfis add column if not exists cpf text;   -- só dígitos, validado na função `signup`; o aluno não edita (sem GRANT de update)
create unique index if not exists perfis_cpf_uidx on public.perfis (cpf) where cpf is not null;
alter table public.cursos add column if not exists stripe_product_id text;

-- ── Preços (editados pelo administrador; o price_id é gerado no Stripe pela função `pagamentos`) ──
create table if not exists public.precos_curso (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos(id) on delete cascade,
  prazo text not null check (prazo in ('mensal', 'semestral', 'anual')),   -- mensal = 30 dias
  valor_centavos integer not null check (valor_centavos > 0),
  stripe_price_id text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (curso_id, prazo)
);

-- ── Assinaturas (espelho do Stripe, gravado só pelo webhook) ──
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  curso_id uuid not null references public.cursos(id) on delete cascade,
  prazo text,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null,
  trial_fim timestamptz,
  periodo_fim timestamptz,
  cancela_no_fim boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists assinaturas_perfil_idx on public.assinaturas (perfil_id, curso_id);

-- ── Idempotência do webhook e limite de cadastros por IP ──
create table if not exists public.stripe_eventos (
  id text primary key,
  tipo text,
  recebido_em timestamptz not null default now()
);
-- um teste grátis por cartão (impressão digital do cartão no Stripe)
create table if not exists public.cartoes_teste (
  fingerprint text primary key,
  perfil_id uuid references public.perfis(id) on delete set null,
  stripe_subscription_id text,
  criado_em timestamptz not null default now()
);
create table if not exists public.cadastro_tentativas (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  criado_em timestamptz not null default now()
);
create index if not exists cadastro_tentativas_idx on public.cadastro_tentativas (ip_hash, criado_em);

-- ── RLS ──
alter table public.precos_curso enable row level security;
alter table public.assinaturas enable row level security;
alter table public.stripe_eventos enable row level security;
alter table public.cartoes_teste enable row level security;
alter table public.cadastro_tentativas enable row level security;

drop policy if exists precos_select on public.precos_curso;
create policy precos_select on public.precos_curso for select to authenticated using (ativo or public.is_admin());
drop policy if exists precos_admin_write on public.precos_curso;
create policy precos_admin_write on public.precos_curso for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists assinaturas_select on public.assinaturas;
create policy assinaturas_select on public.assinaturas for select to authenticated
  using (perfil_id = auth.uid() or public.is_admin());
-- sem política de escrita: só o service_role (webhook) grava

-- stripe_eventos, cartoes_teste e cadastro_tentativas: sem nenhuma política (ninguém lê/escreve pelo navegador)

-- ── Catálogo para a página de planos ──
-- O aluno ainda não matriculado não enxerga `cursos` (RLS), então uma função devolve só o que é público + preços ativos.
create or replace function public.catalogo_cursos()
returns table (id uuid, titulo text, descricao text, capa_url text, ativo boolean, trial boolean, precos jsonb)
language sql stable security definer set search_path = public
as $$
  select c.id, c.titulo, c.descricao, c.capa_url,
         public.has_course_access(c.id) as ativo,
         not exists (select 1 from public.assinaturas a where a.perfil_id = auth.uid() and a.curso_id = c.id) as trial,
         (select jsonb_agg(jsonb_build_object('prazo', p.prazo, 'valor_centavos', p.valor_centavos)
                           order by case p.prazo when 'mensal' then 1 when 'semestral' then 2 else 3 end)
            from public.precos_curso p
           where p.curso_id = c.id and p.ativo and p.stripe_price_id is not null) as precos
  from public.cursos c
  where auth.uid() is not null
    and exists (select 1 from public.precos_curso p where p.curso_id = c.id and p.ativo and p.stripe_price_id is not null)
  order by c.titulo;
$$;
revoke all on function public.catalogo_cursos() from public, anon;
grant execute on function public.catalogo_cursos() to authenticated;
