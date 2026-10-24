// Edge Function `drive-proxy` (Deno): entrega arquivos do Google Drive (PDF/áudio das aulas) só a quem tem acesso à aula.
// Deploy: supabase functions deploy drive-proxy   (verify_jwt = true, o padrão)
// Segredos: SUPABASE_URL, SUPABASE_ANON_KEY (já injetados) e ALLOWED_ORIGIN (o mesmo da função admin-students).
// Exige 0009_drive_proxy_acesso.sql aplicado (função SQL drive_file_allowed).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowed = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const corsFor = (origin: string | null) => {
  const ok = !!origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Type',
    'Vary': 'Origin',
  };
};

const FILE_ID = /^[A-Za-z0-9_-]{10,}$/;
const safeName = (s: string) => s.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 120) || 'arquivo';

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('Origin'));
  const text = (body: string, status: number) => new Response(body, { status, headers: cors });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return text('method not allowed', 405);

  const url = new URL(req.url);
  const fileId = url.searchParams.get('id') ?? '';
  const filename = safeName(url.searchParams.get('filename') || 'arquivo');
  const isDownload = url.searchParams.get('download') === 'true';
  if (!FILE_ID.test(fileId)) return text('invalid file id', 400);

  // 1) Quem chamou e se pode ver esse arquivo (a regra roda com o JWT do usuário, sob RLS).
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: authErr } = await asUser.auth.getUser();
  if (authErr || !user) return text('unauthorized', 401);
  const { data: ok, error: ruleErr } = await asUser.rpc('drive_file_allowed', { p_id: fileId });
  if (ruleErr || ok !== true) return text('forbidden', 403);

  // 2) Busca no Drive (só drive.google.com), tratando o aviso de vírus em arquivos grandes.
  try {
    let driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    let driveRes = await fetch(driveUrl);
    const confirm = (await driveRes.clone().text()).match(/confirm=([a-zA-Z0-9_-]+)/);
    if (confirm) {
      driveUrl += `&confirm=${confirm[1]}`;
      driveRes = await fetch(driveUrl);
    }
    if (!driveRes.ok) driveRes = await fetch(`https://drive.google.com/uc?id=${fileId}&export=open`);
    if (!driveRes.ok) return text(`Error fetching from Drive: ${driveRes.status}`, driveRes.status);

    const headers = new Headers(cors);
    const length = driveRes.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-store');

    if (isDownload) {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    } else {
      let type = driveRes.headers.get('content-type') || 'application/octet-stream';
      if (/\.mp3$/i.test(filename)) type = 'audio/mpeg';
      else if (/\.pdf$/i.test(filename)) type = 'application/pdf';
      headers.set('Content-Type', type);
      headers.set('Content-Disposition', 'inline');
    }
    return new Response(driveRes.body, { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
