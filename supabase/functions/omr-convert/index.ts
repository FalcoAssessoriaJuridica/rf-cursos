// Função `omr-convert` (Deno): AUTORIZA o uso do leitor de partituras (PDF/imagem -> MusicXML) e emite um bilhete de uso único.
// O navegador envia o arquivo direto ao serviço OMR (omr-service, no VPS) com esse bilhete; assim a leitura demorada não passa
// pelo limite de tempo das funções do Supabase e o arquivo não trafega duas vezes. O serviço confere o bilhete com o mesmo segredo.
//
// Quem pode: administrador (sem limite) e aluno com curso ativo (OMR_DAILY_LIMIT por dia, padrão 5).
// Deploy: verify_jwt LIGADO. Segredos: OMR_URL (https://omr.seudominio.com.br), OMR_TICKET_SECRET (igual ao do serviço),
//   ALLOWED_ORIGIN (o endereço do site) e os já injetados (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).
// Exige 0016_omr_uso.sql.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowed = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const corsFor = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

const TTL_S = 300;
const LIMITE_DIA = Number(Deno.env.get('OMR_DAILY_LIMIT') ?? '5');

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function emitirBilhete(secret: string, userId: string) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: userId, e: Math.floor(Date.now() / 1000) + TTL_S, n: crypto.randomUUID() })));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('Origin'));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await asUser.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  const omrUrl = Deno.env.get('OMR_URL');
  const secret = Deno.env.get('OMR_TICKET_SECRET');
  if (!omrUrl || !secret) return json({ error: 'O leitor de partituras ainda não está configurado.' }, 503);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

  if (user.app_metadata?.role !== 'admin') {
    // aluno: precisa de pelo menos um curso ativo e respeita o limite diário
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: matriculas } = await db.from('inscricoes').select('id')
      .eq('perfil_id', user.id).neq('status', 'bloqueado').or(`data_expiracao.is.null,data_expiracao.gt.${hoje}`).limit(1);
    if (!matriculas?.length) return json({ error: 'A leitura de partituras está disponível para alunos com curso ativo.' }, 403);
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await db.from('omr_uso').select('id', { count: 'exact', head: true }).eq('usuario_id', user.id).gte('criado_em', desde);
    if ((count ?? 0) >= LIMITE_DIA) return json({ error: `Você atingiu o limite de ${LIMITE_DIA} leituras por dia. Tente amanhã.` }, 429);
  }
  await db.from('omr_uso').insert({ usuario_id: user.id });

  return json({ url: `${omrUrl.replace(/\/+$/, '')}/convert`, ticket: await emitirBilhete(secret, user.id) });
});
