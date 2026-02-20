import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Card, CardContent } from '../../components/Card';
import { CheckCircle, Lock, ChevronRight, ChevronLeft, Play, AlertTriangle } from 'lucide-react';
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
                                    <div className="flex h-full items-center justify-center text-text-muted">
                                        Vídeo não configurado para esta aula.
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
                        {modules.map((module) => (
                            <div key={module.id} className="space-y-1">
                                <div className="px-3 py-2 text-[10px] font-black text-primary/60 uppercase tracking-[0.2em] bg-white/5 rounded">
                                    {module.titulo}
                                </div>
                                <div className="space-y-0.5">
                                    {module.aulas?.sort((a, b) => a.ordem - b.ordem).map((aula) => (
                                        <button
                                            key={aula.id}
                                            onClick={() => navigate(`/student/course/${courseId}/lesson/${aula.id}`)}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-4 py-3 text-sm text-left rounded-md transition-all group",
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
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
