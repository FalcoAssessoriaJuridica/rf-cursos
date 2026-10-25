import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, Trash2 } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { loadProfile, saveProfile, uploadAvatar, removeAvatar } from '../../lib/profile';
import { changePassword, MIN_PASSWORD, isDemoSession } from '../../lib/auth';
import { PRAZOS, STATUS_ASSINATURA, minhasAssinaturas, meusPagamentosPix, pagamentos } from '../../lib/pagamentos';

const EXTRA_FIELDS = [
    { key: 'data_nascimento', label: 'Data de nascimento', type: 'date' },
    { key: 'cidade', label: 'Cidade', type: 'text', placeholder: 'Ex.: Campo Grande - MS' },
];

const maskPhone = (v = '') => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

function Field({ label, hint, children }) {
    return (
        <label className="block space-y-2">
            <span className="profile-label text-xs font-bold uppercase tracking-widest text-primary">{label}</span>
            {children}
            {hint && <span className="profile-hint block text-xs text-text-muted">{hint}</span>}
        </label>
    );
}

// Assinaturas (Stripe): situação de cada curso e acesso ao portal do Stripe (trocar cartão, ver faturas, cancelar).
function SubscriptionsCard() {
    const [lista, setLista] = useState(null);
    const [pix, setPix] = useState([]);
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        minhasAssinaturas().then((l) => setLista(l.filter((a) => !a.motivo))).catch(() => setLista([]));
        meusPagamentosPix().then(setPix).catch(() => setPix([]));
    }, []);
    if (!lista?.length && !pix.length) return null;

    const abrirPortal = async () => {
        setErro(''); setBusy(true);
        try { const { url } = await pagamentos('portal'); window.location.assign(url); }
        catch (e) { setErro(e.message); setBusy(false); }
    };

    return (
        <section className="liquid-glass profile-card space-y-5 rounded-[2rem] p-6 md:p-8" aria-label="Minhas assinaturas">
            <h2 className="text-lg font-bold text-text">Minhas assinaturas</h2>
            <ul className="divide-y divide-white/10">
                {lista.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                            <p className="font-semibold text-text">{a.cursos?.titulo}</p>
                            <p className="text-xs text-text-muted">
                                {PRAZOS.find((p) => p.id === a.prazo)?.label}
                                {a.periodo_fim && ` · ${a.status === 'canceled' || a.cancela_no_fim ? 'acesso até' : 'próxima cobrança em'} ${new Date(a.periodo_fim).toLocaleDateString('pt-BR')}`}
                            </p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{STATUS_ASSINATURA[a.status] ?? a.status}{a.cancela_no_fim && a.status !== 'canceled' ? ' · cancela no fim' : ''}</span>
                    </li>
                ))}
                {pix.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                            <p className="font-semibold text-text">{x.cursos?.titulo}</p>
                            <p className="text-xs text-text-muted">Pix · {PRAZOS.find((p) => p.id === x.prazo)?.label}{x.acesso_ate && ` · acesso até ${new Date(x.acesso_ate + 'T12:00:00').toLocaleDateString('pt-BR')}`}</p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Pago</span>
                    </li>
                ))}
            </ul>
            {!!lista?.length && <div className="flex flex-wrap items-center gap-4">
                <button onClick={abrirPortal} disabled={busy} className="btn-primary flex h-12 items-center gap-2 px-8 disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Abrindo...' : 'Gerenciar pagamento e cancelamento'}
                </button>
                {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
            </div>}
        </section>
    );
}

// Troca de senha: pede a atual (reautentica) e a nova duas vezes. Não existe para as contas de demonstração (locais).
function PasswordCard() {
    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');
    const [again, setAgain] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setMsg(null);
        if (next !== again) { setMsg({ type: 'error', text: 'As duas senhas novas não são iguais.' }); return; }
        setBusy(true);
        try {
            await changePassword(cur, next);
            setCur(''); setNext(''); setAgain('');
            setMsg({ type: 'ok', text: 'Senha alterada.' });
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="liquid-glass profile-card space-y-5 rounded-[2rem] p-6 md:p-8" aria-label="Alterar senha">
            <h2 className="text-lg font-bold text-text">Alterar senha</h2>
            <Field label="Senha atual"><input className="input-field" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
            <div className="grid gap-5 md:grid-cols-2">
                <Field label="Senha nova" hint={`Mínimo de ${MIN_PASSWORD} caracteres.`}><input className="input-field" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
                <Field label="Repita a senha nova"><input className="input-field" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
            </div>
            <div className="flex flex-wrap items-center gap-4">
                <button type="submit" disabled={busy} className="btn-primary flex h-12 items-center gap-2 px-8 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{busy ? 'Salvando...' : 'Alterar senha'}</button>
                {msg && <p role={msg.type === 'error' ? 'alert' : 'status'} className={msg.type === 'error' ? 'text-sm font-semibold text-red-500' : 'text-sm font-semibold text-green-600'}>{msg.text}</p>}
            </div>
        </form>
    );
}

export default function Profile() {
    const userId = localStorage.getItem('rf_user_id');
    const fileRef = useRef(null);
    const [state, setState] = useState({ loading: true });
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [msg, setMsg] = useState(null); // { type: 'ok' | 'error', text }

    useEffect(() => {
        if (!userId) { setState({ loading: false, noUser: true }); return undefined; }
        let alive = true;
        loadProfile(userId)
            .then((p) => { if (alive) { setForm(p); setState({ loading: false, profile: p }); } })
            .catch((e) => alive && setState({ loading: false, error: e.message }));
        return () => { alive = false; };
    }, [userId]);

    const set = (key) => (e) => { setMsg(null); setForm((f) => ({ ...f, [key]: e.target.value })); };

    const onSubmit = async (e) => {
        e.preventDefault();
        const nome = (form.nome_completo || '').trim();
        if (nome.length < 3) { setMsg({ type: 'error', text: 'Informe seu nome completo.' }); return; }
        const fields = { nome_completo: nome, telefone: (form.telefone || '').trim() };
        EXTRA_FIELDS.forEach((f) => { if (f.key in form) fields[f.key] = form[f.key] || null; });
        setBusy(true);
        try {
            await saveProfile(userId, fields);
            setMsg({ type: 'ok', text: 'Dados atualizados.' });
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    };

    const onPhoto = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setPhotoBusy(true);
        setMsg(null);
        try {
            await uploadAvatar(userId, file);
            setMsg({ type: 'ok', text: 'Foto atualizada.' });
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setPhotoBusy(false);
        }
    };

    const onRemovePhoto = async () => {
        setPhotoBusy(true);
        try {
            await removeAvatar(userId);
            setMsg({ type: 'ok', text: 'Foto removida.' });
        } catch {
            setMsg({ type: 'error', text: 'Não foi possível remover a foto.' });
        } finally {
            setPhotoBusy(false);
        }
    };

    if (state.loading) {
        return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    if (state.noUser) {
        return <p className="liquid-glass rounded-3xl p-8 text-text">O perfil está disponível para contas de aluno. Você está visualizando a área do aluno como administrador.</p>;
    }
    if (state.error) {
        return <p role="alert" className="liquid-glass rounded-3xl p-8 text-text">{state.error}</p>;
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8 pb-16">
            <div>
                <h1 className="text-3xl font-black tracking-tight text-text">Meu perfil</h1>
                <p className="mt-1 text-sm text-text-muted">Sua foto e seus dados de contato.</p>
            </div>

            <div className="liquid-glass profile-card grid gap-8 rounded-[2rem] p-6 md:grid-cols-[auto_1fr] md:p-8">
                <div className="flex flex-col items-center gap-4">
                    <Avatar userId={userId} name={form.nome_completo} className="h-32 w-32 text-3xl" />
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                    <button type="button" disabled={photoBusy} onClick={() => fileRef.current?.click()} className="bevel flex h-10 items-center gap-2 rounded-md border border-white/30 px-4 text-sm font-semibold text-text disabled:opacity-50">
                        {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        Alterar foto
                    </button>
                    <button type="button" disabled={photoBusy} onClick={onRemovePhoto} className="flex items-center gap-1.5 text-sm font-semibold text-text hover:text-red-600 disabled:opacity-50">
                        <Trash2 className="h-4 w-4" /> Remover foto
                    </button>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                    <Field label="Nome completo">
                        <input className="input-field" value={form.nome_completo || ''} onChange={set('nome_completo')} autoComplete="name" required />
                    </Field>
                    <Field label="E-mail de acesso" hint="O e-mail é a sua credencial de acesso e só pode ser alterado pelo suporte.">
                        <input className="input-field profile-readonly" value={form.email || ''} readOnly aria-readonly="true" />
                    </Field>
                    <Field label="Telefone / WhatsApp">
                        <input className="input-field" inputMode="tel" placeholder="(67) 99999-9999" value={maskPhone(form.telefone || '')} onChange={(e) => { setMsg(null); setForm((f) => ({ ...f, telefone: maskPhone(e.target.value) })); }} autoComplete="tel" />
                    </Field>
                    {EXTRA_FIELDS.filter((f) => f.key in form).map((f) => (
                        <Field key={f.key} label={f.label}>
                            <input className="input-field" type={f.type} placeholder={f.placeholder} value={form[f.key] || ''} onChange={set(f.key)} />
                        </Field>
                    ))}

                    <div className="flex flex-wrap items-center gap-4 pt-2">
                        <button type="submit" disabled={busy} className="btn-primary flex h-12 items-center gap-2 px-8 disabled:opacity-60">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {busy ? 'Salvando...' : 'Salvar alterações'}
                        </button>
                        {msg && (
                            <p role={msg.type === 'error' ? 'alert' : 'status'} className={msg.type === 'error' ? 'text-sm font-semibold text-red-500' : 'text-sm font-semibold text-green-600'}>
                                {msg.text}
                            </p>
                        )}
                    </div>
                </form>
            </div>

            {!isDemoSession() && <SubscriptionsCard />}
            {!isDemoSession() && <PasswordCard />}
        </div>
    );
}
