-- Depois do cutover: a chave anônima (qualquer visitante) não pode ler nem escrever nada nas tabelas do sistema.
drop schema if exists t cascade;
create schema t;
grant usage on schema t to anon;
create function t.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true); execute 'set local role anon'; end $$;
create function t.n(q text) returns bigint language plpgsql as $$ declare c bigint; begin execute 'select count(*) from ('||q||') x' into c; return c; end $$;
create function t.eq(nome text, got bigint, want bigint) returns void language plpgsql as $$
begin raise notice '%', case when got = want then 'RESULTADO ok     ' else 'RESULTADO FALHOU ' end || nome || ' (obtido ' || got || ', esperado ' || want || ')'; end $$;
create function t.bloqueado(nome text, q text) returns void language plpgsql as $$
declare c bigint;
begin
  begin execute q; get diagnostics c = row_count;
    raise notice '%', case when c = 0 then 'RESULTADO ok     ' else 'RESULTADO FALHOU ' end || nome || ' (linhas afetadas ' || c || ')';
  exception when others then raise notice 'RESULTADO ok     % (negado: %)', nome, left(sqlerrm, 60); end;
end $$;
grant execute on all functions in schema t to anon;

begin; select t.as_anon();
select t.eq('anon não lê perfis (nem senhas)', t.n('select 1 from public.perfis'), 0);
select t.eq('anon não lê matrículas', t.n('select 1 from public.inscricoes'), 0);
select t.eq('anon não lê cursos', t.n('select 1 from public.cursos'), 0);
select t.eq('anon não lê módulos', t.n('select 1 from public.modulos'), 0);
select t.eq('anon não lê aulas (URLs de vídeo)', t.n('select 1 from public.aulas'), 0);
select t.eq('anon não lê progresso', t.n('select 1 from public.progresso'), 0);
select t.eq('anon não lê configurações', t.n('select 1 from public.configuracoes'), 0);
select t.eq('anon não lê partituras', t.n('select 1 from public.partituras'), 0);
select t.eq('anon não lê pastas do acervo', t.n('select 1 from public.partitura_pastas'), 0);
select t.eq('anon não lê vínculos', t.n('select 1 from public.partitura_vinculos'), 0);
select t.bloqueado('anon não cria perfil', $$insert into public.perfis(nome_completo, email) values ('x','x@x.x')$$);
select t.bloqueado('anon não cria matrícula', $$insert into public.inscricoes(perfil_id, curso_id) values ('10000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000b')$$);
select t.bloqueado('anon não altera matrícula', $$update public.inscricoes set status='ativo'$$);
select t.bloqueado('anon não apaga curso', $$delete from public.cursos$$);
select t.bloqueado('anon não grava progresso', $$insert into public.progresso(perfil_id, aula_id) values ('10000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a')$$);
select t.bloqueado('anon não sobe arquivo em capas', $$insert into storage.objects(bucket_id, name) values ('course-covers','x.jpg')$$);
select t.bloqueado('anon não sobe arquivo em materiais', $$insert into storage.objects(bucket_id, name) values ('course-materials','x.pdf')$$);
rollback;
