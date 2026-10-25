import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { enrollTotp, mfaLevels, unenrollTotp, verifiedFactors, verifyTotp } from '../../lib/mfa';

// Verificação em duas etapas do administrador (app autenticador). Com ela ativa, o painel só abre com senha + código,
// e o banco e as funções recusam ações de administrador de uma sessão sem o código.
export default function Seguranca() {
    const [state, setState] = useState({ loading: true, factors: [], level: null, erro: '' });
    const [enroll, setEnroll] = useState(null);     // { id, qr, secret } durante o cadastro
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');
    const [ok, setOk] = useState('');
    const [copiado, setCopiado] = useState(false);

    const load = async () => {
        try {
            const [factors, lv] = await Promise.all([verifiedFactors(), mfaLevels()]);
            setState({ loading: false, factors, level: lv.current, erro: '' });
        } catch (e) { setState({ loading: false, factors: [], level: null, erro: e.message }); }
    };
    useEffect(() => { load(); }, []);

    const start = async () => {
        setErro(''); setOk(''); setBusy(true);
        try { setEnroll(await enrollTotp()); setCode(''); } catch (e) { setErro(e.message); } finally { setBusy(false); }
    };
    const confirm = async (e) => {
        e.preventDefault();
        setErro(''); setBusy(true);
        try {
            await verifyTotp(enroll.id, code);
            setEnroll(null); setCode('');
            setOk('Verificação em duas etapas ativada. Na próxima vez que você entrar, o código do app será pedido.');
            await load();
        } catch (err) { setErro(err.message); } finally { setBusy(false); }
    };
    const disable = async (id) => {
        if (!confirm_('Desativar a verificação em duas etapas? O painel passa a abrir só com a senha.')) return;
        setErro(''); setOk(''); setBusy(true);
        try { await unenrollTotp(id); setOk('Verificação em duas etapas desativada.'); await load(); }
        catch (err) { setErro(/aal2/i.test(err.message) ? 'Para desativar, entre de novo com o código do app e tente outra vez.' : err.message); }
        finally { setBusy(false); }
    };
    const copy = async () => { try { await navigator.clipboard.writeText(enroll.secret); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem permissão */ } };

    const ativo = state.factors.length > 0;
    return (
        <div className="mx-auto max-w-2xl space-y-8 pb-10">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Segurança da conta</h1>
                <p className="mt-2 text-sm text-text-muted">A verificação em duas etapas protege o painel mesmo que alguém descubra a sua senha: além dela, é preciso o código de 6 dígitos do seu celular.</p>
            </header>

            {state.loading && <div className="h-32 animate-pulse rounded-[2rem] bg-white/5" aria-busy="true" />}
            {state.erro && <p role="alert" className="text-sm font-semibold text-red-500">{state.erro}</p>}

            {!state.loading && !state.erro && (
                <section className="liquid-glass space-y-5 rounded-[2rem] p-6 md:p-8">
                    <div className="flex items-center gap-3">
                        {ativo ? <ShieldCheck className="h-6 w-6 text-green-500" /> : <ShieldOff className="h-6 w-6 text-yellow-500" />}
                        <h2 className="text-lg font-bold">Verificação em duas etapas: {ativo ? 'ativa' : 'desativada'}</h2>
                    </div>

                    {ativo && !enroll && (
                        <ul className="divide-y divide-white/10">
                            {state.factors.map((f) => (
                                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                    <span className="text-sm"><span className="font-semibold">{f.friendly_name || 'App autenticador'}</span><span className="block text-xs text-text-muted">Cadastrado em {new Date(f.created_at).toLocaleDateString('pt-BR')}</span></span>
                                    <button type="button" disabled={busy} onClick={() => disable(f.id)} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-text-muted hover:border-red-500/50 hover:text-red-500 disabled:opacity-50">Desativar</button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!ativo && !enroll && (
                        <button type="button" onClick={start} disabled={busy} className="btn-primary flex h-12 items-center gap-2 px-8 disabled:opacity-60">
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Ativar verificação em duas etapas
                        </button>
                    )}

                    {enroll && (
                        <form onSubmit={confirm} className="space-y-5">
                            <ol className="list-decimal space-y-4 pl-5 text-sm text-text-muted">
                                <li>Instale um app autenticador no celular (Google Authenticator, Microsoft Authenticator, Authy ou 1Password).</li>
                                <li>
                                    Leia este QR code no app:
                                    <img src={enroll.qr} alt="QR code para o app autenticador" className="mt-3 h-44 w-44 rounded-xl bg-white p-2" />
                                    <span className="mt-3 block">Se não conseguir ler, digite este código no app:</span>
                                    <span className="mt-1 flex items-center gap-2"><code className="break-all rounded-md bg-black/30 px-2 py-1 text-xs text-text">{enroll.secret}</code>
                                        <button type="button" onClick={copy} className="flex items-center gap-1 text-xs font-semibold text-primary">{copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiado ? 'Copiado' : 'Copiar'}</button></span>
                                </li>
                                <li>
                                    Digite o código de 6 dígitos que o app mostrar:
                                    <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                                        aria-label="Código de 6 dígitos" className="input-field mt-3 block w-48 text-center text-xl tracking-[0.4em]" />
                                </li>
                            </ol>
                            <div className="flex flex-wrap items-center gap-4">
                                <button type="submit" disabled={busy || code.replace(/\s/g, '').length < 6} className="btn-primary flex h-12 items-center gap-2 px-8 disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar e ativar</button>
                                <button type="button" onClick={() => { setEnroll(null); setCode(''); setErro(''); }} className="text-sm font-semibold text-text-muted underline underline-offset-4">Cancelar</button>
                            </div>
                        </form>
                    )}

                    {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
                    {ok && <p role="status" className="text-sm font-semibold text-green-600">{ok}</p>}
                </section>
            )}

            <section className="rounded-2xl border border-white/10 p-5 text-sm text-text-muted">
                <h2 className="mb-2 font-bold text-text">Se você perder o celular</h2>
                <p>Não há código de recuperação automático. Quem tem acesso ao painel do Supabase pode remover o fator: <em>Authentication → Users →</em> sua conta <em>→ Multi-factor →</em> excluir. Por isso, mantenha o acesso ao Supabase seguro e, se possível, cadastre o mesmo QR code em dois aparelhos.</p>
            </section>
        </div>
    );
}

const confirm_ = (msg) => window.confirm(msg);
