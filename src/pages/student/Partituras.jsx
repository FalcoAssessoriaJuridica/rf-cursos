import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileMusic, Loader2, Upload } from 'lucide-react';
import { loadLibrary } from '../../lib/scores';
import { listOfflineScores, renewOfflineScores } from '../../lib/offlineScores';
import useOnline from '../../lib/useOnline';
import ScoreViewer from '../../score/ScoreViewer';
import { convertToMusicXml, isMusicXml, isPdfOrImage } from '../../score/omr';

const EXEMPLOS = [
    { id: 'amazing', titulo: 'Amazing Grace', nota: 'Hino de domínio público, lido a partir de um PDF (Church Music Association of America, CC BY 3.0)', url: '/partituras-exemplo/amazing-grace.mxl' },
];

export default function Partituras() {
    const inputRef = useRef(null);
    const abortRef = useRef(null);
    const [source, setSource] = useState(null);
    const [title, setTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [fromOmr, setFromOmr] = useState(false);
    const [library, setLibrary] = useState(null);
    const [saved, setSaved] = useState([]);
    const online = useOnline();

    useEffect(() => {
        let alive = true;
        listOfflineScores().then((l) => alive && setSaved(l)).catch(() => {});
        if (!navigator.onLine) { setLibrary([]); return () => { alive = false; }; }
        loadLibrary()
            .then(async (l) => {
                if (!alive) return;
                setLibrary(l);
                // biblioteca carregada: renova as cópias que ainda valem e apaga as de partituras que a pessoa não alcança mais
                const ids = l.flatMap((c) => [...c.geral, ...c.aulas.flatMap((a) => a.scores)].map((s) => s.id));
                await renewOfflineScores(ids).catch(() => {});
                listOfflineScores().then((x) => alive && setSaved(x)).catch(() => {});
            })
            .catch(() => alive && setLibrary([]));
        return () => { alive = false; };
    }, []);
    const savedIds = new Set(saved.map((x) => x.id));

    const openFile = async (file) => {
        if (!file) return;
        setError('');
        setTitle(file.name.replace(/\.[^.]+$/, ''));
        if (isMusicXml(file)) { setFromOmr(false); setSource(await file.arrayBuffer()); return; }
        if (!isPdfOrImage(file)) { setError('Envie um PDF, uma imagem (PNG/JPG) ou um arquivo MusicXML (.mxl, .musicxml).'); return; }
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setBusy(true);
        try {
            const buf = await convertToMusicXml(file, { signal: ctrl.signal });
            setFromOmr(true);
            setSource(buf);
        } catch (e) {
            if (e.name !== 'AbortError') setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto max-w-5xl space-y-8 pb-16">
            <div>
                <h1 className="text-3xl font-black tracking-tight text-text">Partituras</h1>
                <p className="mt-1 text-sm text-text-muted">Abra uma partitura, ouça a melodia e acompanhe cada nota com o cursor. Funciona com uma única pauta (clave de Sol) ou com várias partes.</p>
            </div>

            {saved.length > 0 && (
                <section aria-label="Salvas neste aparelho" className="space-y-3">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Salvas neste aparelho {online ? '' : '(funcionam sem internet)'}</h2>
                    <ul className="grid gap-2 md:grid-cols-2">
                        {saved.map((s) => (
                            <li key={s.id}><Link to={`/student/partituras/${s.id}`} className="bevel flex items-center gap-3 rounded-xl p-3"><CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" /><span className="truncate text-sm font-semibold">{s.titulo}</span></Link></li>
                        ))}
                    </ul>
                </section>
            )}

            <section aria-label="Biblioteca" className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Biblioteca dos seus cursos</h2>
                {library === null && <p className="text-sm text-text-muted">Carregando…</p>}
                {library?.length === 0 && !online && <p className="text-sm text-text-muted">Sem internet. A biblioteca dos cursos volta quando a conexão voltar.</p>}
                {library?.length === 0 && online && <p className="text-sm text-text-muted">Quando seus professores publicarem partituras nos cursos ou nas aulas, elas aparecem aqui.</p>}
                {library?.map((c) => (
                    <div key={c.id} className="liquid-glass rounded-2xl p-4 md:p-5 space-y-3">
                        <h3 className="font-bold">{c.titulo}</h3>
                        {[{ id: 'geral', titulo: 'Geral do curso', scores: c.geral }, ...c.aulas].filter((g) => g.scores.length).map((g) => (
                            <div key={g.id}>
                                <p className="text-xs font-semibold text-text-muted mb-1">{g.titulo}</p>
                                <ul className="grid gap-2 md:grid-cols-2">
                                    {g.scores.map((s) => (
                                        <li key={s.id}><Link to={`/student/partituras/${s.id}`} className="bevel flex items-center gap-3 rounded-xl p-3"><FileMusic className="h-5 w-5 text-primary shrink-0" /><span className="truncate text-sm font-semibold">{s.titulo}</span>{savedIds.has(s.id) && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-green-500" aria-label="Salva neste aparelho" />}</Link></li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                ))}
            </section>

            <div className="liquid-glass rounded-[2rem] p-6 md:p-8 grid gap-6 md:grid-cols-[1fr_auto] items-center">
                <div className="space-y-2">
                    <h2 className="text-lg font-bold">Abrir do seu computador</h2>
                    <p className="text-sm text-text-muted">PDF ou imagem: o sistema lê a partitura e a transforma em notas tocáveis (pode levar cerca de um minuto, e o resultado deve ser conferido). MusicXML abre na hora.</p>
                </div>
                <div>
                    <input ref={inputRef} type="file" accept=".mxl,.musicxml,.xml,.pdf,.png,.jpg,.jpeg,.tif,.tiff" className="hidden" onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
                    <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="bevel bg-primary text-black h-12 px-6 rounded-lg font-bold flex items-center gap-2 disabled:opacity-60">
                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                        {busy ? 'Lendo a partitura…' : 'Escolher arquivo'}
                    </button>
                    {busy && <button type="button" onClick={() => abortRef.current?.abort()} className="mt-2 block text-sm font-semibold underline">Cancelar</button>}
                </div>
                {error && <p role="alert" className="md:col-span-2 text-sm font-semibold text-red-500">{error}</p>}
            </div>

            <section aria-label="Exemplos" className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Exemplos</h2>
                <div className="grid gap-3 md:grid-cols-2">
                    {EXEMPLOS.map((ex) => (
                        <button key={ex.id} type="button" onClick={() => { setError(''); setTitle(ex.titulo); setFromOmr(true); setSource(ex.url); }} className="liquid-glass bevel rounded-2xl p-4 text-left flex gap-4 items-start">
                            <FileMusic className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                            <span><span className="block font-bold">{ex.titulo}</span><span className="block text-xs text-text-muted mt-1">{ex.nota}</span></span>
                        </button>
                    ))}
                </div>
            </section>

            {source && <ScoreViewer source={source} title={title} fromOmr={fromOmr} />}
        </div>
    );
}
