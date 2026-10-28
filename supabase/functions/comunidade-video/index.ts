// Edge Function `comunidade-video` (Deno): envios de vídeo da Comunidade MAC.
// Armazenamento: Google Drive do professor (padrão, gratuito) ou Bunny Stream (opcional, pago, desligado). Escolha pelo segredo
// COMUNIDADE_VIDEO_PROVIDER = 'drive' | 'bunny' (sem o segredo, vale 'drive'). Cada envio guarda o provedor em que foi feito; trocar o
// provedor depois não quebra os envios antigos.
//
// Deploy: supabase functions deploy comunidade-video --no-verify-jwt
//   (o player de vídeo não consegue mandar o login; por isso o JWT é conferido AQUI, em cada ação, e a reprodução usa um link assinado que expira)
// Segredos (digitados por você, nunca em chat/arquivo):
//   Drive : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN   (a pasta "Comunidade MAC - envios" é criada pela própria função)
//   Bunny : BUNNY_LIBRARY_ID, BUNNY_API_KEY, BUNNY_TOKEN_KEY   (só se um dia escolher o Bunny)
//   Limpeza diária: COMUNIDADE_MAC_CRON_SECRET (senha que o agendador envia no cabeçalho x-cron-secret)
//   E-mail: RESEND_API_KEY (chave só desta função), COMUNIDADE_MAC_EMAIL_PROFESSOR (e-mail(s) do professor, separados por vírgula),
//           opcionais: EMAIL_FROM, APP_URL. Sem RESEND_API_KEY os avisos simplesmente não são enviados.
//   ALLOWED_ORIGIN (o mesmo das outras funções). SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY o Supabase já injeta.
// Exige 0017 e 0019 aplicados.
//
// POST (JSON, com o login do usuário):
//   criar      { espaco_id, mensagem?, duracao_s, tamanho_bytes, tipo, visibilidade? } -> registra o envio ('professor' ou 'comunidade') e prepara o upload
//   confirmar  { envio_id, file_id? }                                    -> confere que o arquivo chegou e libera o envio ao professor
//   reproduzir { envio_id }                                              -> como assistir (dono, professor, ou membro se o envio for da comunidade)
//   avisar_resposta { envio_id }                                         -> (só o professor) e-mail ao aluno avisando que há resposta
//   revogar_termo                                                        -> o aluno retira o consentimento: apaga TODOS os vídeos dele e grava a retirada
//   avisar_termo_menor                                                   -> e-mail ao professor: um menor pediu autorização do responsável
//   expurgar                                                             -> (só o professor) apaga os envios vencidos (90 dias, exceto os guardados)
// POST com o cabeçalho x-cron-secret (= COMUNIDADE_MAC_CRON_SECRET), sem login -> só 'expurgar', para o agendador diário
//   apagar     { envio_id }                                              -> apaga o arquivo e o envio (dono ou professor)
// GET ?s=<token>                                                         -> vídeo do Drive (com Range), só com o token assinado
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { apagarVideo, assinaturaUpload, consultarVideo, criarVideo, urlDeReproducao, type BunnyCfg } from './bunny.ts';
import { emailNovoEnvio, emailResposta, emailTermoMenor, enviarEmail } from './email.ts';
import { apagarArquivo, baixarArquivo, consultarArquivo, iniciarUpload, pasta, procurarPorNome, type DriveCfg } from './drive.ts';

const MAX_BYTES = 157286400;        // 150 MB (o mesmo limite da tabela)
const MAX_DURACAO_S = 180;          // 3 minutos
const EXTENSAO: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const MAX_ENVIOS_30D = 6;           // trava contra abuso (o uso esperado é cerca de 2 por mês)
const PENDENTE_VELHO_MS = 15 * 60 * 1000;
const UPLOAD_VALE_S = 6 * 3600;
const REPRODUCAO_VALE_S = 4 * 3600;
const PENDENTE = 'pendente';        // video_ref de um envio do Drive cujo arquivo ainda não foi confirmado

const allowed = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const corsFor = (origin: string | null) => {
  const ok = !!origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    'Vary': 'Origin',
  };
};

const env = (n: string) => Deno.env.get(n) ?? '';
const bunnyCfg = (): BunnyCfg | null => (env('BUNNY_LIBRARY_ID') && env('BUNNY_API_KEY') && env('BUNNY_TOKEN_KEY')
  ? { libraryId: env('BUNNY_LIBRARY_ID'), apiKey: env('BUNNY_API_KEY'), tokenKey: env('BUNNY_TOKEN_KEY') } : null);
const driveCfg = (): DriveCfg | null => (env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && env('GOOGLE_REFRESH_TOKEN')
  ? { clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET'), refreshToken: env('GOOGLE_REFRESH_TOKEN'), folderId: env('DRIVE_FOLDER_ID') || undefined } : null);
const PROVEDOR = env('COMUNIDADE_VIDEO_PROVIDER') === 'bunny' ? 'bunny' : 'drive';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_ID = /^[A-Za-z0-9_-]{10,}$/;

// Token do player do Drive: envio.expira.HMAC(envio.expira) com uma chave que só o servidor tem.
const hmacHex = async (msg: string) => {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('SUPABASE_SERVICE_ROLE_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const iguais = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const assinarStream = async (envioId: string, expira: number) => `${envioId}.${expira}.${await hmacHex(`${envioId}.${expira}`)}`;

type Envio = { id: string; aluno_id: string; video_provider: string; video_ref: string; upload_ok: boolean };

const MENSAGEM_TERMO: Record<string, string> = {
  sem_termo: 'Antes de enviar um vídeo, leia e aceite o termo da Comunidade.',
  versao_antiga: 'O termo da Comunidade foi atualizado. Leia e aceite de novo para enviar vídeos.',
  revogado: 'Você retirou o consentimento. Para enviar vídeos de novo, aceite o termo.',
  aguardando_responsavel: 'Seu envio será liberado quando o professor confirmar a autorização do seu responsável.',
};

// Remove o arquivo onde ele estiver guardado (Drive ou Bunny).
async function removerArquivoDe(e: Envio, bunny: BunnyCfg | null, drive: DriveCfg | null) {
  if (e.video_provider === 'bunny') { if (!bunny) throw new Error('Bunny não configurado'); await apagarVideo(bunny, e.video_ref); return; }
  if (!drive) throw new Error('Drive não configurado');
  if (FILE_ID.test(e.video_ref)) { await apagarArquivo(drive, e.video_ref); return; }
  for (const id of await procurarPorNome(drive, `mac-envio-${e.id}`)) await apagarArquivo(drive, id);   // upload que não chegou a ser confirmado
}

// Limpeza: apaga (arquivo e linha) os envios vencidos que o professor não marcou para guardar e os uploads que nunca terminaram (mais de 1 dia).
// Um erro em um envio não impede os outros; o que falhar é tentado de novo na próxima rodada.
// deno-lint-ignore no-explicit-any
async function expurgar(admin: any) {
  const bunny = bunnyCfg(), drive = driveCfg();
  const campos = 'id, aluno_id, video_provider, video_ref, upload_ok';
  const { data: vencidos } = await admin.from('comunidade_envios').select(campos).eq('guardar', false).lt('expira_em', new Date().toISOString()).limit(200);
  const { data: orfaos } = await admin.from('comunidade_envios').select(campos).eq('upload_ok', false).lt('criado_em', new Date(Date.now() - 86400_000).toISOString()).limit(200);
  const todos = new Map<string, Envio>();
  for (const e of [...(vencidos ?? []), ...(orfaos ?? [])] as Envio[]) todos.set(e.id, e);
  let apagados = 0, falhas = 0;
  for (const e of todos.values()) {
    try { await removerArquivoDe(e, bunny, drive); await admin.from('comunidade_envios').delete().eq('id', e.id); apagados++; }
    catch (err) { falhas++; console.error('comunidade-video expurgo', e.id, (err as Error).message); }
  }
  return { vencidos: vencidos?.length ?? 0, orfaos: orfaos?.length ?? 0, apagados, falhas };
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('Origin'));
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const erro = (mensagem: string, status: number) => json({ error: mensagem }, status);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Escritas/leituras do servidor (a tabela não aceita INSERT/DELETE de quem está logado).
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  // ── GET: vídeo do Drive, só com token assinado ──
  if (req.method === 'GET') {
    const drive = driveCfg();
    if (!drive) return erro('Envio de vídeo ainda não configurado.', 503);
    const [envioId, expira, assinatura] = (new URL(req.url).searchParams.get('s') ?? '').split('.');
    if (!UUID.test(envioId ?? '') || !/^\d+$/.test(expira ?? '') || Number(expira) < Date.now() / 1000) return erro('Link inválido ou vencido.', 403);
    if (!iguais(assinatura ?? '', await hmacHex(`${envioId}.${expira}`))) return erro('Link inválido ou vencido.', 403);
    const { data: envio } = await admin.from('comunidade_envios').select('video_provider, video_ref, upload_ok').eq('id', envioId).maybeSingle();
    if (!envio || envio.video_provider !== 'drive' || !FILE_ID.test(envio.video_ref)) return erro('Vídeo não encontrado.', 404);
    try {
      const g = await baixarArquivo(drive, envio.video_ref, req.headers.get('Range'));
      if (!g.ok && g.status !== 206) return erro('Não foi possível abrir o vídeo.', g.status === 404 ? 404 : 502);
      const h = new Headers(cors);
      h.set('Content-Type', g.headers.get('content-type') && g.headers.get('content-type') !== 'application/octet-stream' ? g.headers.get('content-type')! : 'video/mp4');
      for (const k of ['content-length', 'content-range']) { const v = g.headers.get(k); if (v) h.set(k, v); }
      h.set('Accept-Ranges', 'bytes');
      h.set('Cache-Control', 'private, no-store');
      h.set('X-Content-Type-Options', 'nosniff');
      h.set('Content-Disposition', 'inline');
      return new Response(g.body, { status: g.status, headers: h });
    } catch (e) {
      console.error('comunidade-video stream', (e as Error).message);
      return erro('Erro ao abrir o vídeo. Tente de novo.', 502);
    }
  }
  if (req.method !== 'POST') return erro('method not allowed', 405);

  // ── POST do agendador diário: sem login, com a senha no cabeçalho; só faz a limpeza ──
  const cron = req.headers.get('x-cron-secret');
  if (cron !== null) {
    const segredo = env('COMUNIDADE_MAC_CRON_SECRET');
    if (!segredo || !iguais(cron, segredo)) return erro('forbidden', 403);
    return json(await expurgar(admin));
  }

  // ── POST: exige o login do usuário ──
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user }, error: authErr } = await asUser.auth.getUser();
  if (authErr || !user) return erro('unauthorized', 401);

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return erro('JSON inválido', 400); }
  const acao = String(corpo.action ?? '');

  const bunny = bunnyCfg();
  const drive = driveCfg();
  const configurado = PROVEDOR === 'bunny' ? !!bunny : !!drive;

  try {
    // Lê o envio sob as regras de acesso do usuário: só devolve linha se for o dono (sendo membro) ou o professor.
    const meuEnvio = async (): Promise<Envio | null> => {
      const id = String(corpo.envio_id ?? '');
      if (!UUID.test(id)) return null;
      const { data } = await asUser.from('comunidade_envios').select('id, aluno_id, video_provider, video_ref, upload_ok').eq('id', id).maybeSingle();
      return data as Envio | null;
    };
    // Para ASSISTIR: além do dono e do professor, vale o membro ativo quando o aluno compartilhou o vídeo com a comunidade (regra no banco).
    const envioParaVer = async (): Promise<Envio | null> => {
      const id = String(corpo.envio_id ?? '');
      if (!UUID.test(id)) return null;
      const { data: pode } = await asUser.rpc('comunidade_envio_pode_ver', { p_envio: id });
      if (pode !== true) return null;
      const { data } = await admin.from('comunidade_envios').select('id, aluno_id, video_provider, video_ref, upload_ok').eq('id', id).maybeSingle();
      return data as Envio | null;
    };
    const eProfessor = user.app_metadata?.role === 'admin';
    const appUrl = (env('APP_URL') || 'https://rfcursos.falcotech.com.br').replace(/\/$/, '');
    const nomeDe = async (uid: string) => ((await admin.from('perfis').select('nome_completo').eq('id', uid).maybeSingle()).data?.nome_completo as string | undefined)?.trim() || 'Um aluno';
    const removerArquivo = (e: Envio) => removerArquivoDe(e, bunny, drive);

    // E-mail ao professor quando um envio chega. De melhor esforço: nunca faz a ação falhar.
    const avisarProfessor = async (envioId: string) => {
      try {
        const para = env('COMUNIDADE_MAC_EMAIL_PROFESSOR').split(',').map((x) => x.trim()).filter(Boolean);
        if (para.length === 0) return;
        const { data: e } = await admin.from('comunidade_envios').select('aluno_id, espaco_id, mensagem, duracao_s, visibilidade').eq('id', envioId).maybeSingle();
        if (!e) return;
        const { data: esp } = await admin.from('comunidade_espacos').select('nome').eq('id', e.espaco_id).maybeSingle();
        const d = Number(e.duracao_s ?? 0);
        const m = emailNovoEnvio({
          aluno: await nomeDe(e.aluno_id), instrumento: esp?.nome ?? 'instrumento', duracao: `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`,
          recado: e.mensagem, compartilhado: e.visibilidade === 'comunidade', link: `${appUrl}/admin/comunidade`,
        });
        await enviarEmail({ para, ...m });
      } catch (err) { console.error('comunidade-video aviso professor', (err as Error).message); }
    };

    if (acao === 'criar') {
      if (!configurado) return erro('Envio de vídeo ainda não configurado.', 503);
      const espacoId = String(corpo.espaco_id ?? '');
      const duracao = Number(corpo.duracao_s);
      const tamanho = Number(corpo.tamanho_bytes);
      const tipo = String(corpo.tipo);
      const mensagem = corpo.mensagem == null ? null : String(corpo.mensagem).trim().slice(0, 1000) || null;
      const visibilidade = corpo.visibilidade == null ? 'professor' : String(corpo.visibilidade);
      if (!['professor', 'comunidade'].includes(visibilidade)) return erro('Visibilidade inválida.', 400);
      if (!UUID.test(espacoId)) return erro('Espaço inválido.', 400);
      if (!EXTENSAO[tipo]) return erro('Formato não aceito. Envie MP4, MOV ou WebM.', 400);
      if (!Number.isFinite(tamanho) || tamanho < 1 || tamanho > MAX_BYTES) return erro('O vídeo passa de 150 MB.', 400);
      if (!Number.isFinite(duracao) || duracao < 1 || duracao > MAX_DURACAO_S) return erro('O vídeo passa de 3 minutos.', 400);

      const { data: membro } = await asUser.rpc('comunidade_espaco_membro', { p_espaco: espacoId });
      if (membro !== true) return erro('Você não faz parte desta comunidade.', 403);

      // Termo de consentimento (LGPD): sem aceite vigente, e sem a confirmação do responsável no caso de menores, não há envio.
      const { data: termo } = await asUser.rpc('comunidade_termo_status');
      if (termo?.status !== 'ok') return json({ error: MENSAGEM_TERMO[termo?.status] ?? 'Aceite o termo da Comunidade para enviar vídeos.', codigo: 'termo', status: termo?.status ?? 'sem_termo' }, 403);
      if (visibilidade === 'comunidade' && termo.pode_compartilhar !== true) return erro('O responsável não autorizou o compartilhamento com a comunidade. O vídeo ficaria só para o professor.', 403);

      // Limpa envios interrompidos do próprio aluno (upload que não terminou) antes de contar.
      const velho = new Date(Date.now() - PENDENTE_VELHO_MS).toISOString();
      const { data: orfaos } = await admin.from('comunidade_envios').select('id, aluno_id, video_provider, video_ref, upload_ok').eq('aluno_id', user.id).eq('upload_ok', false).lt('criado_em', velho);
      for (const o of (orfaos ?? []) as Envio[]) { await removerArquivo(o).catch(() => {}); await admin.from('comunidade_envios').delete().eq('id', o.id); }

      const { data: emAndamento } = await admin.from('comunidade_envios').select('id').eq('aluno_id', user.id).eq('upload_ok', false).limit(1);
      if (emAndamento?.length) return erro('Já existe um envio em andamento. Aguarde terminar.', 409);

      const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { count } = await admin.from('comunidade_envios').select('id', { count: 'exact', head: true }).eq('aluno_id', user.id).gte('criado_em', desde);
      if ((count ?? 0) >= MAX_ENVIOS_30D) return erro('Você chegou ao limite de envios do mês. Fale com o professor.', 429);

      const base = { espaco_id: espacoId, aluno_id: user.id, duracao_s: Math.round(duracao), tamanho_bytes: Math.round(tamanho), mensagem, visibilidade };

      if (PROVEDOR === 'bunny') {
        const videoId = await criarVideo(bunny!, `MAC ${user.id.slice(0, 8)} ${new Date().toISOString().slice(0, 10)}`);
        const { data: envio, error: insErr } = await admin.from('comunidade_envios').insert({ ...base, video_provider: 'bunny', video_ref: videoId }).select('id').single();
        if (insErr || !envio) { await apagarVideo(bunny!, videoId).catch(() => {}); return erro('Não foi possível registrar o envio.', 500); }
        return json({ provider: 'bunny', envio_id: envio.id, upload: await assinaturaUpload(bunny!, videoId, Math.floor(Date.now() / 1000) + UPLOAD_VALE_S) });
      }

      // Drive: o nome do arquivo carrega o id do envio (é o que amarra o arquivo ao envio na confirmação).
      const envioId = crypto.randomUUID();
      const url = await iniciarUpload(drive!, { nome: `mac-envio-${envioId}.${EXTENSAO[tipo]}`, tipo, tamanho: Math.round(tamanho), origem: req.headers.get('Origin') });
      const { error: insErr } = await admin.from('comunidade_envios').insert({ ...base, id: envioId, video_provider: 'drive', video_ref: PENDENTE });
      if (insErr) return erro('Não foi possível registrar o envio.', 500);
      return json({ provider: 'drive', envio_id: envioId, upload: { url, tipo } });
    }

    if (acao === 'confirmar') {
      const envio = await meuEnvio();
      if (!envio || envio.aluno_id !== user.id) return erro('Envio não encontrado.', 404);

      if (envio.video_provider === 'bunny') {
        const v = await consultarVideo(bunny!, envio.video_ref);
        // 1 enviado, 2 processando, 3 codificando, 4 pronto
        if (!v || v.status < 1 || v.status > 4) return erro('O arquivo ainda não chegou ao servidor.', 409);
        if (v.storageSize > MAX_BYTES) { await apagarVideo(bunny!, envio.video_ref).catch(() => {}); await admin.from('comunidade_envios').delete().eq('id', envio.id); return erro('O vídeo passa de 150 MB e foi descartado.', 413); }
        await admin.from('comunidade_envios').update({ upload_ok: true }).eq('id', envio.id);
        await avisarProfessor(envio.id);
        return json({ ok: true });
      }

      const fileId = String(corpo.file_id ?? '');
      if (!FILE_ID.test(fileId)) return erro('Arquivo inválido.', 400);
      const f = await consultarArquivo(drive!, fileId);
      // O arquivo precisa ser o criado para ESTE envio (nome definido pelo servidor) e estar na pasta do professor.
      const nomeOk = !!f && !f.trashed && f.parents.includes(await pasta(drive!)) && f.name.startsWith(`mac-envio-${envio.id}.`);
      if (!f || !nomeOk) return erro('O arquivo ainda não chegou ao servidor.', 409);
      if (f.size > MAX_BYTES) { await apagarArquivo(drive!, f.id).catch(() => {}); await admin.from('comunidade_envios').delete().eq('id', envio.id); return erro('O vídeo passa de 150 MB e foi descartado.', 413); }
      await admin.from('comunidade_envios').update({ video_ref: f.id, upload_ok: true }).eq('id', envio.id);
      await avisarProfessor(envio.id);
      return json({ ok: true });
    }

    if (acao === 'reproduzir') {
      const envio = await envioParaVer();
      if (!envio) return erro('Envio não encontrado.', 404);
      const expira = Math.floor(Date.now() / 1000) + REPRODUCAO_VALE_S;
      if (envio.video_provider === 'bunny') {
        if (!bunny) return erro('Envio de vídeo ainda não configurado.', 503);
        return json({ tipo: 'iframe', url: await urlDeReproducao(bunny, envio.video_ref, expira), expira });
      }
      if (!FILE_ID.test(envio.video_ref)) return erro('Este envio não terminou.', 409);
      return json({ tipo: 'video', token: await assinarStream(envio.id, expira), expira });
    }

    if (acao === 'revogar_termo') {
      // Retirar o consentimento apaga TUDO que a pessoa enviou. Se algum arquivo não puder ser apagado, nada é revogado (dá para tentar de novo).
      const { data: meus } = await admin.from('comunidade_envios').select('id, aluno_id, video_provider, video_ref, upload_ok').eq('aluno_id', user.id);
      for (const e of (meus ?? []) as Envio[]) { await removerArquivo(e); await admin.from('comunidade_envios').delete().eq('id', e.id); }
      const { error: rErr } = await asUser.rpc('comunidade_revogar_termo');
      if (rErr) return erro('Não foi possível registrar a retirada. Tente de novo.', 500);
      return json({ ok: true, apagados: meus?.length ?? 0 });
    }

    if (acao === 'avisar_termo_menor') {
      const { data: termo } = await asUser.rpc('comunidade_termo_status');
      if (termo?.status !== 'aguardando_responsavel') return json({ ok: true, enviado: false });
      const { data: c } = await admin.from('comunidade_consentimentos').select('responsavel_nome, responsavel_parentesco, responsavel_contato').eq('user_id', user.id).maybeSingle();
      const para = env('COMUNIDADE_MAC_EMAIL_PROFESSOR').split(',').map((x) => x.trim()).filter(Boolean);
      if (!c || para.length === 0) return json({ ok: true, enviado: false });
      const m = emailTermoMenor({ aluno: await nomeDe(user.id), responsavel: c.responsavel_nome, parentesco: c.responsavel_parentesco, contato: c.responsavel_contato, link: `${appUrl}/admin/comunidade` });
      return json({ ok: true, enviado: await enviarEmail({ para, ...m }) });
    }

    if (acao === 'expurgar') {
      if (!eProfessor) return erro('Só o professor executa a limpeza.', 403);
      return json(await expurgar(admin));
    }

    if (acao === 'avisar_resposta') {
      if (!eProfessor) return erro('Só o professor envia este aviso.', 403);
      const id = String(corpo.envio_id ?? '');
      if (!UUID.test(id)) return erro('Envio não encontrado.', 404);
      const { data: e } = await admin.from('comunidade_envios').select('aluno_id').eq('id', id).maybeSingle();
      if (!e) return erro('Envio não encontrado.', 404);
      const { data: r } = await admin.from('comunidade_respostas').select('texto').eq('envio_id', id).order('criado_em', { ascending: false }).limit(1).maybeSingle();
      if (!r) return erro('Ainda não há resposta para avisar.', 409);
      const { data: u } = await admin.auth.admin.getUserById(e.aluno_id);
      const enviado = await enviarEmail({ para: [u?.user?.email ?? ''], ...emailResposta({ texto: r.texto, link: `${appUrl}/student/comunidade` }) });
      return json({ ok: true, enviado });
    }

    if (acao === 'apagar') {
      const envio = await meuEnvio();
      if (!envio) return erro('Envio não encontrado.', 404);
      await removerArquivo(envio);   // se falhar, não apaga a linha (dá para tentar de novo)
      await admin.from('comunidade_envios').delete().eq('id', envio.id);
      return json({ ok: true });
    }

    return erro('Ação desconhecida.', 400);
  } catch (e) {
    console.error('comunidade-video', (e as Error).message);
    return erro('Erro ao falar com o serviço de vídeo. Tente de novo.', 502);
  }
});
