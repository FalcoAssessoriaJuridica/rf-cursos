import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, RotateCcw, SkipBack, Timer, Volume2, VolumeX } from 'lucide-react';
import { ScorePlayer } from './scoreEngine';
import DrumOverlay from './DrumOverlay';
import { cn } from '../lib/utils';

// Partitura interativa: desenha, toca e acompanha com o cursor. Funciona com uma só pauta (clave de Sol) ou várias partes.
export default function ScoreViewer({ source, title, fromOmr = false, initialTimeSig = '', initialClean = null }) {
    const holder = useRef(null);
    const player = useRef(null);
    const [state, setState] = useState({ loading: true });
    const [playing, setPlaying] = useState(false);
    const [step, setStep] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [muted, setMuted] = useState([]);
    const [metro, setMetro] = useState(false);
    const [clean, setClean] = useState(fromOmr);
    const [timeSig, setTimeSig] = useState('');

    useEffect(() => {
        if (!holder.current || !source) return undefined;
        let alive = true;
        const p = new ScorePlayer(holder.current, {
            onStep: (i) => alive && setStep(i),
            onEnd: () => alive && setPlaying(false),
        });
        player.current = p;
        setState({ loading: true });
        setPlaying(false);
        setStep(0);
        setMuted([]);
        p.load(source, { clean, timeSig: timeSig || null })
            .then((info) => alive && setState({ loading: false, ...info }))
            .catch((e) => alive && setState({ loading: false, error: e?.message || 'Não foi possível abrir esta partitura.' }));
        return () => { alive = false; p.dispose(); };
    }, [source, clean, timeSig]);

    useEffect(() => { setClean(initialClean ?? fromOmr); setTimeSig(initialTimeSig || ''); }, [source, fromOmr, initialClean, initialTimeSig]);

    const toggle = useCallback(async () => {
        const p = player.current;
        if (!p || state.loading || state.error) return;
        if (playing) { p.pause(); setPlaying(false); } else { await p.play(); setPlaying(true); }
    }, [playing, state]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName || '')) { e.preventDefault(); toggle(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toggle]);

    const restart = () => { player.current?.stop(); setPlaying(false); };
    const changeSpeed = (v) => { setSpeed(v); player.current?.setSpeed(v); };
    const togglePart = (i) => {
        const off = !muted.includes(i);
        player.current?.setMuted(i, off);
        setMuted((m) => (off ? [...m, i] : m.filter((x) => x !== i)));
    };
    const toggleMetro = () => { const v = !metro; setMetro(v); player.current?.setMetronome(v); };

    const bpm = state.bpm ? Math.round(state.bpm * speed) : null;

    return (
        <div className="score-viewer space-y-4">
            <div className="score-controls sticky top-0 z-30 rounded-2xl p-3 md:p-4 flex flex-wrap items-center gap-3 md:gap-5">
                <div className="flex items-center gap-2">
                    <button type="button" onClick={toggle} disabled={state.loading || !!state.error} aria-label={playing ? 'Pausar' : 'Tocar'} className="bevel bg-primary text-black h-11 px-5 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50">
                        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                        {playing ? 'Pausar' : 'Tocar'}
                    </button>
                    <button type="button" onClick={restart} disabled={state.loading || !!state.error} aria-label="Voltar ao início" className="bevel h-11 w-11 rounded-lg border border-white/30 flex items-center justify-center disabled:opacity-50">
                        <SkipBack className="h-5 w-5" />
                    </button>
                </div>

                <label className="flex items-center gap-3 text-sm font-semibold">
                    <Timer className="h-5 w-5 text-primary" />
                    <span className="min-w-[4.2rem]">{bpm ? `${bpm} bpm` : 'Andamento'}</span>
                    <input type="range" min="0.4" max="1.6" step="0.05" value={speed} onChange={(e) => changeSpeed(parseFloat(e.target.value))} className="w-32 md:w-44 accent-[rgb(var(--c-primary))]" aria-label="Velocidade" />
                    <span className="w-10 text-right tabular-nums">{Math.round(speed * 100)}%</span>
                </label>

                <button type="button" onClick={toggleMetro} aria-pressed={metro} className={cn('bevel h-11 px-4 rounded-lg border text-sm font-semibold flex items-center gap-2', metro ? 'border-primary text-primary' : 'border-white/30')}>
                    Metrônomo {metro ? 'ligado' : 'desligado'}
                </button>

                {state.steps > 0 && (
                    <input type="range" min="0" max={Math.max(0, state.steps - 1)} value={step} onChange={(e) => { const v = Number(e.target.value); setStep(v); player.current?.seek(v); }} className="w-full accent-[rgb(var(--c-primary))]" aria-label="Posição na música" />
                )}
            </div>

            <div className="liquid-glass rounded-2xl p-3 md:p-4 flex flex-wrap items-center gap-4">
                {fromOmr && (
                    <div className="flex flex-wrap items-center gap-4 w-full text-sm font-semibold">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-primary))]" /> Limpar anotações que a leitura do PDF inventa (dinâmicas, ornamentos)</label>
                        <label className="flex items-center gap-2">Compasso
                            <select value={timeSig} onChange={(e) => setTimeSig(e.target.value)} className="input-field !w-auto !py-1.5 !px-3 !rounded-lg">
                                <option value="">{state.hasTime === false ? 'não reconhecido: escolha' : 'como lido'}</option>
                                {['2/4', '3/4', '4/4', '6/8', '2/2', '3/8', '12/8'].map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </label>
                    </div>
                )}

                {state.parts?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Partes que tocam">
                        {state.parts.map((pt) => {
                            const off = muted.includes(pt.index);
                            return (
                                <button key={pt.index} type="button" onClick={() => togglePart(pt.index)} aria-pressed={!off} className={cn('bevel h-11 px-3 rounded-lg border text-sm font-semibold flex items-center gap-2', off ? 'border-white/20 opacity-60' : 'border-primary/70')}>
                                    {off ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-primary" />}
                                    {state.parts.length > 1 ? `Parte ${pt.index + 1}` : 'Melodia'}
                                </button>
                            );
                        })}
                    </div>
                )}

            </div>

            {state.error && <p role="alert" className="liquid-glass rounded-2xl p-5 font-semibold">{state.error}</p>}
            {state.loading && !state.error && (
                <div className="flex items-center gap-3 text-sm font-semibold"><Loader2 className="h-5 w-5 animate-spin text-primary" /> Preparando a partitura{title ? `: ${title}` : ''}…</div>
            )}

            <div className={cn('score-paper rounded-2xl overflow-x-auto p-3 md:p-6', state.hasDrums && 'drum-paper')} aria-label={title ? `Partitura: ${title}` : 'Partitura'} onClick={() => { if (playing) { player.current?.pause(); setPlaying(false); } }} title={playing ? 'Clique para pausar' : undefined}>
                {state.hasDrums && (
                    <div className="dp-head">
                        <span className="dp-title">{title}</span>
                        {bpm && <span className="dp-badge"><Timer className="h-4 w-4" /> {bpm}</span>}
                    </div>
                )}
                <div className="dp-wrap">
                    <div ref={holder} />
                    {state.hasDrums && <DrumOverlay player={player.current} ready={!state.loading && !state.error} playing={playing} step={step} layoutKey={`${source}|${clean}|${timeSig}`} />}
                </div>
            </div>
            {!state.loading && !state.error && (
                <button type="button" onClick={restart} className="sr-only"><RotateCcw /> Reiniciar</button>
            )}
            {state.hasDrums && <p className="text-xs text-text-muted">Sons de bateria: MuldjordKit, de Lars Muldjord (CC BY 4.0).</p>}
        </div>
    );
}
