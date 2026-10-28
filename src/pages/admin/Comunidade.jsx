import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, FileText, Loader2, Plus, RefreshCw, Trash2, UserCheck, UserX, Video } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { driveId } from '../../lib/media';
import { cn } from '../../lib/utils';

const ABAS = [
    { id: 'mural', label: 'Mural' },
    { id: 'espacos', label: 'Espaços' },
    { id: 'membros', label: 'Membros' },
    { id: 'acesso', label: 'Código de acesso' },
];

const data = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I, para o código poder ser lido em voz alta
const novoCodigo = () => 'MAC-' + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALFABETO[b % ALFABETO.length]).join('');

function Aviso({ msg }) {
    if (!msg) return null;
    return <p role={msg.ok ? 'status' : 'alert'} className={cn('text-xs font-semibold', msg.ok ? 'text-green-600' : 'text-red-500')}>{msg.text}</p>;
}

// Roda uma operação do Supabase mostrando o resultado; devolve true se deu certo.
function useAcao(recarregar) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const rodar = async (fn, ok) => {
        setBusy(true); setMsg(null);
        try {
            const { error } = await fn();
            if (error) throw error;
            if (ok) setMsg({ ok: true, text: ok });
            await recarregar();
            return true;
        } catch (e) {
            setMsg({ ok: false, text: e.message || 'Não foi possível concluir.' });
            return false;
        } finally { setBusy(false); }
    };
    return { busy, msg, rodar };
}

function SeletorEspaco({ espacos, valor, onChange }) {
    return (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Espaço">
            {espacos.map((e) => (
                <button key={e.id} type="button" onClick={() => onChange(e.id)} aria-pressed={valor === e.id}
                    className={cn('h-10 rounded-full border px-4 text-sm font-semibold transition-colors',
                        valor === e.id ? 'border-primary bg-primary text-black' : 'border-white/10 text-text-muted hover:border-primary/50 hover:text-text')}>
                    {e.nome}
                </button>
            ))}
        </div>
    );
}

function Mural({ espacos, posts, userId, recarregar }) {
    const [espacoId, setEspacoId] = useState(espacos[0]?.id ?? null);
    const [titulo, setTitulo] = useState('');
    const [texto, setTexto] = useState('');
    const [video, setVideo] = useState('');
    const [pdf, setPdf] = useState('');
    const { busy, msg, rodar } = useAcao(recarregar);
    const [erro, setErro] = useState('');

    useEffect(() => { if (!espacos.some((e) => e.id === espacoId)) setEspacoId(espacos[0]?.id ?? null); }, [espacos, espacoId]);
    if (espacos.length === 0) return <p className="text-sm text-text-muted">Crie um espaço na aba "Espaços" para começar a publicar.</p>;

    const lista = posts.filter((p) => p.espaco_id === espacoId);

    const publicar = async (ev) => {
        ev.preventDefault();
        setErro('');
        const v = video.trim() ? driveId(video.trim()) : null;
        const d = pdf.trim() ? driveId(pdf.trim()) : null;
        if (!titulo.trim()) return setErro('Dê um título à publicação.');
        if (video.trim() && !v) return setErro('Cole o link de compartilhamento do vídeo no Google Drive.');
        if (pdf.trim() && !d) return setErro('Cole o link de compartilhamento do PDF no Google Drive.');
        const ok = await rodar(() => supabase.from('comunidade_posts').insert({
            espaco_id: espacoId, autor_id: userId, titulo: titulo.trim(), texto: texto.trim() || null,
            video_provider: v ? 'drive' : null, video_ref: v, pdf_ref: d,
        }), 'Publicado no mural.');
        if (ok) { setTitulo(''); setTexto(''); setVideo(''); setPdf(''); }
    };

    return (
        <div className="space-y-6">
            <SeletorEspaco espacos={espacos} valor={espacoId} onChange={setEspacoId} />

            <form onSubmit={publicar} className="liquid-glass space-y-4 rounded-[2rem] p-5 md:p-6">
                <h2 className="text-lg font-bold">Nova publicação em {espacos.find((e) => e.id === espacoId)?.nome}</h2>
                <label className="block space-y-2">
                    <span className="text-sm font-semibold">Título</span>
                    <input className="input-field h-11 w-full" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Ex.: Introdução do hino Rude Cruz" />
                </label>
                <label className="block space-y-2">
                    <span className="text-sm font-semibold">Explicação <span className="font-normal text-text-muted">(opcional)</span></span>
                    <textarea className="input-field min-h-24 w-full py-3" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} placeholder="O que o aluno deve observar, andamento, tom…" />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                        <span className="flex items-center gap-2 text-sm font-semibold"><Video className="h-4 w-4" /> Vídeo no Google Drive</span>
                        <input className="input-field h-11 w-full" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://drive.google.com/file/d/…" inputMode="url" />
                    </label>
                    <label className="block space-y-2">
                        <span className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> Partitura em PDF no Drive</span>
                        <input className="input-field h-11 w-full" value={pdf} onChange={(e) => setPdf(e.target.value)} placeholder="https://drive.google.com/file/d/…" inputMode="url" />
                    </label>
                </div>
                <p className="text-xs text-text-muted">No Drive, compartilhe cada arquivo como "Qualquer pessoa com o link" e cole o link aqui. Só o código do arquivo é guardado.</p>
                <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={busy} className="btn-primary flex h-11 items-center gap-2 px-5 text-sm disabled:opacity-40">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Publicar
                    </button>
                    {erro && <p role="alert" className="text-xs font-semibold text-red-500">{erro}</p>}
                    <Aviso msg={msg} />
                </div>
            </form>

            <section className="space-y-3" aria-label="Publicações do espaço">
                <h2 className="text-lg font-bold">Publicações ({lista.length})</h2>
                {lista.length === 0 && <p className="text-sm text-text-muted">Nada publicado neste espaço ainda.</p>}
                {lista.map((p) => (
                    <article key={p.id} className="flex items-start justify-between gap-4 border-t border-white/5 py-4 first:border-t-0">
                        <div className="min-w-0">
                            <h3 className="font-bold">{p.titulo}</h3>
                            {p.texto && <p className="mt-1 whitespace-pre-line text-sm text-text-muted">{p.texto}</p>}
                            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                                <span>{data(p.criado_em)}</span>
                                {p.video_ref && <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" /> vídeo</span>}
                                {p.pdf_ref && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> PDF</span>}
                            </p>
                        </div>
                        <button type="button" disabled={busy} aria-label={`Apagar "${p.titulo}"`}
                            onClick={() => confirm(`Apagar a publicação "${p.titulo}"?`) && rodar(() => supabase.from('comunidade_posts').delete().eq('id', p.id), 'Publicação apagada.')}
                            className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-text-muted hover:border-red-500/50 hover:text-red-500 disabled:opacity-40">
                            <Trash2 className="h-4 w-4" /> Apagar
                        </button>
                    </article>
                ))}
            </section>
        </div>
    );
}

function LinhaEspaco({ espaco, qtdPosts, qtdEnvios, recarregar }) {
    const [nome, setNome] = useState(espaco.nome);
    const { busy, msg, rodar } = useAcao(recarregar);
    const alterado = nome.trim() && nome.trim() !== espaco.nome;
    const apagar = () => confirm(`Apagar o espaço "${espaco.nome}"? Isso apaga também ${qtdPosts} publicação(ões) e ${qtdEnvios} envio(s) de alunos. Não dá para desfazer.`)
        && rodar(() => supabase.from('comunidade_espacos').delete().eq('id', espaco.id), 'Espaço apagado.');
    return (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 py-3 first:border-t-0">
            <input className="input-field h-10 w-56" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} aria-label={`Nome do espaço ${espaco.nome}`} />
            <button type="button" disabled={busy || !alterado} onClick={() => rodar(() => supabase.from('comunidade_espacos').update({ nome: nome.trim() }).eq('id', espaco.id), 'Nome salvo.')}
                className="btn-primary flex h-10 items-center gap-2 px-4 text-sm disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
            </button>
            <button type="button" disabled={busy} onClick={apagar}
                className="flex h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-text-muted hover:border-red-500/50 hover:text-red-500 disabled:opacity-40">
                <Trash2 className="h-4 w-4" /> Apagar
            </button>
            <span className="text-xs text-text-muted">{qtdPosts} publicação(ões), {qtdEnvios} envio(s)</span>
            <Aviso msg={msg} />
        </div>
    );
}

function Espacos({ comunidade, espacos, posts, envios, recarregar }) {
    const [nome, setNome] = useState('');
    const { busy, msg, rodar } = useAcao(recarregar);
    const criar = async (ev) => {
        ev.preventDefault();
        if (!nome.trim()) return;
        const ordem = espacos.reduce((m, e) => Math.max(m, e.ordem), 0) + 1;
        const ok = await rodar(() => supabase.from('comunidade_espacos').insert({ comunidade_id: comunidade.id, nome: nome.trim(), ordem }), 'Espaço criado.');
        if (ok) setNome('');
    };
    return (
        <div className="space-y-6">
            <form onSubmit={criar} className="liquid-glass flex flex-wrap items-end gap-3 rounded-[2rem] p-5 md:p-6">
                <label className="block space-y-2">
                    <span className="text-sm font-semibold">Novo espaço (instrumento)</span>
                    <input className="input-field h-11 w-64" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} placeholder="Ex.: Violão, Bateria, Vocal" />
                </label>
                <button type="submit" disabled={busy || !nome.trim()} className="btn-primary flex h-11 items-center gap-2 px-5 text-sm disabled:opacity-40">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar espaço
                </button>
                <Aviso msg={msg} />
            </form>
            <section aria-label="Espaços existentes">
                {espacos.map((e) => (
                    <LinhaEspaco key={e.id + e.nome} espaco={e} recarregar={recarregar}
                        qtdPosts={posts.filter((p) => p.espaco_id === e.id).length} qtdEnvios={envios.filter((v) => v.espaco_id === e.id).length} />
                ))}
            </section>
        </div>
    );
}

function Membros({ membros, recarregar }) {
    const { busy, msg, rodar } = useAcao(recarregar);
    const chave = (m) => ({ comunidade_id: m.comunidade_id, user_id: m.user_id });
    const alterar = (m, status) => rodar(() => supabase.from('comunidade_membros').update({ status }).match(chave(m)), status === 'bloqueado' ? 'Membro bloqueado.' : 'Membro liberado.');
    const remover = (m) => confirm(`Remover ${m.nome} da comunidade? Para voltar, a pessoa precisará digitar o código de novo.`)
        && rodar(() => supabase.from('comunidade_membros').delete().match(chave(m)), 'Membro removido.');
    return (
        <div className="space-y-4">
            <p className="text-sm text-text-muted">{membros.length} membro(s). Quem entra pelo código aparece aqui. Bloquear impede o acesso e o novo ingresso com o código.</p>
            <Aviso msg={msg} />
            {membros.length === 0 ? (
                <p className="text-sm text-text-muted">Ninguém entrou ainda. Envie o código da aba "Código de acesso" aos alunos da igreja.</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="text-[11px] uppercase tracking-widest text-text-muted"><tr>
                            <th className="px-4 py-3">Pessoa</th><th className="px-4 py-3">Entrou em</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3 text-right">Ações</th>
                        </tr></thead>
                        <tbody>
                            {membros.map((m) => (
                                <tr key={m.user_id} className="border-t border-white/5">
                                    <td className="px-4 py-3"><span className="block font-semibold">{m.nome}</span><span className="block text-xs text-text-muted">{m.email}</span></td>
                                    <td className="px-4 py-3 tabular-nums">{data(m.entrou_em)}</td>
                                    <td className="px-4 py-3">{m.status === 'ativo' ? 'Ativo' : <span className="font-semibold text-red-500">Bloqueado</span>}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            {m.status === 'ativo' ? (
                                                <button type="button" disabled={busy} onClick={() => alterar(m, 'bloqueado')} className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-text-muted hover:border-red-500/50 hover:text-red-500 disabled:opacity-40"><UserX className="h-4 w-4" /> Bloquear</button>
                                            ) : (
                                                <button type="button" disabled={busy} onClick={() => alterar(m, 'ativo')} className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-text-muted hover:border-primary/50 hover:text-text disabled:opacity-40"><UserCheck className="h-4 w-4" /> Liberar</button>
                                            )}
                                            <button type="button" disabled={busy} onClick={() => remover(m)} className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-text-muted hover:border-red-500/50 hover:text-red-500 disabled:opacity-40"><Trash2 className="h-4 w-4" /> Remover</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function Acesso({ comunidade, codigo, recarregar }) {
    const { busy, msg, rodar } = useAcao(recarregar);
    const [copiado, setCopiado] = useState(false);
    const copiar = async () => {
        try { await navigator.clipboard.writeText(codigo?.codigo ?? ''); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem permissão de área de transferência */ }
    };
    const salvar = (campos, ok) => rodar(() => supabase.from('comunidade_codigos').upsert({ comunidade_id: comunidade.id, codigo: codigo?.codigo ?? novoCodigo(), ativo: codigo?.ativo ?? true, ...campos, atualizado_em: new Date().toISOString() }), ok);
    return (
        <div className="liquid-glass max-w-xl space-y-5 rounded-[2rem] p-5 md:p-6">
            <div>
                <p className="text-sm font-semibold">Código de convite</p>
                <p className="mt-2 font-mono text-3xl font-bold tracking-widest" aria-live="polite">{codigo?.codigo ?? '—'}</p>
                <p className="mt-2 text-xs text-text-muted">{codigo?.ativo ? 'Ativo: quem digitar este código entra na comunidade.' : 'Desligado: ninguém novo consegue entrar.'}</p>
            </div>
            <div className="flex flex-wrap gap-3">
                <button type="button" onClick={copiar} className="btn-primary flex h-10 items-center gap-2 px-4 text-sm">
                    {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copiado ? 'Copiado' : 'Copiar'}
                </button>
                <button type="button" disabled={busy} onClick={() => confirm('Gerar um novo código? O código atual deixa de valer (quem já entrou continua).') && salvar({ codigo: novoCodigo(), ativo: true }, 'Novo código gerado.')}
                    className="flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm text-text-muted hover:border-primary/50 hover:text-text disabled:opacity-40">
                    <RefreshCw className="h-4 w-4" /> Gerar novo código
                </button>
                <button type="button" disabled={busy} onClick={() => salvar({ ativo: !(codigo?.ativo ?? true) }, codigo?.ativo ? 'Entrada desligada.' : 'Entrada ligada.')}
                    className="flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm text-text-muted hover:border-primary/50 hover:text-text disabled:opacity-40">
                    {codigo?.ativo ? 'Desligar entrada' : 'Ligar entrada'}
                </button>
            </div>
            <Aviso msg={msg} />
        </div>
    );
}

export default function Comunidade() {
    const [aba, setAba] = useState('mural');
    const [comunidade, setComunidade] = useState(null);
    const [espacos, setEspacos] = useState([]);
    const [posts, setPosts] = useState([]);
    const [envios, setEnvios] = useState([]);
    const [membros, setMembros] = useState([]);
    const [codigo, setCodigo] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');

    const carregar = useCallback(async () => {
        const { data: com, error } = await supabase.from('comunidades').select('id, slug, nome').eq('slug', 'mac').maybeSingle();
        if (error) { setErro(error.message); return; }
        if (!com) { setErro('Comunidade não encontrada. A migração 0017_comunidade.sql precisa ser executada no Supabase.'); return; }
        const [esp, cod, mem, sess] = await Promise.all([
            supabase.from('comunidade_espacos').select('id, nome, ordem').eq('comunidade_id', com.id).order('ordem'),
            supabase.from('comunidade_codigos').select('codigo, ativo').eq('comunidade_id', com.id).maybeSingle(),
            supabase.from('comunidade_membros').select('comunidade_id, user_id, status, entrou_em').eq('comunidade_id', com.id).order('entrou_em', { ascending: false }),
            supabase.auth.getSession(),
        ]);
        const falha = esp.error || cod.error || mem.error;
        if (falha) { setErro(falha.message); return; }
        const ids = esp.data.map((e) => e.id);
        const [po, en, pe] = await Promise.all([
            ids.length ? supabase.from('comunidade_posts').select('id, espaco_id, titulo, texto, video_ref, pdf_ref, criado_em').in('espaco_id', ids).order('criado_em', { ascending: false }) : { data: [] },
            ids.length ? supabase.from('comunidade_envios').select('id, espaco_id').in('espaco_id', ids) : { data: [] },
            mem.data.length ? supabase.from('perfis').select('id, nome_completo, email').in('id', mem.data.map((m) => m.user_id)) : { data: [] },
        ]);
        if (po.error || en.error || pe.error) { setErro((po.error || en.error || pe.error).message); return; }
        const perfil = Object.fromEntries((pe.data ?? []).map((p) => [p.id, p]));
        setComunidade(com); setEspacos(esp.data); setCodigo(cod.data); setPosts(po.data ?? []); setEnvios(en.data ?? []);
        setMembros(mem.data.map((m) => ({ ...m, nome: perfil[m.user_id]?.nome_completo || 'Sem nome', email: perfil[m.user_id]?.email || '' })));
        setUserId(sess.data?.session?.user?.id ?? null);
        setErro('');
    }, []);

    useEffect(() => { carregar().finally(() => setLoading(false)); }, [carregar]);

    return (
        <div className="mx-auto max-w-5xl space-y-8 pb-10">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">{comunidade?.nome ?? 'Comunidade MAC'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-text-muted">
                    Espaço gratuito do Ministério Adoradores de Cristo. Publique aulas e solos por instrumento, acompanhe quem entrou e controle o código de acesso.
                </p>
            </header>

            {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
            {loading && <div className="h-40 animate-pulse rounded-[2rem] bg-white/5" aria-busy="true" />}

            {comunidade && (
                <>
                    <div role="tablist" aria-label="Seções da comunidade" className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
                        {ABAS.map((a) => (
                            <button key={a.id} role="tab" type="button" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
                                className={cn('h-10 rounded-lg px-4 text-sm font-semibold transition-colors',
                                    aba === a.id ? 'bg-primary text-black' : 'text-text-muted hover:text-text')}>
                                {a.label}{a.id === 'membros' ? ` (${membros.length})` : ''}
                            </button>
                        ))}
                    </div>
                    <div role="tabpanel">
                        {aba === 'mural' && <Mural espacos={espacos} posts={posts} userId={userId} recarregar={carregar} />}
                        {aba === 'espacos' && <Espacos comunidade={comunidade} espacos={espacos} posts={posts} envios={envios} recarregar={carregar} />}
                        {aba === 'membros' && <Membros membros={membros} recarregar={carregar} />}
                        {aba === 'acesso' && <Acesso comunidade={comunidade} codigo={codigo} recarregar={carregar} />}
                    </div>
                </>
            )}
        </div>
    );
}
