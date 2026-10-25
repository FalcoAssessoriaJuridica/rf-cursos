// Converte PDF/imagem de partitura em MusicXML pelo serviço OMR (Audiveris), que roda no servidor (omr-service).
// Produção: a função omr-convert do Supabase confere quem é (administrador ou aluno com curso ativo, com limite diário) e entrega um
// bilhete de uso único; o arquivo vai direto ao serviço com esse bilhete. A chave do serviço nunca fica no navegador.
// Desenvolvimento: o Vite encaminha /__omr para o container local e acrescenta a chave. VITE_OMR_ENDPOINT força um endereço fixo.
import { supabase } from '../lib/supabase';

const FIXED = import.meta.env.VITE_OMR_ENDPOINT || '';
const DEV = import.meta.env.DEV;

async function funcError(error) {
    try { const j = await error.context?.json?.(); if (j?.error) return j.error; } catch { /* corpo sem JSON */ }
    return 'Não foi possível iniciar a leitura da partitura.';
}

export async function convertToMusicXml(file, { signal } = {}) {
    let url = FIXED || '/__omr/convert';
    const headers = {};
    if (!FIXED && !DEV) {
        const { data, error } = await supabase.functions.invoke('omr-convert');
        if (error) throw new Error(await funcError(error));
        url = data.url;
        headers['X-Ticket'] = data.ticket;
    }
    const body = new FormData();
    body.append('file', file, file.name);
    const res = await fetch(url, { method: 'POST', body, headers, signal });
    if (!res.ok) {
        let msg = 'Não foi possível ler a partitura.';
        try { msg = (await res.json()).detail || msg; } catch { /* corpo sem JSON */ }
        throw new Error(String(msg).slice(0, 220));
    }
    return res.arrayBuffer(); // .mxl
}

export const isPdfOrImage = (f) => /\.(pdf|png|jpe?g|tiff?)$/i.test(f.name);
export const isMusicXml = (f) => /\.(mxl|musicxml|xml)$/i.test(f.name);
