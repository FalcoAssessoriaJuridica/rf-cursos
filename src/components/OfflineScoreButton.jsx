import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Loader2, Trash2 } from 'lucide-react';
import { isSavedOffline, removeOfflineScore, saveScoreOffline } from '../lib/offlineScores';
import useOnline from '../lib/useOnline';

// Salvar a partitura no aparelho para usar sem internet (ou remover a cópia)
export default function OfflineScoreButton({ score }) {
    const online = useOnline();
    const [state, setState] = useState('checking');   // checking | idle | saving | saved
    const [error, setError] = useState('');

    useEffect(() => { let alive = true; isSavedOffline(score.id).then((v) => alive && setState(v ? 'saved' : 'idle')); return () => { alive = false; }; }, [score.id]);

    const save = async () => {
        setError(''); setState('saving');
        try { await saveScoreOffline(score); setState('saved'); }
        catch (e) { setError(e.message); setState('idle'); }
    };
    const remove = async () => { await removeOfflineScore(score.id); setState('idle'); };

    if (state === 'checking') return null;
    return (
        <div className="flex flex-wrap items-center gap-3">
            {state === 'saved' ? (
                <>
                    <span className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-semibold text-green-500"><CheckCircle2 className="h-4 w-4" /> Salva neste aparelho (funciona sem internet)</span>
                    <button type="button" onClick={remove} className="flex items-center gap-2 text-sm font-semibold text-text-muted underline underline-offset-4 hover:text-red-500"><Trash2 className="h-4 w-4" /> Remover do aparelho</button>
                </>
            ) : (
                <button type="button" onClick={save} disabled={state === 'saving' || !online} className="bevel flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-60">
                    {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {state === 'saving' ? 'Salvando...' : 'Salvar para usar sem internet'}
                </button>
            )}
            {error && <p role="alert" className="text-sm font-semibold text-red-500">{error}</p>}
        </div>
    );
}
