import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Check, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Headphones,
    Library, ListVideo, Loader2, MessageSquare, PanelRightClose, PanelRightOpen, Play, Search, Star,
} from 'lucide-react';
import { loadCourse, saveProgress, courseProgress, flatLessons, canAccessStudentArea } from '../../lib/courseData';
import { formatDuration } from '../../lib/demoCourses';
import { cn } from '../../lib/utils';
import AccessBlocked from '../../components/AccessBlocked';
import LessonThumb from '../../components/LessonThumb';

const FUNC_URL = 'https://bghvzdfikfhceekoxtxg.supabase.co/functions/v1/drive-proxy';
const driveId = (url = '') =>
    (url.match(/\/d\/([^/?#]+)/) || url.match(/[?&]id=([^&?#]+)/) || url.match(/\/file\/d\/([^/?#]+)/) || [])[1];

// Decide como renderizar a aula: { kind: 'video' | 'iframe' | 'none', src }
function resolveMedia(lesson, startTime = 0) {
    if (lesson.url_video_drive) {
        const id = driveId(lesson.url_video_drive);
        return { kind: 'iframe', src: id ? `https://drive.google.com/file/d/${id}/preview` : lesson.url_video_drive };
    }
    const id = lesson.id_video_profissional;
    if (!id) return { kind: 'none' };

    if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(id)) return { kind: 'video', src: id };

    if (id.includes('youtube.com') || id.includes('youtu.be')) {
        const m = id.match(/[?&]v=([^&]+)/) || id.match(/youtu\.be\/([^?]+)/) || id.match(/embed\/([^?]+)/);
        const ytId = m ? m[1] : id.split('/').pop();
        return { kind: 'iframe', src: `https://www.youtube.com/embed/${ytId}?autoplay=1${startTime > 0 ? `&start=${startTime}` : ''}` };
    }
    if (id.includes('vimeo.com')) {
        const m = id.match(/vimeo\.com\/(\d+)/) || id.match(/video\/(\d+)/);
        const vId = m ? m[1] : id.split('/').pop();
        return { kind: 'iframe', src: `https://player.vimeo.com/video/${vId}?autoplay=1${startTime > 0 ? `#t=${startTime}s` : ''}` };
    }
    if (id.includes('pandavideo.com.br')) {
        const base = id.includes('embed') ? id : id.replace('app.pandavideo', 'player-vz-xxx.pandavideo');
        let url = base.includes('?') ? `${base}&autoplay=true` : `${base}?autoplay=true`;
        if (startTime > 0) url += `&t=${startTime}`;
        return { kind: 'iframe', src: url };
    }
    return { kind: 'iframe', src: id };
}

export default function Player() {
    const { courseId, lessonId } = useParams();
    const navigate = useNavigate();
    const userId = localStorage.getItem('rf_user_id');

    const [loading, setLoading] = useState(true);
    const [blocked, setBlocked] = useState(null); // null | { reason, expira_em }
    const [course, setCourse] = useState(null);
    const [modules, setModules] = useState([]);
    const [progress, setProgress] = useState({});
    const [expanded, setExpanded] = useState(new Set());
    const [query, setQuery] = useState('');
    const [listOpen, setListOpen] = useState(true);
    const [infoTab, setInfoTab] = useState('info');
    const [rating, setRating] = useState(0);
    const [isDownloading, setIsDownloading] = useState({});

    const videoRef = useRef(null);
    const lastSaved = useRef(0);

    // ── Carrega curso + progresso ──
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                if (!canAccessStudentArea()) return navigate('/login');
                const data = await loadCourse(courseId, userId);
                if (!alive) return;
                if (data.blocked || data.notFound) { setBlocked({ reason: data.reason || 'sem_acesso', expira_em: data.expira_em }); return; }
                setCourse(data.course);
                setModules(data.modules);
                setProgress(data.progress);
            } catch (err) {
                console.error(err);
                if (alive) setBlocked({ reason: 'sem_acesso' });
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [courseId, userId, navigate]);

    const lessons = useMemo(() => flatLessons(modules), [modules]);

    // "latest" → primeira aula não concluída
    useEffect(() => {
        if (loading || lessonId !== 'latest' || lessons.length === 0) return;
        const target = lessons.find((a) => !progress[a.id]?.concluida) || lessons[0];
        navigate(`/student/course/${courseId}/lesson/${target.id}`, { replace: true });
    }, [loading, lessonId, lessons, progress, courseId, navigate]);

    const lesson = lessons.find((a) => a.id === lessonId) || null;
    const lessonIdx = lesson ? lessons.findIndex((a) => a.id === lesson.id) : -1;
    const currentModule = lesson ? modules.find((m) => m.id === lesson.modulo_id) : null;
    const moduleNumber = currentModule ? modules.indexOf(currentModule) + 1 : 0;
    const cur = lesson ? progress[lesson.id] || { concluida: false, pct: 0, seconds: 0 } : null;
    const stats = useMemo(() => courseProgress(modules, progress), [modules, progress]);
    const startSeconds = cur && !cur.concluida ? cur.seconds : 0;
    const media = useMemo(() => (lesson ? resolveMedia(lesson, startSeconds) : { kind: 'none' }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [lesson?.id]);

    // Expande o módulo da aula atual
    useEffect(() => {
        if (lesson) setExpanded((prev) => new Set([...prev, lesson.modulo_id]));
        lastSaved.current = 0;
    }, [lesson?.id, lesson?.modulo_id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Persistência ──
    const patchProgress = useCallback((aulaId, patch) => {
        setProgress((prev) => ({ ...prev, [aulaId]: { concluida: false, pct: 0, seconds: 0, ...prev[aulaId], ...patch } }));
    }, []);

    const persist = useCallback(async (aulaId, p) => {
        try {
            await saveProgress(courseId, userId, aulaId, p);
        } catch (err) {
            console.error('Erro ao salvar progresso:', err);
        }
    }, [courseId, userId]);

    const toggleComplete = (aula) => {
        const next = !(progress[aula.id]?.concluida);
        const pct = next ? 100 : progress[aula.id]?.pct >= 100 ? 0 : progress[aula.id]?.pct || 0;
        patchProgress(aula.id, { concluida: next, pct });
        persist(aula.id, { concluida: next, pct });
    };

    // Progresso real para <video>
    const onTimeUpdate = (e) => {
        if (!lesson) return;
        const v = e.currentTarget;
        if (!v.duration) return;
        const seconds = Math.floor(v.currentTime);
        const pct = Math.min(99, Math.round((v.currentTime / v.duration) * 100));
        if (!cur?.concluida) patchProgress(lesson.id, { pct, seconds });
        if (Math.abs(seconds - lastSaved.current) >= 5) {
            lastSaved.current = seconds;
            if (!cur?.concluida) persist(lesson.id, { pct, seconds });
        }
    };
    const onPause = (e) => {
        if (!lesson || cur?.concluida) return;
        const v = e.currentTarget;
        if (v.duration) persist(lesson.id, { pct: Math.min(99, Math.round((v.currentTime / v.duration) * 100)), seconds: Math.floor(v.currentTime) });
    };
    const onEnded = () => { if (lesson && !cur?.concluida) { patchProgress(lesson.id, { concluida: true, pct: 100 }); persist(lesson.id, { concluida: true, pct: 100 }); } };
    const onLoadedMetadata = (e) => { if (startSeconds > 0 && startSeconds < e.currentTarget.duration - 3) e.currentTarget.currentTime = startSeconds; };

    // Aulas em iframe (YouTube/Drive etc.): progresso estimado, como antes
    useEffect(() => {
        if (!lesson || media.kind !== 'iframe' || cur?.concluida) return;
        const t = setInterval(() => {
            setProgress((prev) => {
                const p = prev[lesson.id] || { concluida: false, pct: 0, seconds: 0 };
                if (p.concluida || p.pct >= 95) return prev;
                return { ...prev, [lesson.id]: { ...p, pct: p.pct + 1, seconds: p.seconds + 60 } };
            });
        }, 60000);
        const s = setInterval(() => {
            const p = progressRef.current[lesson.id];
            if (p && !p.concluida) persist(lesson.id, { pct: p.pct, seconds: p.seconds });
        }, 30000);
        return () => { clearInterval(t); clearInterval(s); };
    }, [lesson?.id, media.kind, cur?.concluida, persist]); // eslint-disable-line react-hooks/exhaustive-deps
    const progressRef = useRef(progress);
    useEffect(() => { progressRef.current = progress; }, [progress]);

    // ── Navegação ──
    const go = (aula) => aula && navigate(`/student/course/${courseId}/lesson/${aula.id}`);
    const prev = lessonIdx > 0 ? lessons[lessonIdx - 1] : null;
    const next = lessonIdx >= 0 && lessonIdx < lessons.length - 1 ? lessons[lessonIdx + 1] : null;

    // ── Downloads (PDF/Áudio) ──
    const handleDownload = async (url, filename, type = 'pdf') => {
        if (isDownloading[url]) return;
        try {
            setIsDownloading((p) => ({ ...p, [url]: true }));
            const id = driveId(url);
            if (!id) { window.open(url, '_blank'); return; }
            const ext = type === 'audio' ? '.mp3' : '.pdf';
            let name = filename || (type === 'audio' ? 'Audio' : 'Documento');
            if (!name.toLowerCase().endsWith(ext)) name += ext;
            const proxyUrl = `${FUNC_URL}?id=${id}&filename=${encodeURIComponent(name)}&download=true&t=${Date.now()}`;

            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: name,
                        types: [{ description: type === 'audio' ? 'Arquivo de Áudio' : 'Documento PDF', accept: { [type === 'audio' ? 'audio/mpeg' : 'application/pdf']: [ext] } }],
                    });
                    const response = await fetch(proxyUrl);
                    if (!response.ok) throw new Error('Erro ao baixar do servidor');
                    const writable = await handle.createWritable();
                    await response.body.pipeTo(writable);
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.warn('showSaveFilePicker falhou, tentando fallback...', err);
                }
            }
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('Erro no download');
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
            const a = document.createElement('a');
            a.href = blobUrl; a.download = name;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error('Erro no download:', err);
            if (err.name !== 'AbortError') alert('Não foi possível baixar o arquivo. Tente novamente.');
        } finally {
            setIsDownloading((p) => ({ ...p, [url]: false }));
        }
    };

    const filteredModules = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return modules;
        return modules
            .map((m) => ({ ...m, aulas: m.aulas.filter((a) => a.titulo?.toLowerCase().includes(q)) }))
            .filter((m) => m.aulas.length > 0);
    }, [modules, query]);

    // ── Estados ──
    if (loading || (lessonId === 'latest' && lessons.length > 0)) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    <p className="text-sm text-text-muted uppercase tracking-[0.2em] animate-pulse">Preparando sua aula...</p>
                </div>
            </div>
        );
    }

    if (blocked) return <AccessBlocked reason={blocked.reason} expiraEm={blocked.expira_em} />;

    const hasMaterials = (lesson?.materiais_pdf?.length || 0) + (lesson?.materiais_audio?.length || 0) > 0;

    return (
        <div className={cn('grid gap-6 items-start glass rounded-2xl p-4 md:p-6', listOpen ? 'lg:grid-cols-[minmax(0,1fr)_400px]' : 'lg:grid-cols-1')}>
            {/* ══ COLUNA PRINCIPAL ══ */}
            <section className="min-w-0">
                <div className="flex items-center justify-between">
                    <button onClick={() => navigate(`/student/course/${courseId}`)} className="flex items-center gap-2 h-10 px-2 text-sm font-semibold text-white/90 hover:text-white">
                        <ArrowLeft className="h-4 w-4" /> Voltar
                    </button>
                    <div className="flex items-center gap-2">
                        <button aria-label="Anterior" disabled={!prev} onClick={() => go(prev)} className="h-9 w-9 rounded-md bg-panel flex items-center justify-center hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button aria-label="Próxima" disabled={!next} onClick={() => go(next)} className="h-9 w-9 rounded-md bg-panel flex items-center justify-center hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        {!listOpen && (
                            <button aria-label="Mostrar lista" onClick={() => setListOpen(true)} className="hidden lg:flex h-9 w-9 rounded-md bg-panel items-center justify-center hover:bg-white/10">
                                <PanelRightOpen className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                {lesson ? (
                    <>
                        <div className="mt-3">
                            <p className="text-xs text-white/60">{currentModule?.titulo || `Módulo ${moduleNumber}`}</p>
                            <h1 className="text-2xl font-bold leading-tight">{lesson.titulo}</h1>
                        </div>

                        {/* Player */}
                        <div className="mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black border border-white/10">
                            {media.kind === 'video' && (
                                <video
                                    key={lesson.id}
                                    ref={videoRef}
                                    src={media.src}
                                    poster={lesson.thumb}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="h-full w-full"
                                    onLoadedMetadata={onLoadedMetadata}
                                    onTimeUpdate={onTimeUpdate}
                                    onPause={onPause}
                                    onEnded={onEnded}
                                />
                            )}
                            {media.kind === 'iframe' && (
                                <iframe key={lesson.id} src={media.src} title={lesson.titulo} className="h-full w-full border-none" allow="autoplay; fullscreen" allowFullScreen />
                            )}
                            {media.kind === 'none' && (
                                <div className="flex h-full items-center justify-center">
                                    <div className="text-center space-y-4 p-6">
                                        <div className="mx-auto w-16 h-16 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center">
                                            <Library className="h-8 w-8 text-primary/60" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">Conteúdo de Estudo</h3>
                                            <p className="text-sm text-text-muted max-w-xs mx-auto mt-1">Esta aula não possui vídeo. Explore os materiais disponíveis abaixo.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Barra de ações */}
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-4">
                            <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Avaliar aula">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} onClick={() => setRating(n === rating ? 0 : n)}>
                                        <Star className={cn('h-4 w-4 transition-colors', n <= rating ? 'fill-primary text-primary' : 'text-white/30 hover:text-white/60')} />
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => toggleComplete(lesson)}
                                className={cn(
                                    'h-10 px-4 rounded-md border text-sm font-semibold flex items-center gap-2 transition-colors',
                                    cur?.concluida ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-white/30 hover:bg-white/10'
                                )}
                            >
                                {cur?.concluida ? 'Concluída' : 'Concluir'}
                                <CheckCircle className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Abas: informações / comentários */}
                        <div className="mt-6 border-b border-white/10 flex gap-2" role="tablist">
                            {[['info', 'Informações da aula', FileText], ['comments', 'Comentários 0', MessageSquare]].map(([id, label, Icon]) => (
                                <button key={id} role="tab" aria-selected={infoTab === id} onClick={() => setInfoTab(id)}
                                    className={cn('px-3 py-2 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 transition-colors', infoTab === id ? 'border-white text-white' : 'border-transparent text-dim hover:text-white')}>
                                    <Icon className="h-4 w-4" /> {label}
                                </button>
                            ))}
                        </div>

                        {infoTab === 'info' ? (
                            <div className="mt-5 space-y-5">
                                <p className="text-sm text-white/80 leading-relaxed">
                                    {lesson.descricao || 'Esta aula ainda não possui descrição.'}
                                </p>

                                {hasMaterials && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Materiais da aula</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {lesson.materiais_pdf?.map((pdf, i) => (
                                                <button key={`pdf-${i}`} onClick={() => handleDownload(pdf.url, pdf.nome, 'pdf')} disabled={isDownloading[pdf.url]}
                                                    className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:border-primary/40 hover:bg-primary/5 transition-all text-left">
                                                    <div className="h-10 w-10 bg-red-500/10 rounded-lg flex items-center justify-center shrink-0">
                                                        {isDownloading[pdf.url] ? <Loader2 className="h-5 w-5 text-red-500 animate-spin" /> : <FileText className="h-5 w-5 text-red-400" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold truncate">{pdf.nome || 'Material PDF'}</p>
                                                        <p className="text-[10px] text-text-muted uppercase tracking-tighter">{isDownloading[pdf.url] ? 'Preparando arquivo...' : 'Baixar Partitura (PDF)'}</p>
                                                    </div>
                                                    {!isDownloading[pdf.url] && <Download className="h-4 w-4 text-text-muted shrink-0" />}
                                                </button>
                                            ))}
                                            {lesson.materiais_audio?.map((audio, i) => (
                                                <div key={`audio-${i}`} className="flex flex-col gap-2 p-3 rounded-lg border border-white/10">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                                            {isDownloading[audio.url] ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <Headphones className="h-5 w-5 text-primary" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold truncate">{audio.nome || 'Material de Áudio'}</p>
                                                            <p className="text-[10px] text-text-muted uppercase tracking-tighter">Ouvir agora</p>
                                                        </div>
                                                        <button onClick={() => handleDownload(audio.url, audio.nome, 'audio')} disabled={isDownloading[audio.url]} className="p-2 hover:bg-white/10 rounded-full shrink-0" title="Baixar Áudio">
                                                            <Download className="h-4 w-4 text-text-muted" />
                                                        </button>
                                                    </div>
                                                    <audio controls crossOrigin="anonymous" preload="none" className="w-full h-8 filter invert opacity-80">
                                                        <source src={driveId(audio.url) ? `${FUNC_URL}?${new URLSearchParams({ id: driveId(audio.url), filename: audio.nome || 'arquivo' })}` : audio.url} type="audio/mpeg" />
                                                    </audio>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mt-8 flex flex-col items-center text-center gap-2 py-8">
                                <MessageSquare className="h-8 w-8 text-white/20" />
                                <p className="font-semibold">Ainda sem comentários por aqui</p>
                                <p className="text-sm text-white/60 max-w-sm">Seja a primeira pessoa a comentar algo e inicie um tópico para trocar ideias sobre a aula.</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="mt-6 flex items-center justify-center h-64 text-text-muted rounded-xl border border-white/10">
                        Aula não encontrada. Escolha uma aula na lista.
                    </div>
                )}
            </section>

            {/* ══ LISTA LATERAL ══ */}
            {listOpen && (
                <aside className="glass rounded-xl overflow-hidden flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]">
                    <header className="flex items-center justify-between gap-3 p-3 border-b border-white/10">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-md bg-panel flex items-center justify-center shrink-0"><ListVideo className="h-4 w-4" /></div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{course?.titulo}</p>
                                <p className="text-[11px] text-white/60">{stats.done}/{stats.total} concluídas · {stats.percent}%</p>
                            </div>
                        </div>
                        <button aria-label="Ocultar lista" onClick={() => setListOpen(false)} className="hidden lg:flex h-9 w-9 rounded-md hover:bg-white/10 items-center justify-center shrink-0">
                            <PanelRightClose className="h-4 w-4" />
                        </button>
                    </header>

                    <div className="p-3">
                        <div className="relative">
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conteúdo"
                                className="w-full h-10 rounded-md bg-transparent border border-white/20 pl-3 pr-9 text-sm placeholder:text-white/40 focus:outline-none focus:border-white/60" />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 px-2 pb-3">
                        {filteredModules.map((mod) => {
                            const idx = modules.indexOf(mod) >= 0 ? modules.findIndex((m) => m.id === mod.id) : 0;
                            const done = mod.aulas.filter((a) => progress[a.id]?.concluida).length;
                            const total = modules.find((m) => m.id === mod.id)?.aulas.length || mod.aulas.length;
                            const pct = total ? Math.round((done / total) * 100) : 0;
                            const isOpen = expanded.has(mod.id) || query.trim().length > 0;
                            return (
                                <div key={mod.id} className="mb-1">
                                    <button aria-expanded={isOpen}
                                        onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(mod.id) ? n.delete(mod.id) : n.add(mod.id); return n; })}
                                        className="w-full flex items-center gap-3 p-3 text-left">
                                        <div className="h-10 w-10 shrink-0 rounded-full bg-panel flex items-center justify-center text-sm font-semibold">{idx + 1}</div>
                                        <div className="flex-1 min-w-0">
                                            <span className="block text-sm truncate">{mod.titulo}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold">{pct}%</span>
                                                <div className="h-1 w-24 rounded-full bg-primary/20 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
                                            </div>
                                        </div>
                                        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                                    </button>

                                    {isOpen && (
                                        <ul className="space-y-1">
                                            {mod.aulas.map((aula) => {
                                                const active = aula.id === lesson?.id;
                                                const p = progress[aula.id];
                                                return (
                                                    <li key={aula.id} className={cn('flex items-center gap-2 rounded-lg pr-3 transition-colors', active ? 'bg-white/10' : 'hover:bg-white/5')}>
                                                        <button onClick={() => go(aula)} aria-current={active ? 'true' : undefined} className="flex flex-1 min-w-0 items-center gap-3 p-2 text-left">
                                                            <div className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-md bg-panel">
                                                                <LessonThumb aula={aula} course={course} />
                                                                {active && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Play className="h-5 w-5 fill-white text-white" /></div>}
                                                                {p?.pct > 0 && !p.concluida && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/20"><div className="h-full bg-primary" style={{ width: `${p.pct}%` }} /></div>}
                                                            </div>
                                                            <div className="min-w-0">
                                                                {active && <p className="text-[11px] font-semibold text-primary">Tocando agora</p>}
                                                                <p className="text-sm line-clamp-2">{aula.titulo}</p>
                                                                {aula.duracao > 0 && <p className="text-[11px] text-white/50">{formatDuration(aula.duracao)}</p>}
                                                            </div>
                                                        </button>
                                                        <button
                                                            aria-label={`Marcar aula ${aula.titulo} como finalizada`}
                                                            aria-pressed={!!p?.concluida}
                                                            onClick={() => toggleComplete(aula)}
                                                            className={cn('h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors', p?.concluida ? 'border-green-500 bg-green-500' : 'border-white/30 hover:border-white/70')}
                                                        >
                                                            {p?.concluida && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </aside>
            )}
        </div>
    );
}
