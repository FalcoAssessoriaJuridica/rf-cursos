-- Comunidade MAC (Ministério Adoradores de Cristo): espaços por instrumento, mural do professor e envios privados de vídeo.
-- Fase 1 do docs/comunidade-mac-plano.md: tabelas, regras de acesso (RLS) e entrada por código. Rodar no SQL Editor do Supabase. Reexecutável.
--
-- Quem é quem: o professor é o admin do app (is_admin()). Membro é quem entrou com o código da comunidade.
-- Privacidade: um envio de vídeo só é visto pelo aluno que o mandou e pelo admin. Nenhum membro vê envio de outro.

-- 1) Tabelas ----------------------------------------------------------------------------------------------------------
create table if not exists public.comunidades (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,
  nome      text not null,
  ativa     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- O código de convite fica à parte para que nenhum membro consiga lê-lo (só o admin).
create table if not exists public.comunidade_codigos (
  comunidade_id uuid primary key references public.comunidades(id) on delete cascade,
  codigo        text not null,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.comunidade_membros (
  comunidade_id uuid not null references public.comunidades(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  papel         text not null default 'membro' check (papel in ('membro', 'professor')),
  status        text not null default 'ativo'  check (status in ('ativo', 'bloqueado')),
  entrou_em     timestamptz not null default now(),
  primary key (comunidade_id, user_id)
);
create index if not exists comunidade_membros_user_idx on public.comunidade_membros (user_id);

create table if not exists public.comunidade_espacos (
  id            uuid primary key default gen_random_uuid(),
  comunidade_id uuid not null references public.comunidades(id) on delete cascade,
  nome          text not null,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now()
);
create index if not exists comunidade_espacos_com_idx on public.comunidade_espacos (comunidade_id, ordem);

create table if not exists public.comunidade_posts (
  id             uuid primary key default gen_random_uuid(),
  espaco_id      uuid not null references public.comunidade_espacos(id) on delete cascade,
  autor_id       uuid references auth.users(id) on delete set null,
  titulo         text not null,
  texto          text,
  video_provider text check (video_provider in ('drive', 'bunny')),
  video_ref      text,        -- id do arquivo no Drive (ou do vídeo no Bunny, no futuro)
  pdf_ref        text,        -- id do PDF no Drive
  partitura_id   uuid references public.partituras(id) on delete set null,
  criado_em      timestamptz not null default now()
);
create index if not exists comunidade_posts_espaco_idx on public.comunidade_posts (espaco_id, criado_em desc);

create table if not exists public.comunidade_envios (
  id             uuid primary key default gen_random_uuid(),
  espaco_id      uuid not null references public.comunidade_espacos(id) on delete cascade,
  aluno_id       uuid not null references auth.users(id) on delete cascade,
  video_provider text not null check (video_provider in ('drive', 'bunny')),
  video_ref      text not null,
  duracao_s      integer check (duracao_s is null or duracao_s between 1 and 600),
  tamanho_bytes  bigint  check (tamanho_bytes is null or tamanho_bytes between 1 and 157286400),   -- 150 MB
  mensagem       text check (mensagem is null or char_length(mensagem) <= 1000),
  status         text not null default 'novo' check (status in ('novo', 'respondido')),
  guardar        boolean not null default false,        -- o professor marca para o envio não expirar
  expira_em      timestamptz not null default (now() + interval '90 days'),
  criado_em      timestamptz not null default now()
);
create index if not exists comunidade_envios_espaco_idx on public.comunidade_envios (espaco_id, status, criado_em desc);
create index if not exists comunidade_envios_aluno_idx  on public.comunidade_envios (aluno_id, criado_em desc);
create index if not exists comunidade_envios_expira_idx on public.comunidade_envios (expira_em) where not guardar;

create table if not exists public.comunidade_respostas (
  id        uuid primary key default gen_random_uuid(),
  envio_id  uuid not null references public.comunidade_envios(id) on delete cascade,
  autor_id  uuid references auth.users(id) on delete set null,
  texto     text not null check (char_length(texto) between 1 and 2000),
  video_ref text,
  criado_em timestamptz not null default now()
);
create index if not exists comunidade_respostas_envio_idx on public.comunidade_respostas (envio_id, criado_em);

-- Tentativas de código errado (limite contra tentativa e erro).
create table if not exists public.comunidade_tentativas (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  em      timestamptz not null default now()
);
create index if not exists comunidade_tentativas_user_idx on public.comunidade_tentativas (user_id, em desc);

-- 2) Funções de apoio -------------------------------------------------------------------------------------------------
-- O usuário logado é membro ativo dessa comunidade (ou admin)?
create or replace function public.comunidade_membro(p_comunidade uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.comunidade_membros m
    join public.comunidades c on c.id = m.comunidade_id and c.ativa
    where m.comunidade_id = p_comunidade and m.user_id = auth.uid() and m.status = 'ativo'
  );
$$;

-- O espaço pertence a uma comunidade da qual o usuário é membro ativo (ou admin)?
create or replace function public.comunidade_espaco_membro(p_espaco uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.comunidade_espacos e
    where e.id = p_espaco and public.comunidade_membro(e.comunidade_id)
  );
$$;

-- Entrada pelo código: cria a participação do usuário logado. Devolve a comunidade (zero linhas = código inválido). Limite: 10 erros por hora.
create or replace function public.comunidade_entrar(p_codigo text)
returns table (id uuid, slug text, nome text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cod  text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_com  uuid;
begin
  if v_user is null then raise exception 'login necessário' using errcode = '28000'; end if;
  if (select count(*) from public.comunidade_tentativas t where t.user_id = v_user and t.em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitas tentativas. Tente de novo mais tarde.' using errcode = '53400';
  end if;

  select c.id into v_com
  from public.comunidade_codigos k
  join public.comunidades c on c.id = k.comunidade_id and c.ativa
  where k.ativo and upper(regexp_replace(k.codigo, '[^A-Za-z0-9]', '', 'g')) = v_cod and v_cod <> ''
  limit 1;

  if v_com is null then
    -- sem "raise": o erro desfaria o registro da tentativa. Devolve zero linhas = código inválido.
    insert into public.comunidade_tentativas (user_id) values (v_user);
    return;
  end if;

  -- não reativa quem o professor bloqueou
  insert into public.comunidade_membros (comunidade_id, user_id) values (v_com, v_user)
  on conflict (comunidade_id, user_id) do nothing;
  if exists (select 1 from public.comunidade_membros m where m.comunidade_id = v_com and m.user_id = v_user and m.status = 'bloqueado') then
    raise exception 'Seu acesso a esta comunidade está bloqueado. Fale com o professor.' using errcode = '42501';
  end if;

  return query select c.id, c.slug, c.nome from public.comunidades c where c.id = v_com;
end;
$$;

revoke all on function public.comunidade_membro(uuid), public.comunidade_espaco_membro(uuid), public.comunidade_entrar(text) from public, anon;
grant execute on function public.comunidade_membro(uuid), public.comunidade_espaco_membro(uuid), public.comunidade_entrar(text) to authenticated;

-- 3) Regras de acesso (RLS) -------------------------------------------------------------------------------------------
alter table public.comunidades          enable row level security;
alter table public.comunidade_codigos   enable row level security;
alter table public.comunidade_membros   enable row level security;
alter table public.comunidade_espacos   enable row level security;
alter table public.comunidade_posts     enable row level security;
alter table public.comunidade_envios    enable row level security;
alter table public.comunidade_respostas enable row level security;
alter table public.comunidade_tentativas enable row level security;   -- sem política: só as funções acima mexem

-- comunidades: membro lê a sua; admin tudo
drop policy if exists comunidades_ler on public.comunidades;
create policy comunidades_ler on public.comunidades for select to authenticated using (public.comunidade_membro(id));
drop policy if exists comunidades_admin on public.comunidades;
create policy comunidades_admin on public.comunidades for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- código: só o admin
drop policy if exists comunidade_codigos_admin on public.comunidade_codigos;
create policy comunidade_codigos_admin on public.comunidade_codigos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- membros: cada um lê a própria linha; admin gerencia. Ninguém entra por insert direto (só pela função comunidade_entrar).
drop policy if exists comunidade_membros_ler on public.comunidade_membros;
create policy comunidade_membros_ler on public.comunidade_membros for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists comunidade_membros_admin on public.comunidade_membros;
create policy comunidade_membros_admin on public.comunidade_membros for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- espaços e mural: membros leem; só admin escreve
drop policy if exists comunidade_espacos_ler on public.comunidade_espacos;
create policy comunidade_espacos_ler on public.comunidade_espacos for select to authenticated using (public.comunidade_membro(comunidade_id));
drop policy if exists comunidade_espacos_admin on public.comunidade_espacos;
create policy comunidade_espacos_admin on public.comunidade_espacos for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists comunidade_posts_ler on public.comunidade_posts;
create policy comunidade_posts_ler on public.comunidade_posts for select to authenticated using (public.comunidade_espaco_membro(espaco_id));
drop policy if exists comunidade_posts_admin on public.comunidade_posts;
create policy comunidade_posts_admin on public.comunidade_posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- envios: o aluno lê/cria/apaga só os dele (sendo membro); admin lê e altera tudo
drop policy if exists comunidade_envios_ler on public.comunidade_envios;
create policy comunidade_envios_ler on public.comunidade_envios for select to authenticated
  using (public.is_admin() or (aluno_id = auth.uid() and public.comunidade_espaco_membro(espaco_id)));
drop policy if exists comunidade_envios_criar on public.comunidade_envios;
create policy comunidade_envios_criar on public.comunidade_envios for insert to authenticated
  with check (aluno_id = auth.uid() and status = 'novo' and not guardar and public.comunidade_espaco_membro(espaco_id));
drop policy if exists comunidade_envios_apagar on public.comunidade_envios;
create policy comunidade_envios_apagar on public.comunidade_envios for delete to authenticated
  using (public.is_admin() or aluno_id = auth.uid());
drop policy if exists comunidade_envios_admin_alterar on public.comunidade_envios;
create policy comunidade_envios_admin_alterar on public.comunidade_envios for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- respostas: lê o dono do envio e o admin; só o admin escreve
drop policy if exists comunidade_respostas_ler on public.comunidade_respostas;
create policy comunidade_respostas_ler on public.comunidade_respostas for select to authenticated
  using (public.is_admin() or exists (select 1 from public.comunidade_envios v where v.id = envio_id and v.aluno_id = auth.uid()));
drop policy if exists comunidade_respostas_admin on public.comunidade_respostas;
create policy comunidade_respostas_admin on public.comunidade_respostas for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Permissões das tabelas: o visitante sem login (anon) não toca em nada; quem decide o resto é a RLS acima.
revoke all on public.comunidades, public.comunidade_codigos, public.comunidade_membros, public.comunidade_espacos,
  public.comunidade_posts, public.comunidade_envios, public.comunidade_respostas, public.comunidade_tentativas from anon, authenticated;
grant select, insert, update, delete on public.comunidades, public.comunidade_codigos, public.comunidade_membros, public.comunidade_espacos,
  public.comunidade_posts, public.comunidade_envios, public.comunidade_respostas to authenticated;

-- 4) Dados iniciais: a Comunidade MAC, um espaço de Teclado e um código de convite aleatório (o admin lê em comunidade_codigos) ----------
insert into public.comunidades (slug, nome) values ('mac', 'Comunidade MAC') on conflict (slug) do nothing;
insert into public.comunidade_codigos (comunidade_id, codigo)
  select c.id, 'MAC-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)) from public.comunidades c where c.slug = 'mac'
  on conflict (comunidade_id) do nothing;
insert into public.comunidade_espacos (comunidade_id, nome, ordem)
  select c.id, 'Teclado', 1 from public.comunidades c
  where c.slug = 'mac' and not exists (select 1 from public.comunidade_espacos e where e.comunidade_id = c.id);
