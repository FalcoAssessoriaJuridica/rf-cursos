-- Pix avulso (pagamento único por período): registro de cada pagamento e do acesso que ele liberou.
-- Escrita só pelo webhook (service_role). Reexecutável. Exige 0010.

create table if not exists public.pagamentos_avulsos (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,          -- garante que um pagamento só libera acesso uma vez
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  curso_id uuid not null references public.cursos(id) on delete cascade,
  prazo text not null check (prazo in ('mensal', 'semestral', 'anual')),
  valor_centavos integer,
  acesso_ate date,
  pago_em timestamptz not null default now()
);
create index if not exists pagamentos_avulsos_perfil_idx on public.pagamentos_avulsos (perfil_id, curso_id);

alter table public.pagamentos_avulsos enable row level security;
drop policy if exists pagamentos_avulsos_select on public.pagamentos_avulsos;
create policy pagamentos_avulsos_select on public.pagamentos_avulsos for select to authenticated
  using (perfil_id = auth.uid() or public.is_admin());
-- sem política de escrita: só o webhook grava
