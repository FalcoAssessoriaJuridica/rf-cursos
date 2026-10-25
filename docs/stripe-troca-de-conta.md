# Troca da conta Stripe do RF Cursos

Quando usar: o RF Cursos vai receber por uma conta Stripe **própria** (em vez da conta compartilhada com o Flash Protocol).
O código **não muda**: a troca é de chaves, webhook e dos vínculos guardados no banco. Os produtos criados pelo sistema já levam o prefixo `RF Cursos - ` e a etiqueta `app=rf-cursos`.

> Se a decisão for **continuar na conta atual**, nada neste roteiro é necessário.

## 0. Antes de começar (decisões e preparação)
1. **Quem opera o RF Cursos** (pessoa física, MEI ou empresa própria): é o titular da conta nova **e** o responsável que aparece nos Termos e na Privacidade.
   Se não for a Falco Assessoria Jurídica, edite `src/legal/dados.js` (nome, CPF/CNPJ, endereço, e-mail), mude `VERSAO_TERMOS`, faça commit e deploy do site **antes de ir para o modo real**.
2. **Conta nova**: no seletor de contas do Stripe, **Criar** → nova conta (mesmo login). Preencha dados da empresa e conta bancária **em nome do titular** (isso é com você: documentos e dados bancários).
3. Na conta nova, em **Configurações**:
   - **Marca** (logo do RF Music Academy, cores) e **Dados públicos da empresa** (nome, site `https://rfcursos.falcotech.com.br`, e-mail e telefone de suporte).
   - **Descritor da fatura** (o nome no extrato do cartão), por exemplo `RF MUSIC`.
   - **Formas de pagamento**: Cartões e **Pix** ligados (o Pix no modo real exige a conta ativada e pode passar por análise).
4. Anote os valores atuais das chaves e do webhook **antigos** (só para poder voltar, se preciso). Não guarde chaves em arquivos do projeto.

## 1. Ensaio no modo de TESTE da conta nova (recomendado)
1. **Chave** (modo teste, conta nova): Desenvolvedores → Chaves de API → crie uma **chave restrita** com **Escrita** em: Clientes, Sessões de Checkout, Portal do cliente, Produtos, Preços, Assinaturas; e **Leitura** em: Métodos de pagamento. (Alternativa mais simples: a chave secreta `sk_test_...`.) Se alguma chamada falhar por permissão, a mensagem diz qual falta.
2. **Webhook** (modo teste, conta nova): Desenvolvedores → Webhooks → Adicionar destino:
   - Nome: `RF Cursos - Supabase (teste)`
   - URL: `https://bghvzdfikfhceekoxtxg.supabase.co/functions/v1/stripe-webhook`
   - Eventos (8): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` e `customer.subscription.resumed` (opcional)
   - Copie o **segredo da assinatura** (`whsec_...`).
3. **Supabase → Edge Functions → Secrets**: substitua `STRIPE_SECRET_KEY` (chave nova) e `STRIPE_WEBHOOK_SECRET` (segredo novo). Se alguma função continuar com o valor antigo, republique-a em **Deploy updates**, sem mudar o código (`pagamentos` e `stripe-webhook`).
4. **SQL Editor**: rode `supabase/ops/stripe_reset.sql` (confira os números do passo 1 do script antes do passo 2). Só enquanto houver apenas compras de teste.
5. **Painel `/admin/precos`**: salve cada preço de novo (os valores já aparecem preenchidos). Isso cria na conta nova os produtos `RF Cursos - <curso>` e os preços.
6. **Testes** (janela anônima):
   - Cadastro com CPF de teste → Planos → "Começar 7 dias grátis" com `4242 4242 4242 4242` → "Pagamento confirmado" e curso aberto.
   - Mesmo cartão em outra conta (outro CPF) → "Este cartão já usou o teste grátis", nenhuma cobrança.
   - **Pix** em outro curso → confirmado, "Meu perfil" mostra "Pix · acesso até…".
   - **Gerenciar pagamento e cancelamento** (cria o portal "RF Cursos" na conta nova sozinho).
   - Stripe → Webhook → entregas: todas **200 OK**.
7. Apague os alunos de teste pelo painel **Alunos → Excluir** (cadastros de teste: e-mails seus ou de teste).

## 2. Ir para o modo REAL (conta nova ativada)
1. Repita o passo 1 (chave, webhook, segredos) **em modo real**: chave `sk_live_...` (ou restrita `rk_live_...`); webhook `RF Cursos - Supabase` com o mesmo endereço e eventos. Atualize `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` no Supabase (valores do modo real).
2. Rode `supabase/ops/stripe_reset.sql` **de novo** (limpa os vínculos do ensaio; ainda não há venda real).
3. `/admin/precos`: informe os **valores reais** e salve (cria produtos e preços reais).
4. Teste real e barato: assine com um cartão seu o plano mais barato, confirme o acesso e os 200 OK do webhook e **cancele/reembolse** pelo painel do Stripe.
5. A partir daqui **nunca mais rode** o `stripe_reset.sql`.

## 3. Limpeza da conta antiga
- Revogue as chaves que o RF Cursos usava e **apague o webhook** `RF Cursos - Supabase (teste)` da conta antiga (senão ele continua tentando entregar eventos que o sistema recusa).
- Os produtos `RF Cursos - ...` antigos podem ser arquivados no catálogo da conta antiga.

## 4. Voltar atrás (se algo falhar antes de vender)
Recoloque os valores antigos de `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`, rode `stripe_reset.sql` e salve os preços de novo na conta antiga. Alunos e matrículas não são afetados.

## O que o sistema faz sozinho nesta troca
- Recria clientes, produtos, preços e o portal do cliente na conta nova (o código sabe lidar com códigos que não existem mais).
- O CPF único, o limite de teste por cartão e a etiqueta `app=rf-cursos` continuam valendo (a tabela `cartoes_teste` é zerada pelo script, porque os cartões são identificados por conta).

## Conferências que eu faço quando você disser "feito"
Webhook respondendo `invalid signature` para chamadas sem assinatura (segredo presente); função `pagamentos` recusando visitantes; produtos novos aparecendo; e as entregas do webhook (lendo o painel do Stripe pelo navegador do app).
