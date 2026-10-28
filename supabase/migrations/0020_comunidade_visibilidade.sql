-- Comunidade MAC: o aluno decide quem pode ver o vídeo que enviou. Exige 0017 e 0019 aplicados. Reexecutável.
--   'professor'  (padrão) : só o aluno e o professor.
--   'comunidade'          : todos os membros ativos da comunidade (do mesmo espaço) também podem assistir.
-- O recado ("mensagem") e as respostas do professor continuam PRIVADOS: quem não é o dono só enxerga o vídeo e o primeiro nome do autor.

alter table public.comunidade_envios add column if not exists visibilidade text not null default 'professor';
alter table public.comunidade_envios drop constraint if exists comunidade_envios_visibilidade_check;
alter table public.comunidade_envios add constraint comunidade_envios_visibilidade_check check (visibilidade in ('professor', 'comunidade'));

-- Quem pode assistir ao vídeo de um envio: o professor, o dono, ou (se compartilhado) qualquer membro ativo do espaço.
-- A Edge Function usa isto antes de entregar o link do player.
create or replace function public.comunidade_envio_pode_ver(p_envio uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.comunidade_envios e
    where e.id = p_envio
      and (
        public.is_admin()
        or (e.aluno_id = auth.uid() and public.comunidade_espaco_membro(e.espaco_id))
        or (e.visibilidade = 'comunidade' and e.upload_ok and e.expira_em > now() and public.comunidade_espaco_membro(e.espaco_id))
      )
  );
$$;

-- O dono troca a visibilidade do próprio envio. Não há UPDATE direto na tabela para o aluno.
create or replace function public.comunidade_envio_visibilidade(p_envio uuid, p_valor text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_valor not in ('professor', 'comunidade') then
    raise exception 'Valor inválido.' using errcode = '22023';
  end if;
  update public.comunidade_envios e
     set visibilidade = p_valor
   where e.id = p_envio and e.aluno_id = auth.uid() and e.upload_ok
     and public.comunidade_espaco_membro(e.espaco_id);
  if not found then
    raise exception 'Envio não encontrado.' using errcode = '42501';
  end if;
end $$;

-- Vídeos que os alunos compartilharam com a comunidade, de um espaço. Devolve só o necessário: nunca o recado nem o e-mail do autor.
create or replace function public.comunidade_videos_compartilhados(p_espaco uuid)
returns table (id uuid, espaco_id uuid, autor text, meu boolean, duracao_s integer, criado_em timestamptz)
language sql stable security definer set search_path = public
as $$
  select e.id, e.espaco_id,
         coalesce(nullif(split_part(trim(p.nome_completo), ' ', 1), ''), 'Aluno')
           || case when position(' ' in trim(coalesce(p.nome_completo, ''))) > 0
                   then ' ' || upper(left(split_part(trim(p.nome_completo), ' ', 2), 1)) || '.' else '' end as autor,
         (e.aluno_id = auth.uid()) as meu,
         e.duracao_s, e.criado_em
  from public.comunidade_envios e
  left join public.perfis p on p.id = e.aluno_id
  where e.espaco_id = p_espaco
    and e.visibilidade = 'comunidade' and e.upload_ok and e.expira_em > now()
    and public.comunidade_espaco_membro(p_espaco)
  order by e.criado_em desc;
$$;

revoke all on function public.comunidade_envio_pode_ver(uuid), public.comunidade_envio_visibilidade(uuid, text), public.comunidade_videos_compartilhados(uuid) from public, anon;
grant execute on function public.comunidade_envio_pode_ver(uuid), public.comunidade_envio_visibilidade(uuid, text), public.comunidade_videos_compartilhados(uuid) to authenticated;
