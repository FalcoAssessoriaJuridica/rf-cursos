// Teste de ponta a ponta da Edge Function `comunidade-video` (provedor Google Drive, o padrão) contra o Supabase local e um Google de mentira.
// Pré-requisito: supabase local de pé, run.sh base e migrações 0009, 0017, 0018, 0019 aplicadas.
// Rodar:  deno run -A supabase/local-test/comunidade_video_drive_test.ts
import { GOOGLE_MOCK, iniciarGoogleMock } from './google_mock.ts';

const API = 'http://127.0.0.1:58321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const FN = 'http://127.0.0.1:58998';
const ORIGEM = 'http://localhost:5173';
const PWD = 'SenhaTeste!2026';

const google = iniciarGoogleMock(58977);

const fn = new Deno.Command('deno', {
  args: ['run', '-A', decodeURIComponent(new URL('../functions/comunidade-video/index.ts', import.meta.url).pathname)],
  env: {
    DENO_SERVE_ADDRESS: 'tcp:127.0.0.1:58998', SUPABASE_URL: API, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    ALLOWED_ORIGIN: ORIGEM, GOOGLE_CLIENT_ID: 'cliente-teste', GOOGLE_CLIENT_SECRET: 'segredo-teste', GOOGLE_REFRESH_TOKEN: GOOGLE_MOCK.refresh,
    GOOGLE_API_URL: google.base, GOOGLE_TOKEN_URL: `${google.base}/token`,
  },
  stdout: 'null', stderr: Deno.env.get('DEBUG_FN') ? 'inherit' : 'null',
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
  const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json', Origin: ORIGEM }, body: JSON.stringify(corpo) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const sql = async (q: string) => {
  const p = await new Deno.Command('docker', { args: ['exec', '-i', 'supabase_db_rf-cursos', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', q], stdout: 'piped', stderr: 'piped' }).output();
  return new TextDecoder().decode(p.stdout).trim();
};
const hmac = async (msg: string) => {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// "O navegador": manda o arquivo direto para a sessão de upload, com o Origin da página.
const subir = (url: string, bytes: Uint8Array) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', Origin: ORIGEM }, body: bytes });
const conteudo = new Uint8Array(5000).map((_, i) => i % 251);

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
  const valido = { action: 'criar', espaco_id: espaco, duracao_s: 90, tamanho_bytes: conteudo.length, tipo: 'video/mp4', mensagem: 'Segue meu solo' };

  // ── regras de entrada ──
  check('sem login é recusado', (await fetch(FN, { method: 'POST', body: '{}' })).status === 401);
  check('quem não é membro não cria envio', (await chamar(intruso.jwt, valido)).status === 403);
  check('vídeo acima de 150 MB é recusado', (await chamar(ana.jwt, { ...valido, tamanho_bytes: 200_000_000 })).status === 400);
  check('vídeo acima de 3 min é recusado', (await chamar(ana.jwt, { ...valido, duracao_s: 200 })).status === 400);
  check('formato inválido é recusado', (await chamar(ana.jwt, { ...valido, tipo: 'application/pdf' })).status === 400);
  check('nada foi aberto no Drive nas recusas', google.sessoes.size === 0);

  // ── envio da Ana ──
  const c = await chamar(ana.jwt, valido);
  check('membro cria o envio (Drive é o padrão)', c.status === 200 && c.body.provider === 'drive' && !!c.body.upload?.url, JSON.stringify(c.body));
  const sessao = [...google.sessoes.values()][0];
  check('o arquivo no Drive leva o id do envio no nome', sessao?.name === `mac-envio-${c.body.envio_id}.mp4`, sessao?.name);
  const pastas = [...google.arquivos.values()].filter((a) => a.name === 'Comunidade MAC - envios');
  check('a função criou a pasta privada "Comunidade MAC - envios" (uma só)', pastas.length === 1);
  check('o arquivo vai para essa pasta', sessao?.parents.join() === pastas[0]?.id);
  check('a sessão foi aberta com o Origin do navegador (CORS)', sessao?.origem === ORIGEM);
  check('o envio nasce pendente', (await sql(`select video_provider||':'||video_ref||':'||upload_ok from public.comunidade_envios where id='${c.body.envio_id}'`)) === 'drive:pendente:false');
  check('segundo envio em andamento é recusado', (await chamar(ana.jwt, valido)).status === 409);
  check('não dá para assistir envio que não terminou', (await chamar(ana.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 409);
  check('confirmar sem arquivo é recusado', (await chamar(ana.jwt, { action: 'confirmar', envio_id: c.body.envio_id })).status === 400);
  check('confirmar com arquivo que não existe é recusado', (await chamar(ana.jwt, { action: 'confirmar', envio_id: c.body.envio_id, file_id: 'ARQUIVO_INEXISTENTE_01' })).status === 409);

  const put = await subir(c.body.upload.url, conteudo);
  const enviado = await put.json();
  check('o upload direto do navegador funciona (CORS liberado para a página)', put.status === 200 && put.headers.get('access-control-allow-origin') === ORIGEM && !!enviado.id);
  const sem = await fetch(c.body.upload.url, { method: 'PUT', headers: { Origin: 'http://outro-site.com' }, body: conteudo });
  check('outro site não recebe CORS na sessão de upload', sem.headers.get('access-control-allow-origin') === null);

  check('outro aluno não confirma o envio da Ana', (await chamar(bruno.jwt, { action: 'confirmar', envio_id: c.body.envio_id, file_id: enviado.id })).status === 404);
  // um arquivo qualquer da pasta (de OUTRO envio) não pode ser amarrado a este
  google.arquivos.set('DRVOUTRO000000000000000000001', { id: 'DRVOUTRO000000000000000000001', name: 'mac-envio-00000000-0000-4000-8000-000000000999.mp4', parents: [pastas[0].id], mime: 'video/mp4', bytes: conteudo });
  check('arquivo de outro envio NÃO é aceito na confirmação', (await chamar(ana.jwt, { action: 'confirmar', envio_id: c.body.envio_id, file_id: 'DRVOUTRO000000000000000000001' })).status === 409);
  check('Ana confirma o arquivo certo', (await chamar(ana.jwt, { action: 'confirmar', envio_id: c.body.envio_id, file_id: enviado.id })).status === 200);
  check('envio liberado e com o código do arquivo', (await sql(`select video_ref||':'||upload_ok from public.comunidade_envios where id='${c.body.envio_id}'`)) === `${enviado.id}:true`);

  // ── reprodução ──
  const rep = await chamar(ana.jwt, { action: 'reproduzir', envio_id: c.body.envio_id });
  check('Ana pede para assistir e recebe um token', rep.status === 200 && rep.body.tipo === 'video' && typeof rep.body.token === 'string', JSON.stringify(rep.body));
  check('o token não revela o código do arquivo do Drive', !JSON.stringify(rep.body).includes(enviado.id));
  const stream = (t: string, range?: string) => fetch(`${FN}?s=${encodeURIComponent(t)}`, { headers: range ? { Range: range } : {} });
  const inteiro = await stream(rep.body.token);
  const bytes = new Uint8Array(await inteiro.arrayBuffer());
  check('o vídeo é entregue inteiro pelo token', inteiro.status === 200 && bytes.length === conteudo.length && bytes.every((b, i) => b === conteudo[i]));
  check('entrega com Accept-Ranges e tipo de vídeo', inteiro.headers.get('accept-ranges') === 'bytes' && (inteiro.headers.get('content-type') ?? '').startsWith('video/'));
  const parte = await stream(rep.body.token, 'bytes=100-199');
  check('Range devolve 206 com o trecho certo (o iPhone exige isso)', parte.status === 206 && parte.headers.get('content-range') === `bytes 100-199/${conteudo.length}` && (await parte.arrayBuffer()).byteLength === 100);
  check('sem token não há vídeo', (await fetch(FN)).status === 403);
  check('token adulterado é recusado', (await stream(rep.body.token.replace(/.$/, (x: string) => (x === '0' ? '1' : '0')))).status === 403);
  const vencido = `${c.body.envio_id}.${Math.floor(Date.now() / 1000) - 10}`;
  check('token vencido é recusado', (await stream(`${vencido}.${await hmac(vencido)}`)).status === 403);
  const outroEnvio = '00000000-0000-4000-8000-000000000777.' + (Math.floor(Date.now() / 1000) + 600);
  check('token de envio inexistente é recusado', (await stream(`${outroEnvio}.${await hmac(outroEnvio)}`)).status === 404);
  check('o professor assiste', (await chamar(prof.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 200);
  check('outro membro NÃO assiste o vídeo da Ana', (await chamar(bruno.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 404);
  check('quem não é membro NÃO assiste', (await chamar(intruso.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 404);
  check('Bruno não apaga o envio da Ana', (await chamar(bruno.jwt, { action: 'apagar', envio_id: c.body.envio_id })).status === 404 && google.arquivos.has(enviado.id));

  // ── arquivo maior que o declarado ──
  const c2 = await chamar(bruno.jwt, valido);
  const p2 = await (await subir(c2.body.upload.url, conteudo)).json();
  google.arquivos.get(p2.id)!.tamanhoDeclarado = 400_000_000;
  check('arquivo real acima de 150 MB é descartado', (await chamar(bruno.jwt, { action: 'confirmar', envio_id: c2.body.envio_id, file_id: p2.id })).status === 413 && !google.arquivos.has(p2.id));

  // ── upload interrompido: some na limpeza ──
  const c3 = await chamar(bruno.jwt, valido);
  const p3 = await (await subir(c3.body.upload.url, conteudo)).json();   // chegou ao Drive, mas o aluno nunca confirmou
  await sql(`update public.comunidade_envios set criado_em = now() - interval '20 minutes' where id='${c3.body.envio_id}'`);
  const c4 = await chamar(bruno.jwt, valido);
  check('envio interrompido (20 min) é limpo e libera um novo', c4.status === 200 && !google.arquivos.has(p3.id) && (await sql(`select count(*) from public.comunidade_envios where id='${c3.body.envio_id}'`)) === '0');

  // ── limite mensal ──
  for (let i = 0; i < 6; i++) {
    const r = await chamar(ana.jwt, valido);
    if (r.status === 200) { const f = await (await subir(r.body.upload.url, conteudo)).json(); await chamar(ana.jwt, { action: 'confirmar', envio_id: r.body.envio_id, file_id: f.id }); }
  }
  check('limite de envios por mês é aplicado (429)', (await chamar(ana.jwt, valido)).status === 429);

  // ── apagar ──
  check('Ana apaga o próprio envio', (await chamar(ana.jwt, { action: 'apagar', envio_id: c.body.envio_id })).status === 200);
  check('o arquivo saiu do Drive', !google.arquivos.has(enviado.id));
  check('a linha foi apagada', (await sql(`select count(*) from public.comunidade_envios where id='${c.body.envio_id}'`)) === '0');
  check('o token do vídeo apagado deixa de funcionar', (await stream(rep.body.token)).status === 404);
  check('professor apaga envio de aluno', await (async () => {
    const x = await sql(`select id from public.comunidade_envios where aluno_id='${ana.id}' limit 1`);
    return (await chamar(prof.jwt, { action: 'apagar', envio_id: x })).status === 200;
  })());
} finally {
  try { fn.kill(); } catch { /* já terminou */ }
  await google.close();
}
console.log(`\n→ ${ok} ok, ${falhas} falhas`);
Deno.exit(falhas === 0 ? 0 : 1);
