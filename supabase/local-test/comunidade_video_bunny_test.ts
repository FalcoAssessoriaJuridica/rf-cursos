// Teste de ponta a ponta da Edge Function `comunidade-video` (provedor Bunny, opcional) contra o Supabase local e um Bunny de mentira.
// Pré-requisito: supabase local de pé, run.sh base e migrações 0009, 0017, 0018, 0019 aplicadas.
// Rodar:  deno run -A supabase/local-test/comunidade_video_bunny_test.ts
const API = 'http://127.0.0.1:58321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const FN = 'http://127.0.0.1:58998';
const BUNNY = 'http://127.0.0.1:58999';
const PWD = 'SenhaTeste!2026';

// --- Bunny de mentira ---
const videos = new Map<string, { status: number; storageSize: number }>();
let seq = 0;
const bunny = Deno.serve({ port: 58999, onListen() {} }, async (req) => {
  const u = new URL(req.url);
  if (req.headers.get('AccessKey') !== 'chave-api-teste') return new Response('no', { status: 401 });
  const m = u.pathname.match(/^\/library\/123456\/videos(?:\/([\w-]+))?$/);
  if (!m) return new Response('?', { status: 404 });
  if (req.method === 'POST') { const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`; videos.set(id, { status: 0, storageSize: 0 }); return Response.json({ guid: id }); }
  const v = m[1] ? videos.get(m[1]) : undefined;
  if (!v) return new Response('nf', { status: 404 });
  if (req.method === 'DELETE') { videos.delete(m[1]!); return Response.json({ success: true }); }
  return Response.json(v);
});

// --- a função, em processo separado ---
const fn = new Deno.Command('deno', {
  args: ['run', '-A', decodeURIComponent(new URL('../functions/comunidade-video/index.ts', import.meta.url).pathname)],
  env: {
    DENO_SERVE_ADDRESS: 'tcp:127.0.0.1:58998', SUPABASE_URL: API, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    ALLOWED_ORIGIN: 'http://localhost:5173', BUNNY_LIBRARY_ID: '123456', BUNNY_API_KEY: 'chave-api-teste', BUNNY_TOKEN_KEY: 'chave-token-teste',
    BUNNY_API_URL: BUNNY, COMUNIDADE_VIDEO_PROVIDER: 'bunny',
  },
  stdout: 'null', stderr: 'null',
}).spawn();

let ok = 0, falhas = 0;
const check = (nome: string, cond: boolean, extra = '') => { cond ? ok++ : falhas++; console.log(`${cond ? 'ok    ' : 'FALHOU'} ${nome}${cond ? '' : ' ' + extra}`); };

const gotrue = (path: string, init: RequestInit) => fetch(`${API}/auth/v1${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
async function usuario(email: string, admin = false) {
  const r = await gotrue('/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PWD, email_confirm: true, app_metadata: admin ? { role: 'admin' } : {} }) });
  const u = await r.json();
  const login = await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PWD }) })).json();
  return { id: u.id as string, jwt: login.access_token as string };
}
const chamar = async (jwt: string, corpo: unknown) => {
  const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(corpo) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const sql = async (q: string) => {
  const p = await new Deno.Command('docker', { args: ['exec', '-i', 'supabase_db_rf-cursos', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', q], stdout: 'piped', stderr: 'piped' }).output();
  return new TextDecoder().decode(p.stdout).trim();
};

try {
  for (let i = 0; i < 40; i++) { try { await fetch(FN, { method: 'OPTIONS' }); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const stamp = Date.now();
  const ana = await usuario(`ana${stamp}@teste.local`);
  const bruno = await usuario(`bruno${stamp}@teste.local`);
  const prof = await usuario(`prof${stamp}@teste.local`, true);
  const intruso = await usuario(`intruso${stamp}@teste.local`);
  const codigo = await sql('select codigo from public.comunidade_codigos limit 1');
  const espaco = await sql('select id from public.comunidade_espacos limit 1');
  const entrar = (jwt: string) => fetch(`${API}/rest/v1/rpc/comunidade_entrar`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_codigo: codigo }) });
  await entrar(ana.jwt); await entrar(bruno.jwt);

  const valido = { action: 'criar', espaco_id: espaco, duracao_s: 90, tamanho_bytes: 50_000_000, tipo: 'video/mp4', mensagem: 'Segue meu solo' };

  check('sem login é recusado', (await fetch(FN, { method: 'POST', body: '{}' })).status === 401);
  check('quem não é membro não cria envio', (await chamar(intruso.jwt, valido)).status === 403);
  check('vídeo acima de 150 MB é recusado', (await chamar(ana.jwt, { ...valido, tamanho_bytes: 200_000_000 })).status === 400);
  check('vídeo acima de 3 min é recusado', (await chamar(ana.jwt, { ...valido, duracao_s: 200 })).status === 400);
  check('formato inválido é recusado', (await chamar(ana.jwt, { ...valido, tipo: 'application/pdf' })).status === 400);
  check('nada foi criado no Bunny nas recusas', videos.size === 0, `videos=${videos.size}`);

  const c = await chamar(ana.jwt, valido);
  check('membro cria o envio', c.status === 200 && c.body.provider === 'bunny' && !!c.body.envio_id && !!c.body.upload?.signature, JSON.stringify(c.body));
  check('o vídeo foi criado no Bunny', videos.size === 1);
  const sigEsperada = await sha256('123456' + 'chave-api-teste' + c.body.upload.expire + c.body.upload.videoId);
  check('assinatura do upload confere (SHA256 de biblioteca+chave+expiração+vídeo)', c.body.upload.signature === sigEsperada);
  check('a chave da API não vai na resposta', !JSON.stringify(c.body).includes('chave-api-teste'));
  check('segundo envio em andamento é recusado', (await chamar(ana.jwt, valido)).status === 409);
  check('envio recém-criado fica pendente (upload_ok=false), fora da caixa do professor', (await sql(`select count(*) from public.comunidade_envios where id='${c.body.envio_id}' and upload_ok`)) === '0');

  check('confirmar antes do upload chegar é recusado', (await chamar(ana.jwt, { action: 'confirmar', envio_id: c.body.envio_id })).status === 409);
  videos.get(c.body.upload.videoId)!.status = 4; videos.get(c.body.upload.videoId)!.storageSize = 40_000_000;
  check('outro aluno não confirma o envio da Ana', (await chamar(bruno.jwt, { action: 'confirmar', envio_id: c.body.envio_id })).status === 404);
  check('Ana confirma depois que o arquivo chegou', (await chamar(ana.jwt, { action: 'confirmar', envio_id: c.body.envio_id })).status === 200);
  check('envio ficou liberado (upload_ok=true)', (await sql(`select upload_ok from public.comunidade_envios where id='${c.body.envio_id}'`)) === 't');

  const rep = await chamar(ana.jwt, { action: 'reproduzir', envio_id: c.body.envio_id });
  const url = new URL(rep.body.url ?? 'http://x');
  const tokenEsperado = await sha256('chave-token-teste' + c.body.upload.videoId + url.searchParams.get('expires'));
  check('Ana assiste o próprio vídeo', rep.status === 200 && rep.body.tipo === 'iframe' && url.hostname === 'player.mediadelivery.net', JSON.stringify(rep.body));
  check('token do player confere (SHA256 de chave+vídeo+expiração)', url.searchParams.get('token') === tokenEsperado);
  check('o link do player expira no futuro', Number(url.searchParams.get('expires')) > Date.now() / 1000);
  check('o professor assiste', (await chamar(prof.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 200);
  check('outro membro NÃO assiste o vídeo da Ana', (await chamar(bruno.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 404);
  check('quem não é membro NÃO assiste', (await chamar(intruso.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 404);
  check('Bruno não apaga o envio da Ana', (await chamar(bruno.jwt, { action: 'apagar', envio_id: c.body.envio_id })).status === 404 && videos.size === 1);

  // arquivo maior do que o declarado: é descartado na confirmação
  const c2 = await chamar(bruno.jwt, valido);
  videos.get(c2.body.upload.videoId)!.status = 4; videos.get(c2.body.upload.videoId)!.storageSize = 400_000_000;
  check('arquivo real acima de 150 MB é descartado', (await chamar(bruno.jwt, { action: 'confirmar', envio_id: c2.body.envio_id })).status === 413 && !videos.has(c2.body.upload.videoId));

  // limite mensal
  for (let i = 0; i < 6; i++) {
    const r = await chamar(ana.jwt, valido);
    if (r.status === 200) { videos.get(r.body.upload.videoId)!.status = 4; await chamar(ana.jwt, { action: 'confirmar', envio_id: r.body.envio_id }); }
  }
  check('limite de envios por mês é aplicado (429)', (await chamar(ana.jwt, valido)).status === 429);

  check('Ana apaga o próprio envio', (await chamar(ana.jwt, { action: 'apagar', envio_id: c.body.envio_id })).status === 200);
  check('o arquivo saiu do Bunny', !videos.has(c.body.upload.videoId));
  check('a linha foi apagada', (await sql(`select count(*) from public.comunidade_envios where id='${c.body.envio_id}'`)) === '0');
  check('professor apaga envio de aluno', await (async () => {
    const x = await sql(`select id from public.comunidade_envios where aluno_id='${ana.id}' limit 1`);
    return (await chamar(prof.jwt, { action: 'apagar', envio_id: x })).status === 200;
  })());
} finally {
  try { fn.kill(); } catch { /* já terminou */ }
  await bunny.shutdown();
}
console.log(`\n→ ${ok} ok, ${falhas} falhas`);
Deno.exit(falhas === 0 ? 0 : 1);

async function sha256(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
