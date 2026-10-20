// Verificação da senha mestra do administrador.
// O build grava apenas um hash PBKDF2 (vite.config.js); a senha em texto puro não vai para o bundle.
// Observação: isto é uma barreira de interface. A proteção real dos dados precisa de regras (RLS) no Supabase.

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const adminLoginConfigured = () => Boolean(__ADMIN_HASH__);

export async function verifyAdminPassword(password) {
    if (!__ADMIN_HASH__ || !globalThis.crypto?.subtle) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(__ADMIN_SALT__), iterations: __ADMIN_ITERATIONS__ },
        key,
        256
    );
    const derived = toHex(bits);
    // comparação em tempo constante
    if (derived.length !== __ADMIN_HASH__.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) diff |= derived.charCodeAt(i) ^ __ADMIN_HASH__.charCodeAt(i);
    return diff === 0;
}
