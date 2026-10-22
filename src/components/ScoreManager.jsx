import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileMusic, Library, Loader2, Unlink, Upload, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { addLinks, listScores, removeLink, LibraryNotReady, SCORE_ACCEPT, isRealId } from '../lib/scores';
import { ingestFile } from '../lib/ingest';
import AcervoPicker from './AcervoPicker';

// Partituras disponíveis em um curso (aulaId vazio) ou em uma aula. Sempre existe: é só enviar um arquivo (entra no acervo
// e já fica aqui) ou escolher partituras que já estão no acervo, mesmo as de outros cursos. Tirar daqui só desfaz o vínculo.
export default function ScoreManager({ cursoId, aulaId = null, title = 'Partituras' }) {
    const inputRef = useRef(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notReady, setNotReady] = useState(false);
    const [picking, setPicking] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setItems(await listScores({ cursoId, aulaId }));
            setNotReady(false);
        } catch (e) {
            if (e instanceof LibraryNotReady) setNotReady(true); else setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [cursoId, aulaId]);

    useEffect(() => { setLoading(true); setError(''); refresh(); }, [refresh]);

    const onFiles = async (files) => {
        setError('');
        for (const file of files) {
            try {
                await ingestFile(file, { cursoId, aulaId, onStatus: setBusy });
            } catch (e) {
                if (e instanceof LibraryNotReady) { setNotReady(true); break; }
                setError(e.message);
            }
        }
        setBusy('');
        refresh();
    };

    const pick = async (ids) => {
        setPicking(false);
        try { await addLinks(ids, { cursoId, aulaId }); refresh(); } catch (e) { setError(e.message); }
    };

    const unlink = async (s) => {
        if (!window.confirm(`Tirar "${s.titulo}" daqui? Ela continua no acervo e nos outros cursos.`)) return;
        try { await removeLink(s.vinculo_id); refresh(); } catch (e) { setError(e.message); }
    };

    if (!isRealId(cursoId)) return null;

    return (
        <div className="space-y-2 rounded-lg border border-white/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-muted"><FileMusic className="h-4 w-4 text-primary" /> {title}</h4>
                <div className="flex gap-2">
                    <button type="button" disabled={notReady} onClick={() => setPicking(true)} className="flex h-8 items-center gap-2 rounded-md border border-white/20 px-3 text-xs font-bold disabled:opacity-50">
                        <Library className="h-3.5 w-3.5" /> Do acervo
                    </button>
                    <button type="button" disabled={!!busy || notReady} onClick={() => inputRef.current?.click()} className="flex h-8 items-center gap-2 rounded-md border border-primary/40 px-3 text-xs font-bold text-primary disabled:opacity-50">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Enviar arquivo
                    </button>
                </div>
                <input ref={inputRef} type="file" multiple accept={SCORE_ACCEPT} className="hidden" onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} />
            </div>
            {busy && <p className="text-xs text-text-muted">{busy}</p>}
            {error && <p role="alert" className="text-xs font-semibold text-red-500">{error}</p>}
            {notReady && <p className="text-xs text-text-muted">O acervo ainda não foi ativado no banco de dados. Rode o SQL <code>0006_acervo_partituras.sql</code> no Supabase.</p>}
            {loading ? <p className="text-xs text-text-muted">Carregando…</p> : (
                <ul className="space-y-1">
                    {items.map((s) => (
                        <li key={s.vinculo_id} className="flex items-center gap-2 text-sm">
                            <FileMusic className="h-4 w-4 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
                            <span className="text-[10px] uppercase text-text-muted">{s.origem === 'pdf' ? 'PDF lido' : 'MusicXML'}</span>
                            <Link to={`/student/partituras/${s.id}`} title="Abrir" className="p-1 text-text-muted hover:text-primary"><Eye className="h-4 w-4" /></Link>
                            <button type="button" title="Tirar daqui" onClick={() => unlink(s)} className="p-1 text-red-500"><Unlink className="h-4 w-4" /></button>
                        </li>
                    ))}
                    {!items.length && !notReady && <li className="text-xs text-text-muted">Nenhuma partitura aqui ainda. Envie um arquivo ou escolha do acervo.</li>}
                </ul>
            )}
            {picking && <AcervoPicker exclude={items.map((s) => s.id)} onPick={pick} onClose={() => setPicking(false)} />}
        </div>
    );
}
