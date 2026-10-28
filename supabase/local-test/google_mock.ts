// Google (OAuth + Drive v3) de mentira, só para ensaiar a Comunidade MAC contra o Supabase local (nunca em produção).
// Faz o que a função usa: renovar token, abrir sessão de upload retomável (exigindo o Origin do navegador), receber o PUT com CORS,
// consultar/procurar/apagar arquivo e entregar o conteúdo com Range.
// Rodar sozinho:  deno run -A supabase/local-test/google_mock.ts   (porta 58977)
export const GOOGLE_MOCK = { token: 'token-de-acesso-teste', refresh: 'refresh-teste' };
const PASTA = 'application/vnd.google-apps.folder';

export type ArquivoMock = { id: string; name: string; parents: string[]; mime: string; bytes: Uint8Array; tamanhoDeclarado?: number };

export function iniciarGoogleMock(port = 58977, log = false) {
  const arquivos = new Map<string, ArquivoMock>();
  const sessoes = new Map<string, { name: string; parents: string[]; mime: string; origem: string | null }>();
  let seq = 0;
  const base = `http://127.0.0.1:${port}`;

  const server = Deno.serve({ port, onListen() {} }, async (req) => {
    const u = new URL(req.url);
    const origem = req.headers.get('Origin');
    const cors = (o: string | null) => (o ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'content-type, content-range', 'Access-Control-Allow-Methods': 'PUT, OPTIONS', 'Access-Control-Expose-Headers': 'Location' } : {});
    if (log) console.log(req.method, u.pathname + u.search.slice(0, 60));

    if (u.pathname === '/token' && req.method === 'POST') {
      const f = new URLSearchParams(await req.text());
      if (f.get('refresh_token') !== GOOGLE_MOCK.refresh || f.get('grant_type') !== 'refresh_token') return new Response('{"error":"invalid_grant"}', { status: 400 });
      return Response.json({ access_token: GOOGLE_MOCK.token, expires_in: 3599, token_type: 'Bearer' });
    }

    // sessão de upload (o navegador faz PUT aqui, direto)
    const sess = u.pathname.match(/^\/session\/(\w+)$/);
    if (sess) {
      const s = sessoes.get(sess[1]);
      if (!s) return new Response('nf', { status: 404 });
      // O Google só libera CORS se a sessão foi aberta com o Origin do navegador.
      const permitido = s.origem && origem === s.origem ? origem : null;
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(permitido) });
      if (req.method === 'PUT') {
        const bytes = new Uint8Array(await req.arrayBuffer());
        const id = 'DRV' + crypto.randomUUID().replaceAll('-', '').slice(0, 25);
        arquivos.set(id, { id, name: s.name, parents: s.parents, mime: s.mime, bytes });
        return Response.json({ id, name: s.name, size: String(bytes.length) }, { headers: cors(permitido) });
      }
    }

    // daqui em diante, API autenticada
    if (req.headers.get('Authorization') !== `Bearer ${GOOGLE_MOCK.token}`) return new Response('unauthorized', { status: 401 });

    if (u.pathname === '/upload/drive/v3/files' && req.method === 'POST') {
      const meta = await req.json();
      const sid = `S${++seq}x${crypto.randomUUID().slice(0, 8).replaceAll('-', '')}`;
      sessoes.set(sid, { name: meta.name, parents: meta.parents ?? [], mime: meta.mimeType, origem });
      return new Response(null, { status: 200, headers: { Location: `${base}/session/${sid}` } });
    }
    if (u.pathname === '/drive/v3/files' && req.method === 'POST') {   // criar pasta
      const meta = await req.json();
      const id = 'PST' + crypto.randomUUID().replaceAll('-', '').slice(0, 25);
      arquivos.set(id, { id, name: meta.name, parents: [], mime: meta.mimeType, bytes: new Uint8Array() });
      return Response.json({ id });
    }
    if (u.pathname === '/drive/v3/files' && req.method === 'GET') {
      const q = u.searchParams.get('q') ?? '';
      const prefixo = q.match(/name contains '([^']*)'/)?.[1];
      const exato = q.match(/name = '([^']*)'/)?.[1];
      const soPasta = q.includes(`mimeType = '${PASTA}'`);
      const pai = q.match(/'([\w-]+)' in parents/)?.[1];
      return Response.json({ files: [...arquivos.values()]
        .filter((a) => (prefixo === undefined || a.name.includes(prefixo)) && (exato === undefined || a.name === exato) && (!soPasta || a.mime === PASTA) && (!pai || a.parents.includes(pai)))
        .map((a) => ({ id: a.id })) });
    }
    const f = u.pathname.match(/^\/drive\/v3\/files\/([\w-]+)$/);
    if (f) {
      const a = arquivos.get(f[1]);
      if (!a) return new Response('{"error":{"code":404}}', { status: 404 });
      if (req.method === 'DELETE') { arquivos.delete(f[1]); return new Response(null, { status: 204 }); }
      if (u.searchParams.get('alt') === 'media') {
        const total = a.bytes.length;
        const r = (req.headers.get('Range') ?? '').match(/^bytes=(\d*)-(\d*)$/);
        if (r) {
          const ini = r[1] === '' ? Math.max(0, total - Number(r[2])) : Number(r[1]);
          const fim = r[1] === '' || r[2] === '' ? total - 1 : Math.min(Number(r[2]), total - 1);
          return new Response(a.bytes.slice(ini, fim + 1), { status: 206, headers: { 'Content-Type': a.mime, 'Content-Range': `bytes ${ini}-${fim}/${total}`, 'Content-Length': String(fim - ini + 1) } });
        }
        return new Response(a.bytes, { headers: { 'Content-Type': a.mime, 'Content-Length': String(total) } });
      }
      return Response.json({ id: a.id, name: a.name, size: String(a.tamanhoDeclarado ?? a.bytes.length), parents: a.parents, trashed: false });
    }
    return new Response('?', { status: 404 });
  });
  return { arquivos, sessoes, base, close: () => server.shutdown() };
}

if (import.meta.main) {
  iniciarGoogleMock(58977, true);
  console.log('Google de mentira em http://127.0.0.1:58977');
}
