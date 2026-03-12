import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Mail, Lock, ChevronRight } from 'lucide-react';

export default function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setIsLoaded(true);
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const masterPassword = import.meta.env.VITE_ADMIN_MASTER_PASSWORD || 'admin';

            if (password === masterPassword && email === 'falco.adv@gmail.com') {
                localStorage.setItem('rf_role', 'admin');
                navigate('/admin');
                return;
            }

            const { data: profile, error: pError } = await supabase
                .from('perfis')
                .select('*')
                .eq('email', email)
                .eq('senha', password)
                .single();

            if (pError || !profile) {
                setError('Acesso negado. Verifique suas credenciais.');
                return;
            }

            localStorage.setItem('rf_role', 'student');
            localStorage.setItem('rf_user_id', profile.id);
            localStorage.setItem('rf_user_email', profile.email);
            localStorage.setItem('rf_user_name', profile.nome_completo);

            navigate('/student');

        } catch (err) {
            setError('Ocorreu um erro ao tentar acessar.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-black">
            {/* BACKGROUND LAYER - Simplified Luxury Dark */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-br from-black via-[#09090b] to-[#121212]" />
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_var(--color-primary)_0%,_transparent_70%)] blur-[120px]" />
            </div>

            {/* CONTENT LAYER */}
            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={isLoaded ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                className="relative z-10 w-full max-w-[420px] px-6"
            >
                <div className="liquid-glass p-8 rounded-[2.5rem] border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] relative glass-shimmer">
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

                    <div className="mt-8 text-center">
                        <p className="text-[10px] text-white/40 uppercase tracking-widest leading-loose">
                            Ambiente Restrito & Criptografado <br />
                            © {new Date().getFullYear()} RF Music Academy
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

