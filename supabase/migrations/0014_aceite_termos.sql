-- Registro do aceite dos Termos de Uso e da Política de Privacidade no cadastro (data e versão). Gravado pela função `signup`. Reexecutável.
alter table public.perfis add column if not exists termos_aceitos_em timestamptz;
alter table public.perfis add column if not exists termos_versao text;
