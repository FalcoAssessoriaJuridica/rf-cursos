// Assinaturas e chamadas do Bunny Stream usadas pela função `comunidade-video`. Sem dependências além do Web Crypto do Deno.
// Documentação: https://docs.bunny.net/docs/stream-tus-resumable-uploads e https://docs.bunny.net/docs/stream-embed-token-authentication

export const sha256Hex = async (texto: string): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// Só os testes locais trocam o endereço (contra um Bunny de mentira); em produção fica o padrão.
const API = Deno.env.get('BUNNY_API_URL') ?? 'https://video.bunnycdn.com';

export type BunnyCfg = { libraryId: string; apiKey: string; tokenKey: string };

// Upload direto do aparelho (TUS): a assinatura é SHA256(libraryId + apiKey + expiração + videoId). A chave da API nunca sai do servidor.
export const assinaturaUpload = async (cfg: BunnyCfg, videoId: string, expire: number) => ({
  endpoint: `${API}/tusupload`,
  expire,
  signature: await sha256Hex(`${cfg.libraryId}${cfg.apiKey}${expire}${videoId}`),
  videoId,
  libraryId: cfg.libraryId,
});

// Reprodução: o player só abre com o token, que é SHA256(chaveDeToken + videoId + expiração) e vale até `expires` (segundos Unix).
export const urlDeReproducao = async (cfg: BunnyCfg, videoId: string, expires: number) => {
  const token = await sha256Hex(`${cfg.tokenKey}${videoId}${expires}`);
  return `https://player.mediadelivery.net/embed/${cfg.libraryId}/${videoId}?token=${token}&expires=${expires}&autoplay=false&preload=true`;
};

const base = (cfg: BunnyCfg) => `${API}/library/${cfg.libraryId}/videos`;
const headers = (cfg: BunnyCfg) => ({ AccessKey: cfg.apiKey, accept: 'application/json', 'content-type': 'application/json' });

export const criarVideo = async (cfg: BunnyCfg, titulo: string): Promise<string> => {
  const r = await fetch(base(cfg), { method: 'POST', headers: headers(cfg), body: JSON.stringify({ title: titulo }) });
  if (!r.ok) throw new Error(`Bunny: não criou o vídeo (${r.status})`);
  const j = await r.json();
  if (!j.guid) throw new Error('Bunny: resposta sem o código do vídeo');
  return j.guid as string;
};

// Estado do vídeo: 0 criado, 1 enviado, 2 processando, 3 codificando, 4 pronto, 5 erro, 6 falha no envio.
export const consultarVideo = async (cfg: BunnyCfg, videoId: string): Promise<{ status: number; storageSize: number; length: number } | null> => {
  const r = await fetch(`${base(cfg)}/${videoId}`, { headers: headers(cfg) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Bunny: não consultou o vídeo (${r.status})`);
  const j = await r.json();
  return { status: Number(j.status ?? 0), storageSize: Number(j.storageSize ?? 0), length: Number(j.length ?? 0) };
};

// Apagar um vídeo que já não existe não é erro.
export const apagarVideo = async (cfg: BunnyCfg, videoId: string): Promise<void> => {
  const r = await fetch(`${base(cfg)}/${videoId}`, { method: 'DELETE', headers: headers(cfg) });
  if (!r.ok && r.status !== 404) throw new Error(`Bunny: não apagou o vídeo (${r.status})`);
};
