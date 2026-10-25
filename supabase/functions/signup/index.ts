// Edge Function `signup` (Deno): cadastro público de aluno. O "sign up" nativo do Supabase fica DESLIGADO; só esta função cria contas.
// Deploy: verify_jwt = DESLIGADO (é pública). Segredos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injetados) e ALLOWED_ORIGIN.
// Defesas: CORS só do app, campo isca (honeypot), limite de cadastros por IP/hora e no total/hora, senha mínima.
// CAPTCHA (Turnstile) opcional por configuração. CPF obrigatório (validado pelos dígitos; um por conta). A conta nasce SEM nenhum curso: o acesso só chega com o pagamento confirmado (webhook do Stripe).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowed = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const corsFor = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const POR_IP = 5;      // cadastros por IP por hora
const NO_TOTAL = 60;   // cadastros no sistema por hora

// CPF: 11 dígitos, não repetidos, com os dois dígitos verificadores corretos
const cpfValido = (d: string) => {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
};

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('Origin'));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!allowed.includes(req.headers.get('Origin') ?? '')) return json({ error: 'origem não permitida' }, 403);

  let p: Record<string, any>;
  try { p = await req.json(); } catch { return json({ error: 'requisição inválida' }, 400); }

  if (p.site) return json({ ok: true });   // honeypot preenchido: robô; responde "ok" sem criar nada

  // CAPTCHA (Cloudflare Turnstile): com TURNSTILE_SECRET_KEY configurado, o token é obrigatório e conferido no Cloudflare
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (turnstileSecret) {
    const token = String(p.captcha_token ?? '');
    if (!token) return json({ error: 'Confirme a verificação de segurança e tente de novo.' }, 400);
    try {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret: turnstileSecret, response: token, remoteip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() }),
      });
      const v = await r.json();
      if (!v.success) return json({ error: 'Não foi possível confirmar a verificação de segurança. Tente de novo.' }, 400);
    } catch {
      return json({ error: 'Não foi possível confirmar a verificação de segurança agora. Tente de novo.' }, 503);
    }
  }

  const nome = String(p.nome_completo ?? '').trim().replace(/\s+/g, ' ');
  const email = String(p.email ?? '').trim().toLowerCase();
  const telefone = String(p.telefone ?? '').replace(/[^\d+]/g, '').slice(0, 20) || null;
  const cpf = String(p.cpf ?? '').replace(/\D/g, '');
  const password = String(p.password ?? '');
  if (nome.length < 3 || nome.length > 120) return json({ error: 'Informe seu nome completo.' }, 400);
  if (p.aceito !== true) return json({ error: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' }, 400);
  if (!cpfValido(cpf)) return json({ error: 'CPF inválido.' }, 400);
  if (!EMAIL.test(email) || email.length > 160) return json({ error: 'E-mail inválido.' }, 400);
  if (password.length < MIN_PASSWORD || password.length > 72) return json({ error: `A senha precisa ter de ${MIN_PASSWORD} a 72 caracteres.` }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

  // limite de cadastros
  const ip = (req.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim();
  const ipHash = await sha256(`rf-cadastro:${ip}`);
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: doIp }, { count: total }] = await Promise.all([
    admin.from('cadastro_tentativas').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', desde),
    admin.from('cadastro_tentativas').select('id', { count: 'exact', head: true }).gte('criado_em', desde),
  ]);
  if ((doIp ?? 0) >= POR_IP || (total ?? 0) >= NO_TOTAL) return json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429);
  await admin.from('cadastro_tentativas').insert({ ip_hash: ipHash });

  // um CPF por conta (checado antes de criar o usuário; o índice único no banco garante mesmo em cadastros simultâneos)
  const { count: cpfUsado } = await admin.from('perfis').select('id', { count: 'exact', head: true }).eq('cpf', cpf);
  if ((cpfUsado ?? 0) > 0) return json({ error: 'Já existe um cadastro com este CPF. Entre ou use "Esqueci minha senha".' }, 409);

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome_completo: nome } });
  if (error) {
    const existe = /already|registered|exists/i.test(error.message);
    return json({ error: existe ? 'Já existe um cadastro com este e-mail. Entre ou use "Esqueci minha senha".' : 'Não foi possível criar a conta agora.' }, existe ? 409 : 400);
  }
  const { error: e1 } = await admin.from('perfis').insert({ id: data.user.id, nome_completo: nome, email, telefone, cpf, termos_aceitos_em: new Date().toISOString(), termos_versao: String(p.termos_versao ?? '').slice(0, 20) || null });
  if (e1) {
    await admin.auth.admin.deleteUser(data.user.id);
    const cpfRepetido = e1.code === '23505';
    return json({ error: cpfRepetido ? 'Já existe um cadastro com este CPF. Entre ou use "Esqueci minha senha".' : 'Não foi possível criar a conta agora.' }, cpfRepetido ? 409 : 400);
  }
  return json({ ok: true });
});
