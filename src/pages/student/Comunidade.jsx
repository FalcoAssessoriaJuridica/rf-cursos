import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, LogIn, MessageSquareText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { driveFetch, driveProxyUrl } from '../../lib/driveProxy';
import { cn } from '../../lib/utils';

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

function Publicacao({ post }) {
    return (
        // Sem backdrop-filter: no celular ele quebra o toque dentro do iframe do Drive (o play não responde depois de pausar).
        <article className="space-y-4 rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 shadow-[var(--glass-relief),var(--glass-drop)] md:p-6">
            <header>
                <h3 className="text-xl font-bold leading-tight">{post.titulo}</h3>
                <p className="mt-1 text-xs text-text-muted">{data(post.criado_em)}</p>
            </header>
            {post.video_provider === 'drive' && post.video_ref && (
                <div className="aspect-video overflow-hidden rounded-2xl bg-black">
                    {/* Sem `allow-popups`: o botão "abrir em outra janela" do Drive não leva o aluno para fora do app, e os controles do player ficam livres. */}
                    <iframe title={post.titulo} src={`https://drive.google.com/file/d/${post.video_ref}/preview`} sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen" allowFullScreen className="h-full w-full border-0" />
                </div>
            )}
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

export default function Comunidade() {
    const [estado, setEstado] = useState('carregando'); // carregando | fora | dentro
    const [comunidade, setComunidade] = useState(null);
    const [espacos, setEspacos] = useState([]);
    const [posts, setPosts] = useState([]);
    const [erro, setErro] = useState('');

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
            {estado === 'dentro' && <Mural espacos={espacos} posts={posts} />}
        </div>
    );
}
