-- Comunidade MAC, fase 6: consentimento (LGPD) e autorização do responsável para menores de 18 anos. Exige 0017 a 0020. Reexecutável.
--
-- Regras:
--  * Para enviar vídeo, a pessoa precisa ter aceitado o termo vigente (`comunidades.termo_versao`).
--  * Maior de 18 anos: vale o aceite. Menor de 18: informa o responsável (nome, parentesco, contato) e o envio só é liberado quando o
--    professor CONFIRMA a autorização com o responsável. Um menor não consegue se liberar sozinho.
--  * Menor só pode liberar o vídeo para "toda a comunidade" se o responsável autorizou isso de forma expressa.
--  * A pessoa pode retirar o consentimento a qualquer momento (a Edge Function apaga todos os vídeos dela e então grava a retirada).
-- Nada é gravado direto na tabela: tudo passa pelas funções abaixo (security definer), que validam quem chama.

alter table public.comunidades add column if not exists termo_versao text not null default '2026-10-v1';

create table if not exists public.comunidade_consentimentos (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  versao                 text not null,
  maior_de_idade         boolean not null,
  responsavel_nome       text check (responsavel_nome is null or char_length(responsavel_nome) between 2 and 120),
  responsavel_parentesco text check (responsavel_parentesco is null or char_length(responsavel_parentesco) between 2 and 40),
  responsavel_contato    text check (responsavel_contato is null or char_length(responsavel_contato) between 3 and 120),
  autoriza_compartilhar  boolean not null default false,   -- menores: o responsável autoriza o vídeo para toda a comunidade
  confirmada_em          timestamptz,                      -- quando o professor confirmou (menores) ou quando a pessoa aceitou (maiores)
  aceito_em              timestamptz not null default now(),
  revogado_em            timestamptz,
  constraint comunidade_consentimento_menor_ok check (maior_de_idade or (responsavel_nome is not null and responsavel_parentesco is not null and responsavel_contato is not null))
);

alter table public.comunidade_consentimentos enable row level security;
drop policy if exists comunidade_consentimentos_ler on public.comunidade_consentimentos;
create policy comunidade_consentimentos_ler on public.comunidade_consentimentos for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.comunidade_consentimentos from public, anon, authenticated;
grant select on public.comunidade_consentimentos to authenticated;

-- Situação de quem chama: sem_termo | versao_antiga | revogado | aguardando_responsavel | ok
create or replace function public.comunidade_termo_status()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v text; c public.comunidade_consentimentos%rowtype; st text;
begin
  select termo_versao into v from public.comunidades where slug = 'mac';
  select * into c from public.comunidade_consentimentos where user_id = auth.uid();
  if not found then
    st := 'sem_termo';
  elsif c.revogado_em is not null then
    st := 'revogado';
  elsif c.versao <> v then
    st := 'versao_antiga';
  elsif not c.maior_de_idade and c.confirmada_em is null then
    st := 'aguardando_responsavel';
  else
    st := 'ok';
  end if;
  return jsonb_build_object(
    'status', st, 'versao', v,
    'maior_de_idade', c.maior_de_idade,
    'pode_compartilhar', coalesce(c.maior_de_idade or c.autoriza_compartilhar, false),
    'aceito_em', c.aceito_em
  );
end $$;

-- Aceitar o termo vigente. Maior de 18: libera na hora. Menor: fica aguardando a confirmação do professor.
create or replace function public.comunidade_aceitar_termo(
  p_maior boolean, p_resp_nome text default null, p_resp_parentesco text default null, p_resp_contato text default null, p_autoriza_compartilhar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v text; com uuid;
begin
  select id, termo_versao into com, v from public.comunidades where slug = 'mac' and ativa;
  if com is null or not public.comunidade_membro(com) then
    raise exception 'Entre na comunidade com o código antes de aceitar o termo.' using errcode = '42501';
  end if;
  if p_maior is null then raise exception 'Informe se você tem 18 anos ou mais.' using errcode = '22023'; end if;
  if not p_maior and (coalesce(trim(p_resp_nome), '') = '' or coalesce(trim(p_resp_parentesco), '') = '' or coalesce(trim(p_resp_contato), '') = '') then
    raise exception 'Informe o nome, o parentesco e o contato do responsável.' using errcode = '22023';
  end if;

  insert into public.comunidade_consentimentos as c (user_id, versao, maior_de_idade, responsavel_nome, responsavel_parentesco, responsavel_contato, autoriza_compartilhar, confirmada_em, aceito_em, revogado_em)
  values (auth.uid(), v, p_maior,
          case when p_maior then null else trim(p_resp_nome) end,
          case when p_maior then null else trim(p_resp_parentesco) end,
          case when p_maior then null else trim(p_resp_contato) end,
          case when p_maior then true else coalesce(p_autoriza_compartilhar, false) end,
          case when p_maior then now() else null end,
          now(), null)
  on conflict (user_id) do update set
    versao = excluded.versao, maior_de_idade = excluded.maior_de_idade, responsavel_nome = excluded.responsavel_nome,
    responsavel_parentesco = excluded.responsavel_parentesco, responsavel_contato = excluded.responsavel_contato,
    autoriza_compartilhar = excluded.autoriza_compartilhar, confirmada_em = excluded.confirmada_em,
    aceito_em = excluded.aceito_em, revogado_em = null;

  -- Se agora a pessoa não pode compartilhar, os vídeos dela voltam a ser só do professor.
  update public.comunidade_envios set visibilidade = 'professor'
   where aluno_id = auth.uid() and visibilidade = 'comunidade' and not (p_maior or coalesce(p_autoriza_compartilhar, false));

  return public.comunidade_termo_status();
end $$;

-- Retirar o consentimento (a Edge Function apaga os vídeos antes de chamar isto).
create or replace function public.comunidade_revogar_termo()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.comunidade_consentimentos set revogado_em = now() where user_id = auth.uid() and revogado_em is null;
end $$;

-- Professor: confirma, depois de falar com o responsável, que o menor pode enviar vídeos.
create or replace function public.comunidade_confirmar_responsavel(p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Só o professor confirma a autorização do responsável.' using errcode = '42501';
  end if;
  update public.comunidade_consentimentos set confirmada_em = now()
   where user_id = p_user and not maior_de_idade and revogado_em is null and confirmada_em is null;
  if not found then
    raise exception 'Nenhuma autorização pendente para esta pessoa.' using errcode = 'P0002';
  end if;
end $$;

-- Visibilidade: menor sem autorização expressa do responsável não libera para a comunidade.
create or replace function public.comunidade_envio_visibilidade(p_envio uuid, p_valor text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_valor not in ('professor', 'comunidade') then
    raise exception 'Valor inválido.' using errcode = '22023';
  end if;
  if p_valor = 'comunidade' and not coalesce((select maior_de_idade or autoriza_compartilhar from public.comunidade_consentimentos where user_id = auth.uid() and revogado_em is null), false) then
    raise exception 'O responsável não autorizou o compartilhamento com a comunidade.' using errcode = '42501';
  end if;
  update public.comunidade_envios e
     set visibilidade = p_valor
   where e.id = p_envio and e.aluno_id = auth.uid() and e.upload_ok
     and public.comunidade_espaco_membro(e.espaco_id);
  if not found then
    raise exception 'Envio não encontrado.' using errcode = '42501';
  end if;
end $$;

revoke all on function public.comunidade_termo_status(), public.comunidade_aceitar_termo(boolean, text, text, text, boolean), public.comunidade_revogar_termo(), public.comunidade_confirmar_responsavel(uuid) from public, anon;
grant execute on function public.comunidade_termo_status(), public.comunidade_aceitar_termo(boolean, text, text, text, boolean), public.comunidade_revogar_termo(), public.comunidade_confirmar_responsavel(uuid) to authenticated;
