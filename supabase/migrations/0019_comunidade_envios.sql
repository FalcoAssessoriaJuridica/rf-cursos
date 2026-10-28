-- Comunidade MAC, fase 4: envio de vídeo dos alunos (Bunny Stream). Exige 0017 aplicado. Reexecutável.
--
-- 1) O envio passa a ser criado SÓ pela Edge Function `comunidade-video` (com a service_role), depois de checar que o aluno é membro,
--    o limite de envios e de criar o vídeo no Bunny. Antes, a política de INSERT deixava o aluno gravar qualquer `video_ref` direto
--    na tabela (ele poderia apontar para o vídeo de outra pessoa e pedir o link assinado dele).
-- 2) `upload_ok`: o envio nasce `false` e vira `true` quando o Bunny confirma o recebimento do arquivo. A caixa de entrada do
--    professor só mostra `upload_ok = true` (sem lixo de upload interrompido).

alter table public.comunidade_envios add column if not exists upload_ok boolean not null default false;

drop policy if exists comunidade_envios_criar on public.comunidade_envios;
revoke insert on public.comunidade_envios from authenticated;

-- Apagar (aluno dono ou professor) também só pela Edge Function, que remove o arquivo no Bunny junto: apagar a linha direto
-- deixaria o vídeo órfão (e continuaria sendo cobrado).
drop policy if exists comunidade_envios_apagar on public.comunidade_envios;
revoke delete on public.comunidade_envios from authenticated;

create index if not exists comunidade_envios_inbox_idx on public.comunidade_envios (status, criado_em desc) where upload_ok;
