import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, FileText, Globe, Loader2, Lock, LogIn, MessageSquareText, Minimize2, Play, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { driveFetch, driveProxyUrl } from '../../lib/driveProxy';
import { cn } from '../../lib/utils';
import EnvioPlayer from '../../components/EnvioPlayer';
import { ACCEPT, LIMITES, aceitarTermo, apagarEnvio, avisarTermoMenor, duracaoLegivel, enviarVideo, retirarConsentimento, statusTermo, tamanhoLegivel, validarArquivo } from '../../lib/comunidadeVideo';
import { ACEITE_TERMO, AUTORIZA_COMPARTILHAR, TERMO_COMUNIDADE } from '../../legal/comunidade';

const data = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// Mensagens do banco que valem ser mostradas como estão (limite de tentativas, bloqueio).
const msgEntrada = (e) => (e?.code === '53400' || e?.code === '42501') ? e.message : 'Não foi possível entrar agora. Tente de novo.';

function EntrarComCodigo({ onEntrou }) {
    const [codigo, setCodigo] = useState('');
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');

    const entrar = async (ev) => {
        ev.preventDefault();
        if (!codigo.trim()) return;
        setBusy(true); setErro('');
        const { data: linhas, error } = await supabase.rpc('comunidade_entrar', { p_codigo: codigo });
        setBusy(false);
        if (error) return setErro(msgEntrada(error));
        if (!linhas?.length) return setErro('Código inválido ou desligado. Confira com o professor.');
        onEntrou();
    };

    return (
        <form onSubmit={entrar} className="liquid-glass max-w-md space-y-5 rounded-[2rem] p-6 md:p-8">
            <div>
                <h2 className="text-xl font-bold">Entrar na comunidade</h2>
                <p className="mt-2 text-sm text-text-muted">Digite o código que o professor passou aos alunos do ministério.</p>
            </div>
            <label className="block space-y-2">
                <span className="text-sm font-semibold">Código de acesso</span>
                <input className="input-field h-12 w-full font-mono text-lg uppercase tracking-widest" value={codigo} onChange={(e) => setCodigo(e.target.value)}
                    placeholder="MAC-XXXXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={20} aria-describedby={erro ? 'erro-codigo' : undefined} />
            </label>
            {erro && <p id="erro-codigo" role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
            <button type="submit" disabled={busy || !codigo.trim()} className="btn-primary flex h-12 w-full items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Entrar
            </button>
        </form>
    );
}

function BotaoPdf({ id, titulo }) {
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');
    const abrir = async () => {
        setBusy(true); setErro('');
        const janela = window.open('', '_blank'); // abre já, no clique, para o navegador não bloquear
        try {
            const res = await driveFetch(driveProxyUrl(id, { filename: `${titulo}.pdf`, t: Date.now() }));
            const url = URL.createObjectURL(new Blob([await res.blob()], { type: 'application/pdf' }));
            if (janela) janela.location.href = url;
            else { const a = document.createElement('a'); a.href = url; a.download = `${titulo}.pdf`; document.body.appendChild(a); a.click(); a.remove(); }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            janela?.close();
            setErro(e.message || 'Não foi possível abrir o PDF.');
        } finally { setBusy(false); }
    };
    return (
        <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={abrir} disabled={busy} className="flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold transition-colors hover:border-primary/50 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Abrir partitura (PDF)
            </button>
            {erro && <p role="alert" className="text-xs font-semibold text-red-500">{erro}</p>}
        </div>
    );
}

const toque = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

// No celular o player do Drive não responde ao play quando está dentro da página rolável; ampliado sobre a janela ele funciona.
// Por isso, em telas de toque o vídeo só roda na tela ampliada, com a saída sempre visível (abaixo da barra de status do iPhone).
function VideoDrive({ id, titulo }) {
    const [fill, setFill] = useState(false);
    const celular = toque();

    useEffect(() => {
        if (!fill) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setFill(false); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [fill]);

    if (celular && !fill) {
        return (
            <button type="button" onClick={() => setFill(true)} aria-label={`Assistir ${titulo}`}
                className="group relative flex aspect-video w-full items-center justify-center rounded-2xl bg-black active:scale-[0.99]">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-black shadow-lg"><Play className="ml-1 h-7 w-7 fill-current" /></span>
                <span className="absolute bottom-3 left-4 text-sm font-semibold text-white/90">Toque para assistir</span>
            </button>
        );
    }

    return (
        <div className={cn('overflow-hidden bg-black', fill ? 'fixed inset-0 z-[200] h-[100dvh] w-screen' : 'relative aspect-video rounded-2xl')}>
            <iframe title={titulo} src={`https://drive.google.com/file/d/${id}/preview`} allow="autoplay; fullscreen" allowFullScreen className="h-full w-full border-0" />
            {celular && (
                <>
                    {/* Coluna transparente na borda direita: o botão "abrir em outra janela" do Drive levaria o aluno para fora do app */}
                    <div aria-hidden="true" className="absolute inset-y-0 right-0 w-14" />
                    <button type="button" onClick={() => setFill(false)} aria-label="Voltar"
                        className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))] z-10 flex h-11 items-center gap-2 rounded-md bg-black/80 px-4 text-sm font-semibold text-white">
                        <Minimize2 className="h-4 w-4" /> Voltar
                    </button>
                </>
            )}
        </div>
    );
}

function Publicacao({ post }) {
    return (
        // Sem backdrop-filter: no celular ele quebra o toque dentro do iframe do Drive (o play não responde depois de pausar).
        <article className="space-y-4 rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 shadow-[var(--glass-relief),var(--glass-drop)] md:p-6">
            <header>
                <h3 className="text-xl font-bold leading-tight">{post.titulo}</h3>
                <p className="mt-1 text-xs text-text-muted">{data(post.criado_em)}</p>
            </header>
            {post.video_provider === 'drive' && post.video_ref && <VideoDrive id={post.video_ref} titulo={post.titulo} />}
            {post.texto && <p className="max-w-[65ch] whitespace-pre-line text-sm leading-relaxed text-text-muted">{post.texto}</p>}
            {post.pdf_ref && <BotaoPdf id={post.pdf_ref} titulo={post.titulo} />}
        </article>
    );
}

function Mural({ espacos, posts }) {
    const [espacoId, setEspacoId] = useState(espacos[0]?.id ?? null);
    const lista = posts.filter((p) => p.espaco_id === espacoId);

    if (espacos.length === 0) return <p className="text-sm text-text-muted">O professor ainda não criou nenhum espaço. Volte em breve.</p>;
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Instrumento">
                {espacos.map((e) => (
                    <button key={e.id} type="button" onClick={() => setEspacoId(e.id)} aria-pressed={espacoId === e.id}
                        className={cn('h-10 rounded-full border px-4 text-sm font-semibold transition-colors',
                            espacoId === e.id ? 'border-primary bg-primary text-black' : 'border-white/10 text-text-muted hover:border-primary/50 hover:text-text')}>
                        {e.nome}
                    </button>
                ))}
            </div>
            {lista.length === 0 ? (
                <div className="flex max-w-md items-start gap-3 rounded-2xl border border-white/10 p-5 text-sm text-text-muted">
                    <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>Ainda não há aulas neste espaço. Quando o professor publicar, elas aparecem aqui.</p>
                </div>
            ) : (
                <div className="grid gap-6 lg:max-w-3xl">{lista.map((p) => <Publicacao key={p.id} post={p} />)}</div>
            )}
        </div>
    );
}

const SELETOR_ESPACO = 'flex flex-wrap gap-2';
const pilula = (ativo) => cn('h-10 rounded-full border px-4 text-sm font-semibold transition-colors',
    ativo ? 'border-primary bg-primary text-black' : 'border-white/10 text-text-muted hover:border-primary/50 hover:text-text');

const OPCOES_VISIBILIDADE = [
    { valor: 'professor', icone: Lock, titulo: 'Só o professor', texto: 'Só você e o professor assistem. É a opção segura para dúvidas e treinos.' },
    { valor: 'comunidade', icone: Globe, titulo: 'Toda a comunidade', texto: 'Os outros membros também assistem, com o seu primeiro nome. O recado e as respostas do professor continuam só seus.' },
];

function NovoEnvio({ espacos, onEnviado, podeCompartilhar }) {
    const [espacoId, setEspacoId] = useState(espacos[0]?.id ?? null);
    const [arquivo, setArquivo] = useState(null);     // { file, duracao }
    const [mensagem, setMensagem] = useState('');
    const [visibilidade, setVisibilidade] = useState('professor');
    const [progresso, setProgresso] = useState(null);  // null = parado; 0..100 enviando; 100 = conferindo
    const [erro, setErro] = useState('');
    const [ok, setOk] = useState('');
    const inputRef = useRef(null);
    const enviando = progresso !== null;

    // Fechar a página no meio do envio perde o vídeo: avisa antes.
    useEffect(() => {
        if (!enviando) return undefined;
        const aviso = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', aviso);
        return () => window.removeEventListener('beforeunload', aviso);
    }, [enviando]);

    const escolher = async (ev) => {
        const file = ev.target.files?.[0];
        ev.target.value = '';
        setErro(''); setOk(''); setArquivo(null);
        if (!file) return;
        try { const { duracao } = await validarArquivo(file); setArquivo({ file, duracao }); } catch (e) { setErro(e.message); }
    };

    const enviar = async (ev) => {
        ev.preventDefault();
        if (!arquivo || !espacoId || enviando) return;
        setErro(''); setOk(''); setProgresso(0);
        try {
            await enviarVideo(arquivo.file, { espacoId, mensagem, visibilidade, onProgresso: setProgresso });
            setArquivo(null); setMensagem(''); setVisibilidade('professor');
            setOk('Vídeo enviado. O professor vai assistir e responder por aqui.');
            await onEnviado();
        } catch (e) {
            setErro(e.message);
        } finally { setProgresso(null); }
    };

    return (
        <form onSubmit={enviar} className="space-y-5 rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 shadow-[var(--glass-relief),var(--glass-drop)] md:p-6">
            <div>
                <h2 className="text-lg font-bold">Enviar um vídeo ao professor</h2>
                <p className="mt-1 max-w-[65ch] text-sm text-text-muted">
                    Só você e o professor veem o vídeo. Até {LIMITES.segundos / 60} minutos e {tamanhoLegivel(LIMITES.bytes)}, em MP4, MOV ou WebM. Ele fica guardado por 90 dias.
                </p>
            </div>

            {espacos.length > 1 && (
                <div className="space-y-2">
                    <span className="text-sm font-semibold">Instrumento</span>
                    <div className={SELETOR_ESPACO} role="group" aria-label="Instrumento do envio">
                        {espacos.map((e) => (
                            <button key={e.id} type="button" disabled={enviando} onClick={() => setEspacoId(e.id)} aria-pressed={espacoId === e.id} className={cn(pilula(espacoId === e.id), 'disabled:opacity-50')}>{e.nome}</button>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <span className="text-sm font-semibold">Vídeo</span>
                <input ref={inputRef} type="file" accept={ACCEPT} onChange={escolher} className="sr-only" tabIndex={-1} aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" disabled={enviando} onClick={() => inputRef.current?.click()}
                        className="flex h-12 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold transition-colors hover:border-primary/50 disabled:opacity-50">
                        <Upload className="h-4 w-4" /> {arquivo ? 'Trocar vídeo' : 'Escolher vídeo'}
                    </button>
                    {arquivo && <span className="text-sm text-text-muted">{arquivo.file.name} · {tamanhoLegivel(arquivo.file.size)} · {duracaoLegivel(arquivo.duracao)}</span>}
                </div>
            </div>

            <fieldset className="space-y-2" disabled={enviando}>
                <legend className="text-sm font-semibold">Quem pode ver este vídeo</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                    {OPCOES_VISIBILIDADE.map((o) => {
                        const bloqueada = o.valor === 'comunidade' && !podeCompartilhar;
                        return (
                        <label key={o.valor} className={cn('flex items-start gap-3 rounded-2xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                            bloqueada ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', visibilidade === o.valor ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-primary/50')}>
                            <input type="radio" name="visibilidade" value={o.valor} checked={visibilidade === o.valor} disabled={bloqueada} onChange={() => setVisibilidade(o.valor)} className="mt-1 accent-[rgb(var(--c-primary))]" />
                            <span>
                                <span className="flex items-center gap-2 text-sm font-semibold"><o.icone className="h-4 w-4" /> {o.titulo}</span>
                                <span className="mt-1 block text-xs text-text-muted">{bloqueada ? 'Seu responsável não autorizou o compartilhamento com a comunidade.' : o.texto}</span>
                            </span>
                        </label>
                        );
                    })}
                </div>
            </fieldset>

            <label className="block space-y-2">
                <span className="text-sm font-semibold">Recado para o professor <span className="font-normal text-text-muted">(opcional)</span></span>
                <textarea className="input-field min-h-20 w-full py-3" value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={1000} disabled={enviando}
                    placeholder="Ex.: Estou com dificuldade na mão esquerda a partir do compasso 9." />
            </label>

            {enviando && (
                <div className="space-y-2" aria-live="polite">
                    <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-label="Progresso do envio">
                        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progresso}%` }} />
                    </div>
                    <p className="text-xs text-text-muted">{progresso < 100 ? `Enviando… ${progresso}%. Não feche esta página.` : 'Conferindo o arquivo…'}</p>
                </div>
            )}
            {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
            {ok && <p role="status" className="text-sm font-semibold text-green-600">{ok}</p>}

            <button type="submit" disabled={!arquivo || !espacoId || enviando} className="btn-primary flex h-12 w-full items-center justify-center gap-2 disabled:opacity-40 sm:w-auto sm:px-8">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {enviando ? 'Enviando…' : 'Enviar vídeo'}
            </button>
        </form>
    );
}

function TermoConsentimento({ termo, onAceito }) {
    const doc = TERMO_COMUNIDADE();
    const [maior, setMaior] = useState(null);   // null = ainda não respondeu
    const [resp, setResp] = useState({ nome: '', parentesco: '', contato: '' });
    const [autoriza, setAutoriza] = useState(false);
    const [concordo, setConcordo] = useState(false);
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');

    const aviso = { versao_antiga: 'O termo foi atualizado desde o seu último aceite. Leia e aceite de novo para continuar enviando vídeos.', revogado: 'Você retirou o consentimento e seus vídeos foram apagados. Para enviar de novo, aceite o termo.' }[termo.status];
    const completo = maior !== null && concordo && (maior || (resp.nome.trim() && resp.parentesco.trim() && resp.contato.trim()));

    const aceitar = async (ev) => {
        ev.preventDefault();
        if (!completo || busy) return;
        setBusy(true); setErro('');
        try {
            const r = await aceitarTermo({ maior, responsavel: resp, autorizaCompartilhar: autoriza });
            if (r.status === 'aguardando_responsavel') avisarTermoMenor();
            await onAceito();
        } catch (e) { setErro(e.message); } finally { setBusy(false); }
    };
    const campo = 'input-field h-11 w-full';

    return (
        <form onSubmit={aceitar} className="space-y-5 rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 shadow-[var(--glass-relief),var(--glass-drop)] md:p-6">
            <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <div>
                    <h2 className="text-lg font-bold">Antes de enviar o seu primeiro vídeo</h2>
                    <p className="mt-1 max-w-[65ch] text-sm text-text-muted">Leia o termo abaixo. Ele explica quem vê o seu vídeo, por quanto tempo ele fica guardado e como você pode apagá-lo.</p>
                </div>
            </div>
            {aviso && <p role="status" className="rounded-2xl border border-primary/40 p-4 text-sm font-semibold">{aviso}</p>}

            <div tabIndex={0} role="region" aria-label={doc.titulo} className="max-h-72 space-y-5 overflow-y-auto rounded-2xl border border-white/10 p-4 text-sm leading-relaxed text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                {doc.secoes.map((sec) => (
                    <section key={sec.titulo} className="space-y-2">
                        <h3 className="font-bold text-text">{sec.titulo}</h3>
                        {sec.blocos.map((b, i) => typeof b === 'string' ? <p key={i}>{b}</p> : <ul key={i} className="list-disc space-y-1 pl-5">{b.lista.map((li) => <li key={li}>{li}</li>)}</ul>)}
                    </section>
                ))}
            </div>

            <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Você tem 18 anos ou mais?</legend>
                <div className="flex flex-wrap gap-3">
                    {[[true, 'Sim, tenho 18 anos ou mais'], [false, 'Não, tenho menos de 18 anos']].map(([valor, rotulo]) => (
                        <label key={String(valor)} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary', maior === valor ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-primary/50')}>
                            <input type="radio" name="maior" checked={maior === valor} onChange={() => setMaior(valor)} className="accent-[rgb(var(--c-primary))]" /> {rotulo}
                        </label>
                    ))}
                </div>
            </fieldset>

            {maior === false && (
                <fieldset className="space-y-4 rounded-2xl border border-white/10 p-4">
                    <legend className="px-1 text-sm font-semibold">Dados do seu responsável</legend>
                    <p className="text-xs text-text-muted">O professor vai entrar em contato com o responsável para confirmar a autorização. Enquanto isso, o envio de vídeos fica em espera.</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block space-y-2"><span className="text-sm font-semibold">Nome do responsável</span><input className={campo} value={resp.nome} onChange={(e) => setResp({ ...resp, nome: e.target.value })} maxLength={120} autoComplete="off" /></label>
                        <label className="block space-y-2"><span className="text-sm font-semibold">Parentesco</span><input className={campo} value={resp.parentesco} onChange={(e) => setResp({ ...resp, parentesco: e.target.value })} maxLength={40} placeholder="Ex.: mãe, pai, avó" autoComplete="off" /></label>
                    </div>
                    <label className="block space-y-2"><span className="text-sm font-semibold">Telefone ou e-mail do responsável</span><input className={campo} value={resp.contato} onChange={(e) => setResp({ ...resp, contato: e.target.value })} maxLength={120} autoComplete="off" /></label>
                    <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} className="mt-1 accent-[rgb(var(--c-primary))]" /> <span>{AUTORIZA_COMPARTILHAR}</span></label>
                </fieldset>
            )}

            <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold"><input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} className="mt-1 accent-[rgb(var(--c-primary))]" /> <span>{ACEITE_TERMO}</span></label>

            {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
            <button type="submit" disabled={!completo || busy} className="btn-primary flex h-12 w-full items-center justify-center gap-2 disabled:opacity-40 sm:w-auto sm:px-8">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Aceitar e continuar
            </button>
        </form>
    );
}

function AguardandoResponsavel() {
    return (
        <div className="flex max-w-xl items-start gap-3 rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 md:p-6">
            <Clock className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div>
                <h2 className="text-lg font-bold">Aguardando a autorização do seu responsável</h2>
                <p className="mt-2 max-w-[65ch] text-sm text-text-muted">Recebemos o seu pedido. O professor vai falar com o seu responsável e, depois da confirmação, o envio de vídeos é liberado aqui. Você não precisa fazer mais nada.</p>
            </div>
        </div>
    );
}

function CartaoEnvio({ envio, espaco, respostas, onApagado }) {
    const [apagando, setApagando] = useState(false);
    const [trocando, setTrocando] = useState(false);
    const [erro, setErro] = useState('');
    const compartilhado = envio.visibilidade === 'comunidade';
    const trocarVisibilidade = async () => {
        setTrocando(true); setErro('');
        const { error } = await supabase.rpc('comunidade_envio_visibilidade', { p_envio: envio.id, p_valor: compartilhado ? 'professor' : 'comunidade' });
        if (error) setErro('Não foi possível mudar agora. Tente de novo.'); else await onApagado();
        setTrocando(false);
    };
    const apagar = async () => {
        if (!confirm('Apagar este vídeo? Ele some para você e para o professor e não dá para desfazer.')) return;
        setApagando(true); setErro('');
        try { await apagarEnvio(envio.id); await onApagado(); } catch (e) { setErro(e.message); setApagando(false); }
    };
    const incompleto = !envio.upload_ok;
    const respondido = envio.status === 'respondido';
    return (
        <article className="space-y-4 rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 shadow-[var(--glass-relief),var(--glass-drop)] md:p-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold leading-tight">{espaco?.nome ?? 'Envio'}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted"><span>Enviado em {data(envio.criado_em)}{!envio.guardar && envio.expira_em ? ` · disponível até ${data(envio.expira_em)}` : ''}</span><span className="flex items-center gap-1 font-semibold">{compartilhado ? <><Globe className="h-3.5 w-3.5" /> Toda a comunidade vê</> : <><Lock className="h-3.5 w-3.5" /> Só o professor vê</>}</span></p>
                </div>
                <span className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                    incompleto ? 'border-red-500/40 text-red-500' : respondido ? 'border-green-600/40 text-green-600' : 'border-white/15 text-text-muted')}>
                    {incompleto ? 'Envio incompleto' : respondido ? <><CheckCircle2 className="h-3.5 w-3.5" /> Respondido</> : <><Clock className="h-3.5 w-3.5" /> Aguardando o professor</>}
                </span>
            </header>

            {incompleto
                ? <p className="text-sm text-text-muted">Este envio não terminou. Apague e envie o vídeo de novo.</p>
                : <EnvioPlayer envioId={envio.id} titulo={`Seu vídeo de ${espaco?.nome ?? 'instrumento'}`} />}

            {envio.mensagem && <p className="max-w-[65ch] whitespace-pre-line text-sm text-text-muted"><span className="font-semibold text-text">Seu recado: </span>{envio.mensagem}</p>}

            {respostas.length > 0 && (
                <div className="space-y-3 border-t border-white/10 pt-4">
                    {respostas.map((r) => (
                        <div key={r.id} className="rounded-2xl bg-white/5 p-4">
                            <p className="text-xs font-semibold text-primary">Professor · {data(r.criado_em)}</p>
                            <p className="mt-1 max-w-[65ch] whitespace-pre-line text-sm">{r.texto}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                {!incompleto && (
                    <button type="button" onClick={trocarVisibilidade} disabled={trocando} aria-pressed={compartilhado}
                        className="flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm transition-colors hover:border-primary/50 disabled:opacity-40">
                        {trocando ? <Loader2 className="h-4 w-4 animate-spin" /> : compartilhado ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                        {compartilhado ? 'Deixar só para o professor' : 'Compartilhar com a comunidade'}
                    </button>
                )}
                <button type="button" onClick={apagar} disabled={apagando}
                    className="flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-text-muted transition-colors hover:border-red-500/50 hover:text-red-500 disabled:opacity-40">
                    {apagando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Apagar vídeo
                </button>
                {erro && <p role="alert" className="text-xs font-semibold text-red-500">{erro}</p>}
            </div>
        </article>
    );
}

function MeusEnvios({ espacos }) {
    const [envios, setEnvios] = useState(null);   // null = carregando
    const [respostas, setRespostas] = useState({});
    const [erro, setErro] = useState('');
    const [termo, setTermo] = useState(null);       // null = carregando
    const [retirando, setRetirando] = useState(false);

    const carregarTermo = useCallback(async () => {
        try { setTermo(await statusTermo()); } catch (e) { setErro(e.message); setTermo({ status: 'erro' }); }
    }, []);
    useEffect(() => { carregarTermo(); }, [carregarTermo]);

    const retirar = async () => {
        if (!confirm('Retirar o consentimento apaga TODOS os seus vídeos e não dá para desfazer. Continuar?')) return;
        setRetirando(true); setErro('');
        try { await retirarConsentimento(); await carregarTermo(); await carregar(); } catch (e) { setErro(e.message); } finally { setRetirando(false); }
    };

    const carregar = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const en = await supabase.from('comunidade_envios')
            .select('id, espaco_id, mensagem, status, upload_ok, guardar, visibilidade, criado_em, expira_em').eq('aluno_id', user.id).order('criado_em', { ascending: false });
        if (en.error) { setErro(en.error.message); setEnvios([]); return; }
        const ids = en.data.map((e) => e.id);
        const re = ids.length ? await supabase.from('comunidade_respostas').select('id, envio_id, texto, criado_em').in('envio_id', ids).order('criado_em') : { data: [] };
        if (re.error) { setErro(re.error.message); return; }
        const porEnvio = {};
        for (const r of re.data) (porEnvio[r.envio_id] ??= []).push(r);
        setRespostas(porEnvio); setEnvios(en.data); setErro('');
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    if (espacos.length === 0) return <p className="text-sm text-text-muted">O professor ainda não criou nenhum espaço. Volte em breve.</p>;
    return (
        <div className="space-y-8">
            {termo === null && <div className="h-40 animate-pulse rounded-[2rem] bg-white/5" aria-busy="true" />}
            {termo && termo.status === 'aguardando_responsavel' && <AguardandoResponsavel />}
            {termo && ['sem_termo', 'versao_antiga', 'revogado'].includes(termo.status) && <TermoConsentimento termo={termo} onAceito={carregarTermo} />}
            {termo?.status === 'ok' && <NovoEnvio espacos={espacos} onEnviado={carregar} podeCompartilhar={termo.pode_compartilhar === true} />}
            <section className="space-y-4" aria-label="Seus envios">
                <h2 className="text-lg font-bold">Seus envios</h2>
                {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
                {envios === null && <div className="h-40 animate-pulse rounded-[2rem] bg-white/5" aria-busy="true" />}
                {envios?.length === 0 && (
                    <div className="flex max-w-md items-start gap-3 rounded-2xl border border-white/10 p-5 text-sm text-text-muted">
                        <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>Você ainda não enviou nenhum vídeo. Quando enviar, ele aparece aqui junto com a resposta do professor.</p>
                    </div>
                )}
                <div className="grid gap-6 lg:max-w-3xl">
                    {envios?.map((e) => <CartaoEnvio key={e.id} envio={e} espaco={espacos.find((x) => x.id === e.espaco_id)} respostas={respostas[e.id] ?? []} onApagado={carregar} />)}
                </div>
            </section>
            {termo && ['ok', 'aguardando_responsavel'].includes(termo.status) && (
                <footer className="flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-5 text-xs text-text-muted">
                    <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Termo aceito em {data(termo.aceito_em)}.</span>
                    <button type="button" onClick={retirar} disabled={retirando} className="flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4 hover:text-red-500 disabled:opacity-40">
                        {retirando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Retirar meu consentimento (apaga todos os meus vídeos)
                    </button>
                </footer>
            )}
        </div>
    );
}

function VideosDaComunidade({ espacos }) {
    const [espacoId, setEspacoId] = useState(espacos[0]?.id ?? null);
    const [videos, setVideos] = useState(null);   // null = carregando
    const [erro, setErro] = useState('');

    useEffect(() => {
        if (!espacoId) return undefined;
        let ativo = true;
        setVideos(null); setErro('');
        supabase.rpc('comunidade_videos_compartilhados', { p_espaco: espacoId }).then(({ data: lista, error }) => {
            if (!ativo) return;
            if (error) { setErro('Não foi possível carregar os vídeos agora.'); setVideos([]); } else setVideos(lista ?? []);
        });
        return () => { ativo = false; };
    }, [espacoId]);

    if (espacos.length === 0) return <p className="text-sm text-text-muted">O professor ainda não criou nenhum espaço. Volte em breve.</p>;
    return (
        <div className="space-y-6">
            <p className="max-w-[65ch] text-sm text-text-muted">Vídeos que os próprios participantes escolheram compartilhar com a comunidade. Para o seu aparecer aqui, abra "Meus envios" e escolha "Compartilhar com a comunidade".</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Instrumento">
                {espacos.map((e) => <button key={e.id} type="button" onClick={() => setEspacoId(e.id)} aria-pressed={espacoId === e.id} className={pilula(espacoId === e.id)}>{e.nome}</button>)}
            </div>
            {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
            {videos === null && <div className="h-40 animate-pulse rounded-[2rem] bg-white/5" aria-busy="true" />}
            {videos?.length === 0 && !erro && (
                <div className="flex max-w-md items-start gap-3 rounded-2xl border border-white/10 p-5 text-sm text-text-muted">
                    <Globe className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>Ninguém compartilhou um vídeo neste instrumento ainda.</p>
                </div>
            )}
            <div className="grid gap-6 lg:max-w-3xl">
                {videos?.map((v) => (
                    <article key={v.id} className="space-y-4 rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 shadow-[var(--glass-relief),var(--glass-drop)] md:p-6">
                        <header>
                            <h3 className="text-lg font-bold leading-tight">{v.meu ? 'Seu vídeo' : v.autor}</h3>
                            <p className="mt-1 text-xs text-text-muted">{data(v.criado_em)}{v.duracao_s ? ` · ${duracaoLegivel(v.duracao_s)}` : ''}</p>
                        </header>
                        <EnvioPlayer envioId={v.id} titulo={`Vídeo de ${v.meu ? 'você' : v.autor}`} />
                    </article>
                ))}
            </div>
        </div>
    );
}

export default function Comunidade() {
    const [estado, setEstado] = useState('carregando'); // carregando | fora | dentro
    const [comunidade, setComunidade] = useState(null);
    const [espacos, setEspacos] = useState([]);
    const [posts, setPosts] = useState([]);
    const [erro, setErro] = useState('');
    const [aba, setAba] = useState('aulas');

    const carregar = useCallback(async () => {
        const { data: com, error } = await supabase.from('comunidades').select('id, nome').eq('slug', 'mac').maybeSingle();
        if (error) { setErro(error.message); setEstado('fora'); return; }
        if (!com) { setEstado('fora'); return; }   // as regras só devolvem a comunidade a quem é membro
        const esp = await supabase.from('comunidade_espacos').select('id, nome, ordem').eq('comunidade_id', com.id).order('ordem');
        if (esp.error) { setErro(esp.error.message); setEstado('fora'); return; }
        const ids = esp.data.map((e) => e.id);
        const po = ids.length
            ? await supabase.from('comunidade_posts').select('id, espaco_id, titulo, texto, video_provider, video_ref, pdf_ref, criado_em').in('espaco_id', ids).order('criado_em', { ascending: false })
            : { data: [] };
        if (po.error) { setErro(po.error.message); setEstado('fora'); return; }
        setComunidade(com); setEspacos(esp.data); setPosts(po.data); setErro(''); setEstado('dentro');
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    return (
        <div className="mx-auto max-w-5xl space-y-8 pb-10">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">{comunidade?.nome ?? 'Comunidade MAC'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-text-muted">
                    Aulas de teclado, introduções e solos dos hinos, separados por instrumento, para o Ministério de Louvor.
                </p>
            </header>
            {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
            {estado === 'carregando' && <div className="h-40 animate-pulse rounded-[2rem] bg-white/5" aria-busy="true" />}
            {estado === 'fora' && <EntrarComCodigo onEntrou={carregar} />}
            {estado === 'dentro' && (
                <>
                    <div role="tablist" aria-label="Seções" className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
                        {[['aulas', 'Aulas'], ['videos', 'Vídeos da comunidade'], ['envios', 'Meus envios']].map(([id, rotulo]) => (
                            <button key={id} role="tab" type="button" aria-selected={aba === id} onClick={() => setAba(id)}
                                className={cn('h-11 rounded-lg px-4 text-sm font-semibold transition-colors', aba === id ? 'bg-primary text-black' : 'text-text-muted hover:text-text')}>{rotulo}</button>
                        ))}
                    </div>
                    <div role="tabpanel">
                        {aba === 'aulas' ? <Mural espacos={espacos} posts={posts} /> : aba === 'videos' ? <VideosDaComunidade espacos={espacos} /> : <MeusEnvios espacos={espacos} />}
                    </div>
                </>
            )}
        </div>
    );
}
