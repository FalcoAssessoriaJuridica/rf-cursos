-- Campos opcionais do perfil do aluno (a tela "Meu perfil" mostra cada campo só se a coluna existir).
alter table public.perfis add column if not exists data_nascimento date;
alter table public.perfis add column if not exists cidade text;
