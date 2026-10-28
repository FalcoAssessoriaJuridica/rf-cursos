// Bunny Stream de mentira, só para ensaiar a Comunidade MAC no navegador contra o Supabase local (nunca em produção).
// Aceita a API de gestão (criar/consultar/apagar vídeo) e o upload TUS, e CONFERE a assinatura do upload como o Bunny faz.
// Rodar:  deno run -A supabase/local-test/bunny_mock.ts        (porta 58999; chave da API "chave-api-teste", biblioteca 123456)
const LIB = '123456', KEY = 'chave-api-teste';
const videos = new Map<string, { status: number; storageSize: number; length: number; recebido: number }>();
let seq = 0;

const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const cors = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, PATCH, HEAD, GET, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Location, Upload-Offset, Upload-Length, Tus-Resumable', 'Tus-Resumable': '1.0.0',
};

Deno.serve({ port: 58999, onListen: () => console.log('Bunny de mentira em http://127.0.0.1:58999') }, async (req) => {
  const u = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // --- TUS ---
  if (u.pathname === '/tusupload' && req.method === 'POST') {
    const id = req.headers.get('VideoId') ?? '', exp = req.headers.get('AuthorizationExpire') ?? '';
    const esperado = await sha256(`${LIB}${KEY}${exp}${id}`);
    if (req.headers.get('LibraryId') !== LIB || req.headers.get('AuthorizationSignature') !== esperado || !videos.has(id)) { console.log('TUS 401', id); return new Response('assinatura inválida', { status: 401, headers: cors }); }
    if (Number(exp) < Date.now() / 1000) return new Response('expirado', { status: 400, headers: cors });
    const v = videos.get(id)!; v.length = Number(req.headers.get('Upload-Length') ?? 0); v.recebido = 0;
    console.log('TUS criado', id, v.length, 'bytes');
    return new Response(null, { status: 201, headers: { ...cors, Location: `http://127.0.0.1:58999/tusupload/${id}`, 'Upload-Offset': '0' } });
  }
  const tus = u.pathname.match(/^\/tusupload\/([\w-]+)$/);
  if (tus) {
    const v = videos.get(tus[1]);
    if (!v) return new Response('nf', { status: 404, headers: cors });
    if (req.method === 'HEAD') return new Response(null, { status: 200, headers: { ...cors, 'Upload-Offset': String(v.recebido), 'Upload-Length': String(v.length) } });
    if (req.method === 'PATCH') {
      v.recebido += (await req.arrayBuffer()).byteLength;
      if (v.recebido >= v.length) { v.status = 4; v.storageSize = v.length; console.log('TUS completo', tus[1]); }
      return new Response(null, { status: 204, headers: { ...cors, 'Upload-Offset': String(v.recebido) } });
    }
  }

  // --- API de gestão ---
  if (req.headers.get('AccessKey') !== KEY) return new Response('no', { status: 401, headers: cors });
  const m = u.pathname.match(new RegExp(`^/library/${LIB}/videos(?:/([\\w-]+))?$`));
  if (!m) return new Response('?', { status: 404, headers: cors });
  if (req.method === 'POST') { const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`; videos.set(id, { status: 0, storageSize: 0, length: 0, recebido: 0 }); console.log('criado', id); return Response.json({ guid: id }, { headers: cors }); }
  const v = m[1] ? videos.get(m[1]) : undefined;
  if (!v) return new Response('nf', { status: 404, headers: cors });
  if (req.method === 'DELETE') { videos.delete(m[1]!); console.log('apagado', m[1]); return Response.json({ success: true }, { headers: cors }); }
  return Response.json({ status: v.status, storageSize: v.storageSize, length: 0 }, { headers: cors });
});
