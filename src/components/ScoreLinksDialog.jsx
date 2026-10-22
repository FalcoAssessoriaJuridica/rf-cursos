import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { listLinks, loadCourseTree, setLinks } from '../lib/scores';
import { Button } from './Button';

// Onde esta partitura fica disponível: curso inteiro e/ou aulas específicas, em qualquer curso.
export default function ScoreLinksDialog({ score, onClose, onSaved }) {
    const [tree, setTree] = useState(null);
    const [sel, setSel] = useState(new Set());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const key = (c, a) => `${c}|${a || ''}`;

    useEffect(() => {
        Promise.all([loadCourseTree(), listLinks(score.id)])
            .then(([t, l]) => { setTree(t); setSel(new Set(l.map((x) => key(x.curso_id, x.aula_id)))); })
            .catch((e) => setError(e.message));
    }, [score.id]);

    const toggle = (k) => setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const targets = [...sel].map((k) => { const [cursoId, aulaId] = k.split('|'); return { cursoId, aulaId: aulaId || null }; });
            await setLinks(score.id, targets);
            onSaved?.(targets.length);
            onClose();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    };

    const box = (k, label, strong) => (
        <label className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-white/5">
            <input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} className="h-4 w-4 accent-[var(--color-primary)]" />
            <span className={strong ? 'text-sm font-semibold' : 'text-sm'}>{label}</span>
        </label>
    );

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
            <div className="glass flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-primary/30 bg-background/95">
                <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                        <h3 className="font-bold">Disponibilizar em cursos e aulas</h3>
                        <p className="truncate text-xs text-text-muted">{score.titulo}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5 text-text-muted" /></button>
                </div>
                <div className="min-h-[200px] flex-1 space-y-4 overflow-y-auto px-4">
                    {!tree && !error && <p className="text-sm text-text-muted">Carregando…</p>}
                    {tree?.map((c) => (
                        <div key={c.id} className="rounded-lg border border-white/10 p-3">
                            {box(key(c.id, null), `${c.titulo} — curso inteiro`, true)}
                            {c.modulos.map((m) => (
                                <div key={m.id} className="ml-4 mt-1">
                                    <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{m.titulo}</p>
                                    {m.aulas.map((a) => <div key={a.id} className="ml-2">{box(key(c.id, a.id), a.titulo)}</div>)}
                                </div>
                            ))}
                        </div>
                    ))}
                    {tree && !tree.length && <p className="text-sm text-text-muted">Nenhum curso cadastrado.</p>}
                    {error && <p role="alert" className="text-sm font-semibold text-red-500">{error}</p>}
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                    <span className="text-xs text-text-muted">{sel.size} destino(s)</span>
                    <div className="flex gap-2">
                        <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
                        <Button type="button" disabled={saving || !tree} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
