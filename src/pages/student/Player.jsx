import ScoreList from '../../components/ScoreList';
import VideoSyncPanel from '../../components/VideoSyncPanel';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Check, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Headphones,
    Library, ListVideo, Loader2, Maximize2, MessageSquare, Minimize2, PanelRightClose, PanelRightOpen, Play, Search, Star,
} from 'lucide-react';
import { loadCourse, saveProgress, courseProgress, flatLessons, canAccessStudentArea } from '../../lib/courseData';
import { formatDuration } from '../../lib/demoCourses';
import { cn } from '../../lib/utils';
import AccessBlocked from '../../components/AccessBlocked';
import LessonThumb from '../../components/LessonThumb';
import Collapse from '../../components/Collapse';
import { useOpenModules } from '../../lib/moduleState';
import { KindIcon } from '../../components/MaterialUploader';
import { downloadHref, fileKind, formatBytes, isStorageUrl } from '../../lib/materials';
import { driveId, resolveMedia, isTimeTracked } from '../../lib/media';
import { driveFetch, driveProxyUrl } from '../../lib/driveProxy';
import ProtectedAudio from '../../components/ProtectedAudio';

export default function Player() {
    const { courseId, lessonId } = useParams();
    const navigate = useNavigate();
    const userId = localStorage.getItem('rf_user_id');

    const [loading, setLoading] = useState(true);
    const [blocked, setBlocked] = useState(null); // null | { reason, expira_em }
    const [course, setCourse] = useState(null);
    const [modules, setModules] = useState([]);
    const [progress, setProgress] = useState({});
    const [expanded, toggleModule] = useOpenModules(courseId);
    const [query, setQuery] = useState('');
    const playerBoxRef = useRef(null);
    const [fill, setFill] = useState(false); // player ampliado sobre a janela inteira (alternativa quando a tela cheia do navegador é bloqueada)
    const [listOpen, setListOpen] = useState(true);
    const [infoTab, setInfoTab] = useState('info');
    const [rating, setRating] = useState(0);
    const [isDownloading, setIsDownloading] = useState({});

    const videoRef = useRef(null);
    const iframeRef = useRef(null);
    const lastSaved = useRef(0);

    // `navigate` muda a cada navegação; guardamos numa ref para o curso NÃO ser recarregado ao trocar de aula
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;

    // ── Carrega curso + progresso (uma vez por curso/usuário) ──
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                if (!canAccessStudentArea()) return navigateRef.current('/login');
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
    }, [courseId, userId]);

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

    useEffect(() => {
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

    // ── Navegação ──
    const go = (aula) => aula && navigate(`/student/course/${courseId}/lesson/${aula.id}`);
    const prev = lessonIdx > 0 ? lessons[lessonIdx - 1] : null;
    const next = lessonIdx >= 0 && lessonIdx < lessons.length - 1 ? lessons[lessonIdx + 1] : null;

    // ── Downloads (PDF/Áudio) ──
    const handleDownload = async (url, filename, type = 'pdf', item = null) => {
        if (isDownloading[url]) return;
        try {
            setIsDownloading((p) => ({ ...p, [url]: true }));
            // Arquivo enviado ao Storage: download direto, com o nome e a extensão originais
            if (isStorageUrl(url)) {
                const a = document.createElement('a');
                a.href = downloadHref(item || { url, nome: filename });
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
            }
            const id = driveId(url);
            if (!id) { window.open(url, '_blank'); return; }
            const ext = type === 'audio' ? '.mp3' : '.pdf';
            let name = filename || (type === 'audio' ? 'Audio' : 'Documento');
            if (!name.toLowerCase().endsWith(ext)) name += ext;
            const proxyUrl = driveProxyUrl(id, { filename: name, download: 'true', t: Date.now() });

            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: name,
                        types: [{ description: type === 'audio' ? 'Arquivo de Áudio' : 'Documento PDF', accept: { [type === 'audio' ? 'audio/mpeg' : 'application/pdf']: [ext] } }],
                    });
                    const response = await driveFetch(proxyUrl);
                    if (!response.ok) throw new Error('Erro ao baixar do servidor');
                    const writable = await handle.createWritable();
                    await response.body.pipeTo(writable);
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.warn('showSaveFilePicker falhou, tentando fallback...', err);
                }
            }
            const response = await driveFetch(proxyUrl);
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
    // Tela cheia: tenta a do navegador; se for bloqueada (navegadores embutidos, iframes restritos), amplia o player sobre a janela.
    const toggleFullscreen = useCallback(async () => {
        if (fill) { setFill(false); return; }
        if (document.fullscreenElement) { await document.exitFullscreen().catch(() => {}); return; }
        try {
            await playerBoxRef.current?.requestFullscreen();
        } catch {
            setFill(true);
        }
    }, [fill]);

    useEffect(() => {
        if (!fill) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setFill(false); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [fill]);

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
                        <div
                            ref={playerBoxRef}
                            className={cn(
                                'bg-black overflow-hidden',
                                fill ? 'fixed inset-0 z-[200] h-[100dvh] w-screen' : 'relative mt-4 aspect-video w-full rounded-xl border border-white/10'
                            )}
                        >
                            {fill && (
                                <button type="button" onClick={() => setFill(false)} aria-label="Sair da tela cheia" className="absolute right-4 top-4 z-10 flex h-10 items-center gap-2 rounded-md bg-black/70 px-3 text-sm font-semibold text-white backdrop-blur hover:bg-black/90">
                                    <Minimize2 className="h-4 w-4" /> Sair (Esc)
                                </button>
                            )}
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
                                <iframe key={lesson.id} ref={iframeRef} src={media.src} title={lesson.titulo} className="h-full w-full border-none" allow="autoplay; fullscreen" allowFullScreen />
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

                        {/* Partitura de bateria acompanhando o vídeo (e, para o admin, o ajuste da sincronia) */}
                        <VideoSyncPanel lesson={lesson} media={media} videoRef={videoRef} iframeRef={iframeRef} />

                        {/* Vídeos de terceiros (Drive etc.) não informam o tempo assistido: a conclusão é manual */}
                        {media.kind === 'iframe' && !cur?.concluida && (
                            <p className="mt-3 text-xs text-text-muted">
                                Ao terminar a aula, marque como concluída para atualizar o seu progresso.
                            </p>
                        )}

                        {/* Barra de ações */}
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-4">
                            <button type="button" onClick={toggleFullscreen} className="bevel h-10 px-4 rounded-md border border-white/30 text-sm font-semibold flex items-center gap-2 transition-colors hover:bg-white/10">
                                <Maximize2 className="h-4 w-4" /> Tela cheia
                            </button>
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
                                    'bevel h-10 px-4 rounded-md border text-sm font-semibold flex items-center gap-2 transition-colors',
                                    cur?.concluida ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-white/30 hover:bg-white/10'
                                )}
                            >
                                {cur?.concluida ? 'Concluída' : 'Concluir'}
                                <CheckCircle className="h-4 w-4" />
                            </button>
                            {media.kind !== 'video' && !cur?.concluida && next && (
                                <button
                                    onClick={() => { toggleComplete(lesson); go(next); }}
                                    className="bevel h-10 px-4 rounded-md bg-primary text-black text-sm font-semibold flex items-center gap-2 hover:bg-primary-hover transition-colors"
                                >
                                    Concluir e avançar
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* Abas: informações / comentários */}
                        <div className="mt-6 border-b border-white/10 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
                            {[['info', <>Informações<span className="max-sm:hidden">&nbsp;da aula</span></>, FileText], ['comments', 'Comentários 0', MessageSquare]].map(([id, label, Icon]) => (
                                <button key={id} role="tab" aria-selected={infoTab === id} onClick={() => setInfoTab(id)}
                                    className={cn('shrink-0 whitespace-nowrap px-3 py-2 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 transition-colors', infoTab === id ? 'border-white text-white' : 'border-transparent text-dim hover:text-white')}>
                                    <Icon className="h-4 w-4" /> {label}
                                </button>
                            ))}
                        </div>

                        {infoTab === 'info' ? (
                            <div className="mt-5 space-y-5">
                                <p className="text-sm text-white/80 leading-relaxed">
                                    {lesson.descricao || 'Esta aula ainda não possui descrição.'}
                                </p>

                                <ScoreList cursoId={courseId} aulaId={lesson.id} title="Partituras da aula" />

                                {hasMaterials && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Materiais da aula</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {lesson.materiais_pdf?.map((pdf, i) => {
                                                const kind = fileKind(pdf);
                                                return (
                                                    <button key={`pdf-${i}`} onClick={() => handleDownload(pdf.url, pdf.nome, 'pdf', pdf)} disabled={isDownloading[pdf.url]}
                                                        className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:border-primary/40 hover:bg-primary/5 transition-all text-left">
                                                        {isDownloading[pdf.url] ? <div className="h-10 w-10 flex items-center justify-center shrink-0"><Loader2 className="h-5 w-5 text-primary animate-spin" /></div> : <KindIcon item={pdf} />}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold truncate">{pdf.nome || pdf.arquivo || 'Material'}</p>
                                                            <p className="text-[10px] text-text-muted uppercase tracking-tighter">
                                                                {isDownloading[pdf.url] ? 'Preparando arquivo...' : `Baixar ${kind.label}${pdf.tamanho ? ` · ${formatBytes(pdf.tamanho)}` : ''}`}
                                                            </p>
                                                        </div>
                                                        {!isDownloading[pdf.url] && <Download className="h-4 w-4 text-text-muted shrink-0" />}
                                                    </button>
                                                );
                                            })}
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
                                                        <button onClick={() => handleDownload(audio.url, audio.nome, 'audio', audio)} disabled={isDownloading[audio.url]} className="p-2 hover:bg-white/10 rounded-full shrink-0" title="Baixar Áudio">
                                                            <Download className="h-4 w-4 text-text-muted" />
                                                        </button>
                                                    </div>
                                                    <ProtectedAudio driveFileId={driveId(audio.url)} name={audio.nome} url={audio.url} />
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
                                        onClick={() => toggleModule(mod.id)}
                                        className="w-full flex items-center gap-3 p-3 text-left">
                                        <div className="h-10 w-10 shrink-0 rounded-full bg-panel flex items-center justify-center text-sm font-semibold">{idx + 1}</div>
                                        <div className="flex-1 min-w-0">
                                            <span className="block text-sm truncate">{mod.titulo}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold">{pct}%</span>
                                                <div className="h-1 w-24 rounded-full bg-primary/20 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
                                            </div>
                                        </div>
                                        <ChevronDown className={cn('module-chevron h-5 w-5 shrink-0 transition-transform duration-300', isOpen && 'rotate-180')} />
                                    </button>

                                    <Collapse open={isOpen}>
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
                                                                {p?.pct > 0 && !p.concluida && isTimeTracked(aula) && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/20"><div className="h-full bg-primary" style={{ width: `${p.pct}%` }} /></div>}
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
                                    </Collapse>
                                </div>
                            );
                        })}
                    </div>
                </aside>
            )}
        </div>
    );
}
