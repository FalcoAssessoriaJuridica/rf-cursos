import { supabase } from './supabase';

// Verificação em duas etapas (TOTP, app autenticador) do Supabase Auth.
// Níveis: aal1 = só a senha; aal2 = senha + código. O administrador que ativou o MFA só é tratado como administrador em aal2.

export async function mfaLevels() {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return { current: data?.currentLevel ?? null, next: data?.nextLevel ?? null };
}

// há um segundo fator cadastrado e a sessão ainda não o cumpriu
export async function mfaPending() {
    const { current, next } = await mfaLevels();
    return next === 'aal2' && current !== 'aal2';
}

// fatores TOTP já confirmados (os não confirmados não valem)
export async function verifiedFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    return data?.totp || [];
}

// inicia o cadastro: devolve o QR (imagem SVG) e o código para digitar à mão. Limpa tentativas antigas não confirmadas.
export async function enrollTotp() {
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of (all?.all || []).filter((x) => x.factor_type === 'totp' && x.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `App autenticador ${new Date().toLocaleDateString('pt-BR')} ${Date.now() % 100000}` });
    if (error) throw new Error(error.message.includes('enabled') ? 'A verificação em duas etapas não está habilitada no Supabase (Authentication → MFA).' : error.message);
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(factorId, code) {
    const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
    if (e1) throw new Error(e1.message);
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: String(code).replace(/\s/g, '') });
    if (error) throw new Error(/invalid/i.test(error.message) ? 'Código incorreto ou expirado. Confira o app e tente de novo.' : error.message);
}

export async function unenrollTotp(factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw new Error(error.message);
}
