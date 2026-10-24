import { supabase } from './supabase';

// Arquivos do Drive (PDF/áudio das aulas) passam pela função `drive-proxy`, que exige login e acesso à aula.
const BASE = import.meta.env.DEV ? `${window.location.origin}/supabase-api` : 'https://bghvzdfikfhceekoxtxg.supabase.co';
export const DRIVE_FUNC_URL = `${BASE}/functions/v1/drive-proxy`;

export const driveProxyUrl = (id, params = {}) => `${DRIVE_FUNC_URL}?${new URLSearchParams({ id, ...params })}`;

// fetch com o login do usuário (um <audio src> não consegue enviar o cabeçalho; por isso o áudio também vem por aqui).
export async function driveFetch(url) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessão expirada. Entre novamente.');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } });
    if (res.status === 401 || res.status === 403) throw new Error('Você não tem acesso a este arquivo.');
    if (!res.ok) throw new Error('Erro ao buscar o arquivo.');
    return res;
}
