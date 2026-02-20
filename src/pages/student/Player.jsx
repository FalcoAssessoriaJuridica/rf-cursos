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
                // Use the proxy for audio streaming
                return `${funcUrl}?${params.toString()}`;
            }
            // View/Download for PDF - standard drive preview is usually fine for viewing
            return `https://drive.google.com/file/d/${idMatch[1]}/view`;
        }
        return url;
    };

    const handleDownload = async (url, filename, type = 'pdf') => {
        // Guard against double-clicks
        if (isDownloading[url]) return;
        // Use a unique ID for the loading state to avoid mismatches
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

            // TENTATIVA 1: showSaveFilePicker (Garante janela de Salvar Como)
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: finalFilename,
                        types: [{
                            description: type === 'audio' ? 'Arquivo de Áudio' : 'Documento PDF',
                            accept: { [type === 'audio' ? 'audio/mpeg' : 'application/pdf']: [extension] },
                        }],
                    });

                    // Só faz o fetch DEPOIS que o usuário escolheu o local
                    const response = await fetch(proxyUrl);
                    if (!response.ok) throw new Error("Erro ao baixar do servidor");

                    const writable = await handle.createWritable();
                    await response.body.pipeTo(writable); // Stream direto para o arquivo
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') {
                        console.log("Usuário cancelou o salvamento.");
                        return;
                    }
                    console.warn("showSaveFilePicker falhou, tentando fallback...", err);
                }
            }

            // FALLBACK: Método tradicional (Respeita configuração do navegador)
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
            // Mostrar erro apenas se não for cancelamento do usuário
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

            // 1. Check Access Expiration (Requirement 4)
            const userId = localStorage.getItem('rf_user_id');

            // 1. Check Access Expiration (Requirement 4)
            // Filter by BOTH courseId and the current userId
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
                // If no inscription found, block access
                setIsBlocked(true);
                setLoading(false);
                return;
            }

            // 2. Fetch modules with lessons AND course details
            const { data: modulesData } = await supabase
                .from('modulos')
                .select('*, aulas(*), cursos(titulo)')
                .eq('curso_id', courseId)
                .order('ordem');

            setModules(modulesData || []);

            // 3. Current lesson
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
                const userId = localStorage.getItem('rf_user_id');
                // Fetch all progress for this student across all lessons
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

                // Calculate Course Progress for this specific course
                const allAulasInCourse = modulesData?.flatMap(m => m.aulas) || [];
                const totalAulasCount = allAulasInCourse.length;
                const completedInCourse = allAulasInCourse.filter(a => completedSet.has(a.id)).length;
                setCourseProgressPercent(totalAulasCount > 0 ? Math.round((completedInCourse / totalAulasCount) * 100) : 0);

                // Check specific current lesson progress
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

                // Auto-expand current module
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

    // Effect to track video progress (Real Implementation)
    // Effect to track video progress (Real Implementation)
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

            const interval = setInterval(saveProgress, 30000); // Auto-save

            // Simulate progress increase while watching (useful for iframes)
            const progressSim = setInterval(() => {
                setProgress(prev => {
                    if (prev.watched < 95) {
                        return {
                            ...prev,
                            watched: prev.watched + 1,
                            seconds: prev.seconds + 60 // Estimate 60s per minute
                        };
                    }
                    return prev;
                });
            }, 60000); // +1% per minute

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

            // Update local set for sidebar UI
            setCompletedLessons(prev => {
                const next = new Set(prev);
                if (newState) next.add(lesson.id);
                else next.delete(lesson.id);
                return next;
            });

            // Update local map for sidebar percentages
            setLessonProgressMap(prev => ({
                ...prev,
                [lesson.id]: newState ? 100 : progress.watched
            }));

            // Re-calculate course progress
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

    if (loading) return <div className="flex h-screen items-center justify-center text-primary">Preparamos sua aula...</div>;

    if (isBlocked) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center space-y-6">
                <div className="p-4 rounded-full bg-primary/10 border border-primary/20">
                    <Lock className="h-16 w-16 text-primary" />
                </div>
                <div className="max-w-md">
                    <h1 className="text-3xl font-bold text-primary uppercase tracking-tighter">Acesso Expirado</h1>
                    <p className="text-text-muted mt-4">
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
            {/* Header com Progresso do Curso */}
            <div className="bg-surface border border-border rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => navigate('/student')}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h2 className="text-lg font-bold text-primary uppercase tracking-tighter">
                            {modules.length > 0 ? modules[0].cursos?.titulo : 'Curso'}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="w-32 h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                <div className="bg-primary h-full transition-all duration-1000" style={{ width: `${courseProgressPercent}%` }} />
                            </div>
                            <span className="text-[10px] text-text-muted font-bold">{courseProgressPercent}% CONCLUÍDO</span>
                        </div>
                    </div>
                </div>
                <div className="hidden md:flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleNextPrev('prev')}>Aula Anterior</Button>
                    <Button size="sm" onClick={() => handleNextPrev('next')}>Próxima Aula</Button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 flex flex-col gap-4">
                    {lesson ? (
                        <>
                            <div className="aspect-video w-full bg-black rounded-lg overflow-hidden border border-border relative">
                                {/* Intelligent Player with Resume (Requirement 4) */}
                                {getEmbedUrl(lesson, initialStartTime) ? (
                                    <iframe
                                        key={lesson.id} // Only reload when the lesson actually changes
                                        src={getEmbedUrl(lesson, initialStartTime)}
                                        className="w-full h-full border-none"
                                        allow="autoplay; fullscreen"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center bg-surface/50">
                                        <div className="text-center space-y-3 p-6">
                                            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                                                <Library className="h-8 w-8 text-primary/60" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-text text-lg">Conteúdo de Estudo</h3>
                                                <p className="text-sm text-text-muted max-w-xs mx-auto">
                                                    Esta aula não possui vídeo. Explore os materiais em PDF e Áudio disponíveis abaixo para seu aprendizado.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h1 className="text-2xl font-bold text-primary">{lesson.titulo}</h1>
                                    <p className="text-text-muted text-sm">Módulo: {modules.find(m => m.id === lesson.modulo_id)?.titulo}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant={isCompleted ? "secondary" : "outline"}
                                        size="sm"
                                        onClick={toggleCompletion}
                                        className={isCompleted ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20" : ""}
                                    >
                                        <CheckCircle className={cn("h-4 w-4 mr-2", isCompleted && "fill-green-500")} />
                                        {isCompleted ? "Concluída" : "Concluir Aula"}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleNextPrev('prev')}>Anterior</Button>
                                    <Button size="sm" onClick={() => handleNextPrev('next')}>Próxima Aula</Button>
                                </div>
                            </div>

                            <div className="mt-2">
                                <div className="flex justify-between text-xs text-text-muted mb-1">
                                    <span>Progresso na Aula</span>
                                    <span>{progress.watched}%</span>
                                </div>
                                <div className="w-full bg-surface border border-border rounded-full h-2 overflow-hidden">
                                    <div className="bg-primary h-full transition-all duration-1000" style={{ width: `${progress.watched}%` }} />
                                </div>
                            </div>

                            {((lesson.materiais_pdf && lesson.materiais_pdf.length > 0) || (lesson.materiais_audio && lesson.materiais_audio.length > 0)) && (
                                <div className="mt-6 p-4 bg-surface border border-border rounded-lg space-y-4">
                                    <h3 className="text-sm font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        Materiais da Aula
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {lesson.materiais_pdf?.map((pdf, idx) => (
                                            <button
                                                key={`pdf-${idx}`}
                                                onClick={() => handleDownload(pdf.url, pdf.nome, 'pdf')}
                                                disabled={isDownloading[pdf.url]}
                                                className="flex items-center gap-3 p-3 bg-black/20 rounded-md border border-border hover:border-primary/50 transition-all group w-full text-left"
                                            >
                                                <div className="h-10 w-10 bg-red-500/10 rounded flex items-center justify-center">
                                                    {isDownloading[pdf.url] ? (
                                                        <Loader2 className="h-5 w-5 text-red-500 animate-spin" />
                                                    ) : (
                                                        <FileText className="h-5 w-5 text-red-500" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-text truncate">{pdf.nome || 'Material PDF'}</p>
                                                    <p className="text-[10px] text-text-muted uppercase tracking-tighter">
                                                        {isDownloading[pdf.url] ? 'Preparando arquivo...' : 'Baixar Partitura (PDF)'}
                                                    </p>
                                                </div>
                                                {!isDownloading[pdf.url] && <Download className="h-4 w-4 text-text-muted group-hover:text-primary transition-colors" />}
                                            </button>
                                        ))}

                                        {lesson.materiais_audio?.map((audio, idx) => (
                                            <div key={`audio-${idx}`} className="flex flex-col gap-2 p-3 bg-black/20 rounded-md border border-border">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 bg-primary/10 rounded flex items-center justify-center">
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
                                                        className="p-2 hover:bg-white/10 rounded-full transition-colors group"
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
                        <div className="flex items-center justify-center h-full text-text-muted">Selecione uma aula lateral para começar.</div>
                    )}
                </div>

                <div className="w-full lg:w-96 bg-surface border border-border rounded-lg overflow-hidden flex flex-col shadow-2xl">
                    <div className="p-5 border-b border-border bg-black/40 space-y-3">
                        <h3 className="font-bold text-text uppercase tracking-widest text-xs flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Play className="h-4 w-4 text-primary" fill="currentColor" />
                                Conteúdo do Curso
                            </span>
                            <span className="text-primary">{courseProgressPercent}%</span>
                        </h3>
                        <div className="w-full bg-surface border border-border rounded-full h-1 overflow-hidden">
                            <div
                                className="bg-primary h-full transition-all duration-700"
                                style={{ width: `${courseProgressPercent}%` }}
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-3 custom-scrollbar">
                        {modules.map((module) => {
                            const isExpanded = expandedModules.has(module.id);
                            return (
                                <div key={module.id} className="space-y-1">
                                    <button
                                        onClick={() => setExpandedModules(prev => {
                                            const next = new Set(prev);
                                            if (next.has(module.id)) next.delete(module.id);
                                            else next.add(module.id);
                                            return next;
                                        })}
                                        className="w-full px-3 py-2 text-[10px] font-black text-primary/60 uppercase tracking-[0.2em] bg-white/5 rounded flex items-center justify-between group hover:bg-white/10 transition-all"
                                    >
                                        <span>{module.titulo}</span>
                                        <ChevronDown className={cn("h-3 w-3 transition-transform duration-300", !isExpanded && "-rotate-90")} />
                                    </button>

                                    <div className={cn(
                                        "grid transition-all duration-300 ease-in-out",
                                        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 overflow-hidden"
                                    )}>
                                        <div className="min-h-0 space-y-0.5">
                                            {module.aulas?.sort((a, b) => a.ordem - b.ordem).map((aula) => (
                                                <button
                                                    key={aula.id}
                                                    onClick={() => navigate(`/student/course/${courseId}/lesson/${aula.id}`)}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 px-4 py-4 text-sm text-left rounded-md transition-all group",
                                                        lesson?.id === aula.id
                                                            ? "bg-primary/20 text-primary border-l-4 border-primary"
                                                            : "text-text-muted hover:bg-white/5 hover:text-text"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                                                        completedLessons.has(aula.id)
                                                            ? "border-green-500 bg-green-500/20"
                                                            : (lesson?.id === aula.id ? "border-primary" : "border-border")
                                                    )}>
                                                        {completedLessons.has(aula.id) ? (
                                                            <CheckCircle className="h-3 w-3 text-green-500 fill-green-500" />
                                                        ) : (
                                                            lesson?.id === aula.id && <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className="line-clamp-1 group-hover:text-text transition-colors">{aula.titulo}</span>
                                                        {lessonProgressMap[aula.id] > 0 && !completedLessons.has(aula.id) && (
                                                            <span className="text-[10px] text-primary/70">{lessonProgressMap[aula.id]}% assistido</span>
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
