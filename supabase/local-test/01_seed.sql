-- Dados fictícios do ensaio local (nada de produção). Senhas em texto puro como no sistema atual.
-- ids fixos para os testes de RLS
insert into public.cursos (id, titulo) values
  ('c0000000-0000-0000-0000-00000000000a', 'Curso A (piano)'),
  ('c0000000-0000-0000-0000-00000000000b', 'Curso B (bateria)') on conflict do nothing;
insert into public.modulos (id, curso_id, titulo, ordem) values
  ('d0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'Módulo A1', 1),
  ('d0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'Módulo B1', 1) on conflict do nothing;
insert into public.aulas (id, modulo_id, titulo, id_video_profissional, ordem) values
  ('a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000a', 'Aula A1', 'https://www.youtube.com/watch?v=AAAAAAAAAAA', 1),
  ('a0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000b', 'Aula B1 (conteúdo pago de B)', 'https://www.youtube.com/watch?v=BBBBBBBBBBB', 1) on conflict do nothing;

insert into public.perfis (id, nome_completo, email, telefone, senha) values
  ('10000000-0000-0000-0000-000000000001', 'Admin Teste',        'admin@teste.local',  '11999990000', 'Admin!Forte2026'),
  ('10000000-0000-0000-0000-00000000000a', 'Aluna A (curso A)',  'aluna.a@teste.local','11999990001', 'SenhaForteA1'),
  ('10000000-0000-0000-0000-00000000000b', 'Aluno B (curso B)',  'aluno.b@teste.local','11999990002', 'SenhaForteB2'),
  ('10000000-0000-0000-0000-00000000000c', 'Aluno C (bloqueado)','aluno.c@teste.local','11999990003', 'SenhaForteC3'),
  ('10000000-0000-0000-0000-00000000000d', 'Aluno D (expirado)', 'aluno.d@teste.local','11999990004', 'abc123'),
  ('10000000-0000-0000-0000-00000000000e', 'Aluno E (sem senha)','aluno.e@teste.local','11999990005', null) on conflict do nothing;

insert into public.inscricoes (perfil_id, curso_id, data_expiracao, status) values
  ('10000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', null,                  'ativo'),
  ('10000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', current_date + 30,      'ativo'),
  ('10000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000a', null,                  'bloqueado'),
  ('10000000-0000-0000-0000-00000000000d', 'c0000000-0000-0000-0000-00000000000a', current_date - 5,      'ativo'),
  ('10000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-00000000000b', null,                  'ativo');
insert into public.progresso (perfil_id, aula_id, concluida) values
  ('10000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', true),
  ('10000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', false);
insert into public.configuracoes (chave, valor, descricao) values ('whatsapp_suporte', '5500000000000', 'teste') on conflict do nothing;

-- uma partitura de teste ligada só ao curso B
insert into public.partitura_pastas (id, nome) values ('f0000000-0000-0000-0000-00000000000f', 'Pasta de teste') on conflict do nothing;
insert into public.partituras (id, pasta_id, titulo, origem, arquivo_url) values
  ('e0000000-0000-0000-0000-00000000000e', 'f0000000-0000-0000-0000-00000000000f', 'Partitura do curso B', 'musicxml', 'http://exemplo/b.musicxml') on conflict do nothing;
insert into public.partitura_vinculos (partitura_id, curso_id, aula_id) values
  ('e0000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-00000000000b', null);
