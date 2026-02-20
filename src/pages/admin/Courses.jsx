import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Plus, Search, Book, Pencil, Trash2, X, Image as ImageIcon, Upload } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Courses() {
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [newCourse, setNewCourse] = useState({ titulo: '', descricao: '', capa_url: '', capa_posicao_y: 50, capa_posicao_x: 50 });
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
            setNewCourse({
                titulo: course.titulo || '',
                descricao: course.descricao || '',
                capa_url: course.capa_url || '',
                capa_posicao_y: course.capa_posicao_y ?? 50,
                capa_posicao_x: course.capa_posicao_x ?? 50
            });
        } else {
            setEditingId(null);
            setNewCourse({ titulo: '', descricao: '', capa_url: '', capa_posicao_y: 50, capa_posicao_x: 50 });
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

            if (editingId) {
                const { error } = await supabase
                    .from('cursos')
                    .update(newCourse)
                    .eq('id', editingId);
                if (error) throw error;
                alert("Curso atualizado com sucesso!");
            } else {
                const { data: createdCourse, error } = await supabase
                    .from('cursos')
                    .insert([newCourse])
                    .select()
                    .single();

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

    const filteredCourses = courses.filter(c =>
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

            <div className="flex items-center gap-4 bg-surface p-4 rounded-lg border border-border">
                <Search className="h-5 w-5 text-text-muted" />
                <Input
                    placeholder="Buscar por título do curso..."
                    className="bg-transparent border-none focus-visible:ring-0 px-0 h-auto"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading && courses.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-text-muted">Carregando cursos...</div>
                ) : filteredCourses.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-text-muted">Nenhum curso encontrado.</div>
                ) : (
                    filteredCourses.map((course) => (
                        <Card key={course.id} className="overflow-hidden group border-border hover:border-primary/50 transition-all card-3d">
                            <div className="aspect-video bg-black/40 relative">
                                {course.capa_url ? (
                                    <img
                                        src={course.capa_url}
                                        alt={course.titulo}
                                        className="w-full h-full object-cover transition-all duration-500"
                                        style={{ objectPosition: `${course.capa_posicao_x || 50}% ${course.capa_posicao_y || 50}%` }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-text-muted">
                                        <ImageIcon className="h-10 w-10" />
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="secondary" size="icon" className="h-8 w-8 text-primary" title="Gerenciar Conteúdo" onClick={() => navigate(`/admin/courses/${course.id}/content`)}>
                                        <Book className="h-4 w-4" />
                                    </Button>
                                    <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => openModal(course)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="secondary" size="icon" className="h-8 w-8 text-red-500" onClick={(e) => handleDeleteClick(e, course)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <CardContent className="p-4">
                                <h3 className="text-lg font-bold text-text truncate">{course.titulo}</h3>
                                <p className="text-sm text-text-muted line-clamp-2 mt-1 h-10">{course.descricao || 'Sem descrição'}</p>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Modal de Cadastro/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="w-full max-w-lg border-primary/30 max-h-[90vh] flex flex-col">
                        <CardHeader className="flex flex-row justify-between items-center border-b border-border/50">
                            <CardTitle>{editingId ? 'Editar Curso' : 'Novo Curso'}</CardTitle>
                            <button onClick={() => setIsModalOpen(false)}><X className="h-5 w-5 text-text-muted hover:text-primary transition-colors" /></button>
                        </CardHeader>
                        <CardContent className="overflow-y-auto flex-1">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Título do Curso</label>
                                    <Input placeholder="Ex: Piano Popular I" required value={newCourse.titulo} onChange={e => setNewCourse({ ...newCourse, titulo: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Descrição</label>
                                    <textarea
                                        className="w-full min-h-[100px] bg-surface border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-text"
                                        placeholder="Breve descrição do curso..."
                                        value={newCourse.descricao}
                                        onChange={e => setNewCourse({ ...newCourse, descricao: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Capa do Curso</label>

                                    <div className="relative aspect-video w-full bg-black/40 border-2 border-dashed border-border rounded-lg overflow-hidden group/image transition-all hover:border-primary/50">
                                        {newCourse.capa_url ? (
                                            <>
                                                <img
                                                    src={newCourse.capa_url}
                                                    alt="Capa"
                                                    className="w-full h-full object-cover transition-all"
                                                    style={{ objectPosition: `${newCourse.capa_posicao_x}% ${newCourse.capa_posicao_y}%` }}
                                                />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <label className="cursor-pointer bg-primary text-black px-4 py-2 rounded-md text-xs font-bold hover:scale-105 transition-transform flex items-center gap-2">
                                                        <Upload className="h-4 w-4" />
                                                        Trocar Imagem
                                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                                    </label>
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        type="button"
                                                        className="bg-red-500/20 text-red-500 hover:bg-red-500/40 border-none"
                                                        onClick={() => setNewCourse(prev => ({ ...prev, capa_url: '' }))}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                                                <div className="bg-primary/10 p-4 rounded-full mb-2">
                                                    <Upload className="h-8 w-8 text-primary" />
                                                </div>
                                                <span className="text-sm font-bold text-text">Fazer Upload da Capa</span>
                                                <span className="text-[10px] text-text-muted mt-1 uppercase tracking-wider">Recomendado: 1280x720 (16:9)</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                            </label>
                                        )}

                                        {uploading && (
                                            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 z-10">
                                                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                                <span className="text-xs text-primary font-bold animate-pulse">ENVIANDO...</span>
                                            </div>
                                        )}
                                    </div>

                                    {newCourse.capa_url && (
                                        <div className="bg-black/20 p-3 rounded-lg border border-border mt-2 space-y-4">
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center text-[10px] text-text-muted uppercase font-bold tracking-widest">
                                                    <span>Ajuste Horizontal</span>
                                                    <span className="text-primary">{newCourse.capa_posicao_x}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={newCourse.capa_posicao_x}
                                                    onChange={(e) => setNewCourse(prev => ({ ...prev, capa_posicao_x: parseInt(e.target.value) }))}
                                                    className="w-full accent-primary cursor-pointer"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center text-[10px] text-text-muted uppercase font-bold tracking-widest">
                                                    <span>Ajuste Vertical</span>
                                                    <span className="text-primary">{newCourse.capa_posicao_y}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={newCourse.capa_posicao_y}
                                                    onChange={(e) => setNewCourse(prev => ({ ...prev, capa_posicao_y: parseInt(e.target.value) }))}
                                                    className="w-full accent-primary cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-[10px] text-text-muted italic text-center">Use os controles acima para enquadrar a imagem.</p>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                                    <Button type="submit" isLoading={loading}>{editingId ? 'Salvar Alterações' : 'Criar Curso'}</Button>
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
