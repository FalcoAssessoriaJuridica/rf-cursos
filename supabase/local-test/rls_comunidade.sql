-- Matriz de RLS da Comunidade MAC (migrações 0017 a 0019). Rodar depois de run.sh base + 0009, 0017, 0018 e 0019:  ./matriz.sh rls_comunidade.sql
drop schema if exists t cascade;
create schema t;
grant usage on schema t to anon, authenticated;

-- os resultados saem como NOTICE (sobrevivem ao rollback de cada bloco)
-- assume o papel + claims do JWT (admin = app_metadata.role)
create function t.as_user(uid uuid, adm boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_metadata', case when adm then json_build_object('role','admin') else '{}'::json end)::text, true);
  execute 'set local role authenticated';
end $$;
create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  execute 'set local role anon';
end $$;
create function t.n(q text) returns bigint language plpgsql as $$ declare c bigint; begin execute 'select count(*) from ('||q||') x' into c; return c; end $$;
create function t.eq(nome text, got bigint, want bigint) returns void language plpgsql as $$
begin raise notice '%', case when got = want then 'RESULTADO ok     ' else 'RESULTADO FALHOU ' end || nome || ' (obtido ' || got || ', esperado ' || want || ')'; end $$;
-- tenta uma escrita: ok quando ELA FALHA (erro de permissão/política) ou não afeta nenhuma linha
create function t.bloqueado(nome text, q text) returns void language plpgsql as $$
declare c bigint;
begin
  begin
    execute q; get diagnostics c = row_count;
    raise notice '%', case when c = 0 then 'RESULTADO ok     ' else 'RESULTADO FALHOU ' end || nome || ' (linhas afetadas ' || c || ')';
  exception when others then
    raise notice 'RESULTADO ok     % (negado: %)', nome, left(sqlerrm, 60);
  end;
end $$;
-- escrita que DEVE funcionar
create function t.permitido(nome text, q text) returns void language plpgsql as $$
declare c bigint;
begin
  begin
    execute q; get diagnostics c = row_count;
    raise notice '%', case when c >= 1 then 'RESULTADO ok     ' else 'RESULTADO FALHOU ' end || nome || ' (linhas afetadas ' || c || ')';
  exception when others then
    raise notice 'RESULTADO FALHOU % (ERRO: %)', nome, left(sqlerrm, 80);
  end;
end $$;
create function t.as_super() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
grant execute on function t.as_super() to anon, authenticated;

-- usuários: ADM (admin), M1 e M2 (membros), X (sem código)
\set ADM '''20000000-0000-0000-0000-000000000001'''
\set M1  '''20000000-0000-0000-0000-0000000000a1'''
\set M2  '''20000000-0000-0000-0000-0000000000a2'''
\set X   '''20000000-0000-0000-0000-0000000000f1'''

begin;
insert into auth.users (id, email) values (:ADM::uuid,'adm@c.t'),(:M1::uuid,'m1@c.t'),(:M2::uuid,'m2@c.t'),(:X::uuid,'x@c.t');
create temp table ctx as select (select id from public.comunidades where slug='mac') com,
  (select id from public.comunidade_espacos limit 1) esp, (select codigo from public.comunidade_codigos limit 1) cod;
grant select on ctx to authenticated, anon;

-- ===== Entrada por código =====
select t.as_user(:X::uuid);
select t.eq('visitante sem membro não lê comunidade', t.n('select 1 from public.comunidades'), 0);
select t.eq('código errado devolve zero linhas', t.n($$select * from public.comunidade_entrar('ERRADO123')$$), 0);
select t.eq('código vazio devolve zero linhas', t.n($$select * from public.comunidade_entrar('')$$), 0);
select t.as_super();
select t.eq('tentativas erradas ficaram registradas', t.n($$select 1 from public.comunidade_tentativas where user_id=$$ || quote_literal(:X) || '::uuid'), 2);
select t.eq('X ainda não é membro', t.n($$select 1 from public.comunidade_membros where user_id=$$ || quote_literal(:X) || '::uuid'), 0);

select t.as_user(:M1::uuid);
select t.eq('M1 entra com o código certo (minúsculas e sem hífen)', t.n($$select * from public.comunidade_entrar(lower(replace((select cod from ctx),'-',' ')))$$), 1);
select t.as_user(:M2::uuid);
select t.eq('M2 entra com o código certo', t.n($$select * from public.comunidade_entrar((select cod from ctx))$$), 1);
select t.eq('entrar duas vezes não duplica', t.n($$select * from public.comunidade_entrar((select cod from ctx))$$), 1);
select t.as_super();
select t.eq('há 2 membros', t.n('select 1 from public.comunidade_membros'), 2);

-- ===== Bruteforce: 10 erros por hora =====
select t.as_user(:X::uuid);
do $$ begin for i in 1..8 loop perform * from public.comunidade_entrar('Z'||i); end loop; end $$;
select t.bloqueado('11ª tentativa é barrada', $$select * from public.comunidade_entrar('QUALQUER')$$);
select t.bloqueado('mesmo o código certo é barrado após 10 erros', $$select * from public.comunidade_entrar((select cod from ctx))$$);

-- ===== Visibilidade =====
select t.as_user(:X::uuid);
select t.eq('X (de fora) não vê espaços', t.n('select 1 from public.comunidade_espacos'), 0);
select t.eq('X não vê o código', t.n('select 1 from public.comunidade_codigos'), 0);
select t.eq('X não vê posts', t.n('select 1 from public.comunidade_posts'), 0);
select t.bloqueado('X não se insere como membro', $$insert into public.comunidade_membros(comunidade_id,user_id) select com,auth.uid() from ctx$$);
select t.bloqueado('X não lê tentativas', $$select 1 from public.comunidade_tentativas where false or true limit 1$$);

select t.as_user(:M1::uuid);
select t.eq('M1 vê a comunidade', t.n('select 1 from public.comunidades'), 1);
select t.eq('M1 vê os espaços', t.n('select 1 from public.comunidade_espacos'), 1);
select t.eq('M1 NÃO vê o código de convite', t.n('select 1 from public.comunidade_codigos'), 0);
select t.eq('M1 vê só a própria participação', t.n('select 1 from public.comunidade_membros'), 1);
select t.bloqueado('M1 não altera o código', $$update public.comunidade_codigos set codigo='X'$$);
select t.bloqueado('M1 não cria espaço', $$insert into public.comunidade_espacos(comunidade_id,nome) select com,'Hack' from ctx$$);
select t.bloqueado('M1 não publica no mural', $$insert into public.comunidade_posts(espaco_id,titulo) select esp,'x' from ctx$$);
select t.bloqueado('M1 não vira professor', $$update public.comunidade_membros set papel='professor'$$);
select t.bloqueado('M1 não desbloqueia nem mexe em membros', $$delete from public.comunidade_membros where user_id<>auth.uid()$$);

-- ===== Mural =====
select t.as_user(:ADM::uuid, true);
select t.permitido('admin publica no mural', $$insert into public.comunidade_posts(espaco_id,autor_id,titulo,texto,video_provider,video_ref) select esp,auth.uid(),'Aula 1','Intro do hino','drive','1AbCdEfGhIjKlMn' from ctx$$);
select t.permitido('admin cria espaço', $$insert into public.comunidade_espacos(comunidade_id,nome,ordem) select com,'Violão',2 from ctx$$);
select t.as_user(:M1::uuid);
select t.eq('M1 lê o mural', t.n('select 1 from public.comunidade_posts'), 1);
select t.as_user(:X::uuid);
select t.eq('X não lê o mural', t.n('select 1 from public.comunidade_posts'), 0);

-- ===== PDF do mural pelo drive-proxy (migração 0018) =====
select t.as_user(:ADM::uuid, true);
select t.permitido('admin anexa PDF ao post', $$update public.comunidade_posts set pdf_ref='PDF_POST_abcdef123'$$);
select t.as_user(:M1::uuid);
select t.eq('membro pode abrir o PDF do mural', t.n($$select 1 where public.drive_file_allowed('PDF_POST_abcdef123')$$), 1);
select t.eq('membro não abre arquivo desconhecido', t.n($$select 1 where public.drive_file_allowed('OUTRO_ARQUIVO_abcdef')$$), 0);
select t.as_user(:X::uuid);
select t.eq('quem não é membro não abre o PDF do mural', t.n($$select 1 where public.drive_file_allowed('PDF_POST_abcdef123')$$), 0);

-- ===== Envios privados (migração 0019: o envio é criado só pelo servidor, com a service_role) =====
select t.as_user(:M1::uuid);
select t.bloqueado('M1 não grava envio direto na tabela', $$insert into public.comunidade_envios(espaco_id,aluno_id,video_provider,video_ref) select esp,auth.uid(),'bunny','VID_M1_abcdef' from ctx$$);
select t.bloqueado('M1 não grava envio em nome de M2', $$insert into public.comunidade_envios(espaco_id,aluno_id,video_provider,video_ref) select esp,'20000000-0000-0000-0000-0000000000a2','bunny','VID_FAKE_abcdef' from ctx$$);
select t.as_user(:ADM::uuid, true);
select t.bloqueado('nem o admin grava envio direto na tabela', $$insert into public.comunidade_envios(espaco_id,aluno_id,video_provider,video_ref) select esp,auth.uid(),'bunny','VID_ADM_abcdef' from ctx$$);
reset role;
-- o servidor (service_role/postgres) cria o envio do M1
insert into public.comunidade_envios(espaco_id,aluno_id,video_provider,video_ref,duracao_s,tamanho_bytes,mensagem,upload_ok)
  select esp,'20000000-0000-0000-0000-0000000000a1','bunny','VID_M1_abcdef',90,50000000,'Segue meu solo',true from ctx;
select t.bloqueado('arquivo acima de 150 MB é recusado', $$insert into public.comunidade_envios(espaco_id,aluno_id,video_provider,video_ref,tamanho_bytes) select esp,'20000000-0000-0000-0000-0000000000a1','bunny','VID_Z_abcdef',200000000 from ctx$$);
select t.bloqueado('vídeo acima de 10 minutos é recusado', $$insert into public.comunidade_envios(espaco_id,aluno_id,video_provider,video_ref,duracao_s) select esp,'20000000-0000-0000-0000-0000000000a1','bunny','VID_W_abcdef',700 from ctx$$);
select t.as_user(:M1::uuid);
select t.eq('M1 vê o próprio envio', t.n('select 1 from public.comunidade_envios'), 1);
select t.bloqueado('M1 não apaga o próprio envio direto (só pela função, que limpa o Bunny)', $$delete from public.comunidade_envios$$);
select t.bloqueado('M1 não altera o próprio envio', $$update public.comunidade_envios set guardar=true$$);
select t.as_user(:M2::uuid);
select t.eq('M2 NÃO vê o envio do M1', t.n('select 1 from public.comunidade_envios'), 0);
select t.bloqueado('M2 não apaga o envio do M1', $$delete from public.comunidade_envios$$);
select t.bloqueado('M2 não altera o envio do M1', $$update public.comunidade_envios set status='respondido'$$);
select t.as_user(:X::uuid);
select t.eq('X não vê envios', t.n('select 1 from public.comunidade_envios'), 0);
select t.bloqueado('X não envia vídeo', $$insert into public.comunidade_envios(espaco_id,aluno_id,video_provider,video_ref) select esp,auth.uid(),'bunny','VID_X1_abcdef' from ctx$$);
select t.as_user(:ADM::uuid, true);
select t.eq('admin vê todos os envios', t.n('select 1 from public.comunidade_envios'), 1);
select t.bloqueado('admin também não apaga direto na tabela', $$delete from public.comunidade_envios$$);

-- ===== Respostas =====
select t.permitido('admin responde', $$insert into public.comunidade_respostas(envio_id,autor_id,texto) select id,auth.uid(),'Ótimo! Atenção ao compasso 5.' from public.comunidade_envios$$);
select t.permitido('admin marca como respondido e guardar', $$update public.comunidade_envios set status='respondido', guardar=true$$);
select t.as_user(:M1::uuid);
select t.eq('M1 lê a resposta ao próprio envio', t.n('select 1 from public.comunidade_respostas'), 1);
select t.bloqueado('M1 não escreve resposta', $$insert into public.comunidade_respostas(envio_id,texto) select id,'eu mesmo' from public.comunidade_envios$$);
select t.as_user(:M2::uuid);
select t.eq('M2 não lê resposta do M1', t.n('select 1 from public.comunidade_respostas'), 0);

-- ===== Bloqueio de membro =====
select t.as_user(:ADM::uuid, true);
select t.permitido('admin bloqueia M1', $$update public.comunidade_membros set status='bloqueado' where user_id='20000000-0000-0000-0000-0000000000a1'$$);
select t.as_user(:M1::uuid);
select t.eq('M1 bloqueado não vê espaços', t.n('select 1 from public.comunidade_espacos'), 0);
select t.eq('M1 bloqueado não vê mural', t.n('select 1 from public.comunidade_posts'), 0);
select t.eq('M1 bloqueado não vê nem o próprio envio', t.n('select 1 from public.comunidade_envios'), 0);
select t.eq('M1 bloqueado não abre o PDF do mural', t.n($$select 1 where public.drive_file_allowed('PDF_POST_abcdef123')$$), 0);
select t.bloqueado('M1 bloqueado não reentra com o código', $$select * from public.comunidade_entrar((select cod from ctx))$$);

-- ===== Visitante sem login =====
select t.as_anon();
select t.bloqueado('anon não lê comunidades', $$select 1 from public.comunidades$$);
select t.bloqueado('anon não chama comunidade_entrar', $$select * from public.comunidade_entrar('MAC')$$);
rollback;
