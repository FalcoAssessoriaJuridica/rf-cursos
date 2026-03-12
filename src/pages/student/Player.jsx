import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Card, CardContent } from '../../components/Card';
import { CheckCircle, Lock, ChevronRight, ChevronLeft, Play, AlertTriangle, FileText, Headphones, Download, Library, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Player() {
    const { courseId, lessonId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [lesson, setLesson] = useState(null);
    const [modules, setModules] = useState([]);
    const [isBlocked, setIsBlocked] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [completedLessons, setCompletedLessons] = useState(new Set());
    const [lessonProgressMap, setLessonProgressMap] = useState({});
    const [courseProgressPercent, setCourseProgressPercent] = useState(0);
    const [progress, setProgress] = useState({ watched: 0, total: 0, seconds: 0 });
    const [initialStartTime, setInitialStartTime] = useState(0);
    const [isDownloading, setIsDownloading] = useState({});
    const [expandedModules, setExpandedModules] = useState(new Set());

    // Helper to format embed URLs with optional start time
    const getEmbedUrl = (lesson, startTime = 0) => {
        if (lesson.url_video_drive) {
            const driveUrl = lesson.url_video_drive;
            const idMatch = driveUrl.match(/\/d\/([^/?]+)/) || driveUrl.match(/[?&]id=([^&]+)/);
            if (idMatch && idMatch[1]) {
                return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
            }
            return driveUrl;
        }

        const id = lesson.id_video_profissional;
        if (!id) return null;

        let url = id;

        // YouTube
        if (id.includes('youtube.com') || id.includes('youtu.be')) {
            const ytIdMatch = id.match(/[?&]v=([^&]+)/) || id.match(/youtu\.be\/([^?]+)/) || id.match(/embed\/([^?]+)/);
            const ytId = ytIdMatch ? ytIdMatch[1] : id.split('/').pop();
            url = `https://www.youtube.com/embed/${ytId}?autoplay=1`;
            if (startTime > 0) url += `&start=${startTime}`;
            return url;
        }

        // Vimeo
        if (id.includes('vimeo.com')) {
            const vimeoIdMatch = id.match(/vimeo\.com\/(\d+)/) || id.match(/video\/(\d+)/);
            const vimeoId = vimeoIdMatch ? vimeoIdMatch[1] : id.split('/').pop();
            url = `https://player.vimeo.com/video/${vimeoId}?autoplay=1`;
            if (startTime > 0) url += `#t=${startTime}s`;
            return url;
        }

        // Panda Video
        if (id.includes('pandavideo.com.br')) {
            const base = id.includes('embed') ? id : id.replace('app.pandavideo', 'player-vz-xxx.pandavideo');
            url = base.includes('?') ? `${base}&autoplay=true` : `${base}?autoplay=true`;
            if (startTime > 0) url += `&t=${startTime}`;
            return url;
        }

        return id;
    };

    // Helper to format Drive URLs for PDF and Audio
    const formatDriveUrl = (url, isAudio = false, filename = '') => {
        if (!url || !url.includes('drive.google.com')) return url;
        const idMatch = url.match(/\/d\/([^/?#]+)/) || url.match(/[?&]id=([^&?#]+)/) || url.match(/\/file\/d\/([^/?#]+)/);
        if (idMatch && idMatch[1]) {
            const funcUrl = `https://bghvzdfikfhceekoxtxg.supabase.co/functions/v1/drive-proxy`;
            const params = new URLSearchParams({
                id: idMatch[1],
                filename: filename || 'arquivo'
            });

            if (isAudio) {
                return `${funcUrl}?${params.toString()}`;
            }
            return `https://drive.google.com/file/d/${idMatch[1]}/view`;
        }
        return url;
    };

    const handleDownload = async (url, filename, type = 'pdf') => {
        if (isDownloading[url]) return;
        const loadingKey = url;
        try {
            setIsDownloading(prev => ({ ...prev, [loadingKey]: true }));

            const idMatch = url.match(/\/d\/([^/?#]+)/) || url.match(/[?&]id=([^&?#]+)/) || url.match(/\/file\/d\/([^/?#]+)/);
            if (!idMatch) {
                window.open(url, '_blank');
                return;
            }

            const extension = type === 'audio' ? '.mp3' : '.pdf';
            let finalFilename = filename || (type === 'audio' ? 'Audio' : 'Documento');
            if (!finalFilename.toLowerCase().endsWith(extension)) {
                finalFilename += extension;
            }

            const proxyUrl = `https://bghvzdfikfhceekoxtxg.supabase.co/functions/v1/drive-proxy?id=${idMatch[1]}&filename=${encodeURIComponent(finalFilename)}&download=true&t=${Date.now()}`;

            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: finalFilename,
                        types: [{
                            description: type === 'audio' ? 'Arquivo de Áudio' : 'Documento PDF',
                            accept: { [type === 'audio' ? 'audio/mpeg' : 'application/pdf']: [extension] },
                        }],
                    });
                    const response = await fetch(proxyUrl);
                    if (!response.ok) throw new Error("Erro ao baixar do servidor");
                    const writable = await handle.createWritable();
                    await response.body.pipeTo(writable);
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.warn("showSaveFilePicker falhou, tentando fallback...", err);
                }
            }

            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error("Erro no download");
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', finalFilename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);

        } catch (err) {
            console.error("Erro no download:", err);
            if (err.name !== 'AbortError') {
                alert("Não foi possível baixar o arquivo. Tente novamente.");
            }
        } finally {
            setIsDownloading(prev => ({ ...prev, [loadingKey]: false }));
        }
    };

    useEffect(() => {
        fetchData();
    }, [courseId, lessonId]);

    async function fetchData() {
        try {
            setLoading(true);
            const userId = localStorage.getItem('rf_user_id');

            const { data: inscription } = await supabase
                .from('inscricoes')
                .select('*')
                .eq('curso_id', courseId)
                .eq('perfil_id', userId)
                .single();

            if (inscription) {
                const expirationDate = inscription.data_expiracao ? new Date(inscription.data_expiracao) : null;
                if (inscription.status === 'bloqueado' || (expirationDate && expirationDate < new Date())) {
                    setIsBlocked(true);
                    setLoading(false);
                    return;
                }
            } else {
                setIsBlocked(true);
                setLoading(false);
                return;
            }

            const { data: modulesData } = await supabase
                .from('modulos')
                .select('*, aulas(*), cursos(titulo)')
                .eq('curso_id', courseId)
                .order('ordem');

            setModules(modulesData || []);

            let currentLessonId = lessonId;
            if (lessonId === 'latest') {
                if (modulesData?.[0]?.aulas?.[0]) currentLessonId = modulesData[0].aulas[0].id;
            }

            if (currentLessonId) {
                const { data: lessonData } = await supabase
                    .from('aulas')
                    .select('*')
                    .eq('id', currentLessonId)
                    .single();

                const { data: allProg } = await supabase
                    .from('progresso')
                    .select('aula_id, concluida, porcentagem_concluida, segundos_assistidos')
                    .eq('perfil_id', userId);

                const completedSet = new Set(
                    allProg?.filter(p => p.concluida).map(p => p.aula_id) || []
                );
                setCompletedLessons(completedSet);

                const progMap = {};
                allProg?.forEach(p => {
                    progMap[p.aula_id] = p.porcentagem_concluida || 0;
                });
                setLessonProgressMap(progMap);

                const allAulasInCourse = modulesData?.flatMap(m => m.aulas) || [];
                const totalAulasCount = allAulasInCourse.length;
                const completedInCourse = allAulasInCourse.filter(a => completedSet.has(a.id)).length;
                setCourseProgressPercent(totalAulasCount > 0 ? Math.round((completedInCourse / totalAulasCount) * 100) : 0);

                const currentProg = allProg?.find(p => p.aula_id === currentLessonId);

                if (currentProg) {
                    setIsCompleted(currentProg.concluida);
                    const savedSeconds = currentProg.segundos_assistidos || 0;
                    setProgress({
                        watched: currentProg.porcentagem_concluida || 0,
                        seconds: savedSeconds,
                        total: 0
                    });
                    setInitialStartTime(savedSeconds);
                } else {
                    setIsCompleted(false);
                    setProgress({ watched: 0, seconds: 0, total: 0 });
                    setInitialStartTime(0);
                }
                setLesson(lessonData);

                if (lessonData) {
                    setExpandedModules(prev => new Set([...prev, lessonData.modulo_id]));
                }
            }

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (lesson && !isBlocked && !isCompleted) {
            const saveProgress = async () => {
                try {
                    const userId = localStorage.getItem('rf_user_id');
                    if (!userId) return;
                    await supabase.from('progresso').upsert({
                        perfil_id: userId,
                        aula_id: lesson.id,
                        concluida: isCompleted,
                        porcentagem_concluida: progress.watched,
                        segundos_assistidos: progress.seconds
                    }, { onConflict: 'perfil_id, aula_id' });
                } catch (err) {
                    console.error("Erro ao salvar progresso:", err);
                }
            };

            const interval = setInterval(saveProgress, 30000);

            const progressSim = setInterval(() => {
                setProgress(prev => {
                    if (prev.watched < 95) {
                        return { ...prev, watched: prev.watched + 1, seconds: prev.seconds + 60 };
                    }
                    return prev;
                });
            }, 60000);

            return () => {
                clearInterval(interval);
                clearInterval(progressSim);
            };
        }
    }, [lesson, isBlocked, progress.watched, isCompleted]);

    const toggleCompletion = async () => {
        try {
            const newState = !isCompleted;
            setIsCompleted(newState);

            setCompletedLessons(prev => {
                const next = new Set(prev);
                if (newState) next.add(lesson.id);
                else next.delete(lesson.id);
                return next;
            });

            setLessonProgressMap(prev => ({
                ...prev,
                [lesson.id]: newState ? 100 : progress.watched
            }));

            const allAulasInCourse = modules.flatMap(m => m.aulas);
            const concludedCount = allAulasInCourse.filter(a =>
                a.id === lesson.id ? newState : completedLessons.has(a.id)
            ).length;
            setCourseProgressPercent(allAulasInCourse.length > 0 ? Math.round((concludedCount / allAulasInCourse.length) * 100) : 0);

            const userId = localStorage.getItem('rf_user_id');
            await supabase.from('progresso').upsert({
                perfil_id: userId,
                aula_id: lesson.id,
                concluida: newState,
                porcentagem_concluida: newState ? 100 : progress.watched
            }, { onConflict: 'perfil_id, aula_id' });

            if (newState) setProgress(prev => ({ ...prev, watched: 100 }));
        } catch (err) {
            console.error("Erro ao alternar conclusão:", err);
        }
    };

    const handleNextPrev = (direction) => {
        const allAulas = modules.flatMap(m => m.aulas).sort((a, b) => a.ordem - b.ordem);
        const currentIndex = allAulas.findIndex(a => a.id === lesson?.id);

        if (direction === 'next' && currentIndex < allAulas.length - 1) {
            navigate(`/student/course/${courseId}/lesson/${allAulas[currentIndex + 1].id}`);
        } else if (direction === 'prev' && currentIndex > 0) {
            navigate(`/student/course/${courseId}/lesson/${allAulas[currentIndex - 1].id}`);
        }
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <p className="text-sm text-text-muted uppercase tracking-[0.2em] animate-pulse">Preparando sua aula...</p>
            </div>
        </div>
    );

    if (isBlocked) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center space-y-6">
                <div className="p-5 rounded-full glass-panel border border-primary/30" style={{ boxShadow: '0 0 40px rgba(212,175,55,0.2)' }}>
                    <Lock className="h-16 w-16 text-primary" />
                </div>
                <div className="max-w-md">
                    <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Acesso Expirado</h1>
                    <p className="text-text-muted mt-4 leading-relaxed">
                        Seu ciclo de estudos nesta jornada chegou ao fim. <br />
                        Para renovar seu acesso e continuar evoluindo, entre em contato com nosso suporte.
                    </p>
                </div>
                <Button onClick={() => navigate('/student')} variant="outline">Voltar aos Cursos</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* ── Header com Progresso do Curso ── */}
            <div className="glass-panel rounded-xl p-4 flex items-center justify-between border border-white/10" style={{ boxShadow: '0 4px 30px rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/student')}
                        className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-text-muted hover:text-primary hover:border-primary/40 transition-all"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-[0.15em] gold-text-gradient">
                            {modules.length > 0 ? modules[0].cursos?.titulo : 'Curso'}
                        </h2>
                        <div className="flex items-center gap-2 mt-1.5">
                            <div className="w-28 h-1 bg-black/40 rounded-full overflow-hidden">
                                <div
                                    className="bg-primary h-full transition-all duration-1000"
                                    style={{ width: `${courseProgressPercent}%`, boxShadow: '0 0 8px rgba(212,175,55,0.5)' }}
                                />
                            </div>
                            <span className="text-[10px] text-primary/70 font-bold tracking-widest">{courseProgressPercent}% CONCLUÍDO</span>
                        </div>
                    </div>
                </div>
                <div className="hidden md:flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleNextPrev('prev')}>Aula Anterior</Button>
                    <Button size="sm" onClick={() => handleNextPrev('next')}>Próxima Aula</Button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* ── Main Content ── */}
                <div className="flex-1 flex flex-col gap-4">
                    {lesson ? (
                        <>
                            {/* Vídeo Player */}
                            <div className="aspect-video w-full bg-black rounded-xl overflow-hidden relative border border-white/10"
                                style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
                                {getEmbedUrl(lesson, initialStartTime) ? (
                                    <iframe
                                        key={lesson.id}
                                        src={getEmbedUrl(lesson, initialStartTime)}
                                        className="w-full h-full border-none"
                                        allow="autoplay; fullscreen"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center glass-panel rounded-xl">
                                        <div className="text-center space-y-4 p-6">
                                            <div className="mx-auto w-16 h-16 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center"
                                                style={{ boxShadow: '0 0 20px rgba(212,175,55,0.2)' }}>
                                                <Library className="h-8 w-8 text-primary/60" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-text text-lg">Conteúdo de Estudo</h3>
                                                <p className="text-sm text-text-muted max-w-xs mx-auto mt-1">
                                                    Esta aula não possui vídeo. Explore os materiais em PDF e Áudio disponíveis abaixo.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Lesson Info & Actions */}
                            <div className="glass-panel rounded-xl p-5 border border-white/10">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <h1 className="text-xl font-bold gold-text-gradient">{lesson.titulo}</h1>
                                        <p className="text-text-muted text-sm mt-1">
                                            {modules.find(m => m.id === lesson.modulo_id)?.titulo}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={toggleCompletion}
                                            className={cn(
                                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border",
                                                isCompleted
                                                    ? "bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20"
                                                    : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                                            )}
                                        >
                                            <CheckCircle className={cn("h-4 w-4", isCompleted && "fill-green-500 text-green-500")} />
                                            {isCompleted ? 'Concluída' : 'Concluir Aula'}
                                        </button>
                                        <Button variant="outline" size="sm" onClick={() => handleNextPrev('prev')}>Anterior</Button>
                                        <Button size="sm" onClick={() => handleNextPrev('next')}>Próxima</Button>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="mt-4 pt-4 border-t border-white/5">
                                    <div className="flex justify-between text-[11px] text-text-muted mb-1.5">
                                        <span className="uppercase tracking-wider font-bold">Progresso na Aula</span>
                                        <span className="text-primary font-bold">{progress.watched}%</span>
                                    </div>
                                    <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-primary h-full transition-all duration-1000 rounded-full"
                                            style={{ width: `${progress.watched}%`, boxShadow: '0 0 6px rgba(212,175,55,0.6)' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Materiais */}
                            {((lesson.materiais_pdf && lesson.materiais_pdf.length > 0) || (lesson.materiais_audio && lesson.materiais_audio.length > 0)) && (
                                <div className="glass-panel rounded-xl p-5 border border-white/10 space-y-4">
                                    <h3 className="text-xs font-black gold-text-gradient uppercase tracking-[0.2em] flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-primary" />
                                        Materiais da Aula
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {lesson.materiais_pdf?.map((pdf, idx) => (
                                            <button
                                                key={`pdf-${idx}`}
                                                onClick={() => handleDownload(pdf.url, pdf.nome, 'pdf')}
                                                disabled={isDownloading[pdf.url]}
                                                className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5 hover:border-primary/40 hover:bg-primary/5 transition-all group w-full text-left"
                                            >
                                                <div className="h-10 w-10 bg-red-500/10 rounded-lg flex items-center justify-center shrink-0">
                                                    {isDownloading[pdf.url] ? (
                                                        <Loader2 className="h-5 w-5 text-red-500 animate-spin" />
                                                    ) : (
                                                        <FileText className="h-5 w-5 text-red-400" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-text truncate">{pdf.nome || 'Material PDF'}</p>
                                                    <p className="text-[10px] text-text-muted uppercase tracking-tighter">
                                                        {isDownloading[pdf.url] ? 'Preparando arquivo...' : 'Baixar Partitura (PDF)'}
                                                    </p>
                                                </div>
                                                {!isDownloading[pdf.url] && (
                                                    <Download className="h-4 w-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
                                                )}
                                            </button>
                                        ))}

                                        {lesson.materiais_audio?.map((audio, idx) => (
                                            <div key={`audio-${idx}`} className="flex flex-col gap-2 p-3 bg-black/20 rounded-lg border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                                        {isDownloading[audio.url] ? (
                                                            <Loader2 className="h-5 w-5 text-primary animate-spin" />
                                                        ) : (
                                                            <Headphones className="h-5 w-5 text-primary" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold text-text truncate">{audio.nome || 'Material de Áudio'}</p>
                                                        <p className="text-[10px] text-text-muted uppercase tracking-tighter">
                                                            {isDownloading[audio.url] ? 'Preparando arquivo...' : 'Ouvir agora'}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDownload(audio.url, audio.nome, 'audio')}
                                                        disabled={isDownloading[audio.url]}
                                                        className="p-2 hover:bg-white/10 rounded-full transition-colors group shrink-0"
                                                        title="Baixar Áudio"
                                                    >
                                                        <Download className="h-4 w-4 text-text-muted group-hover:text-primary" />
                                                    </button>
                                                </div>
                                                <audio
                                                    controls
                                                    crossOrigin="anonymous"
                                                    preload="none"
                                                    className="w-full h-8 mt-1 filter invert opacity-80 hover:opacity-100 transition-opacity"
                                                >
                                                    <source src={formatDriveUrl(audio.url, true, audio.nome)} type="audio/mpeg" />
                                                    Seu navegador não suporta o elemento de áudio.
                                                </audio>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="glass-panel rounded-xl flex items-center justify-center h-64 text-text-muted border border-white/10">
                            Selecione uma aula na lateral para começar.
                        </div>
                    )}
                </div>

                {/* ── Sidebar: Conteúdo do Curso ── */}
                <div className="w-full lg:w-96 glass-panel rounded-xl overflow-hidden flex flex-col border border-white/10"
                    style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                    {/* Sidebar Header */}
                    <div className="p-5 border-b border-white/10 bg-black/30 space-y-3">
                        <h3 className="font-black text-xs uppercase tracking-[0.2em] flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Play className="h-3.5 w-3.5 text-primary" fill="currentColor" />
                                <span className="gold-text-gradient">Conteúdo do Curso</span>
                            </span>
                            <span className="text-primary font-black">{courseProgressPercent}%</span>
                        </h3>
                        <div className="w-full bg-black/40 rounded-full h-1 overflow-hidden">
                            <div
                                className="bg-primary h-full transition-all duration-700 rounded-full"
                                style={{ width: `${courseProgressPercent}%`, boxShadow: '0 0 6px rgba(212,175,55,0.5)' }}
                            />
                        </div>
                    </div>

                    {/* Module List */}
                    <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                        {modules.map((module) => {
                            const isExpanded = expandedModules.has(module.id);
                            const moduleAulas = module.aulas || [];
                            const completedCount = moduleAulas.filter(a => completedLessons.has(a.id)).length;
                            return (
                                <div key={module.id} className="rounded-lg overflow-hidden border border-white/5">
                                    <button
                                        onClick={() => setExpandedModules(prev => {
                                            const next = new Set(prev);
                                            if (next.has(module.id)) next.delete(module.id);
                                            else next.add(module.id);
                                            return next;
                                        })}
                                        className="w-full px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] bg-white/5 hover:bg-white/10 flex items-center justify-between group transition-all"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-primary/70 group-hover:text-primary transition-colors truncate">{module.titulo}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            <span className="text-text-muted">{completedCount}/{moduleAulas.length}</span>
                                            <ChevronDown className={cn("h-3 w-3 text-primary/50 transition-transform duration-300", !isExpanded && "-rotate-90")} />
                                        </div>
                                    </button>

                                    <div className={cn(
                                        "grid transition-all duration-300 ease-in-out",
                                        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 overflow-hidden"
                                    )}>
                                        <div className="min-h-0 space-y-0.5 p-1">
                                            {moduleAulas.sort((a, b) => a.ordem - b.ordem).map((aula) => (
                                                <button
                                                    key={aula.id}
                                                    onClick={() => navigate(`/student/course/${courseId}/lesson/${aula.id}`)}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 px-3 py-3 text-sm text-left rounded-lg transition-all group",
                                                        lesson?.id === aula.id
                                                            ? "bg-primary/15 text-primary border-l-2 border-primary font-bold"
                                                            : "text-text-muted hover:bg-white/5 hover:text-text"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                                        completedLessons.has(aula.id)
                                                            ? "border-green-500 bg-green-500/20"
                                                            : lesson?.id === aula.id
                                                                ? "border-primary bg-primary/10"
                                                                : "border-white/20"
                                                    )}>
                                                        {completedLessons.has(aula.id) ? (
                                                            <CheckCircle className="h-3 w-3 text-green-500 fill-green-500" />
                                                        ) : (
                                                            lesson?.id === aula.id && <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className="line-clamp-2 text-xs group-hover:text-text transition-colors leading-relaxed">{aula.titulo}</span>
                                                        {lessonProgressMap[aula.id] > 0 && !completedLessons.has(aula.id) && (
                                                            <span className="text-[10px] text-primary/60 mt-0.5">{lessonProgressMap[aula.id]}% assistido</span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
