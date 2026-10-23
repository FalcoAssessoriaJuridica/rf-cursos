import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ChevronLeft } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { requestPasswordReset } from '../lib/auth';

// "Esqueci minha senha": envia o link de redefinição. A mensagem é a mesma exista ou não o e-mail (não revela quem é aluno).
export default function RecuperarSenha() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try { await requestPasswordReset(email); } catch { /* resposta igual de propósito */ }
        setSent(true);
        setBusy(false);
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background login-root">
            <ThemeToggle className="absolute top-4 right-4 z-20" />
            <div className="relative z-10 w-full max-w-[420px] px-6">
                <div className="liquid-glass login-card p-8 rounded-[2.5rem] relative">
                    <h1 className="text-2xl font-black tracking-tight text-center">Recuperar senha</h1>
                    {sent ? (
                        <div className="mt-6 space-y-4 text-center" role="status">
                            <p className="text-sm text-white/80">Se este e-mail estiver cadastrado, você vai receber em instantes um link para criar uma senha nova. Olhe também a caixa de spam.</p>
                            <Link to="/login" className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4"><ChevronLeft className="h-4 w-4" /> Voltar para o login</Link>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="mt-6 space-y-5">
                            <p className="text-sm text-white/70 text-center">Informe o e-mail do seu cadastro. Enviaremos um link para você escolher uma senha nova.</p>
                            <div className="space-y-2">
                                <label htmlFor="rec-email" className="text-[10px] uppercase font-bold tracking-widest text-primary/70 ml-1">E-mail de acesso</label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30 group-focus-within:text-primary transition-colors" />
                                    <input id="rec-email" type="email" required autoComplete="email" placeholder="seu@email.com" className="input-field pl-12" value={email} onChange={(e) => setEmail(e.target.value)} />
                                </div>
                            </div>
                            <button type="submit" disabled={busy} className="btn-primary w-full h-[54px] flex items-center justify-center">{busy ? 'ENVIANDO...' : 'ENVIAR LINK'}</button>
                            <p className="text-center"><Link to="/login" className="text-sm text-white/60 underline underline-offset-4 hover:text-primary">Voltar para o login</Link></p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
