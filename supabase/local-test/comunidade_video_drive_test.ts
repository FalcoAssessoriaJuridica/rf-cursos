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

// Resend de mentira: guarda os e-mails que a função tentou enviar.
const emails: { auth: string | null; body: { from: string; to: string[]; subject: string; html: string; text: string } }[] = [];
const resend = Deno.serve({ port: 58976, onListen() {} }, async (req) => { emails.push({ auth: req.headers.get('Authorization'), body: await req.json() }); return Response.json({ id: 'email-teste' }); });

const fn = new Deno.Command('deno', {
  args: ['run', '-A', decodeURIComponent(new URL('../functions/comunidade-video/index.ts', import.meta.url).pathname)],
  env: {
    DENO_SERVE_ADDRESS: 'tcp:127.0.0.1:58998', SUPABASE_URL: API, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    ALLOWED_ORIGIN: ORIGEM, GOOGLE_CLIENT_ID: 'cliente-teste', GOOGLE_CLIENT_SECRET: 'segredo-teste', GOOGLE_REFRESH_TOKEN: GOOGLE_MOCK.refresh,
    RESEND_API_KEY: 'chave-resend-teste', RESEND_API_URL: 'http://127.0.0.1:58976/emails', COMUNIDADE_MAC_EMAIL_PROFESSOR: 'professor@teste.local', COMUNIDADE_MAC_CRON_SECRET: 'segredo-cron-teste', APP_URL: 'https://app.teste',
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
  const rpc0 = (jwt: string, fn: string, args: unknown) => fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const valido = { action: 'criar', espaco_id: espaco, duracao_s: 90, tamanho_bytes: conteudo.length, tipo: 'video/mp4', mensagem: 'Segue meu solo' };

  // ── termo de consentimento: sem aceite não há envio ──
  const antes = await chamar(ana.jwt, valido);
  check('sem aceitar o termo, o envio é recusado (403, "sem_termo")', antes.status === 403 && antes.body.codigo === 'termo' && antes.body.status === 'sem_termo', JSON.stringify(antes.body));
  check('recusa por falta de termo não abre nada no Drive nem grava envio', google.sessoes.size === 0 && (await sql(`select count(*) from public.comunidade_envios where aluno_id='${ana.id}'`)) === '0');
  for (const u of [ana, bruno]) await rpc0(u.jwt, 'comunidade_aceitar_termo', { p_maior: true });

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


  // ── visibilidade: só o professor (padrão) ou toda a comunidade ──
  const rpc = (jwt: string, fn: string, args: unknown) => fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  check('visibilidade inválida na criação é recusada', (await chamar(ana.jwt, { ...valido, visibilidade: 'todos' })).status === 400);
  check('o envio nasce privado (só o professor)', (await sql(`select visibilidade from public.comunidade_envios where id='${c.body.envio_id}'`)) === 'professor');
  check('Ana compartilha o vídeo com a comunidade', (await rpc(ana.jwt, 'comunidade_envio_visibilidade', { p_envio: c.body.envio_id, p_valor: 'comunidade' })).status === 204);
  check('agora Bruno (membro) assiste ao vídeo da Ana', (await chamar(bruno.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 200);
  check('quem não é membro continua sem assistir', (await chamar(intruso.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 404);
  check('compartilhar não dá a Bruno o direito de apagar', (await chamar(bruno.jwt, { action: 'apagar', envio_id: c.body.envio_id })).status === 404 && google.arquivos.has(enviado.id));
  const lista = await (await rpc(bruno.jwt, 'comunidade_videos_compartilhados', { p_espaco: espaco })).json();
  check('a lista da comunidade traz o vídeo, sem recado nem e-mail', lista.length === 1 && !('mensagem' in lista[0]) && !JSON.stringify(lista).includes('@'), JSON.stringify(lista));
  check('Bruno não consegue mudar a visibilidade do vídeo da Ana', (await rpc(bruno.jwt, 'comunidade_envio_visibilidade', { p_envio: c.body.envio_id, p_valor: 'professor' })).status >= 400);
  check('Ana volta o vídeo para só o professor', (await rpc(ana.jwt, 'comunidade_envio_visibilidade', { p_envio: c.body.envio_id, p_valor: 'professor' })).status === 204);
  check('Bruno deixa de assistir', (await chamar(bruno.jwt, { action: 'reproduzir', envio_id: c.body.envio_id })).status === 404);

  // ── avisos por e-mail (fase 5) ──
  check('o professor recebeu 1 e-mail quando o envio da Ana chegou', emails.length === 1 && emails[0].body.to.join() === 'professor@teste.local', JSON.stringify(emails.map((e) => e.body.to)));
  check('o e-mail usa a chave do Resend e o remetente do domínio', emails[0].auth === 'Bearer chave-resend-teste' && emails[0].body.from.includes('@falcotech.com.br'));
  check('o e-mail traz o recado e o link do painel', emails[0].body.text.includes('Segue meu solo') && emails[0].body.html.includes('https://app.teste/admin/comunidade'));
  check('o e-mail não leva link do vídeo', !/drive\.google|mac-envio|\?s=/.test(emails[0].body.html + emails[0].body.text));
  check('sem ser professor, não dá para disparar aviso de resposta', (await chamar(ana.jwt, { action: 'avisar_resposta', envio_id: c.body.envio_id })).status === 403);
  check('aviso sem resposta existente é recusado', (await chamar(prof.jwt, { action: 'avisar_resposta', envio_id: c.body.envio_id })).status === 409);
  await sql(`insert into public.comunidade_respostas(envio_id, autor_id, texto) values ('${c.body.envio_id}', '${prof.id}', 'Ótimo! <script>alert(1)</script> Atenção ao compasso 5.')`);
  const av = await chamar(prof.jwt, { action: 'avisar_resposta', envio_id: c.body.envio_id });
  check('o professor avisa o aluno da resposta', av.status === 200 && av.body.enviado === true, JSON.stringify(av.body));
  const ult = emails[emails.length - 1];
  check('o aviso vai para o e-mail da Ana, e só para ela', ult?.body.to.length === 1 && ult.body.to[0].startsWith(`ana${stamp}@`), JSON.stringify(ult?.body.to));
  check('o texto da resposta no e-mail está protegido contra HTML', !!ult && !ult.body.html.includes('<script>') && ult.body.html.includes('&lt;script&gt;'));
  check('o aviso leva ao app do aluno', !!ult && ult.body.html.includes('https://app.teste/student/comunidade'));

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


  // ── menor de idade: só envia depois que o professor confirma o responsável ──
  const jovem = await usuario(`jovem${stamp}@teste.local`);
  await entrar(jovem.jwt);
  check('menor sem dados do responsável não consegue aceitar', (await rpc0(jovem.jwt, 'comunidade_aceitar_termo', { p_maior: false })).status >= 400);
  const aj = await rpc0(jovem.jwt, 'comunidade_aceitar_termo', { p_maior: false, p_resp_nome: 'Helena Prado', p_resp_parentesco: 'mãe', p_resp_contato: '21 98888-7777', p_autoriza_compartilhar: false });
  check('menor aceita informando o responsável e fica aguardando', aj.status === 200 && (await aj.json()).status === 'aguardando_responsavel');
  const j1 = await chamar(jovem.jwt, valido);
  check('menor aguardando não consegue enviar', j1.status === 403 && j1.body.status === 'aguardando_responsavel', JSON.stringify(j1.body));
  const nEmails = emails.length;
  const avm = await chamar(jovem.jwt, { action: 'avisar_termo_menor' });
  const em = emails[emails.length - 1];
  check('o professor é avisado por e-mail do pedido do menor', avm.status === 200 && avm.body.enviado === true && emails.length === nEmails + 1 && em.body.to.join() === 'professor@teste.local');
  check('o e-mail traz o responsável e o contato', em.body.text.includes('Helena Prado') && em.body.text.includes('mãe') && em.body.text.includes('21 98888-7777'));
  check('o aviso não vale para quem não está aguardando', (await chamar(ana.jwt, { action: 'avisar_termo_menor' })).body.enviado === false);
  check('o menor não consegue se confirmar sozinho', (await rpc0(jovem.jwt, 'comunidade_confirmar_responsavel', { p_user: jovem.id })).status >= 400);
  check('o professor confirma a autorização do responsável', (await rpc0(prof.jwt, 'comunidade_confirmar_responsavel', { p_user: jovem.id })).status === 204);
  check('menor sem autorização expressa não envia para a comunidade', (await chamar(jovem.jwt, { ...valido, visibilidade: 'comunidade' })).status === 403);
  const j2 = await chamar(jovem.jwt, valido);
  check('confirmado, o menor envia (só para o professor)', j2.status === 200 && j2.body.provider === 'drive', JSON.stringify(j2.body));
  const jf = await (await subir(j2.body.upload.url, conteudo)).json();
  await chamar(jovem.jwt, { action: 'confirmar', envio_id: j2.body.envio_id, file_id: jf.id });

  // ── retirar o consentimento apaga tudo e bloqueia novos envios ──
  check('o arquivo do menor existe no Drive antes da retirada', google.arquivos.has(jf.id));
  const rv = await chamar(jovem.jwt, { action: 'revogar_termo' });
  check('retirar o consentimento apaga os vídeos da pessoa', rv.status === 200 && rv.body.apagados === 1 && !google.arquivos.has(jf.id) && (await sql(`select count(*) from public.comunidade_envios where aluno_id='${jovem.id}'`)) === '0', JSON.stringify(rv.body));
  const j3 = await chamar(jovem.jwt, valido);
  check('depois de retirar, o envio é recusado ("revogado")', j3.status === 403 && j3.body.status === 'revogado');
  check('retirar não afeta os vídeos dos outros', (await sql(`select count(*) from public.comunidade_envios where aluno_id='${ana.id}'`)) !== '0');

  // ── limpeza dos vencidos (agendador e professor) ──
  const lia = await usuario(`lia${stamp}@teste.local`);
  await entrar(lia.jwt); await rpc0(lia.jwt, 'comunidade_aceitar_termo', { p_maior: true });
  const envia = async () => { const r = await chamar(lia.jwt, valido); const f = await (await subir(r.body.upload.url, conteudo)).json(); await chamar(lia.jwt, { action: 'confirmar', envio_id: r.body.envio_id, file_id: f.id }); return { id: r.body.envio_id as string, arquivo: f.id as string }; };
  const A = await envia(), B = await envia(), C = await envia();
  await sql(`update public.comunidade_envios set expira_em = now() - interval '1 day' where id in ('${A.id}','${B.id}')`);
  await sql(`update public.comunidade_envios set guardar = true where id = '${B.id}'`);
  const D = await chamar(lia.jwt, valido);                                     // upload que nunca terminou
  const dPend = [...google.arquivos.values()].length;                          // (o arquivo só existe se o PUT acontecer: aqui o PUT nunca acontece)
  await sql(`update public.comunidade_envios set criado_em = now() - interval '2 days' where id = '${D.body.envio_id}'`);
  const cronPost = (segredo?: string) => fetch(FN, { method: 'POST', headers: segredo === undefined ? {} : { 'x-cron-secret': segredo, 'Content-Type': 'application/json' }, body: '{}' });
  check('agendador com senha errada é recusado', (await cronPost('errada')).status === 403);
  check('aluno comum não executa a limpeza', (await chamar(ana.jwt, { action: 'expurgar' })).status === 403);
  const limpa = await (await cronPost('segredo-cron-teste')).json();
  check('o agendador apaga o vencido e o upload abandonado', limpa.apagados === 2 && limpa.falhas === 0 && limpa.vencidos === 1 && limpa.orfaos === 1, JSON.stringify(limpa));
  check('o vencido sumiu (arquivo e linha)', !google.arquivos.has(A.arquivo) && (await sql(`select count(*) from public.comunidade_envios where id='${A.id}'`)) === '0');
  check('o vencido que o professor marcou para guardar continua', google.arquivos.has(B.arquivo) && (await sql(`select count(*) from public.comunidade_envios where id='${B.id}'`)) === '1');
  check('o envio dentro do prazo continua', google.arquivos.has(C.arquivo) && (await sql(`select count(*) from public.comunidade_envios where id='${C.id}'`)) === '1');
  check('o upload abandonado foi removido do banco', (await sql(`select count(*) from public.comunidade_envios where id='${D.body.envio_id}'`)) === '0');
  const limpa2 = await chamar(prof.jwt, { action: 'expurgar' });
  check('o professor também pode rodar a limpeza (e não há mais nada a apagar)', limpa2.status === 200 && limpa2.body.apagados === 0, JSON.stringify(limpa2.body));

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
  await google.close(); await resend.shutdown();
}
console.log(`\n→ ${ok} ok, ${falhas} falhas`);
Deno.exit(falhas === 0 ? 0 : 1);
