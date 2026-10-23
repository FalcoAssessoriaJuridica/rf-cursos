import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Timer } from 'lucide-react';
import { ScorePlayer } from '../score/scoreEngine';
import DrumOverlay from '../score/DrumOverlay';

// Partitura de bateria que acompanha o vídeo: a barra e a bolinha seguem o relógio do vídeo (sem som próprio) e um clique
// em qualquer nota leva o vídeo àquele ponto. sync = { inicio, bpm, loop }: inicio = segundo do vídeo em que o 1º tempo do compasso 1 soa.
export default function SyncedDrumScore({ score, sync, clock, seek }) {
    const holder = useRef(null);
    const playerRef = useRef(null);
    const syncRef = useRef(sync);
    syncRef.current = sync;
    const [state, setState] = useState({ loading: true });

    useEffect(() => {
        let alive = true;
        const p = new ScorePlayer(holder.current, {});
        playerRef.current = p;
        setState({ loading: true });
        p.load(score.arquivo_url, { clean: score.origem === 'pdf' ? score.limpar_anotacoes !== false : false, timeSig: score.compasso || null })
            .then((info) => {
                if (!alive) return;
                // posição na partitura (semibreves) a partir do tempo do vídeo; bpm em semínimas por minuto
                p.ext = () => {
                    const s = syncRef.current;
                    const bpm = s.bpm || p.baseBpm;
                    const w = Math.max(0, clock.now() - s.inicio) * (bpm / 60 / 4);
                    const end = p.endWhole();
                    if (!(end > 0)) return w;
                    return s.loop ? w % end : Math.min(w, end - 1e-6);
                };
                setState({ loading: false, ...info });
            })
            .catch((e) => alive && setState({ loading: false, error: e?.message || 'Não foi possível abrir a partitura.' }));
        return () => { alive = false; p.ext = null; p.dispose(); };
    }, [score.arquivo_url, score.origem, score.compasso, clock]);

    const onSeek = (t) => {
        const p = playerRef.current;
        const s = syncRef.current;
        const bpm = s.bpm || p.baseBpm;
        const secPerWhole = 240 / bpm;
        const loopSec = p.endWhole() * secPerWhole;
        const rep = s.loop && loopSec > 0 ? Math.max(0, Math.floor((clock.now() - s.inicio) / loopSec)) : 0; // fica na repetição em que o vídeo está
        seek(s.inicio + rep * loopSec + t * secPerWhole);
    };

    const bpm = sync.bpm || state.bpm;
    return (
        <div className="score-paper drum-paper rounded-2xl p-3 md:p-6" aria-label={`Partitura: ${score.titulo}`}>
            <div className="dp-head">
                <span className="dp-title">{score.titulo}</span>
                {bpm ? <span className="dp-badge"><Timer className="h-4 w-4" /> {Math.round(bpm)}</span> : null}
            </div>
            {state.loading && !state.error && <div className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin" /> Preparando a partitura…</div>}
            {state.error && <p role="alert" className="text-sm font-semibold text-red-600">{state.error}</p>}
            <div className="dp-wrap">
                <div ref={holder} />
                <DrumOverlay player={playerRef.current} ready={!state.loading && !state.error} playing step={0} layoutKey={score.arquivo_url} onSeek={onSeek} />
            </div>
        </div>
    );
}
