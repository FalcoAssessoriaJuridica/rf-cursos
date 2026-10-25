// Edge Function `stripe-webhook` (Deno): recebe os eventos do Stripe e liberam/encerram o acesso do aluno.
// Deploy: verify_jwt = DESLIGADO (quem chama é o Stripe; a autenticidade vem da assinatura `Stripe-Signature`).
// Segredos: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_...), e os injetados (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// Eventos a assinar no Stripe: checkout.session.completed, checkout.session.async_payment_succeeded (Pix), customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed.
//
// Regra de acesso: a matrícula (inscricoes.data_expiracao) vai até o fim do período pago + TOLERANCIA_DIAS.
// A cada renovação o Stripe avisa e a data avança; se o pagamento falha, o acesso simplesmente expira. Matrícula "bloqueado" (manual) nunca é reaberta.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.7.0?target=denonext';

const APP = 'rf-cursos';   // a conta Stripe é compartilhada: só processamos o que este sistema criou (metadata.app)
const TOLERANCIA_DIAS = 3;
const ABERTAS = ['active', 'trialing', 'past_due'];
const ENCERRADAS = ['canceled', 'unpaid', 'incomplete_expired'];

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { httpClient: Stripe.createFetchHttpClient() });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ts = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

// Um teste grátis por cartão: se o cartão desta assinatura já foi usado em outro teste, a assinatura é CANCELADA sem cobrança
// (o aluno aceitou "7 dias grátis", não uma cobrança imediata) e NÃO libera acesso. Ele pode assinar de novo, sem teste.
// A decisão de negar vem da comparação do cartão e vale para QUALQUER aviso desta assinatura, mesmo que outro aviso (o Stripe manda
// vários quase juntos) já a tenha cancelado: o cancelamento é só uma tentativa. Falha na própria checagem não nega nada.
async function aplicarUmTestePorCartao(sub: Stripe.Subscription, perfilId: string): Promise<{ sub: Stripe.Subscription; negado: boolean }> {
  if (sub.metadata?.teste_negado) return { sub, negado: true };
  if (sub.status !== 'trialing' || !sub.trial_end) return { sub, negado: false };
  try {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    let pmId = typeof sub.default_payment_method === 'string' ? sub.default_payment_method : sub.default_payment_method?.id;
    if (!pmId) {
      const lista = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
      pmId = lista.data[0]?.id;
    }
    if (!pmId) return { sub, negado: false };
    const fingerprint = (await stripe.paymentMethods.retrieve(pmId)).card?.fingerprint;
    if (!fingerprint) return { sub, negado: false };

    const { data: uso } = await db.from('cartoes_teste').select('stripe_subscription_id').eq('fingerprint', fingerprint).maybeSingle();
    if (!uso) { await db.from('cartoes_teste').insert({ fingerprint, perfil_id: perfilId, stripe_subscription_id: sub.id }); return { sub, negado: false }; }
    if (uso.stripe_subscription_id === sub.id) return { sub, negado: false };   // este é o teste que usou o cartão

    console.warn('cartão já usou teste grátis; cancelando sem cobrança:', sub.id);
    try { await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, teste_negado: '1' } }); } catch { /* outro aviso pode ter cancelado antes */ }
    let atual = sub;
    try { atual = await stripe.subscriptions.cancel(sub.id); } catch { atual = await stripe.subscriptions.retrieve(sub.id); }
    return { sub: atual, negado: true };
  } catch (e) {
    console.error('checagem de teste por cartão falhou:', (e as Error).message);
    return { sub, negado: false };
  }
}

// Pix avulso: soma o período comprado ao acesso que sobrar (ou a partir de hoje). Idempotente pelo id da sessão.
const somarPeriodo = (inicio: Date, prazo: string) => {
  const d = new Date(inicio);
  if (prazo === 'semestral') d.setUTCMonth(d.getUTCMonth() + 6);
  else if (prazo === 'anual') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCDate(d.getUTCDate() + 30);
  return d;
};

async function conceder(s: Stripe.Checkout.Session) {
  const { perfil_id: perfilId, curso_id: cursoId, prazo, app } = (s.metadata ?? {}) as Record<string, string>;
  if (app !== APP) return;   // pagamento de outro sistema da mesma conta
  if (!perfilId || !cursoId || !['mensal', 'semestral', 'anual'].includes(prazo)) { console.warn('pagamento avulso sem metadados:', s.id); return; }

  // 1º registra (a chave única impede liberar duas vezes); se algo falhar depois, desfaz para o Stripe poder repetir o evento
  const { error: e0 } = await db.from('pagamentos_avulsos').insert({ stripe_session_id: s.id, perfil_id: perfilId, curso_id: cursoId, prazo, valor_centavos: s.amount_total });
  if (e0) { if (e0.code === '23505') return; throw new Error(e0.message); }

  try {
    const { data: m } = await db.from('inscricoes').select('id, status, data_expiracao').eq('perfil_id', perfilId).eq('curso_id', cursoId).limit(1).maybeSingle();
    if (m?.status === 'bloqueado') { console.warn('matrícula bloqueada manualmente; pagamento registrado sem liberar:', s.id); return; }
    const hoje = new Date(isoDate(Date.now()) + 'T00:00:00Z');
    const atual = m?.data_expiracao ? new Date(m.data_expiracao + 'T00:00:00Z') : null;
    const ate = isoDate(somarPeriodo(atual && atual > hoje ? atual : hoje, prazo).getTime());
    const { error: eM } = await db.from('inscricoes').upsert({ perfil_id: perfilId, curso_id: cursoId, status: 'ativo', data_expiracao: ate }, { onConflict: 'perfil_id,curso_id' });
    if (eM) throw new Error(eM.message);
    await db.from('pagamentos_avulsos').update({ acesso_ate: ate }).eq('stripe_session_id', s.id);
  } catch (e) {
    await db.from('pagamentos_avulsos').delete().eq('stripe_session_id', s.id);
    throw e;
  }
}

async function sincronizar(subOriginal: Stripe.Subscription) {
  let sub = subOriginal;
  const { perfil_id: perfilId, curso_id: cursoId, prazo, app } = (sub.metadata ?? {}) as Record<string, string>;
  if (app !== APP) return;   // assinatura de outro sistema da mesma conta
  if (!perfilId || !cursoId) { console.warn('assinatura rf-cursos sem perfil/curso, ignorada:', sub.id); return; }

  const checagem = await aplicarUmTestePorCartao(sub, perfilId);
  sub = checagem.sub;
  const negado = checagem.negado;
  // o fim do período está na assinatura (API antiga) ou no 1º item (API nova)
  const fim: number | null = (sub as any).current_period_end ?? (sub.items?.data?.[0] as any)?.current_period_end ?? null;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const { error } = await db.from('assinaturas').upsert({
    perfil_id: perfilId, curso_id: cursoId, prazo, stripe_customer_id: customerId, stripe_subscription_id: sub.id,
    ...(negado ? { motivo: 'teste_cartao_repetido' } : {}),
    status: sub.status, trial_fim: ts(sub.trial_end), periodo_fim: ts(fim), cancela_no_fim: !!sub.cancel_at_period_end,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' });
  if (error) throw new Error(error.message);

  if (!fim || negado) return;   // assinatura negada: não libera nem mexe na matrícula
  const { data: matricula } = await db.from('inscricoes').select('id, status, data_expiracao').eq('perfil_id', perfilId).eq('curso_id', cursoId).limit(1).maybeSingle();
  if (matricula?.status === 'bloqueado') return;

  if (ABERTAS.includes(sub.status)) {
    const expira = isoDate(fim * 1000 + TOLERANCIA_DIAS * 86400_000);
    const { error: eM } = await db.from('inscricoes').upsert({ perfil_id: perfilId, curso_id: cursoId, status: 'ativo', data_expiracao: expira }, { onConflict: 'perfil_id,curso_id' });
    if (eM) throw new Error(eM.message);
  } else if (ENCERRADAS.includes(sub.status) && matricula) {
    // cancelada: o acesso vai até onde foi pago (sem tolerância). Só encurta a data que veio desta assinatura (não a vitalícia nem a de um Pix, por exemplo).
    const doPeriodo = isoDate(fim * 1000 + TOLERANCIA_DIAS * 86400_000);
    if (matricula.data_expiracao && matricula.data_expiracao <= doPeriodo) await db.from('inscricoes').update({ data_expiracao: isoDate(fim * 1000) }).eq('id', matricula.id);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const assinatura = req.headers.get('stripe-signature');
  const segredo = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!assinatura || !segredo) return new Response('bad request', { status: 400 });

  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(await req.text(), assinatura, segredo, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) {
    console.warn('assinatura inválida:', (e as Error).message);
    return new Response('invalid signature', { status: 400 });
  }

  const { data: jaProcessado } = await db.from('stripe_eventos').select('id').eq('id', evento.id).maybeSingle();
  if (jaProcessado) return new Response('ok (duplicado)', { status: 200 });

  try {
    switch (evento.type) {
      case 'checkout.session.completed': {
        const s = evento.data.object as Stripe.Checkout.Session;
        if (s.mode === 'payment' && s.payment_status === 'paid') await conceder(s);
        if (s.mode === 'subscription' && s.subscription) await sincronizar(await stripe.subscriptions.retrieve(typeof s.subscription === 'string' ? s.subscription : s.subscription.id));
        break;
      }
      case 'checkout.session.async_payment_succeeded': {   // Pix confirmado depois do checkout
        const s = evento.data.object as Stripe.Checkout.Session;
        if (s.mode === 'payment' && s.payment_status === 'paid') await conceder(s);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await sincronizar(evento.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const i = evento.data.object as any;
        const subId = i.subscription ?? i.parent?.subscription_details?.subscription;
        if (subId) await sincronizar(await stripe.subscriptions.retrieve(typeof subId === 'string' ? subId : subId.id));
        break;
      }
      default:
        break;
    }
    await db.from('stripe_eventos').insert({ id: evento.id, tipo: evento.type });
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('webhook falhou:', evento.type, (e as Error).message);
    return new Response('erro', { status: 500 });   // o Stripe tenta de novo
  }
});
