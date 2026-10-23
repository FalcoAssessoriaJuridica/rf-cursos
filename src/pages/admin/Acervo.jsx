import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, FileMusic, Folder, FolderPlus, Layers, Loader2, Pencil, Search, Share2, Trash2, Upload, X } from 'lucide-react';
import { Button } from '../../components/Button';
import ScoreLinksDialog from '../../components/ScoreLinksDialog';
import { ingestFile } from '../../lib/ingest';
import { LibraryNotReady, SCORE_ACCEPT, createFolder, deleteFolder, listAcervo, listFolders, removeScore, renameFolder, updateScore } from '../../lib/scores';
import { cn } from '../../lib/utils';

// Acervo central de partituras: pastas por gênero/tema, upload em lote e controle de onde cada partitura aparece (cursos e aulas).
export default function Acervo() {
    const inputRef = useRef(null);
    const navigate = useNavigate();
    const [folders, setFolders] = useState([]);
    const [scores, setScores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notReady, setNotReady] = useState(false);
    const [error, setError] = useState('');
    const [folder, setFolder] = useState('all'); // 'all' | 'none' | id
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState('');
    const [linking, setLinking] = useState(null);
    const [editing, setEditing] = useState(null);
    const [notice, setNotice] = useState('');

    const refresh = useCallback(async () => {
        try {
            const [f, s] = await Promise.all([listFolders(), listAcervo()]);
            setFolders(f); setScores(s); setNotReady(false);
        } catch (e) {
            if (e instanceof LibraryNotReady) setNotReady(true); else setError(e.message);
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    const children = useMemo(() => {
        const m = new Map();
        folders.forEach((f) => { const k = f.pai_id || 'root'; m.set(k, [...(m.get(k) || []), f]); });
        return m;
    }, [folders]);
    const descendants = useCallback((id) => {
        const out = [id];
        (children.get(id) || []).forEach((c) => out.push(...descendants(c.id)));
        return out;
    }, [children]);
    const count = (id) => { const ids = new Set(descendants(id)); return scores.filter((s) => ids.has(s.pasta_id)).length; };
    const folderName = useMemo(() => new Map(folders.map((f) => [f.id, f.nome])), [folders]);

    const shown = useMemo(() => {
        const term = q.trim().toLowerCase();
        const ids = folder !== 'all' && folder !== 'none' ? new Set(descendants(folder)) : null;
        return scores.filter((s) => (folder === 'all' || (folder === 'none' ? !s.pasta_id : ids.has(s.pasta_id)))
            && (!term || `${s.titulo} ${s.compositor || ''}`.toLowerCase().includes(term)));
    }, [scores, folder, q, descendants]);

    const targetFolder = folder !== 'all' && folder !== 'none' ? folder : null;

    const onFiles = async (files) => {
        setError(''); setNotice('');
        let ok = 0;
        for (const [i, file] of files.entries()) {
            try {
                await ingestFile(file, { pastaId: targetFolder, onStatus: (m) => setBusy(`(${i + 1}/${files.length}) ${m}`) });
                ok += 1;
            } catch (e) {
                if (e instanceof LibraryNotReady) { setNotReady(true); break; }
                setError((p) => (p ? `${p}\n` : '') + e.message);
            }
        }
        setBusy('');
        if (ok) setNotice(`${ok} partitura(s) adicionada(s)${targetFolder ? ` em "${folderName.get(targetFolder)}"` : ' (sem pasta)'}.`);
        refresh();
    };

    const newFolder = async () => {
        const nome = window.prompt(targetFolder ? `Nome da subpasta de "${folderName.get(targetFolder)}":` : 'Nome da nova pasta:');
        if (!nome?.trim()) return;
        try { const f = await createFolder(nome, targetFolder); await refresh(); setFolder(f.id); } catch (e) { setError(e.message); }
    };
    const rename = async () => {
        const nome = window.prompt('Novo nome da pasta:', folderName.get(folder));
        if (!nome?.trim()) return;
        try { await renameFolder(folder, nome); refresh(); } catch (e) { setError(e.message); }
    };
    const dropFolder = async () => {
        if (!window.confirm(`Excluir a pasta "${folderName.get(folder)}" e suas subpastas? As partituras NÃO são apagadas: ficam em "Sem pasta".`)) return;
        try { await deleteFolder(folder); setFolder('all'); refresh(); } catch (e) { setError(e.message); }
    };
    const drop = async (s) => {
        if (!window.confirm(`Excluir "${s.titulo}" do acervo? Ela some também de todos os cursos e aulas onde está disponível.`)) return;
        try { await removeScore(s); refresh(); } catch (e) { setError(e.message); }
    };
    const saveEdit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
            await updateScore(editing.id, { titulo: f.get('titulo').trim(), compositor: f.get('compositor').trim() || null, fonte: f.get('fonte').trim() || null, pasta_id: f.get('pasta') || null });
            setEditing(null); refresh();
        } catch (err) { setError(err.message); }
    };

    const renderFolders = (parent, depth) => (children.get(parent) || []).map((f) => (
        <React.Fragment key={f.id}>
            <button type="button" onClick={() => setFolder(f.id)} style={{ paddingLeft: 12 + depth * 16 }}
                className={cn('flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors', folder === f.id ? 'bg-primary/15 font-bold text-primary' : 'hover:bg-white/5')}>
                <Folder className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{f.nome}</span><span className="text-xs text-text-muted">{count(f.id)}</span>
            </button>
            {renderFolders(f.id, depth + 1)}
        </React.Fragment>
    ));

    const row = (id, label, Icon, n) => (
        <button type="button" onClick={() => setFolder(id)} className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors', folder === id ? 'bg-primary/15 font-bold text-primary' : 'hover:bg-white/5')}>
            <Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span><span className="text-xs text-text-muted">{n}</span>
        </button>
    );

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold text-text">Acervo de partituras</h2>
                <p className="text-text-muted">Organize por pastas e escolha em quais cursos e aulas cada partitura aparece.</p>
            </div>
            {notReady && <p className="rounded-lg border border-primary/30 p-4 text-sm">O acervo ainda não foi ativado no banco de dados. Rode o SQL <code>0006_acervo_partituras.sql</code> no Supabase.</p>}
            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="glass h-fit space-y-1 rounded-2xl p-3">
                    {row('all', 'Todas as partituras', Layers, scores.length)}
                    {renderFolders('root', 0)}
                    {row('none', 'Sem pasta', FileMusic, scores.filter((s) => !s.pasta_id).length)}
                    <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                        <button type="button" onClick={newFolder} className="flex h-8 items-center gap-1 rounded-md border border-primary/40 px-2 text-xs font-bold text-primary"><FolderPlus className="h-3.5 w-3.5" />{targetFolder ? 'Subpasta' : 'Nova pasta'}</button>
                        {targetFolder && <>
                            <button type="button" onClick={rename} className="flex h-8 items-center gap-1 rounded-md border border-white/20 px-2 text-xs font-bold"><Pencil className="h-3.5 w-3.5" />Renomear</button>
                            <button type="button" onClick={dropFolder} className="flex h-8 items-center gap-1 rounded-md border border-red-500/40 px-2 text-xs font-bold text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</button>
                        </>}
                    </div>
                </aside>

                <section className="min-w-0 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative min-w-[200px] flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título ou compositor" className="h-10 w-full rounded-md border border-border bg-transparent pl-9 pr-3 text-sm" />
                        </div>
                        <Button type="button" disabled={!!busy || notReady} onClick={() => inputRef.current?.click()}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Adicionar{targetFolder ? ` em ${folderName.get(targetFolder)}` : ''}
                        </Button>
                        <input ref={inputRef} type="file" multiple accept={SCORE_ACCEPT} className="hidden" onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} />
                    </div>
                    {busy && <p className="text-sm text-text-muted">{busy}</p>}
                    {notice && <p className="text-sm font-semibold text-primary">{notice}</p>}
                    {error && <p role="alert" className="whitespace-pre-line text-sm font-semibold text-red-500">{error}</p>}

                    {loading ? <p className="text-sm text-text-muted">Carregando…</p> : (
                        <ul className="space-y-2">
                            {shown.map((s) => (
                                <li key={s.id} role="link" tabIndex={0} onClick={() => navigate(`/student/partituras/${s.id}`)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/student/partituras/${s.id}`); }}
                                    className="glass glass-hover flex cursor-pointer flex-wrap items-center gap-3 rounded-xl p-3">
                                    <FileMusic className="h-5 w-5 shrink-0 text-primary" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold">{s.titulo}</p>
                                        <p className="truncate text-xs text-text-muted">
                                            {[s.compositor, s.pasta_id ? folderName.get(s.pasta_id) : 'Sem pasta', s.origem === 'pdf' ? 'PDF lido' : 'MusicXML'].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Button variant="secondary" size="sm" type="button" className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider" onClick={() => setLinking(s)}><Share2 className="mr-1 h-3.5 w-3.5" />Cursos e aulas</Button>
                                        <Link to={`/student/partituras/${s.id}`} title="Abrir" className="p-2 text-text-muted hover:text-primary"><Eye className="h-4 w-4" /></Link>
                                        <button type="button" title="Editar" onClick={() => setEditing(s)} className="p-2 text-text-muted hover:text-primary"><Pencil className="h-4 w-4" /></button>
                                        <button type="button" title="Excluir" onClick={() => drop(s)} className="p-2 text-red-500"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                </li>
                            ))}
                            {!shown.length && !notReady && <li className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-text-muted">Nenhuma partitura aqui. Use "Adicionar" para enviar PDFs ou MusicXML.</li>}
                        </ul>
                    )}
                </section>
            </div>

            {linking && <ScoreLinksDialog score={linking} onClose={() => setLinking(null)} />}
            {editing && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
                    <form onSubmit={saveEdit} className="glass w-full max-w-md space-y-3 rounded-2xl border border-primary/30 bg-background/95 p-5">
                        <div className="flex items-center justify-between"><h3 className="font-bold">Editar partitura</h3><button type="button" onClick={() => setEditing(null)} aria-label="Fechar"><X className="h-5 w-5 text-text-muted" /></button></div>
                        {[['titulo', 'Título', editing.titulo, true], ['compositor', 'Compositor', editing.compositor || ''], ['fonte', 'Procedência / licença', editing.fonte || '']].map(([n, l, v, req]) => (
                            <label key={n} className="block space-y-1"><span className="text-xs font-bold uppercase tracking-wider text-text-muted">{l}</span>
                                <input name={n} defaultValue={v} required={!!req} className="h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm" /></label>
                        ))}
                        <label className="block space-y-1"><span className="text-xs font-bold uppercase tracking-wider text-text-muted">Pasta</span>
                            <select name="pasta" defaultValue={editing.pasta_id || ''} className="h-10 w-full rounded-md border border-border bg-black/20 px-2 text-sm">
                                <option value="">Sem pasta</option>
                                {folders.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                            </select></label>
                        <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit">Salvar</Button></div>
                    </form>
                </div>
            )}
        </div>
    );
}
