-- Uma matrícula por aluno e curso. O webhook do Stripe pode receber dois avisos quase juntos e, sem esta trava, criava duas linhas
-- (a tela do curso espera exatamente uma e mostrava "Curso não liberado"). Reexecutável.

-- 1) Remove duplicatas, mantendo a mais "restritiva" e, empatando, a de maior validade:
--    bloqueada > sem validade (vitalícia) > maior data de expiração.
delete from public.inscricoes where id in (
  select id from (
    select id, row_number() over (
      partition by perfil_id, curso_id
      order by coalesce(status = 'bloqueado', false) desc, (data_expiracao is null) desc, data_expiracao desc, id
    ) as rn
    from public.inscricoes
  ) t where rn > 1
);

-- 2) Garante a unicidade daqui para frente
create unique index if not exists inscricoes_perfil_curso_uidx on public.inscricoes (perfil_id, curso_id);
