import React, { useEffect, useMemo, useState } from 'react';
import { FileMusic, Folder, Search, X } from 'lucide-react';
import { listAcervo, listFolders } from '../lib/scores';
import { Button } from './Button';

// Escolhe partituras do acervo (várias) para disponibilizar em um curso ou aula. `exclude` = ids que já estão lá.
export default function AcervoPicker({ exclude = [], onPick, onClose, title = 'Escolher do acervo' }) {
    const [scores, setScores] = useState(null);
    const [folders, setFolders] = useState([]);
    const [folder, setFolder] = useState('all');
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(new Set());
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([listAcervo(), listFolders()]).then(([s, f]) => { setScores(s); setFolders(f); }).catch((e) => setError(e.message));
    }, []);

    const path = useMemo(() => {
        const byId = new Map(folders.map((f) => [f.id, f]));
        const name = (f) => (f.pai_id && byId.get(f.pai_id) ? `${name(byId.get(f.pai_id))} / ${f.nome}` : f.nome);
        return new Map(folders.map((f) => [f.id, name(f)]));
    }, [folders]);

    const shown = useMemo(() => {
        const term = q.trim().toLowerCase();
        const skip = new Set(exclude);
        return (scores || []).filter((s) => !skip.has(s.id)
            && (folder === 'all' || (folder === 'none' ? !s.pasta_id : s.pasta_id === folder))
            && (!term || `${s.titulo} ${s.compositor || ''}`.toLowerCase().includes(term)));
    }, [scores, folder, q, exclude]);

    const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
            <div className="glass flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-primary/30 bg-background/95">
                <div className="flex items-center justify-between p-4">
                    <h3 className="font-bold">{title}</h3>
                    <button type="button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5 text-text-muted" /></button>
                </div>
                <div className="flex gap-2 px-4">
                    <select value={folder} onChange={(e) => setFolder(e.target.value)} className="h-10 rounded-md border border-border bg-black/20 px-2 text-sm">
                        <option value="all">Todas as pastas</option>
                        <option value="none">Sem pasta</option>
                        {folders.map((f) => <option key={f.id} value={f.id}>{path.get(f.id)}</option>)}
                    </select>
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar título ou compositor" className="h-10 w-full rounded-md border border-border bg-transparent pl-9 pr-3 text-sm" />
                    </div>
                </div>
                <div className="mt-3 min-h-[200px] flex-1 overflow-y-auto px-4">
                    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
                    {scores === null && !error && <p className="text-sm text-text-muted">Carregando…</p>}
                    {scores && !shown.length && <p className="py-6 text-center text-sm text-text-muted">Nenhuma partitura encontrada.</p>}
                    <ul className="space-y-1">
                        {shown.map((s) => (
                            <li key={s.id}>
                                <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-white/5">
                                    <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4 accent-[var(--color-primary)]" />
                                    <FileMusic className="h-4 w-4 shrink-0 text-primary" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold">{s.titulo}</span>
                                        <span className="flex items-center gap-1 truncate text-xs text-text-muted">
                                            {s.pasta_id && <><Folder className="h-3 w-3" />{path.get(s.pasta_id)}</>}
                                            {s.compositor && <span>· {s.compositor}</span>}
                                        </span>
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                    <span className="text-xs text-text-muted">{sel.size} selecionada(s)</span>
                    <div className="flex gap-2">
                        <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
                        <Button type="button" disabled={!sel.size} onClick={() => onPick([...sel])}>Disponibilizar</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
