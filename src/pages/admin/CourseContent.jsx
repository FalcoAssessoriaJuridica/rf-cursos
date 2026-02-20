import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Plus, ChevronLeft, Pencil, Trash2, Video, List, X, GripVertical, ChevronDown, ChevronRight, Info, AlertTriangle, FileText, Headphones } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function CourseContent() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState(null);
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedModules, setExpandedModules] = useState(new Set());

    // Modals State
    const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
    const [editingModule, setEditingModule] = useState(null);
    const [moduleForm, setModuleForm] = useState({ titulo: '', ordem: 0 });

    const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
    const [editingLesson, setEditingLesson] = useState(null);
    const [activeModuleId, setActiveModuleId] = useState(null);
    const [lessonForm, setLessonForm] = useState({
        titulo: '',
        ordem: 1,
        video_provider: 'google_drive',
        video_id: '',
        materiais_pdf: [],
        materiais_audio: [],
    });

    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [previewLesson, setPreviewLesson] = useState(null);

    // Confirmation Modals State
    const [moduleToDelete, setModuleToDelete] = useState(null);
    const [lessonToDelete, setLessonToDelete] = useState(null);

    // Helper to format preview URLs (same as player)
    const getPreviewUrl = (lesson) => {
        if (!lesson) return '';
        if (lesson.url_video_drive) {
            const driveUrl = lesson.url_video_drive;
            const idMatch = driveUrl.match(/\/d\/([^/?#]+)/) || driveUrl.match(/[?&]id=([^&?#]+)/) || driveUrl.match(/\/file\/d\/([^/?#]+)/);
            const fileId = idMatch ? idMatch[1] : null;
            return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : driveUrl;
        }

        const id = lesson.id_video_profissional;
        if (!id) return '';

        if (id.includes('youtube.com') || id.includes('youtu.be')) {
            const ytIdMatch = id.match(/[?&]v=([^&]+)/) || id.match(/youtu\.be\/([^?]+)/) || id.match(/embed\/([^?]+)/);
            const ytId = ytIdMatch ? ytIdMatch[1] : id.split('/').pop();
            return `https://www.youtube.com/embed/${ytId}`;
        }

        if (id.includes('vimeo.com')) {
            const vimeoIdMatch = id.match(/vimeo\.com\/(\d+)/) || id.match(/video\/(\d+)/);
            const vimeoId = vimeoIdMatch ? vimeoIdMatch[1] : id.split('/').pop();
            return `https://player.vimeo.com/video/${vimeoId}`;
        }

        if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
        if (id.length >= 10 && id.length <= 12) return `https://www.youtube.com/embed/${id}`;

        return id;
    };

    useEffect(() => {
        fetchCourseData();
    }, [courseId]);

    async function fetchCourseData() {
        try {
            setLoading(true);
            // Fetch Course
            const { data: cData } = await supabase.from('cursos').select('titulo').eq('id', courseId).single();
            setCourse(cData);

            // Fetch Modules and Lessons
            const { data: mData, error } = await supabase
                .from('modulos')
                .select(`
                    *,
                    aulas (*)
                `)
                .eq('curso_id', courseId)
                .order('ordem', { ascending: true });

            if (error) throw error;

            // Sort lessons within modules locally
            const sortedModules = (mData || []).map(mod => ({
                ...mod,
                aulas: (mod.aulas || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
            }));

            setModules(sortedModules);
            // Expand all by default
            setExpandedModules(new Set(sortedModules.map(m => m.id)));
        } catch (error) {
            console.error('Erro ao buscar conteúdo:', error);
        } finally {
            setLoading(false);
        }
    }

    const toggleModule = (id) => {
        const newExpanded = new Set(expandedModules);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedModules(newExpanded);
    };

    // --- Module Actions ---
    const openModuleModal = (mod = null) => {
        if (mod) {
            setEditingModule(mod.id);
            setModuleForm({ titulo: mod.titulo, ordem: mod.ordem });
        } else {
            setEditingModule(null);
            setModuleForm({ titulo: '', ordem: modules.length + 1 });
        }
        setIsModuleModalOpen(true);
    };

    const handleModuleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            if (editingModule) {
                await supabase.from('modulos').update(moduleForm).eq('id', editingModule);
            } else {
                await supabase.from('modulos').insert([{ ...moduleForm, curso_id: courseId }]);
            }
            setIsModuleModalOpen(false);
            fetchCourseData();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteModuleClick = (e, mod) => {
        e.stopPropagation();
        setModuleToDelete(mod);
    };

    const confirmDeleteModule = async () => {
        if (!moduleToDelete) return;
        try {
            setLoading(true);
            const mid = moduleToDelete.id;
            setModuleToDelete(null);
            // Delete lessons first (cascade)
            await supabase.from('aulas').delete().eq('modulo_id', mid);
            await supabase.from('modulos').delete().eq('id', mid);
            fetchCourseData();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- Lesson Actions ---
    const openLessonModal = (modId, lesson = null) => {
        setActiveModuleId(modId);
        if (lesson) {
            setEditingLesson(lesson.id);
            // Detect provider and value
            const provider = lesson.url_video_drive ? 'google_drive' : (lesson.video_provider || 'youtube');
            const videoValue = lesson.url_video_drive || lesson.id_video_profissional || '';

            setLessonForm({
                titulo: lesson.titulo,
                video_id: videoValue,
                video_provider: provider,
                ordem: lesson.ordem,
                materiais_pdf: lesson.materiais_pdf || [],
                materiais_audio: lesson.materiais_audio || []
            });
        } else {
            const mod = modules.find(m => m.id === modId);
            setEditingLesson(null);
            setLessonForm({
                titulo: '',
                video_id: '',
                video_provider: 'youtube',
                ordem: (mod?.aulas?.length || 0) + 1,
                materiais_pdf: [],
                materiais_audio: []
            });
        }
        setIsLessonModalOpen(true);
    };

    const handleLessonSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);

            // Prepare data for DB mapping
            const payload = {
                titulo: lessonForm.titulo,
                ordem: lessonForm.ordem,
                // If it's drive, fill url_video_drive, else id_video_profissional
                url_video_drive: lessonForm.video_provider === 'google_drive' ? lessonForm.video_id : null,
                id_video_profissional: lessonForm.video_provider !== 'google_drive' ? lessonForm.video_id : null,
                materiais_pdf: lessonForm.materiais_pdf,
                materiais_audio: lessonForm.materiais_audio,
            };

            if (editingLesson) {
                await supabase.from('aulas').update(payload).eq('id', editingLesson);
            } else {
                await supabase.from('aulas').insert([{ ...payload, modulo_id: activeModuleId }]);
            }
            setIsLessonModalOpen(false);
            fetchCourseData();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteLessonClick = (e, lesson) => {
        e.stopPropagation();
        setLessonToDelete(lesson);
    };

    const confirmDeleteLesson = async () => {
        if (!lessonToDelete) return;
        try {
            setLoading(true);
            const lid = lessonToDelete.id;
            setLessonToDelete(null);
            await supabase.from('aulas').delete().eq('id', lid);
            fetchCourseData();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !course) {
        return <div className="flex h-[calc(100vh-200px)] items-center justify-center text-primary animate-pulse">Carregando conteúdo...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/admin/courses')}>
                    <ChevronLeft className="h-6 w-6" />
                </Button>
                <div>
                    <h2 className="text-3xl font-bold text-text truncate max-w-md">
                        {course?.titulo || 'Gerenciar Conteúdo'}
                    </h2>
                    <p className="text-text-muted">Módulos e Aulas do curso.</p>
                </div>
            </div>

            <div className="flex justify-end">
                <Button onClick={() => openModuleModal()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Módulo
                </Button>
            </div>

            <div className="space-y-4">
                {modules.length === 0 && !loading && (
                    <Card className="p-12 text-center text-text-muted border-dashed">
                        Nenhum módulo cadastrado ainda. Comece adicionando o primeiro!
                    </Card>
                )}

                {modules.map((mod) => (
                    <div key={mod.id} className="space-y-2">
                        <div className="flex items-center gap-2 group">
                            <button
                                onClick={() => toggleModule(mod.id)}
                                className="flex-1 flex items-center gap-3 p-4 bg-surface rounded-lg border border-border hover:border-primary/50 transition-all text-left"
                            >
                                {expandedModules.has(mod.id) ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-text-muted" />}
                                <span className="font-bold text-lg text-text flex-1">{mod.ordem}. {mod.titulo}</span>
                                <span className="text-xs text-text-muted">{mod.aulas?.length || 0} aulas</span>
                            </button>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => openModuleModal(mod)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-10 w-10 text-red-500" onClick={(e) => handleDeleteModuleClick(e, mod)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {expandedModules.has(mod.id) && (
                            <div className="ml-8 space-y-2 border-l-2 border-primary/20 pl-4 py-2">
                                {mod.aulas?.map((lesson) => (
                                    <div
                                        key={lesson.id}
                                        className="flex items-center gap-3 p-3 bg-black/20 rounded-md border border-border/50 group/lesson cursor-pointer hover:bg-black/30 transition-all"
                                        onClick={() => openLessonModal(mod.id, lesson)}
                                    >
                                        <div className="h-8 w-8 bg-primary/10 rounded flex items-center justify-center">
                                            <Video className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-text">{lesson.ordem}. {lesson.titulo}</p>
                                            <p className="text-[10px] text-text-muted uppercase tracking-wider">
                                                {lesson.url_video_drive ? 'Google Drive' : (lesson.video_provider || 'Vídeo Pro')}
                                            </p>
                                        </div>
                                        <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider"
                                                onClick={() => {
                                                    setPreviewLesson(lesson);
                                                    setIsPreviewModalOpen(true);
                                                }}
                                            >
                                                Visualizar
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={(e) => handleDeleteLessonClick(e, lesson)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => openLessonModal(mod.id)}
                                    className="flex items-center gap-2 p-3 w-full border border-dashed border-border rounded-md text-sm text-text-muted hover:text-primary hover:border-primary/50 transition-all justify-center"
                                >
                                    <Plus className="h-4 w-4" />
                                    Adicionar Aula no Módulo
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Modal Preview de Vídeo */}
            {isPreviewModalOpen && previewLesson && (
                <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[60]">
                    <div className="w-full max-w-4xl space-y-4">
                        <div className="flex justify-between items-center text-white">
                            <h3 className="text-xl font-bold">{previewLesson.titulo}</h3>
                            <button onClick={() => {
                                setIsPreviewModalOpen(false);
                                setPreviewLesson(null);
                            }} className="p-2 hover:bg-white/10 rounded-full">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
                            <iframe
                                src={getPreviewUrl(previewLesson)}
                                className="w-full h-full"
                                allow="autoplay; fullscreen"
                                allowFullScreen
                            />
                        </div>
                        <p className="text-center text-text-muted text-sm mt-4">
                            Se o vídeo não carregar, verifique as permissões de compartilhamento no Google Drive.
                        </p>
                    </div>
                </div>
            )}

            {/* Modal Módulo */}
            {isModuleModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-md border-primary/30">
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>{editingModule ? 'Editar Módulo' : 'Novo Módulo'}</CardTitle>
                            <button onClick={() => setIsModuleModalOpen(false)}><X className="h-5 w-5 text-text-muted" /></button>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleModuleSubmit} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Título do Módulo</label>
                                    <Input required value={moduleForm.titulo} onChange={e => setModuleForm({ ...moduleForm, titulo: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Ordem</label>
                                    <Input type="number" required value={moduleForm.ordem} onChange={e => setModuleForm({ ...moduleForm, ordem: parseInt(e.target.value) })} />
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button variant="ghost" type="button" onClick={() => setIsModuleModalOpen(false)}>Cancelar</Button>
                                    <Button type="submit">Salvar</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Modal Aula */}
            {isLessonModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-lg border-primary/30">
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>{editingLesson ? 'Editar Aula' : 'Nova Aula'}</CardTitle>
                            <button onClick={() => setIsLessonModalOpen(false)}><X className="h-5 w-5 text-text-muted" /></button>
                        </CardHeader>
                        <CardContent className="max-h-[80vh] overflow-y-auto">
                            <form onSubmit={handleLessonSubmit} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Título da Aula</label>
                                    <Input required value={lessonForm.titulo} onChange={e => setLessonForm({ ...lessonForm, titulo: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Provedor</label>
                                        <select
                                            className="w-full bg-surface border border-border rounded-md h-10 px-3 text-sm"
                                            value={lessonForm.video_provider}
                                            onChange={e => setLessonForm({ ...lessonForm, video_provider: e.target.value })}
                                        >
                                            <option value="youtube">YouTube</option>
                                            <option value="vimeo">Vimeo</option>
                                            <option value="panda">Panda Video</option>
                                            <option value="google_drive">Google Drive</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-text-muted uppercase font-bold tracking-wider">
                                            {lessonForm.video_provider === 'google_drive' ? 'Link do Drive (Opcional)' : 'ID do Vídeo (Opcional)'}
                                        </label>
                                        <Input value={lessonForm.video_id} onChange={e => setLessonForm({ ...lessonForm, video_id: e.target.value })} />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Ordem</label>
                                    <Input type="number" required value={lessonForm.ordem} onChange={e => setLessonForm({ ...lessonForm, ordem: parseInt(e.target.value) })} />
                                </div>

                                {/* Seção de Materiais PDF */}
                                <div className="space-y-3 p-4 bg-black/20 rounded-lg border border-border/50">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-primary uppercase font-bold tracking-wider flex items-center gap-2">
                                            <FileText className="h-4 w-4" /> Materiais PDF
                                        </label>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px]"
                                            onClick={() => setLessonForm({
                                                ...lessonForm,
                                                materiais_pdf: [...lessonForm.materiais_pdf, { nome: '', url: '' }]
                                            })}
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> Adicionar PDF
                                        </Button>
                                    </div>

                                    {lessonForm.materiais_pdf.length === 0 && (
                                        <p className="text-[10px] text-text-muted italic">Nenhum PDF anexado.</p>
                                    )}

                                    {lessonForm.materiais_pdf.map((pdf, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                            <div className="col-span-5 space-y-1">
                                                <label className="text-[9px] text-text-muted uppercase">Nome Exibição</label>
                                                <Input
                                                    placeholder="Ex: Partitura Aula 01"
                                                    value={pdf.nome}
                                                    onChange={e => {
                                                        const newList = [...lessonForm.materiais_pdf];
                                                        newList[idx].nome = e.target.value;
                                                        setLessonForm({ ...lessonForm, materiais_pdf: newList });
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-6 space-y-1">
                                                <label className="text-[9px] text-text-muted uppercase">Link Drive</label>
                                                <Input
                                                    placeholder="URL do PDF..."
                                                    value={pdf.url}
                                                    onChange={e => {
                                                        const newList = [...lessonForm.materiais_pdf];
                                                        newList[idx].url = e.target.value;
                                                        setLessonForm({ ...lessonForm, materiais_pdf: newList });
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-1 pb-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 text-red-500 hover:bg-red-500/10"
                                                    onClick={() => {
                                                        const newList = lessonForm.materiais_pdf.filter((_, i) => i !== idx);
                                                        setLessonForm({ ...lessonForm, materiais_pdf: newList });
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Seção de Materiais Áudio */}
                                <div className="space-y-3 p-4 bg-black/20 rounded-lg border border-border/50">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-primary uppercase font-bold tracking-wider flex items-center gap-2">
                                            <Headphones className="h-4 w-4" /> Materiais de Áudio
                                        </label>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px]"
                                            onClick={() => setLessonForm({
                                                ...lessonForm,
                                                materiais_audio: [...lessonForm.materiais_audio, { nome: '', url: '' }]
                                            })}
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> Adicionar Áudio
                                        </Button>
                                    </div>

                                    {lessonForm.materiais_audio.length === 0 && (
                                        <p className="text-[10px] text-text-muted italic">Nenhum áudio anexado.</p>
                                    )}

                                    {lessonForm.materiais_audio.map((audio, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                            <div className="col-span-5 space-y-1">
                                                <label className="text-[9px] text-text-muted uppercase">Nome Exibição</label>
                                                <Input
                                                    placeholder="Ex: Playalong - Lento"
                                                    value={audio.nome}
                                                    onChange={e => {
                                                        const newList = [...lessonForm.materiais_audio];
                                                        newList[idx].nome = e.target.value;
                                                        setLessonForm({ ...lessonForm, materiais_audio: newList });
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-6 space-y-1">
                                                <label className="text-[9px] text-text-muted uppercase">Link Drive</label>
                                                <Input
                                                    placeholder="URL do Áudio..."
                                                    value={audio.url}
                                                    onChange={e => {
                                                        const newList = [...lessonForm.materiais_audio];
                                                        newList[idx].url = e.target.value;
                                                        setLessonForm({ ...lessonForm, materiais_audio: newList });
                                                    }}
                                                />
                                            </div>
                                            <div className="col-span-1 pb-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 text-red-500 hover:bg-red-500/10"
                                                    onClick={() => {
                                                        const newList = lessonForm.materiais_audio.filter((_, i) => i !== idx);
                                                        setLessonForm({ ...lessonForm, materiais_audio: newList });
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button variant="ghost" type="button" onClick={() => setIsLessonModalOpen(false)}>Cancelar</Button>
                                    <Button type="submit">Salvar Aula</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Modal de Confirmação de Exclusão de Módulo */}
            {moduleToDelete && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[70] backdrop-blur-sm">
                    <Card className="w-full max-w-md border-red-500/30 font-sans">
                        <CardHeader className="border-b border-border/50">
                            <CardTitle className="text-red-500">Excluir Módulo</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <p className="text-text">
                                Tem certeza que deseja apagar o módulo <strong className="text-primary">"{moduleToDelete.titulo}"</strong>?
                            </p>
                            <p className="text-sm text-text-muted">
                                Isso apagará <strong className="text-red-500 text-xs">TODAS as {moduleToDelete.aulas?.length || 0} aulas</strong> contidas nele. Esta ação não pode ser desfeita.
                            </p>
                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="ghost" onClick={() => setModuleToDelete(null)}>Cancelar</Button>
                                <Button
                                    className="bg-red-500 text-white hover:bg-red-600 shadow-none"
                                    onClick={confirmDeleteModule}
                                    isLoading={loading}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Excluir Tudo
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Modal de Confirmação de Exclusão de Aula */}
            {lessonToDelete && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[70] backdrop-blur-sm">
                    <Card className="w-full max-w-md border-red-500/30 font-sans">
                        <CardHeader className="border-b border-border/50">
                            <CardTitle className="text-red-500">Excluir Aula</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <p className="text-text">
                                Tem certeza que deseja apagar a aula <strong className="text-primary">"{lessonToDelete.titulo}"</strong>?
                            </p>
                            <p className="text-sm text-text-muted">
                                Esta ação não pode ser desfeita.
                            </p>
                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="ghost" onClick={() => setLessonToDelete(null)}>Cancelar</Button>
                                <Button
                                    className="bg-red-500 text-white hover:bg-red-600 shadow-none"
                                    onClick={confirmDeleteLesson}
                                    isLoading={loading}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Excluir Aula
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
