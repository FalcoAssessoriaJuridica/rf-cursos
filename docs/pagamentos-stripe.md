# Pagamentos com Stripe — como ligar

Modelo: **assinatura por curso**, em 3 prazos (30 dias, 6 meses, 1 ano), sempre recorrente, com valores editados no painel (`/admin/precos`).
Teste grátis de **7 dias só no plano de 30 dias**, na primeira assinatura do aluno naquele curso, **com cartão obrigatório**.
Além do cartão, o aluno pode pagar por **Pix avulso**: paga uma vez e ganha o período escolhido (30 dias, 6 meses ou 1 ano) pelo mesmo valor; sem teste grátis e sem renovação
automática (para continuar, paga de novo, e o que sobrar do acesso é somado). Exige o Pix habilitado na conta Stripe (Settings → Payment methods → Pix) e a migração `0011_pix_avulso.sql`.
O aluno cria a conta em `/cadastro`, escolhe o curso em `/student/planos` e paga no Checkout do Stripe. O acesso é liberado pelo webhook.

Proteções grátis: o **CPF** é obrigatório no cadastro (validado pelos dígitos; **um CPF por conta**) e o **teste grátis vale uma vez por cartão**
(o webhook compara a impressão digital do cartão no Stripe; se já foi usado em outro teste, o teste é encerrado e a cobrança começa na hora).

Como o acesso funciona: o webhook só mexe na **matrícula** (`inscricoes.data_expiracao` = fim do período pago + 3 dias de tolerância).
Pagamento que falha = a data simplesmente deixa de avançar e o acesso expira. Matrícula "bloqueado" (manual) nunca é reaberta.

## O que foi criado

| Peça | Onde |
|---|---|
| Tabelas `precos_curso`, `assinaturas`, `stripe_eventos`, `cadastro_tentativas` + função `catalogo_cursos()` | `supabase/migrations/0010_pagamentos.sql` |
| Função `pagamentos` (checkout, portal, preços do admin) | `supabase/functions/pagamentos/index.ts` |
| Função `stripe-webhook` (libera/encerra acesso) | `supabase/functions/stripe-webhook/index.ts` |
| Função `signup` (cadastro público, com limite por IP) | `supabase/functions/signup/index.ts` |
| Telas: `/cadastro`, `/student/planos`, `/student/pagamento/sucesso`, `/admin/precos`, "Minhas assinaturas" em Meu perfil | `src/pages/...` |

## Passo a passo (comece em modo TESTE do Stripe)

1. **Stripe** (modo teste ligado): Developers → API keys → copie a **Secret key** (`sk_test_...`).
   Em Settings → Billing → **Customer portal**, ative e salve (cancelar assinatura, trocar cartão, ver faturas).
2. **SQL Editor do Supabase**: rodar `0010_pagamentos.sql` e depois `0011_pix_avulso.sql`.
3. **Supabase → Edge Functions → Secrets**: criar `STRIPE_SECRET_KEY` com a chave do passo 1. (`ALLOWED_ORIGIN` já existe.)
4. **Publicar as 3 funções** (Edge Functions → Deploy a new function → Via editor; cole o código de cada arquivo):
   - `pagamentos` — **Verify JWT: ligado**
   - `signup` — **Verify JWT: DESLIGADO** (é pública; a proteção é CORS + limite por IP + campo isca)
   - `stripe-webhook` — **Verify JWT: DESLIGADO** (quem chama é o Stripe; a autenticidade vem da assinatura)
5. **Stripe → Developers → Webhooks → Add endpoint**
   - URL: `https://bghvzdfikfhceekoxtxg.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded` (Pix), `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
   - Copie o **Signing secret** (`whsec_...`) e crie o segredo `STRIPE_WEBHOOK_SECRET` no Supabase (passo 3).
6. **Deploy do site** (Easypanel).
7. Entre como administrador → **Preços**: informe os valores e clique em **Salvar** (cria o produto e o preço no Stripe). Só aparecem na página de planos os cursos com preço salvo.
8. **Teste**: crie uma conta em `/cadastro`, assine com o cartão de teste `4242 4242 4242 4242` (qualquer validade futura e CVC). Em segundos o curso é liberado e a tela diz "Pagamento confirmado". Confira também "Minhas assinaturas" e o botão de gerenciar pagamento.

## Passar para valer (modo real)

Troque `STRIPE_SECRET_KEY` pela chave `sk_live_...`, crie o webhook de novo no modo real (novo `whsec_...`) e **salve cada preço de novo** em `/admin/precos`
(os produtos/preços do modo teste não existem no modo real; a função recria sozinha). A conta Stripe precisa estar ativada (CNPJ).

## O que NÃO está incluído

- **Confirmar que o CPF existe e é daquele nome**: exige consulta paga (provedor ainda não escolhido). Hoje só se valida o formato e a unicidade.
- **E-mail do cadastro não é confirmado** (a conta nasce confirmada). Sem curso comprado a conta não acessa nada; ainda assim, para bloquear cadastros em massa, vale ligar hCaptcha/Turnstile depois.
- **Pix recorrente** (Pix Automático) e **boleto**: não incluídos; o Pix é avulso. Confira com o Stripe se o Pix Automático está disponível na sua conta.
- **Nota fiscal** e **reembolso**: pelo painel do Stripe.
