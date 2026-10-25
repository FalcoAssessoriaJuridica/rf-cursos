-- Reinício dos vínculos com o Stripe, para TROCAR DE CONTA STRIPE (ver docs/stripe-troca-de-conta.md).
-- Os códigos de cliente, produto, preço e assinatura de uma conta Stripe NÃO existem em outra: este script apaga esses vínculos.
-- Rode no SQL Editor do Supabase. NÃO é uma migração (não roda sozinho).
--
-- ATENÇÃO: apaga o histórico de assinaturas e de pagamentos por Pix do banco. Use SOMENTE enquanto só existirem compras de TESTE.
-- Depois de vendas reais, NUNCA rode (perderia o registro de quem pagou). As matrículas (inscricoes) não são tocadas.

-- 1) Conferir o que será apagado
select 'assinaturas' as tabela, count(*) as linhas from public.assinaturas
union all select 'pagamentos_avulsos', count(*) from public.pagamentos_avulsos
union all select 'cartoes_teste', count(*) from public.cartoes_teste
union all select 'stripe_eventos', count(*) from public.stripe_eventos
union all select 'perfis com cliente Stripe', count(*) from public.perfis where stripe_customer_id is not null
union all select 'cursos com produto Stripe', count(*) from public.cursos where stripe_product_id is not null
union all select 'precos com price_id', count(*) from public.precos_curso where stripe_price_id is not null;

-- 2) Reiniciar (tudo ou nada)
begin;
  delete from public.stripe_eventos;
  delete from public.cartoes_teste;
  delete from public.pagamentos_avulsos;
  delete from public.assinaturas;
  update public.perfis set stripe_customer_id = null where stripe_customer_id is not null;
  update public.cursos set stripe_product_id = null where stripe_product_id is not null;
  -- os VALORES dos preços ficam (aparecem preenchidos em /admin/precos); só falta salvar de novo para criá-los na conta nova.
  -- ativo = false: some da página de planos até ser salvo de novo, e o botão Salvar volta a ficar habilitado.
  update public.precos_curso set stripe_price_id = null, ativo = false where stripe_price_id is not null or ativo;
  delete from public.configuracoes where chave in ('stripe_portal_test', 'stripe_portal_live');
commit;

-- 3) Conferir: tudo zerado, e os preços inativos esperando o "Salvar" no painel
select count(*) as assinaturas from public.assinaturas;
select curso_id, prazo, valor_centavos, ativo, stripe_price_id from public.precos_curso order by curso_id, prazo;
