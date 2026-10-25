-- Verificação em duas etapas do administrador, também no banco: quem ativou o MFA só é administrador numa sessão aal2
-- (senha + código do app). Quem NÃO ativou continua como antes (nenhum bloqueio). Reexecutável.
-- ATENÇÃO: rode DEPOIS de ativar o MFA na página "Segurança" e confirmar que o login com código funciona.

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
     );
$$;
