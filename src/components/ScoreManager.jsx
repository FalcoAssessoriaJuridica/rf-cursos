import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileMusic, Loader2, Trash2, Upload, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { addScore, listScores, removeScore, LibraryNotReady, SCORE_ACCEPT, isRealId } from '../lib/scores';
import { convertToMusicXml, isMusicXml, isPdfOrImage } from '../score/omr';

// Biblioteca de partituras de um curso (aulaId vazio) ou de uma aula. Está sempre disponível: o admin só envia o arquivo.
// MusicXML entra direto; PDF/imagem passa pela leitura (OMR) e guarda o MusicXML junto com o original.
export default function ScoreManager({ cursoId, aulaId = null, title = 'Partituras' }) {
    const inputRef = useRef(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notReady, setNotReady] = useState(false);

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
            const titulo = file.name.replace(/\.[^.]+$/, '');
            try {
                if (isMusicXml(file)) {
                    setBusy(`Salvando ${titulo}…`);
                    await addScore({ cursoId, aulaId, titulo, origem: 'musicxml', mxl: file, ordem: items.length });
                } else if (isPdfOrImage(file)) {
                    setBusy(`Lendo ${titulo} (pode levar cerca de um minuto)…`);
                    const mxl = await convertToMusicXml(file);
                    await addScore({ cursoId, aulaId, titulo, origem: 'pdf', mxl, original: file, limpar: true, ordem: items.length });
                } else {
                    throw new Error(`"${file.name}": envie PDF, imagem ou MusicXML (.mxl, .musicxml).`);
                }
            } catch (e) {
                if (e instanceof LibraryNotReady) { setNotReady(true); break; }
                setError(e.message);
            }
        }
        setBusy('');
        refresh();
    };

    const remove = async (s) => {
        if (!window.confirm(`Excluir a partitura "${s.titulo}"?`)) return;
        try { await removeScore(s); refresh(); } catch (e) { setError(e.message); }
    };

    if (!isRealId(cursoId)) return null;

    return (
        <div className="space-y-2 rounded-lg border border-white/10 p-3">
            <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-muted"><FileMusic className="h-4 w-4 text-primary" /> {title}</h4>
                <button type="button" disabled={!!busy || notReady} onClick={() => inputRef.current?.click()} className="flex h-8 items-center gap-2 rounded-md border border-primary/40 px-3 text-xs font-bold text-primary disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Adicionar
                </button>
                <input ref={inputRef} type="file" multiple accept={SCORE_ACCEPT} className="hidden" onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} />
            </div>
            {busy && <p className="text-xs text-text-muted">{busy}</p>}
            {error && <p role="alert" className="text-xs font-semibold text-red-500">{error}</p>}
            {notReady && <p className="text-xs text-text-muted">A biblioteca ainda não foi ativada no banco de dados. Rode o SQL <code>0005_partituras.sql</code> no Supabase.</p>}
            {loading ? <p className="text-xs text-text-muted">Carregando…</p> : (
                <ul className="space-y-1">
                    {items.map((s) => (
                        <li key={s.id} className="flex items-center gap-2 text-sm">
                            <FileMusic className="h-4 w-4 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
                            <span className="text-[10px] uppercase text-text-muted">{s.origem === 'pdf' ? 'PDF lido' : 'MusicXML'}</span>
                            <Link to={`/student/partituras/${s.id}`} title="Abrir" className="p-1 text-text-muted hover:text-primary"><Eye className="h-4 w-4" /></Link>
                            <button type="button" title="Excluir" onClick={() => remove(s)} className="p-1 text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </li>
                    ))}
                    {!items.length && !notReady && <li className="text-xs text-text-muted">Nenhuma partitura ainda. Envie um PDF ou MusicXML.</li>}
                </ul>
            )}
        </div>
    );
}
