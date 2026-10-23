import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { supabase } from '../lib/supabase';
import { MIN_PASSWORD, passwordProblem, updatePassword } from '../lib/auth';

// Destino do link do e-mail de recuperação: o Supabase abre uma sessão temporária a partir do link e aqui se define a senha nova.
export default function RedefinirSenha() {
    const navigate = useNavigate();
    const [ready, setReady] = useState(null); // null = verificando, true = link válido, false = inválido/expirado
    const [pass, setPass] = useState('');
    const [again, setAgain] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        let alive = true;
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (!alive) return;
            if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
        });
        // o link pode já ter sido processado antes de este componente montar
        supabase.auth.getSession().then(({ data: { session } }) => { if (alive && session) setReady(true); });
        const t = setTimeout(() => { if (alive) setReady((r) => (r === null ? false : r)); }, 3500);
        return () => { alive = false; clearTimeout(t); sub.subscription.unsubscribe(); };
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        const problem = passwordProblem(pass);
        if (problem) { setError(problem); return; }
        if (pass !== again) { setError('As duas senhas não são iguais.'); return; }
        setBusy(true);
        try {
            await updatePassword(pass);
            setDone(true);
            // o link do e-mail já abriu uma sessão: leva direto à área da pessoa (e ao login só se a sessão não existir)
            setTimeout(() => {
                const role = localStorage.getItem('rf_role');
                navigate(role === 'admin' ? '/admin' : role === 'student' ? '/student' : '/login');
            }, 1800);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background login-root">
            <ThemeToggle className="absolute top-4 right-4 z-20" />
            <div className="relative z-10 w-full max-w-[420px] px-6">
                <div className="liquid-glass login-card p-8 rounded-[2.5rem] relative">
                    <h1 className="text-2xl font-black tracking-tight text-center">Criar senha nova</h1>
                    {ready === null && <p className="mt-6 text-center text-sm text-white/70">Verificando o link…</p>}
                    {ready === false && (
                        <div className="mt-6 space-y-4 text-center" role="alert">
                            <p className="text-sm text-white/80">Este link expirou ou já foi usado. Peça um novo.</p>
                            <Link to="/recuperar-senha" className="btn-primary inline-flex h-12 items-center px-6">Pedir novo link</Link>
                        </div>
                    )}
                    {ready && !done && (
                        <form onSubmit={submit} className="mt-6 space-y-5">
                            {[['nova', 'Senha nova', pass, setPass], ['rep', 'Repita a senha nova', again, setAgain]].map(([id, label, v, set]) => (
                                <div key={id} className="space-y-2">
                                    <label htmlFor={`rs-${id}`} className="text-[10px] uppercase font-bold tracking-widest text-primary/70 ml-1">{label}</label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30 group-focus-within:text-primary transition-colors" />
                                        <input id={`rs-${id}`} type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input-field pl-12" value={v} onChange={(e) => set(e.target.value)} />
                                    </div>
                                </div>
                            ))}
                            <p className="text-xs text-white/60">Mínimo de {MIN_PASSWORD} caracteres.</p>
                            {error && <p role="alert" className="text-red-400 text-xs text-center font-medium bg-red-400/10 py-2 rounded-lg border border-red-400/20">{error}</p>}
                            <button type="submit" disabled={busy} className="btn-primary w-full h-[54px] flex items-center justify-center">{busy ? 'SALVANDO...' : 'SALVAR SENHA'}</button>
                        </form>
                    )}
                    {done && <p role="status" className="mt-6 text-center text-sm font-semibold text-primary">Senha alterada! Levando você para a plataforma…</p>}
                </div>
            </div>
        </div>
    );
}
