import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Phone, IdCard, ChevronRight } from 'lucide-react';
import { maskCpf, cpfValido } from '../lib/cpf';
import { VERSAO_TERMOS } from '../legal/dados';
import { cadastrar } from '../lib/pagamentos';
import { signIn, MIN_PASSWORD } from '../lib/auth';
import ThemeToggle from '../components/ThemeToggle';
import Captcha from '../components/Captcha';

const maskPhone = (v = '') => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

function Campo({ label, icon: Icon, children }) {
    return (
        <label className="block space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-primary/70 ml-1">{label}</span>
            <div className="relative group">
                <Icon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30 group-focus-within:text-primary transition-colors" />
                {children}
            </div>
        </label>
    );
}

export default function Cadastro() {
    const navigate = useNavigate();
    const [f, setF] = useState({ aceito: false, nome: '', email: '', telefone: '', cpf: '', senha: '', repita: '', site: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const captcha = useRef(null);
    const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (!f.aceito) { setError('Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.'); return; }
        if (!cpfValido(f.cpf)) { setError('CPF inválido. Confira os números.'); return; }
        if (f.senha !== f.repita) { setError('As duas senhas não são iguais.'); return; }
        setLoading(true);
        try {
            const tokenCadastro = await captcha.current?.fresh();
            await cadastrar({ nome_completo: f.nome, email: f.email, telefone: f.telefone, cpf: f.cpf, password: f.senha, site: f.site, aceito: true, termos_versao: VERSAO_TERMOS, captcha_token: tokenCadastro });
            const tokenLogin = await captcha.current?.fresh();   // o token do cadastro já foi usado
            await signIn(f.email, f.senha, tokenLogin);
            navigate('/student/planos');
        } catch (err) {
            setError(err.message || 'Não foi possível criar a conta.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background login-root py-10">
            <ThemeToggle className="absolute top-4 right-4 z-20" />
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-br from-black via-[#09090b] to-[#121212] login-gradient" />
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_var(--color-primary)_0%,_transparent_70%)] blur-[120px]" />
            </div>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }} className="relative z-10 w-full max-w-[440px] px-6">
                <div className="liquid-glass login-card p-8 rounded-[2.5rem] relative glass-shimmer">
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl font-black tracking-tighter text-luxury-gold uppercase leading-none">Criar conta</h1>
                        <p className="mt-3 text-sm text-white/60">Cadastre-se, escolha seu curso e comece. O acesso é liberado assim que o pagamento é confirmado.</p>
                    </div>

                    <form onSubmit={submit} className="space-y-4">
                        <Campo label="Nome completo" icon={User}>
                            <input className="input-field pl-12" autoComplete="name" required minLength={3} value={f.nome} onChange={set('nome')} />
                        </Campo>
                        <Campo label="E-mail" icon={Mail}>
                            <input className="input-field pl-12" type="email" autoComplete="email" required value={f.email} onChange={set('email')} placeholder="seu@email.com" />
                        </Campo>
                        <Campo label="CPF" icon={IdCard}>
                            <input className="input-field pl-12" inputMode="numeric" autoComplete="off" required value={f.cpf} onChange={(e) => setF((s) => ({ ...s, cpf: maskCpf(e.target.value) }))} placeholder="000.000.000-00" />
                        </Campo>
                        <Campo label="WhatsApp (opcional)" icon={Phone}>
                            <input className="input-field pl-12" inputMode="tel" autoComplete="tel" value={f.telefone} onChange={(e) => setF((s) => ({ ...s, telefone: maskPhone(e.target.value) }))} placeholder="(67) 90000-0000" />
                        </Campo>
                        <Campo label={`Senha (mín. ${MIN_PASSWORD} caracteres)`} icon={Lock}>
                            <input className="input-field pl-12" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={f.senha} onChange={set('senha')} />
                        </Campo>
                        <Campo label="Repita a senha" icon={Lock}>
                            <input className="input-field pl-12" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={f.repita} onChange={set('repita')} />
                        </Campo>

                        <label className="flex items-start gap-3 text-xs leading-relaxed text-white/70">
                            <input type="checkbox" required checked={f.aceito} onChange={(e) => setF((s) => ({ ...s, aceito: e.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]" />
                            <span>
                                Li e aceito os <Link to="/termos" target="_blank" rel="noopener" className="text-primary underline underline-offset-4">Termos de Uso</Link> e
                                a <Link to="/privacidade" target="_blank" rel="noopener" className="text-primary underline underline-offset-4">Política de Privacidade</Link>.
                            </span>
                        </label>

                        <Captcha ref={captcha} />

                        {/* campo isca: invisível para pessoas; robôs costumam preencher */}
                        <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.site} onChange={set('site')} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="site" />

                        <AnimatePresence>
                            {error && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} role="alert"
                                    className="text-red-400 text-xs text-center font-medium bg-red-400/10 py-2 px-3 rounded-lg border border-red-400/20">
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 group h-[54px] disabled:opacity-60">
                            <span className="flex items-center gap-2">
                                {loading ? 'CRIANDO CONTA...' : 'CRIAR CONTA'}
                                {!loading && <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />}
                            </span>
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-white/60">
                        Já tem conta? <Link to="/login" className="text-primary underline underline-offset-4">Entrar</Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
