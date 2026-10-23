import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crosshair, Save, Trash2, Music2 } from 'lucide-react';
import { useVideoClock } from '../lib/videoClock';
import { clearSync, listLessonLinks, saveSync } from '../lib/scores';
import SyncedDrumScore from './SyncedDrumScore';
import { Button } from './Button';

// Sob o vídeo da aula: a partitura de bateria acompanhando o vídeo (todos) e, para o administrador, o ajuste da sincronia.
export default function VideoSyncPanel({ lesson, media, videoRef, iframeRef }) {
    const isAdmin = localStorage.getItem('rf_role') === 'admin';
    const { clock, seek, supported, ready } = useVideoClock(media, { videoRef, iframeRef, lessonKey: lesson.id });
    const [links, setLinks] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [draft, setDraft] = useState(null); // { id, inicio, bpm, loop }
    const [msg, setMsg] = useState('');

    const reload = useCallback(async () => { setLinks(await listLessonLinks(lesson.id)); setLoaded(true); }, [lesson.id]);
    useEffect(() => { setLoaded(false); setDraft(null); setMsg(''); reload(); }, [reload]);

    const synced = links.filter((l) => l.sync_inicio != null);
    const active = draft ? links.find((l) => l.id === draft.id) : synced[0];
    const cfg = draft
        ? { inicio: Number(draft.inicio) || 0, bpm: Number(draft.bpm) || null, loop: draft.loop }
        : active ? { inicio: Number(active.sync_inicio), bpm: active.sync_bpm ? Number(active.sync_bpm) : null, loop: active.sync_loop !== false } : null;

    if (!loaded) return null;
    if (!isAdmin && (!supported || !synced.length)) return null;

    const pick = (id) => {
        const l = links.find((x) => x.id === id);
        if (!l) { setDraft(null); return; }
        setDraft({ id, inicio: l.sync_inicio ?? Math.round(clock.now() * 100) / 100, bpm: l.sync_bpm ?? '', loop: l.sync_loop !== false });
    };
    const nudge = (d) => setDraft((x) => ({ ...x, inicio: Math.max(0, Math.round(((Number(x.inicio) || 0) + d) * 100) / 100) }));
    const save = async () => {
        setMsg('');
        try { await saveSync(draft.id, { inicio: Number(draft.inicio) || 0, bpm: Number(draft.bpm) || null, loop: draft.loop }); setMsg('Sincronia salva.'); await reload(); setDraft(null); } catch (e) { setMsg(e.message); }
    };
    const remove = async () => {
        if (!window.confirm('Remover a sincronia desta partitura com o vídeo?')) return;
        try { await clearSync(draft.id); setMsg('Sincronia removida.'); await reload(); setDraft(null); } catch (e) { setMsg(e.message); }
    };

    return (
        <section className="mt-4 space-y-3" aria-label="Partitura sincronizada com o vídeo">
            {cfg && active && supported && (
                <>
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><Music2 className="h-4 w-4 text-primary" /> Partitura acompanhando o vídeo</h3>
                        <Link to={`/student/partituras/${active.partituras.id}`} className="text-xs font-semibold underline underline-offset-4">Abrir sozinha, com som</Link>
                    </div>
                    <SyncedDrumScore score={active.partituras} sync={cfg} clock={clock} seek={seek} />
                    <p className="text-xs text-white/60">Clique em uma nota para ir até esse ponto do vídeo.</p>
                </>
            )}

            {isAdmin && (
                <div className="glass rounded-2xl border border-primary/30 p-4 space-y-3">
                    <h3 className="text-sm font-bold flex items-center gap-2"><Crosshair className="h-4 w-4 text-primary" /> Sincronizar partitura com o vídeo (só você vê)</h3>
                    {!supported && <p className="text-xs text-white/70">Este vídeo não permite ler o tempo (Drive, Panda e outros). Use MP4, YouTube ou Vimeo para sincronizar.</p>}
                    {supported && !links.length && <p className="text-xs text-white/70">Ligue uma partitura de bateria a esta aula (em Editar aula, "Partituras da aula") para poder sincronizar.</p>}
                    {supported && links.length > 0 && (
                        <>
                            <label className="block space-y-1">
                                <span className="text-xs font-bold uppercase tracking-wider text-white/60">Partitura</span>
                                <select value={draft?.id || ''} onChange={(e) => pick(e.target.value)} className="h-10 w-full rounded-md border border-border bg-black/30 px-2 text-sm">
                                    <option value="">Escolha…</option>
                                    {links.map((l) => <option key={l.id} value={l.id}>{l.partituras.titulo}{l.sync_inicio != null ? ' (sincronizada)' : ''}</option>)}
                                </select>
                            </label>
                            {draft && (
                                <div className="space-y-3">
                                    <p className="text-xs text-white/70">Toque o vídeo, pause no instante exato do <b>primeiro tempo do compasso 1</b> e clique em "Marcar agora". Ajuste fino com os botões de 0,05 s.</p>
                                    <div className="flex flex-wrap items-end gap-3">
                                        <label className="space-y-1"><span className="block text-xs font-bold uppercase tracking-wider text-white/60">Início (s)</span>
                                            <input type="number" step="0.01" min="0" value={draft.inicio} onChange={(e) => setDraft({ ...draft, inicio: e.target.value })} className="h-10 w-28 rounded-md border border-border bg-black/30 px-2 text-sm tabular-nums" /></label>
                                        <Button type="button" variant="secondary" onClick={() => setDraft({ ...draft, inicio: Math.round(clock.now() * 100) / 100 })} disabled={!ready}>Marcar agora</Button>
                                        <Button type="button" variant="ghost" onClick={() => nudge(-0.05)}>−0,05</Button>
                                        <Button type="button" variant="ghost" onClick={() => nudge(0.05)}>+0,05</Button>
                                        <Button type="button" variant="ghost" onClick={() => seek(Number(draft.inicio) || 0)}>Ir para o início</Button>
                                        <label className="space-y-1"><span className="block text-xs font-bold uppercase tracking-wider text-white/60">Andamento (♩/min)</span>
                                            <input type="number" step="1" min="20" max="300" placeholder="da partitura" value={draft.bpm} onChange={(e) => setDraft({ ...draft, bpm: e.target.value })} className="h-10 w-32 rounded-md border border-border bg-black/30 px-2 text-sm tabular-nums" /></label>
                                        <label className="flex items-center gap-2 pb-2 text-sm font-semibold"><input type="checkbox" checked={draft.loop} onChange={(e) => setDraft({ ...draft, loop: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" /> Repetir até o fim do vídeo</label>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" onClick={save}><Save className="mr-2 h-4 w-4" />Salvar sincronia</Button>
                                        {links.find((l) => l.id === draft.id)?.sync_inicio != null && <Button type="button" variant="ghost" className="text-red-500" onClick={remove}><Trash2 className="mr-2 h-4 w-4" />Remover</Button>}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    {msg && <p role="status" className="text-xs font-semibold text-primary">{msg}</p>}
                </div>
            )}
        </section>
    );
}
