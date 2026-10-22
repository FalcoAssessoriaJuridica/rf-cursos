// Converte PDF/imagem de partitura em MusicXML pelo serviço OMR (Audiveris), que roda no servidor.
// Em desenvolvimento, o Vite encaminha /__omr para o container local e acrescenta a chave; em produção use VITE_OMR_ENDPOINT
// (uma função do Supabase ou o serviço no VPS, sempre com a chave guardada no servidor, nunca no navegador).
const ENDPOINT = import.meta.env.VITE_OMR_ENDPOINT || '/__omr/convert';

export async function convertToMusicXml(file, { signal } = {}) {
    const body = new FormData();
    body.append('file', file, file.name);
    const res = await fetch(ENDPOINT, { method: 'POST', body, signal });
    if (!res.ok) {
        let msg = 'Não foi possível ler a partitura.';
        try { msg = (await res.json()).detail || msg; } catch { /* corpo sem JSON */ }
        throw new Error(String(msg).slice(0, 220));
    }
    return res.arrayBuffer(); // .mxl
}

export const isPdfOrImage = (f) => /\.(pdf|png|jpe?g|tiff?)$/i.test(f.name);
export const isMusicXml = (f) => /\.(mxl|musicxml|xml)$/i.test(f.name);
