// Armazenamento dos envios no Google Drive do professor (gratuito): chamadas à API do Drive com um refresh token OAuth do próprio dono.
// Escopo mínimo: `drive.file` (o app só enxerga o que ele mesmo criou). Os arquivos ficam numa pasta PRIVADA do professor; ninguém recebe link do Drive.
// O aluno envia direto do aparelho para o Google (sessão de upload retomável criada aqui); a reprodução passa pela função (ver index.ts).

// Só os testes locais trocam os endereços (contra um Google de mentira).
const API = Deno.env.get('GOOGLE_API_URL') ?? 'https://www.googleapis.com';
const TOKEN_URL = Deno.env.get('GOOGLE_TOKEN_URL') ?? 'https://oauth2.googleapis.com/token';

export type DriveCfg = { clientId: string; clientSecret: string; refreshToken: string; folderId?: string };

let cache: { token: string; ate: number } | null = null;

export const acessoDrive = async (cfg: DriveCfg): Promise<string> => {
  if (cache && cache.ate > Date.now() + 60_000) return cache.token;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: 'refresh_token' }),
  });
  if (!r.ok) throw new Error(`Drive: não renovou o acesso (${r.status}). O token do Google pode ter expirado.`);
  const j = await r.json();
  cache = { token: j.access_token, ate: Date.now() + Number(j.expires_in ?? 3000) * 1000 };
  return cache.token;
};

const auth = async (cfg: DriveCfg) => ({ Authorization: `Bearer ${await acessoDrive(cfg)}` });

// Pasta privada dos envios. Com o escopo `drive.file` o app só enxerga o que ele mesmo criou; por isso ele cria a pasta na primeira vez
// e depois a reencontra pelo nome. (DRIVE_FOLDER_ID só serve para forçar outra pasta, que o app precise ter acesso.)
const NOME_PASTA = 'Comunidade MAC - envios';
let pastaCache: string | null = null;
export const pasta = async (cfg: DriveCfg): Promise<string> => {
  if (cfg.folderId) return cfg.folderId;
  if (pastaCache) return pastaCache;
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${NOME_PASTA}' and trashed = false`;
  const l = await fetch(`${API}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, { headers: await auth(cfg) });
  if (!l.ok) throw new Error(`Drive: não procurou a pasta (${l.status})`);
  let id = ((await l.json()).files ?? [])[0]?.id as string | undefined;
  if (!id) {
    const c = await fetch(`${API}/drive/v3/files?fields=id`, {
      method: 'POST', headers: { ...(await auth(cfg)), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: NOME_PASTA, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!c.ok) throw new Error(`Drive: não criou a pasta (${c.status})`);
    id = (await c.json()).id as string;
  }
  pastaCache = id!;
  return pastaCache;
};

// Abre uma sessão de upload retomável e devolve o endereço dela. `origem` (o Origin do navegador) precisa ir junto: é o que faz o Google
// aceitar o PUT vindo direto da página (CORS).
export const iniciarUpload = async (cfg: DriveCfg, o: { nome: string; tipo: string; tamanho: number; origem: string | null }): Promise<string> => {
  const headers: Record<string, string> = {
    ...(await auth(cfg)),
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': o.tipo,
    'X-Upload-Content-Length': String(o.tamanho),
  };
  if (o.origem) headers.Origin = o.origem;
  const r = await fetch(`${API}/upload/drive/v3/files?uploadType=resumable&fields=id,name,size`, {
    method: 'POST', headers, body: JSON.stringify({ name: o.nome, parents: [await pasta(cfg)], mimeType: o.tipo }),
  });
  const url = r.headers.get('Location');
  if (!r.ok || !url) throw new Error(`Drive: não abriu o envio (${r.status})`);
  return url;
};

export type ArquivoDrive = { id: string; name: string; size: number; parents: string[]; trashed: boolean };

export const consultarArquivo = async (cfg: DriveCfg, id: string): Promise<ArquivoDrive | null> => {
  const r = await fetch(`${API}/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,size,parents,trashed`, { headers: await auth(cfg) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Drive: não consultou o arquivo (${r.status})`);
  const j = await r.json();
  return { id: j.id, name: j.name, size: Number(j.size ?? 0), parents: j.parents ?? [], trashed: !!j.trashed };
};

// Acha um arquivo pelo nome (envio que não chegou a registrar o código do arquivo).
export const procurarPorNome = async (cfg: DriveCfg, nomePrefixo: string): Promise<string[]> => {
  const q = `name contains '${nomePrefixo.replace(/'/g, '')}' and '${await pasta(cfg)}' in parents and trashed = false`;
  const r = await fetch(`${API}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=10`, { headers: await auth(cfg) });
  if (!r.ok) throw new Error(`Drive: não procurou o arquivo (${r.status})`);
  return ((await r.json()).files ?? []).map((f: { id: string }) => f.id);
};

// Apagar um arquivo que já não existe não é erro.
export const apagarArquivo = async (cfg: DriveCfg, id: string): Promise<void> => {
  const r = await fetch(`${API}/drive/v3/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await auth(cfg) });
  if (!r.ok && r.status !== 404) throw new Error(`Drive: não apagou o arquivo (${r.status})`);
};

// Conteúdo do arquivo (com suporte a Range, para o player pular trechos e funcionar no iPhone).
export const baixarArquivo = async (cfg: DriveCfg, id: string, range: string | null): Promise<Response> => {
  const headers: Record<string, string> = { ...(await auth(cfg)) };
  if (range) headers.Range = range;
  return await fetch(`${API}/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers });
};
