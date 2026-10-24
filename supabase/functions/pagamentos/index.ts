// Edge Function `pagamentos` (Deno): checkout do Stripe, portal do cliente e cadastro de preços (admin).
// Deploy: verify_jwt = LIGADO (padrão). Segredos: STRIPE_SECRET_KEY, ALLOWED_ORIGIN (o 1º valor é o endereço do app) e os já injetados
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). Exige 0010_pagamentos.sql.
// Ações (POST, JSON): checkout {curso_id, prazo, metodo?: 'cartao'|'pix'} · portal {} · set_price {curso_id, prazo, valor_centavos} (admin) · remove_price {curso_id, prazo} (admin)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.7.0?target=denonext';

const allowed = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const APP_URL = allowed[0] ?? '';
const corsFor = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// "mensal" = 30 dias. Semestral e anual em meses/ano do calendário.
const RECORRENCIA: Record<string, { interval: 'day' | 'month' | 'year'; interval_count: number }> = {
  mensal: { interval: 'day', interval_count: 30 },
  semestral: { interval: 'month', interval_count: 6 },
  anual: { interval: 'year', interval_count: 1 },
};
const TRIAL_DIAS = 7;                       // só no plano de 30 dias e só na 1ª assinatura daquele curso
const ATIVAS = ['active', 'trialing', 'past_due'];

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('Origin'));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user }, error: authErr } = await asUser.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret || !APP_URL) return json({ error: 'Pagamentos ainda não configurados.' }, 503);
  const stripe = new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() });
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

  let p: Record<string, any>;
  try { p = await req.json(); } catch { return json({ error: 'requisição inválida' }, 400); }
  const isAdmin = user.app_metadata?.role === 'admin';

  // cliente do Stripe do usuário (cria se faltar; recria se o id guardado não existe mais, ex.: troca de modo teste/real)
  const ensureCustomer = async () => {
    const { data: perfil } = await db.from('perfis').select('stripe_customer_id, email, nome_completo').eq('id', user.id).maybeSingle();
    if (!perfil) throw new Error('Perfil não encontrado. Saia e entre de novo.');
    if (perfil.stripe_customer_id) {
      try {
        const c = await stripe.customers.retrieve(perfil.stripe_customer_id);
        if (!(c as any).deleted) return perfil.stripe_customer_id as string;
      } catch { /* segue e cria outro */ }
    }
    const c = await stripe.customers.create({ email: perfil.email ?? user.email ?? undefined, name: perfil.nome_completo ?? undefined, metadata: { perfil_id: user.id } });
    await db.from('perfis').update({ stripe_customer_id: c.id }).eq('id', user.id);
    return c.id;
  };

  try {
    switch (p.action) {
      case 'checkout': {
        const cursoId = String(p.curso_id ?? ''); const prazo = String(p.prazo ?? '');
        if (!UUID.test(cursoId) || !RECORRENCIA[prazo]) return json({ error: 'Plano inválido.' }, 400);
        const metodo = p.metodo === 'pix' ? 'pix' : 'cartao';
        const { data: preco } = await db.from('precos_curso').select('stripe_price_id, valor_centavos').eq('curso_id', cursoId).eq('prazo', prazo).eq('ativo', true).maybeSingle();
        if (!preco?.stripe_price_id) return json({ error: 'Este plano não está disponível.' }, 404);

        const { data: previas } = await db.from('assinaturas').select('status').eq('perfil_id', user.id).eq('curso_id', cursoId);
        if (previas?.some((a) => ATIVAS.includes(a.status))) return json({ error: 'Você já tem uma assinatura ativa deste curso. Gerencie em Meu perfil.' }, 409);

        const customer = await ensureCustomer();
        const meta = { perfil_id: user.id, curso_id: cursoId, prazo };
        const comum = { customer, locale: 'pt-BR' as const, success_url: `${APP_URL}/student/pagamento/sucesso?curso=${cursoId}`, cancel_url: `${APP_URL}/student/planos` };

        if (metodo === 'pix') {
          // Pix avulso: paga uma vez e ganha o período; para renovar, paga de novo (o acesso novo soma ao que sobrar)
          const { data: curso } = await db.from('cursos').select('titulo, stripe_product_id').eq('id', cursoId).maybeSingle();
          if (!curso) return json({ error: 'Curso não encontrado.' }, 404);
          const session = await stripe.checkout.sessions.create({
            ...comum,
            mode: 'payment',
            payment_method_types: ['pix'],
            line_items: [{
              quantity: 1,
              price_data: { currency: 'brl', unit_amount: preco.valor_centavos, ...(curso.stripe_product_id ? { product: curso.stripe_product_id } : { product_data: { name: curso.titulo } }) },
            }],
            metadata: { ...meta, metodo: 'pix' },
            payment_intent_data: { metadata: { ...meta, metodo: 'pix' } },
          });
          return json({ url: session.url });
        }

        const teste = prazo === 'mensal' && !(previas?.length);
        const session = await stripe.checkout.sessions.create({
          ...comum,
          mode: 'subscription',
          line_items: [{ price: preco.stripe_price_id, quantity: 1 }],
          payment_method_collection: 'always',            // cartão obrigatório, inclusive no período de teste
          allow_promotion_codes: true,
          subscription_data: { metadata: meta, ...(teste ? { trial_period_days: TRIAL_DIAS } : {}) },
          metadata: meta,
        });
        return json({ url: session.url });
      }

      case 'portal': {
        const customer = await ensureCustomer();
        const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${APP_URL}/student/perfil` });
        return json({ url: session.url });
      }

      case 'set_price': {
        if (!isAdmin) return json({ error: 'forbidden' }, 403);
        const cursoId = String(p.curso_id ?? ''); const prazo = String(p.prazo ?? '');
        const valor = Math.round(Number(p.valor_centavos));
        if (!UUID.test(cursoId) || !RECORRENCIA[prazo]) return json({ error: 'Plano inválido.' }, 400);
        if (!Number.isInteger(valor) || valor < 500 || valor > 5_000_000) return json({ error: 'Valor inválido (mínimo R$ 5,00).' }, 400);

        const { data: curso } = await db.from('cursos').select('id, titulo, stripe_product_id').eq('id', cursoId).maybeSingle();
        if (!curso) return json({ error: 'Curso não encontrado.' }, 404);

        // produto do curso (recriado se o id guardado não existir no modo atual do Stripe)
        let productId = curso.stripe_product_id as string | null;
        if (productId) { try { const pr = await stripe.products.retrieve(productId); if ((pr as any).deleted) productId = null; } catch { productId = null; } }
        if (!productId) {
          const pr = await stripe.products.create({ name: curso.titulo, metadata: { curso_id: cursoId } });
          productId = pr.id;
          await db.from('cursos').update({ stripe_product_id: productId }).eq('id', cursoId);
        }
        const price = await stripe.prices.create({ product: productId, currency: 'brl', unit_amount: valor, recurring: RECORRENCIA[prazo], metadata: { curso_id: cursoId, prazo } });

        const { data: antigo } = await db.from('precos_curso').select('stripe_price_id').eq('curso_id', cursoId).eq('prazo', prazo).maybeSingle();
        const { error } = await db.from('precos_curso').upsert(
          { curso_id: cursoId, prazo, valor_centavos: valor, stripe_price_id: price.id, ativo: true, atualizado_em: new Date().toISOString() },
          { onConflict: 'curso_id,prazo' },
        );
        if (error) return json({ error: error.message }, 400);
        // quem já assina continua no preço antigo; novas assinaturas usam o novo
        if (antigo?.stripe_price_id) { try { await stripe.prices.update(antigo.stripe_price_id, { active: false }); } catch { /* já inativo/inexistente */ } }
        return json({ ok: true });
      }

      case 'remove_price': {
        if (!isAdmin) return json({ error: 'forbidden' }, 403);
        const cursoId = String(p.curso_id ?? ''); const prazo = String(p.prazo ?? '');
        if (!UUID.test(cursoId) || !RECORRENCIA[prazo]) return json({ error: 'Plano inválido.' }, 400);
        const { data: antigo } = await db.from('precos_curso').select('stripe_price_id').eq('curso_id', cursoId).eq('prazo', prazo).maybeSingle();
        await db.from('precos_curso').update({ ativo: false }).eq('curso_id', cursoId).eq('prazo', prazo);
        if (antigo?.stripe_price_id) { try { await stripe.prices.update(antigo.stripe_price_id, { active: false }); } catch { /* ignora */ } }
        return json({ ok: true });
      }

      default:
        return json({ error: 'ação desconhecida' }, 400);
    }
  } catch (e) {
    console.error('pagamentos:', (e as Error).message);
    return json({ error: (e as Error).message || 'Erro ao processar.' }, 500);
  }
});
