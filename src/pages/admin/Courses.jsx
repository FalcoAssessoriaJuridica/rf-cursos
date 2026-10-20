import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Plus, Search, Book, Pencil, Trash2, X, Image as ImageIcon, Upload } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import { DEMO_COURSES, DEMO_STUDENTS, getDemoEnrollments, withDemoCover, setDemoCover } from '../../lib/demoCourses';
import CoverCropper from '../../components/CoverCropper';
import { coverStyle } from '../../lib/cover';

export default function Courses() {
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [newCourse, setNewCourse] = useState({ titulo: '', descricao: '', capa_url: '', capa_posicao_y: 50, capa_posicao_x: 50, capa_zoom: 1 });
    const [editingDemo, setEditingDemo] = useState(false); // curso demo: só o enquadramento da capa é editável
    const [demoTick, setDemoTick] = useState(0);
    const [courseToDelete, setCourseToDelete] = useState(null);

    useEffect(() => {
        fetchCourses();
    }, []);

    async function fetchCourses() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('cursos')
                .select('*')
                .order('titulo', { ascending: true });

            if (error) throw error;
            setCourses(data || []);
        } catch (error) {
            console.error('Erro ao buscar cursos:', error);
        } finally {
            setLoading(false);
        }
    }

    const openModal = (course = null) => {
        if (course) {
            setEditingId(course.id);
            setEditingDemo(!!course.is_demo);
            setNewCourse({
                titulo: course.titulo || '',
                descricao: course.descricao || '',
                capa_url: course.capa_url || '',
                capa_posicao_y: course.capa_posicao_y ?? 50,
                capa_posicao_x: course.capa_posicao_x ?? 50,
                capa_zoom: Number(course.capa_zoom) || 1
            });
        } else {
            setEditingId(null);
            setEditingDemo(false);
            setNewCourse({ titulo: '', descricao: '', capa_url: '', capa_posicao_y: 50, capa_posicao_x: 50, capa_zoom: 1 });
        }
        setIsModalOpen(true);
    };

    const handleImageUpload = async (e) => {
        try {
            setUploading(true);
            const file = e.target.files?.[0];
            if (!file) return;

            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `covers/${fileName}`;

            // 1. Upload file
            const { error: uploadError } = await supabase.storage
                .from('course-covers')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('course-covers')
                .getPublicUrl(filePath);

            setNewCourse(prev => ({ ...prev, capa_url: publicUrl }));
            alert("Imagem enviada com sucesso!");
        } catch (error) {
            alert("Erro no upload: " + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);

            if (editingDemo) {
                setDemoCover(editingId, newCourse);
                setIsModalOpen(false);
                setDemoTick(t => t + 1);
                return;
            }

            // `capa_zoom` precisa existir na tabela `cursos`. Se ainda não existir, salva sem ele e avisa.
            const saveWithZoomFallback = async (run) => {
                let { error } = await run(newCourse);
                if (error && /capa_zoom/i.test(error.message || '')) {
                    const { capa_zoom, ...semZoom } = newCourse; // eslint-disable-line no-unused-vars
                    ({ error } = await run(semZoom));
                    if (!error) alert('Curso salvo, mas o ZOOM da capa não foi gravado: falta a coluna "capa_zoom" na tabela cursos (veja o SQL de migração).');
                }
                return error;
            };

            if (editingId) {
                const error = await saveWithZoomFallback((payload) => supabase.from('cursos').update(payload).eq('id', editingId));
                if (error) throw error;
                alert("Curso atualizado com sucesso!");
            } else {
                let createdCourse = null;
                const error = await saveWithZoomFallback(async (payload) => {
                    const res = await supabase.from('cursos').insert([payload]).select().single();
                    createdCourse = res.data;
                    return res;
                });

                if (error) throw error;

                // Create default modules like HARMONIA
                const defaultModules = [
                    { titulo: 'INTRODUÇÃO', ordem: 1, curso_id: createdCourse.id },
                    { titulo: 'INTERMEDIÁRIO', ordem: 2, curso_id: createdCourse.id },
                    { titulo: 'AVANÇADO', ordem: 3, curso_id: createdCourse.id },
                    { titulo: 'BÔNUS', ordem: 4, curso_id: createdCourse.id }
                ];

                const { error: modError } = await supabase
                    .from('modulos')
                    .insert(defaultModules);

                if (modError) console.error("Erro ao criar módulos padrão:", modError);

                alert("Curso criado com sucesso com módulos padrão!");
            }

            setIsModalOpen(false);
            fetchCourses();
        } catch (error) {
            alert("Erro ao processar: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (e, course) => {
        e.stopPropagation();
        setCourseToDelete(course);
    };

    const confirmDelete = async () => {
        if (!courseToDelete) return;
        try {
            setLoading(true);
            setCourseToDelete(null);
            const { error } = await supabase.from('cursos').delete().eq('id', courseToDelete.id);
            if (error) throw error;
            alert("Curso removido com sucesso!");
            fetchCourses();
        } catch (err) {
            alert("Erro ao deletar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Cursos de demonstração (locais) aparecem junto com os reais, marcados como DEMO
    const demoCourses = DEMO_COURSES.map(c => ({
        ...withDemoCover({ id: c.id }),
        id: c.id,
        titulo: c.titulo,
        descricao: c.descricao,
        capa_url: c.capa_url,
        is_demo: true,
        total_aulas: c.modulos.reduce((n, m) => n + m.aulas.length, 0),
        total_alunos: DEMO_STUDENTS.filter(st => getDemoEnrollments(st.id).some(e => e.curso_id === c.id)).length,
    }));

    // Mesma animação dos cards da Área do Aluno: entrada escalonada + zoom suave no hover
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
    };
    const cardVariants = {
        hidden: { opacity: 0, y: 20, scale: 0.95 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] } },
    };

    const filteredCourses = [...courses, ...demoCourses].filter(c =>
        c.titulo?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-text">Gestão de Cursos</h2>
                    <p className="text-text-muted">Adicione, edite ou remova seus cursos da plataforma.</p>
                </div>
                <Button onClick={() => openModal()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Curso
                </Button>
            </div>

            <div className="glass flex items-center gap-4 p-4 rounded-lg">
                <Search className="h-5 w-5 text-text-muted" />
                <Input
                    placeholder="Buscar por título do curso..."
                    className="bg-transparent border-none focus-visible:ring-0 px-0 h-auto"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
                {loading && courses.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-text-muted">Carregando cursos...</div>
                ) : filteredCourses.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-text-muted">Nenhum curso encontrado.</div>
                ) : (
                    filteredCourses.map((course) => (
                        <motion.div key={course.id} variants={cardVariants} className="group perspective-1000">
                        <Card className="card-3d liquid-glass rounded-[2rem] overflow-hidden transition-transform duration-500 hover:scale-[1.02] h-full">
                            <div className="aspect-video bg-black/40 relative overflow-hidden">
                                {course.capa_url ? (
                                    <img
                                        src={course.capa_url}
                                        alt={course.titulo}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        style={coverStyle(course)}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-text-muted">
                                        <ImageIcon className="h-10 w-10" />
                                    </div>
                                )}
                                {course.is_demo && (
                                    <span className="absolute top-2 left-2 rounded bg-primary text-black px-2 py-0.5 text-[10px] font-black tracking-widest">DEMO</span>
                                )}
                                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {course.is_demo ? (
                                        <>
                                            <Button variant="secondary" size="icon" className="h-8 w-8 text-primary" title="Visualizar curso (demo)" onClick={() => navigate(`/student/course/${course.id}`)}>
                                                <Book className="h-4 w-4" />
                                            </Button>
                                            <Button variant="secondary" size="icon" className="h-8 w-8" title="Ajustar capa" onClick={() => openModal(course)}>
                                                <ImageIcon className="h-4 w-4" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button variant="secondary" size="icon" className="h-8 w-8 text-primary" title="Gerenciar Conteúdo" onClick={() => navigate(`/admin/courses/${course.id}/content`)}>
                                                <Book className="h-4 w-4" />
                                            </Button>
                                            <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => openModal(course)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="secondary" size="icon" className="h-8 w-8 text-red-500" onClick={(e) => handleDeleteClick(e, course)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <CardContent className="p-4">
                                <h3 className="text-lg font-bold text-text truncate">{course.titulo}</h3>
                                <p className="text-sm text-text-muted line-clamp-2 mt-1 h-10">{course.descricao || 'Sem descrição'}</p>
                                {course.is_demo && (
                                    <p className="mt-2 text-[11px] text-text-muted">{course.total_aulas} aulas · {course.total_alunos} aluno(s) com acesso</p>
                                )}
                            </CardContent>
                        </Card>
                        </motion.div>
                    ))
                )}
            </motion.div>

            {/* Modal de Cadastro/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="w-full max-w-lg border-primary/30 max-h-[90vh] flex flex-col">
                        <CardHeader className="flex flex-row justify-between items-center border-b border-border/50">
                            <CardTitle>{editingDemo ? 'Ajustar capa (curso demo)' : editingId ? 'Editar Curso' : 'Novo Curso'}</CardTitle>
                            <button onClick={() => setIsModalOpen(false)}><X className="h-5 w-5 text-text-muted hover:text-primary transition-colors" /></button>
                        </CardHeader>
                        <CardContent className="overflow-y-auto flex-1">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Título do Curso</label>
                                    <Input placeholder="Ex: Piano Popular I" required disabled={editingDemo} value={newCourse.titulo} onChange={e => setNewCourse({ ...newCourse, titulo: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Descrição</label>
                                    <textarea
                                        disabled={editingDemo}
                                        className="w-full min-h-[100px] bg-black/20 backdrop-blur-md border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-text"
                                        placeholder="Breve descrição do curso..."
                                        value={newCourse.descricao}
                                        onChange={e => setNewCourse({ ...newCourse, descricao: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Capa do Curso</label>

                                    {newCourse.capa_url ? (
                                        <>
                                            <CoverCropper
                                                src={newCourse.capa_url}
                                                value={{ x: newCourse.capa_posicao_x, y: newCourse.capa_posicao_y, zoom: newCourse.capa_zoom }}
                                                onChange={(v) => setNewCourse(prev => ({ ...prev, capa_posicao_x: v.x, capa_posicao_y: v.y, capa_zoom: v.zoom }))}
                                            />
                                            {!editingDemo && (
                                                <div className="flex gap-2">
                                                    <label className="cursor-pointer inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-black hover:bg-primary-hover transition-colors">
                                                        <Upload className="h-4 w-4" />
                                                        {uploading ? 'Enviando...' : 'Trocar imagem'}
                                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                                    </label>
                                                    <Button type="button" variant="secondary" size="sm" className="text-red-500" onClick={() => setNewCourse(prev => ({ ...prev, capa_url: '', capa_posicao_x: 50, capa_posicao_y: 50, capa_zoom: 1 }))}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="relative aspect-video w-full bg-black/40 border-2 border-dashed border-border rounded-lg overflow-hidden transition-all hover:border-primary/50">
                                            <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                                                <div className="bg-primary/10 p-4 rounded-full mb-2">
                                                    <Upload className="h-8 w-8 text-primary" />
                                                </div>
                                                <span className="text-sm font-bold text-text">Fazer Upload da Capa</span>
                                                <span className="text-[10px] text-text-muted mt-1 uppercase tracking-wider">Recomendado: 1280x720 (16:9)</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                            </label>
                                            {uploading && (
                                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 z-10">
                                                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                                    <span className="text-xs text-primary font-bold animate-pulse">ENVIANDO...</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                                    <Button type="submit" isLoading={loading}>{editingDemo ? 'Salvar enquadramento' : editingId ? 'Salvar Alterações' : 'Criar Curso'}</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Modal de Confirmação de Exclusão */}
            {courseToDelete && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="w-full max-w-md border-red-500/30">
                        <CardHeader className="border-b border-border/50">
                            <CardTitle className="text-red-500">Confirmar Exclusão</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <p className="text-text">
                                Tem certeza que deseja apagar o curso <strong className="text-primary">"{courseToDelete.titulo}"</strong>?
                            </p>
                            <p className="text-sm text-text-muted">
                                Isso pode afetar as inscrições dos alunos. Esta ação não pode ser desfeita.
                            </p>
                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="ghost" onClick={() => setCourseToDelete(null)}>Cancelar</Button>
                                <Button
                                    className="bg-red-500 text-white hover:bg-red-600 shadow-none"
                                    onClick={confirmDelete}
                                    isLoading={loading}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Excluir Curso
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
