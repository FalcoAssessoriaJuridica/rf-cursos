import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { signIn, signOut, hasPendingMfa, completeMfa } from '../lib/auth';
import Captcha from '../components/Captcha';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Mail, Lock, ChevronRight, ShieldCheck } from 'lucide-react';
import { findDemoStudentByLogin } from '../lib/demoCourses';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoaded, setIsLoaded] = useState(false);
    const [step, setStep] = useState('senha');   // 'senha' | 'codigo' (verificação em duas etapas do administrador)
    const [code, setCode] = useState('');
    const captcha = useRef(null);

    useEffect(() => {
        setIsLoaded(true);
        // recarregou a página no meio do login: a senha já foi aceita e só falta o código
        hasPendingMfa().then((pendente) => { if (pendente) setStep('codigo'); });
    }, []);

    const handleCode = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const role = await completeMfa(code);
            navigate(role === 'admin' ? '/admin' : '/student');
        } catch (err) {
            setError(err.message || 'Não foi possível confirmar o código.');
        } finally {
            setLoading(false);
        }
    };

    const cancelMfa = async () => { await signOut(); setCode(''); setError(''); setStep('senha'); };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Alunos de demonstração (locais; só existem em desenvolvimento ou com VITE_ENABLE_DEMO)
            const demo = findDemoStudentByLogin(email, password);
            if (demo) {
                localStorage.setItem('rf_role', 'student');
                localStorage.setItem('rf_user_id', demo.id);
                localStorage.setItem('rf_user_email', demo.email);
                localStorage.setItem('rf_user_name', demo.nome_completo);
                navigate('/student');
                return;
            }

            // Supabase Auth: a senha é verificada no servidor e o papel (admin/aluno) vem do token, não do navegador
            const token = await captcha.current?.fresh();
            const { role, mfaPending } = await signIn(email, password, token);
            if (mfaPending) { setStep('codigo'); return; }
            navigate(role === 'admin' ? '/admin' : '/student');
        } catch (err) {
            setError(err.message || 'Ocorreu um erro ao tentar acessar.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background login-root">
            <ThemeToggle className="absolute top-4 right-4 z-20" />
            {/* BACKGROUND LAYER - Simplified Luxury Dark */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-br from-black via-[#09090b] to-[#121212] login-gradient" />
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_var(--color-primary)_0%,_transparent_70%)] blur-[120px]" />
            </div>

            {/* CONTENT LAYER */}
            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={isLoaded ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                className="relative z-10 w-full max-w-[420px] px-6"
            >
                <div className="liquid-glass login-card p-8 rounded-[2.5rem] relative glass-shimmer">
                    <div className="mb-10 text-center">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            transition={{ delay: 0.3, duration: 0.8, type: "spring" }}
                            className="relative inline-block mb-6"
                        >
                            <div className="absolute -inset-4 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                            <img
                                src="/logo-rf.png"
                                alt="RF Logo"
                                className="relative h-24 w-24 object-cover rounded-2xl border border-primary/30 shadow-[0_0_30px_rgba(212,175,55,0.3)] mx-auto rotate-1 group-hover:rotate-0 transition-transform duration-500"
                            />
                        </motion.div>
                        <h1 className="text-4xl font-black tracking-tighter text-luxury-gold uppercase leading-none">
                            RF <span className="text-white">MUSIC</span>
                            <span className="block text-[10px] tracking-[0.5em] font-bold mt-2 opacity-50 text-white">PREMIUM ACADEMY</span>
                        </h1>
                    </div>

                    {step === 'codigo' ? (
                        <form onSubmit={handleCode} className="space-y-5">
                            <div className="flex items-center justify-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><p className="text-sm font-bold uppercase tracking-widest">Verificação em duas etapas</p></div>
                            <p className="text-center text-sm text-white/70">Abra o app autenticador no celular e digite o código de 6 dígitos de RF Music Academy.</p>
                            <input
                                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
                                aria-label="Código de 6 dígitos"
                                className="input-field text-center text-2xl tracking-[0.5em]"
                                value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                            />
                            {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 py-2 text-center text-xs font-medium text-red-400">{error}</p>}
                            <button type="submit" disabled={loading || code.replace(/\s/g, '').length < 6} className="btn-primary h-[54px] w-full disabled:opacity-60">{loading ? 'CONFIRMANDO...' : 'CONFIRMAR'}</button>
                            <p className="text-center"><button type="button" onClick={cancelMfa} className="text-sm text-white/60 underline underline-offset-4 hover:text-primary">Cancelar e voltar</button></p>
                        </form>
                    ) : (
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-primary/70 ml-1">E-mail de Acesso</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="email"
                                    placeholder="seu@email.com"
                                    className="input-field pl-12"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-primary/70 ml-1">Senha Privada</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    className="input-field pl-12"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <Captcha ref={captcha} />

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="text-red-400 text-xs text-center font-medium bg-red-400/10 py-2 rounded-lg border border-red-400/20"
                                >
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full flex items-center justify-center gap-2 group overflow-hidden h-[54px]"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                {loading ? 'AUTENTICANDO...' : 'ACESSAR PORTAL'}
                                {!loading && <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />}
                            </span>
                        </button>
                    </form>
                    )}

                    <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
                        <Link to="/recuperar-senha" className="text-white/60 underline underline-offset-4 hover:text-primary">Esqueci minha senha</Link>
                        <Link to="/cadastro" className="text-primary underline underline-offset-4 hover:text-primary-hover">Criar conta</Link>
                    </p>

                    <div className="mt-8 text-center">
                        <p className="text-[10px] text-white/40 uppercase tracking-widest leading-loose">
                            Ambiente Restrito & Criptografado <br />
                            © {new Date().getFullYear()} RF Music Academy
                        </p>
                        <p className="mt-2 text-[10px] uppercase tracking-widest text-white/40">
                            <Link to="/termos" className="hover:text-primary">Termos de Uso</Link> · <Link to="/privacidade" className="hover:text-primary">Privacidade</Link>
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

