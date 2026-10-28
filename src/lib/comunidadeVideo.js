import * as tus from 'tus-js-client';
import { supabase } from './supabase';

// Envios de vídeo da Comunidade MAC. O arquivo vai direto do aparelho para o armazenamento (Google Drive do professor, ou Bunny se um dia
// for ativado); a função `comunidade-video` do Supabase só registra o envio, prepara o upload e entrega o link de reprodução (que expira).
const BASE = import.meta.env.DEV ? `${window.location.origin}/supabase-api` : 'https://bghvzdfikfhceekoxtxg.supabase.co';
const FUNC_URL = `${BASE}/functions/v1/comunidade-video`;

export const LIMITES = { bytes: 157286400, segundos: 180, tipos: ['video/mp4', 'video/quicktime', 'video/webm'] };
export const ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';

export const tamanhoLegivel = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const duracaoLegivel = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

async function chamar(action, corpo = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessão expirada. Entre novamente.');
    let res;
    try {
        res = await fetch(FUNC_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...corpo }),
        });
    } catch {
        throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Não foi possível concluir. Tente de novo.');
    return json;
}

// Duração lida do próprio arquivo, no aparelho. Se o navegador não conseguir decodificar (ex.: vídeo HEVC no Chrome do computador), devolve null.
export function lerDuracao(arquivo) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(arquivo);
        const v = document.createElement('video');
        const fim = (valor) => { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(valor); };
        const timer = setTimeout(() => fim(null), 15000);
        v.preload = 'metadata';
        v.onloadedmetadata = () => { clearTimeout(timer); fim(Number.isFinite(v.duration) ? v.duration : null); };
        v.onerror = () => { clearTimeout(timer); fim(null); };
        v.src = url;
    });
}

// Confere o arquivo antes de gastar internet. Devolve { duracao } ou lança Error com a mensagem para o aluno.
export async function validarArquivo(arquivo) {
    const tipo = arquivo.type || (/\.mov$/i.test(arquivo.name) ? 'video/quicktime' : '');
    if (!LIMITES.tipos.includes(tipo)) throw new Error('Formato não aceito. Envie um vídeo MP4, MOV ou WebM.');
    if (arquivo.size > LIMITES.bytes) throw new Error(`O vídeo tem ${tamanhoLegivel(arquivo.size)}. O limite é 150 MB: grave em qualidade menor ou corte o vídeo.`);
    const duracao = await lerDuracao(arquivo);
    if (duracao == null) throw new Error('Não consegui ler este vídeo. Tente enviar pelo celular ou use um arquivo MP4.');
    if (duracao > LIMITES.segundos) throw new Error(`O vídeo tem ${duracaoLegivel(duracao)}. O limite é 3 minutos.`);
    return { duracao: Math.max(1, Math.ceil(duracao)), tipo };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Envia o vídeo do aluno. `onProgresso(0..100)`. Devolve o id do envio.
export async function enviarVideo(arquivo, { espacoId, mensagem, visibilidade = 'professor', onProgresso }) {
    const { duracao, tipo } = await validarArquivo(arquivo);
    const { envio_id: envioId, provider, upload } = await chamar('criar', {
        espaco_id: espacoId, mensagem: mensagem?.trim() || null, duracao_s: duracao, tamanho_bytes: arquivo.size, tipo, visibilidade,
    });

    let fileId;
    if (provider === 'bunny') await enviarParaBunny(arquivo, tipo, envioId, upload, onProgresso);
    else fileId = await enviarParaDrive(arquivo, tipo, upload.url, onProgresso);

    // O armazenamento pode levar alguns segundos para registrar o arquivo recebido.
    let ultimoErro;
    for (let i = 0; i < 6; i++) {
        try { await chamar('confirmar', { envio_id: envioId, file_id: fileId }); return envioId; } catch (e) { ultimoErro = e; await esperar(1500); }
    }
    throw ultimoErro;
}

const FALHA_UPLOAD = 'O envio foi interrompido. Verifique a internet e tente de novo.';

// Drive: uma sessão de upload aberta pelo servidor; o aparelho manda o arquivo inteiro de uma vez (XHR, para ter a barra de progresso).
function enviarParaDrive(arquivo, tipo, url, onProgresso) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', tipo);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgresso?.(Math.round((e.loaded / e.total) * 100)); };
        xhr.onerror = () => reject(new Error(FALHA_UPLOAD));
        xhr.onload = () => {
            let id;
            try { id = JSON.parse(xhr.responseText).id; } catch { /* resposta inesperada */ }
            if (xhr.status >= 200 && xhr.status < 300 && id) resolve(id); else reject(new Error(FALHA_UPLOAD));
        };
        xhr.send(arquivo);
    });
}

// Bunny (opcional, desligado por padrão): upload retomável TUS direto para o Bunny.
function enviarParaBunny(arquivo, tipo, envioId, upload, onProgresso) {
    return new Promise((resolve, reject) => {
        new tus.Upload(arquivo, {
            endpoint: upload.endpoint,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
                AuthorizationSignature: upload.signature,
                AuthorizationExpire: String(upload.expire),
                VideoId: upload.videoId,
                LibraryId: upload.libraryId,
            },
            storeFingerprintForResuming: false,   // cada tentativa é um envio novo (retomar apontaria para o vídeo antigo, com outra assinatura)
            metadata: { filetype: tipo, title: `envio-${envioId}` },
            onError: () => reject(new Error(FALHA_UPLOAD)),
            onProgress: (enviado, total) => onProgresso?.(Math.round((enviado / total) * 100)),
            onSuccess: () => resolve(),
        }).start();
    });
}

// Como assistir: { tipo: 'iframe', url } (Bunny) ou { tipo: 'video', url } (Drive, tocado pelo <video> do app através da função).
export const urlDoEnvio = async (envioId) => {
    const r = await chamar('reproduzir', { envio_id: envioId });
    return r.tipo === 'video' ? { tipo: 'video', url: `${FUNC_URL}?s=${encodeURIComponent(r.token)}` } : { tipo: 'iframe', url: r.url };
};
export const apagarEnvio = (envioId) => chamar('apagar', { envio_id: envioId });
// Professor: depois de gravar a resposta, avisa o aluno por e-mail. Devolve true se o e-mail saiu.
export const avisarResposta = async (envioId) => (await chamar('avisar_resposta', { envio_id: envioId })).enviado === true;
