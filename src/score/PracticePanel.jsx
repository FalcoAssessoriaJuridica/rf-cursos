import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Keyboard, Loader2, Play, RotateCcw, Square, Usb } from 'lucide-react';
import { PracticeSession, nomeNota } from './practice';
import { connectMidi, midiSupported } from './midi';
import VirtualKeyboard from './VirtualKeyboard';
import { cn } from '../lib/utils';

// Modo prática: o cursor espera o aluno tocar as notas certas num teclado MIDI (ou no teclado na tela) e só então avança.
export default function PracticePanel({ player, parts = [], onActiveChange }) {
    const [active, setActive] = useState(false);
    const [track, setTrack] = useState('all');
    const [anyOctave, setAnyOctave] = useState(false);
    const [midi, setMidi] = useState({ status: 'idle', names: [], error: '' });
    const [exp, setExp] = useState([]);
    const [pressed, setPressed] = useState([]);
    const [feedback, setFeedback] = useState(null);
    const [progress, setProgress] = useState({ passos: 0, total: 0 });
    const [summary, setSummary] = useState(null);
    const [busy, setBusy] = useState(false);
    const session = useRef(null);
    const link = useRef(null);
    const timer = useRef(null);

    // quais pautas o aluno pode escolher tocar
    const tracks = useMemo(() => {
        const list = [{ id: 'all', label: 'Todas as pautas', staves: null }];
        if (parts.length === 1 && parts[0].staffIds?.length === 2) {
            list.push({ id: 'dir', label: 'Só a mão direita (pauta de cima)', staves: new Set([parts[0].staffIds[0]]) });
            list.push({ id: 'esq', label: 'Só a mão esquerda (pauta de baixo)', staves: new Set([parts[0].staffIds[1]]) });
        } else if (parts.length > 1) {
            parts.forEach((pt) => list.push({ id: `p${pt.index}`, label: `Parte ${pt.index + 1}`, staves: new Set(pt.staffIds || []) }));
        }
        return list;
    }, [parts]);
    const chosen = tracks.find((t) => t.id === track) || tracks[0];

    // faixa do teclado na tela: cobre as notas da pauta escolhida
    const range = useMemo(() => {
        const ms = (player?.events || []).flatMap((e) => e.notes).filter((n) => typeof n.midi === 'number' && (!chosen.staves || chosen.staves.has(n.staff))).map((n) => n.midi);
        if (!ms.length) return { from: 48, to: 83 };
        const from = Math.max(21, Math.floor((Math.min(...ms) - 1) / 12) * 12);
        let to = Math.min(108, Math.floor(Math.max(...ms) / 12) * 12 + 11);
        if (to - from < 23) to = Math.min(108, from + 23);
        return { from, to };
    }, [player, chosen]);

    const flash = (f) => { setFeedback(f); clearTimeout(timer.current); timer.current = setTimeout(() => setFeedback(null), 1400); };

    const noteOn = useCallback((m, vel = 0.8) => {
        player?.playLive(m, vel);
        setPressed((p) => (p.includes(m) ? p : [...p, m]));
        session.current?.press(m);
    }, [player]);
    const noteOff = useCallback((m) => { player?.releaseLive(m); setPressed((p) => p.filter((x) => x !== m)); }, [player]);
    const handlers = useRef({});
    handlers.current = { noteOn, noteOff };

    const stop = useCallback(() => {
        session.current?.stop();
        session.current = null;
        setActive(false); setExp([]); onActiveChange?.(false);
    }, [onActiveChange]);

    // trocar de partitura ou sair da tela encerra a prática e solta o teclado MIDI
    useEffect(() => () => { session.current?.stop(); link.current?.dispose(); clearTimeout(timer.current); onActiveChange?.(false); }, [player]); // eslint-disable-line react-hooks/exhaustive-deps

    const connect = async () => {
        setMidi({ status: 'conectando', names: [], error: '' });
        try {
            link.current?.dispose();
            link.current = await connectMidi({
                onNote: ({ on, midi: m, vel }) => (on ? handlers.current.noteOn(m, vel) : handlers.current.noteOff(m)),
                onChange: (names) => setMidi({ status: names.length ? 'ok' : 'vazio', names, error: '' }),
            });
        } catch (e) {
            setMidi({ status: 'erro', names: [], error: e?.name === 'SecurityError' ? 'O navegador bloqueou o acesso ao teclado MIDI. Permita nas configurações do site.' : 'Não foi possível acessar o teclado MIDI.' });
        }
    };

    const start = async () => {
        if (!player) return;
        setBusy(true);
        try {
            player.pause();
            await player.prepareAudio();
            const s = new PracticeSession({
                events: player.events, staves: chosen.staves, anyOctave,
                onStep: (i, e) => { player.moveTo(i); setExp(e); setProgress((p) => ({ ...p, passos: s.stats.passos })); },
                onFeedback: (r, m) => { if (r === 'ok') flash({ tipo: 'ok', texto: 'Certo' }); else if (r === 'erro') flash({ tipo: 'erro', texto: `Tocou ${nomeNota(m)}` }); },
                onDone: (sum) => { setSummary(sum); setActive(false); setExp([]); session.current = null; onActiveChange?.(false); },
            });
            session.current = s;
            setSummary(null);
            setProgress({ passos: 0, total: s.stats.total });
            if (!s.start()) { flash({ tipo: 'erro', texto: 'Não há notas de piano nesta partitura.' }); session.current = null; return; }
            setActive(true); onActiveChange?.(true);
        } finally { setBusy(false); }
    };

    const mm = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const suportado = midiSupported();

    return (
        <section className="liquid-glass space-y-4 rounded-2xl p-4 md:p-5" aria-label="Modo prática">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary"><Keyboard className="h-4 w-4" /> Modo prática</h2>
                {suportado ? (
                    <button type="button" onClick={connect} disabled={midi.status === 'conectando'} className="bevel flex h-11 items-center gap-2 rounded-lg border border-white/30 px-4 text-sm font-semibold disabled:opacity-60">
                        {midi.status === 'conectando' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Usb className="h-4 w-4" />}
                        {midi.status === 'ok' ? 'Reconectar teclado MIDI' : 'Conectar teclado MIDI'}
                    </button>
                ) : (
                    <p className="text-xs text-text-muted">Este navegador não conecta teclado MIDI (use Chrome ou Edge). Você pode usar o teclado na tela.</p>
                )}
            </div>
            <p className="text-sm text-text-muted" role="status">
                {midi.status === 'ok' && <>Teclado conectado: <strong className="text-text">{midi.names.join(', ')}</strong>.</>}
                {midi.status === 'vazio' && 'Nenhum teclado MIDI encontrado. Ligue-o ao computador e clique em Reconectar.'}
                {midi.status === 'erro' && <span className="text-red-400">{midi.error}</span>}
                {midi.status === 'idle' && 'O cursor espera você tocar as notas certas e só então avança, no seu ritmo.'}
            </p>

            <div className="flex flex-wrap items-center gap-4">
                {tracks.length > 1 && (
                    <label className="flex items-center gap-2 text-sm font-semibold">Eu toco
                        <select value={track} onChange={(e) => setTrack(e.target.value)} disabled={active} className="input-field !w-auto !rounded-lg !px-3 !py-1.5">
                            {tracks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    </label>
                )}
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={anyOctave} disabled={active} onChange={(e) => setAnyOctave(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-primary))]" /> Aceitar qualquer oitava</label>
                {active ? (
                    <button type="button" onClick={stop} className="bevel flex h-11 items-center gap-2 rounded-lg border border-white/30 px-5 text-sm font-bold"><Square className="h-4 w-4" /> Parar</button>
                ) : (
                    <button type="button" onClick={start} disabled={busy || !player} className="bevel flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-black disabled:opacity-60">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : summary ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {summary ? 'Praticar de novo' : 'Começar a praticar'}
                    </button>
                )}
            </div>

            {active && (
                <div className="space-y-2" aria-live="polite">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm text-text-muted">Toque agora:</span>
                        <strong data-testid="esperado" className="text-lg text-primary">{exp.map(nomeNota).join(' + ')}</strong>
                        {feedback && <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold', feedback.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>{feedback.texto}</span>}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.passos / progress.total) * 100 : 0}%` }} /></div>
                    <p className="text-xs text-text-muted">{progress.passos} de {progress.total} passos</p>
                </div>
            )}
            {!active && feedback && <p className="text-sm font-semibold text-red-400">{feedback.texto}</p>}

            {summary && !active && (
                <div className="rounded-xl bg-green-500/10 p-4 text-sm" role="status" data-testid="resumo">
                    <p className="flex items-center gap-2 font-bold text-green-400"><CheckCircle2 className="h-4 w-4" /> Prática concluída</p>
                    <p className="mt-1 text-text">{summary.passos} passos em {mm(summary.segundos)} · <strong>{summary.precisao}%</strong> sem errar · {summary.erros} {summary.erros === 1 ? 'nota errada' : 'notas erradas'}</p>
                </div>
            )}

            <VirtualKeyboard from={range.from} to={range.to} expected={exp} pressed={pressed} onDown={(m) => noteOn(m)} onUp={noteOff} />
        </section>
    );
}
