-- Matriz de testes de RLS (docs/migracao-supabase-auth-rls.md §7). Cada teste assume um usuário (claims do JWT) e confere o que ele enxerga/consegue.
-- Falha = exceção (o script para). Sucesso = linhas "ok" no final.
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
grant execute on all functions in schema t to anon, authenticated;

-- ids do seed
\set A '''10000000-0000-0000-0000-00000000000a'''
\set B '''10000000-0000-0000-0000-00000000000b'''
\set C '''10000000-0000-0000-0000-00000000000c'''
\set D '''10000000-0000-0000-0000-00000000000d'''
\set ADM '''10000000-0000-0000-0000-000000000001'''

-- ===== Aluna A (curso A ativo) =====
begin; select t.as_user(:A::uuid);
select t.eq('A vê só o curso A', t.n('select 1 from public.cursos'), 1);
select t.eq('A vê só módulos do curso A', t.n('select 1 from public.modulos'), 1);
select t.eq('A vê só a aula do curso A (não a do curso B)', t.n('select 1 from public.aulas'), 1);
select t.eq('A não vê a aula paga do curso B', t.n($$select 1 from public.aulas where titulo like 'Aula B1%'$$), 0);
select t.eq('A vê só o próprio perfil', t.n('select 1 from public.perfis'), 1);
select t.eq('A vê só as próprias matrículas', t.n('select 1 from public.inscricoes'), 1);
select t.eq('A vê só o próprio progresso', t.n('select 1 from public.progresso'), 1);
select t.eq('A não vê partitura de curso que não é dela', t.n('select 1 from public.partituras'), 0);
select t.eq('A não vê vínculos de partitura de outro curso', t.n('select 1 from public.partitura_vinculos'), 0);
select t.eq('A não vê pastas do acervo', t.n('select 1 from public.partitura_pastas'), 0);
select t.eq('A não lê configurações', t.n('select 1 from public.configuracoes'), 0);
select t.bloqueado('A não reativa a própria matrícula', $$update public.inscricoes set status='ativo', data_expiracao=null$$);
select t.bloqueado('A não altera a matrícula de outro', $$delete from public.inscricoes where perfil_id <> auth.uid()$$);
select t.bloqueado('A não troca o próprio e-mail em perfis', $$update public.perfis set email='x@y.z' where id=auth.uid()$$);
select t.bloqueado('A não lê/escreve senha em perfis', $$update public.perfis set senha='1' where id=auth.uid()$$);
select t.bloqueado('A não edita o perfil de outra pessoa', $$update public.perfis set nome_completo='hack' where id <> auth.uid()$$);
select t.permitido('A edita nome/telefone/cidade do próprio perfil', $$update public.perfis set nome_completo='Aluna A', telefone='1', cidade='Campo Grande' where id=auth.uid()$$);
select t.permitido('A grava o próprio progresso em aula a que tem acesso', $$insert into public.progresso(perfil_id, aula_id, concluida) values (auth.uid(), 'a0000000-0000-0000-0000-00000000000a', true) on conflict (perfil_id, aula_id) do update set concluida=true$$);
select t.bloqueado('A não grava progresso em aula de curso sem acesso', $$insert into public.progresso(perfil_id, aula_id) values (auth.uid(), 'a0000000-0000-0000-0000-00000000000b')$$);
select t.bloqueado('A não grava progresso em nome de outro aluno', $$insert into public.progresso(perfil_id, aula_id) values ('10000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a')$$);
select t.bloqueado('A não cria curso', $$insert into public.cursos(titulo) values ('x')$$);
select t.bloqueado('A não cria aula', $$insert into public.aulas(modulo_id, titulo) values ('d0000000-0000-0000-0000-00000000000a','x')$$);
select t.bloqueado('A não cria partitura', $$insert into public.partituras(titulo, origem, arquivo_url) values ('x','pdf','u')$$);
select t.bloqueado('A não se vincula a um curso', $$insert into public.inscricoes(perfil_id, curso_id) values (auth.uid(), 'c0000000-0000-0000-0000-00000000000b')$$);
select t.bloqueado('A não vira admin pelo próprio perfil (nenhuma coluna de papel)', $$update public.perfis set telefone=telefone where id <> auth.uid()$$);
select t.permitido('A sobe a própria foto', $$insert into storage.objects(bucket_id, name, owner_id) values ('course-covers', 'avatars/10000000-0000-0000-0000-00000000000a.jpg', auth.uid()::text)$$);
select t.bloqueado('A não sobe foto no nome de outro', $$insert into storage.objects(bucket_id, name, owner_id) values ('course-covers', 'avatars/10000000-0000-0000-0000-00000000000b.jpg', auth.uid()::text)$$);
select t.bloqueado('A não sobe capa de curso', $$insert into storage.objects(bucket_id, name, owner_id) values ('course-covers', 'capa-falsa.jpg', auth.uid()::text)$$);
select t.bloqueado('A não sobe material de aula', $$insert into storage.objects(bucket_id, name, owner_id) values ('course-materials', 'x/y.pdf', auth.uid()::text)$$);
rollback;

-- ===== Aluno B (curso B ativo) =====
begin; select t.as_user(:B::uuid);
select t.eq('B vê só o curso B', t.n('select 1 from public.cursos'), 1);
select t.eq('B vê a partitura ligada ao curso B', t.n('select 1 from public.partituras'), 1);
select t.eq('B vê o vínculo do curso B', t.n('select 1 from public.partitura_vinculos'), 1);
select t.eq('B não vê o progresso do aluno A', t.n($$select 1 from public.progresso where perfil_id='10000000-0000-0000-0000-00000000000a'$$), 0);
select t.bloqueado('B não apaga partitura', $$delete from public.partituras$$);
select t.bloqueado('B não muda sincronia de vídeo', $$update public.partitura_vinculos set sync_inicio = 1$$);
rollback;

-- ===== Matrícula bloqueada (C) e expirada (D): somem NA MESMA CONSULTA =====
begin; select t.as_user(:C::uuid);
select t.eq('C (bloqueado) não vê curso', t.n('select 1 from public.cursos'), 0);
select t.eq('C (bloqueado) não vê aulas', t.n('select 1 from public.aulas'), 0);
select t.bloqueado('C (bloqueado) não grava progresso', $$insert into public.progresso(perfil_id, aula_id) values (auth.uid(), 'a0000000-0000-0000-0000-00000000000a')$$);
rollback;
begin; select t.as_user(:D::uuid);
select t.eq('D (expirado) não vê curso', t.n('select 1 from public.cursos'), 0);
select t.eq('D (expirado) não vê aulas', t.n('select 1 from public.aulas'), 0);
select t.eq('D (expirado) não vê partitura', t.n('select 1 from public.partituras'), 0);
rollback;

-- ===== Admin =====
begin; select t.as_user(:ADM::uuid, true);
select t.eq('admin vê todos os cursos', t.n('select 1 from public.cursos'), 2);
select t.eq('admin vê todos os perfis', t.n('select 1 from public.perfis'), 6);
select t.eq('admin vê as pastas', t.n('select 1 from public.partitura_pastas'), 1);
select t.eq('admin lê configurações', t.n('select 1 from public.configuracoes'), 1);
select t.permitido('admin altera matrícula (bloqueio/expiração)', $$update public.inscricoes set status='ativo' where perfil_id='10000000-0000-0000-0000-00000000000c'$$);
select t.permitido('admin cria partitura', $$insert into public.partituras(titulo, origem, arquivo_url) values ('nova','pdf','u')$$);
select t.permitido('admin sobe capa', $$insert into storage.objects(bucket_id, name, owner_id) values ('course-covers', 'capa-nova.jpg', auth.uid()::text)$$);
select t.permitido('admin sobe material de aula', $$insert into storage.objects(bucket_id, name, owner_id) values ('course-materials', 'x/ok.pdf', auth.uid()::text)$$);
rollback;

