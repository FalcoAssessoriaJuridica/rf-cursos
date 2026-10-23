import { supabase } from './supabase';
import { DEMO_ENABLED } from './demoCourses';

// Autenticação pelo Supabase Auth. A SESSÃO (JWT) é a fonte da verdade e quem protege os dados é o banco (RLS).
// As chaves rf_* do localStorage só espelham a sessão para a interface (rota, nome no menu); adulterá-las pelo
// navegador não dá acesso a nada, porque a API valida o JWT em cada consulta.
//
// A área de demonstração (alunos "demo-aluno-*", só em desenvolvimento ou com VITE_ENABLE_DEMO) continua local e nunca chama o Supabase.
const MIRROR = ['rf_role', 'rf_user_id', 'rf_user_email', 'rf_user_name', 'rf_return_admin'];
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const del = (k) => { try { localStorage.removeItem(k); } catch { /* sem storage */ } };

export const isDemoSession = () => DEMO_ENABLED && String(get('rf_user_id') || '').startsWith('demo-aluno-');
export const clearLocalSession = () => MIRROR.forEach(del);

export const roleOf = (user) => (user?.app_metadata?.role === 'admin' ? 'admin' : 'student');

// espelha o usuário verificado na interface. O admin não é "aluno": fica sem rf_user_id (pré-visualiza a área do aluno).
async function mirrorUser(user) {
    const role = roleOf(user);
    set('rf_role', role);
    set('rf_user_email', user.email || '');
    let nome = user.user_metadata?.nome_completo || '';
    try {
        const { data } = await supabase.from('perfis').select('nome_completo').eq('id', user.id).maybeSingle();
        if (data?.nome_completo) nome = data.nome_completo;
    } catch { /* usa o nome do cadastro */ }
    if (nome) set('rf_user_name', nome); else del('rf_user_name');
    if (role === 'student') set('rf_user_id', user.id); else del('rf_user_id');
    return role;
}

// Roda antes de desenhar o app: valida a sessão guardada e limpa qualquer papel forjado no localStorage.
export async function initAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            if (!isDemoSession()) await mirrorUser(session.user);
        } else if (!isDemoSession()) {
            clearLocalSession();
        }
    } catch {
        if (!isDemoSession()) clearLocalSession();
    }
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' && !isDemoSession()) {
            const hadSession = !!get('rf_role');
            clearLocalSession();
            if (hadSession && !/^\/(login|recuperar-senha|redefinir-senha)?$/.test(window.location.pathname)) window.location.assign('/login');
        } else if (event === 'USER_UPDATED' && session?.user && !isDemoSession()) {
            mirrorUser(session.user);
        }
    });
}

const friendly = (error) => {
    const code = error?.code || '';
    const msg = String(error?.message || '');
    if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'Acesso negado. Verifique suas credenciais.';
    if (code === 'over_request_rate_limit' || /rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (/network|fetch/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    return 'Não foi possível entrar. Tente de novo.';
};

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: String(email).trim(), password });
    if (error || !data?.session) throw new Error(friendly(error));
    clearLocalSession(); // descarta qualquer sessão de demonstração anterior
    const role = await mirrorUser(data.session.user);
    return { role, user: data.session.user };
}

export async function signOut() {
    // scope 'local': sair aqui NÃO derruba a sessão da mesma conta em outros aparelhos (o padrão do supabase-js é 'global')
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* encerra a sessão local mesmo sem rede */ }
    clearLocalSession();
}

// "Esqueci minha senha": o e-mail traz um link para /redefinir-senha. A resposta é sempre a mesma (não revela se o e-mail existe).
export async function requestPasswordReset(email) {
    await supabase.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: `${window.location.origin}/redefinir-senha` });
}

export const MIN_PASSWORD = 8;
export const passwordProblem = (p) => (p.length < MIN_PASSWORD ? `Use pelo menos ${MIN_PASSWORD} caracteres.` : null);

export async function updatePassword(newPassword) {
    const problem = passwordProblem(newPassword);
    if (problem) throw new Error(problem);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(/same|different/i.test(error.message || '') ? 'A nova senha precisa ser diferente da atual.' : 'Não foi possível trocar a senha. Abra o link do e-mail de novo e tente outra vez.');
}

// confirma a senha atual antes de trocar (Meu perfil)
export async function changePassword(currentPassword, newPassword) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('Sua sessão expirou. Entre de novo.');
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (error) throw new Error('A senha atual não confere.');
    await updatePassword(newPassword);
}
