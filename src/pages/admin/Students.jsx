import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Plus, Search, MoreVertical, ShieldCheck, ShieldOff, Calendar, UserPlus, Pencil, X, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Students() {
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [newStudent, setNewStudent] = useState({
        nome_completo: '',
        email: '',
        telefone: '',
        data_expiracao: '',
        curso_ids: [],
        senha: ''
    });
    const [courses, setCourses] = useState([]);
    const [lessonStats, setLessonStats] = useState({}); // { curso_id: totalLessons }
    const [aulaIdToCursoId, setAulaIdToCursoId] = useState({}); // { aula_id: curso_id }

    useEffect(() => {
        fetchStudents();
        fetchCourses();
    }, []);

    async function fetchCourses() {
        const { data } = await supabase.from('cursos').select(`
            id, 
            titulo, 
            modulos (
                id,
                aulas (id)
            )
        `);

        const stats = {};
        const mapping = {};

        data?.forEach(course => {
            let total = 0;
            course.modulos?.forEach(mod => {
                total += mod.aulas?.length || 0;
                mod.aulas?.forEach(aula => {
                    mapping[aula.id] = course.id;
                });
            });
            stats[course.id] = total;
        });

        setLessonStats(stats);
        setAulaIdToCursoId(mapping);
        setCourses(data || []);
    }

    async function fetchStudents() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('perfis')
                .select(`
          *,
          inscricoes (
            id,
            status,
            data_expiracao,
            curso_id,
            cursos (titulo)
          ),
          progresso (
            aula_id,
            concluida
          )
        `)
                .order('data_cadastro', { ascending: false });

            if (error) throw error;
            setStudents(data || []);
        } catch (error) {
            console.error('Erro ao buscar alunos:', error);
        } finally {
            setLoading(false);
        }
    }

    const openModal = (student = null) => {
        if (student) {
            const inscr = student.inscricoes?.[0];
            setEditingId(student.id);
            setNewStudent({
                nome_completo: student.nome_completo || '',
                email: student.email || '',
                telefone: student.telefone || '',
                data_expiracao: inscr?.data_expiracao || '',
                curso_ids: student.inscricoes?.map(i => i.curso_id) || [],
                senha: student.senha || ''
            });
        } else {
            setEditingId(null);
            setNewStudent({ nome_completo: '', email: '', telefone: '', data_expiracao: '', curso_ids: [], senha: '' });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);

            if (editingId) {
                // 1. Update Profile
                const { error: pError } = await supabase
                    .from('perfis')
                    .update({
                        nome_completo: newStudent.nome_completo,
                        email: newStudent.email,
                        telefone: newStudent.telefone,
                        senha: newStudent.senha
                    })
                    .eq('id', editingId);

                if (pError) throw pError;

                // 2. Update Inscriptions
                const existingInscriptions = students.find(s => s.id === editingId)?.inscricoes || [];
                const existingCourseIds = existingInscriptions.map(i => i.curso_id);

                // Add new ones
                const idsToAdd = newStudent.curso_ids.filter(id => !existingCourseIds.includes(id));
                if (idsToAdd.length > 0) {
                    const { error: insError } = await supabase
                        .from('inscricoes')
                        .insert(idsToAdd.map(id => ({
                            perfil_id: editingId,
                            curso_id: id,
                            data_expiracao: newStudent.data_expiracao || null,
                            status: 'ativo'
                        })));
                    if (insError) throw insError;
                }

                // Remove deselected
                const idsToRemove = existingCourseIds.filter(id => !newStudent.curso_ids.includes(id));
                if (idsToRemove.length > 0) {
                    const { error: delError } = await supabase
                        .from('inscricoes')
                        .delete()
                        .eq('perfil_id', editingId)
                        .in('curso_id', idsToRemove);
                    if (delError) throw delError;
                }

                // Update expiration date for all current inscriptions
                if (newStudent.curso_ids.length > 0) {
                    await supabase
                        .from('inscricoes')
                        .update({ data_expiracao: newStudent.data_expiracao || null })
                        .eq('perfil_id', editingId);
                }

                alert("Dados do aluno atualizados com sucesso!");
            } else {
                // 1. Create Profile
                const { data: profile, error: pError } = await supabase
                    .from('perfis')
                    .insert([{
                        nome_completo: newStudent.nome_completo,
                        email: newStudent.email,
                        telefone: newStudent.telefone,
                        senha: newStudent.senha
                    }])
                    .select()
                    .single();

                if (pError) throw pError;

                // 2. Create Inscriptions if courses selected
                if (newStudent.curso_ids.length > 0) {
                    const { error: iError } = await supabase
                        .from('inscricoes')
                        .insert(newStudent.curso_ids.map(courseId => ({
                            perfil_id: profile.id,
                            curso_id: courseId,
                            data_expiracao: newStudent.data_expiracao || null,
                            status: 'ativo'
                        })));
                    if (iError) throw iError;
                }

                // 3. Generate WhatsApp Message
                const expirationDate = newStudent.data_expiracao ? new Date(newStudent.data_expiracao).toLocaleDateString() : 'Vitalício';
                const whatsMessage = `Olá ${newStudent.nome_completo}! Boas-vindas à RF MUSIC. Seu acesso ao www.falcotech.com.br/rfcursos está liberado. Usuário: ${newStudent.email}. Senha: ${newStudent.senha}. Acesso válido até: ${expirationDate}.`;

                console.log("WhatsApp Web Link:", `https://wa.me/${newStudent.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsMessage)}`);
                alert("Aluno cadastrado! Mensagem de boas-vindas gerada no console.");
            }

            console.log("Creation/Edit successful, refreshing students list...");
            setIsModalOpen(false);
            fetchStudents();
        } catch (error) {
            console.error("Error in handleSubmit:", error);
            if (error.message?.includes("'senha' column")) {
                alert("⚠️ AÇÃO NECESSÁRIA NO BANCO DE DADOS:\n\nA coluna 'senha' não foi encontrada na tabela 'perfis'.\n\nPara resolver isso, copie e execute este comando no 'SQL Editor' do seu painel Supabase:\n\nALTER TABLE perfis ADD COLUMN senha text;");
            } else {
                alert("Erro ao processar: " + error.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async (student) => {
        const inscricoes = student.inscricoes || [];

        if (inscricoes.length === 0) {
            alert('Este aluno não possui inscrições ativas para bloquear/desbloquear.');
            return;
        }

        try {
            // Verifica o status atual baseado na primeira inscrição
            const currentStatus = inscricoes[0]?.status;
            const newStatus = currentStatus === 'bloqueado' ? 'ativo' : 'bloqueado';

            // Atualiza TODAS as inscrições do aluno de uma vez
            const { error } = await supabase
                .from('inscricoes')
                .update({ status: newStatus })
                .eq('perfil_id', student.id);

            if (error) throw error;
            fetchStudents();
        } catch (err) {
            alert('Erro ao alterar status: ' + err.message);
        }
    };

    const handleDelete = async (student) => {
        const confirmed = window.confirm(`Tem certeza que deseja apagar os dados de ${student.nome_completo}? Esta ação não pode ser desfeita.`);

        if (confirmed) {
            try {
                setLoading(true);

                // 1. Delete associated data first (Cascade simulation if RLS doesn't do it)
                // Delete inscriptions
                await supabase.from('inscricoes').delete().eq('perfil_id', student.id);
                // Delete progress records
                await supabase.from('progresso').delete().eq('perfil_id', student.id);

                // 2. Delete Profile
                const { error } = await supabase.from('perfis').delete().eq('id', student.id);

                if (error) throw error;

                alert("Aluno removido com sucesso!");
                fetchStudents();
            } catch (err) {
                alert("Erro ao deletar: " + err.message);
            } finally {
                setLoading(false);
            }
        }
    };

    const filteredStudents = students.filter(s =>
        s.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-text">Gestão de Alunos</h2>
                    <p className="text-text-muted">Gerencie o acesso e progresso dos seus alunos.</p>
                </div>
                <Button onClick={() => openModal()}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Cadastrar Aluno
                </Button>
            </div>

            <div className="flex items-center gap-4 bg-surface p-4 rounded-lg border border-border">
                <Search className="h-5 w-5 text-text-muted" />
                <Input
                    placeholder="Buscar por nome ou email..."
                    className="bg-transparent border-none focus-visible:ring-0 px-0 h-auto"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-text-muted uppercase bg-black/20">
                            <tr>
                                <th className="px-6 py-3">Nome / E-mail</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Expiração</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && students.length === 0 ? (
                                <tr><td colSpan="4" className="text-center py-8">Carregando...</td></tr>
                            ) : (filteredStudents || []).length === 0 ? (
                                <tr><td colSpan="4" className="text-center py-8 text-text-muted">Nenhum aluno encontrado.</td></tr>
                            ) : (
                                (filteredStudents || []).map((student) => {
                                    if (!student) return null;
                                    const activeInscr = student.inscricoes?.[0];
                                    const isExpired = activeInscr?.data_expiracao && new Date(activeInscr.data_expiracao) < new Date();
                                    const status = activeInscr?.status === 'bloqueado' || isExpired ? 'Bloqueado' : 'Ativo';

                                    return (
                                        <tr key={student.id} className="border-b border-border hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4 font-medium text-text">
                                                <div className="flex flex-col">
                                                    <span>{student.nome_completo || 'Sem Nome'}</span>
                                                    <span className="text-[10px] text-text-muted">{student.email}</span>
                                                    {student.inscricoes?.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {student.inscricoes.map(ins => {
                                                                // Calculate progress for this specific course
                                                                const courseId = ins.curso_id;
                                                                const totalAulas = lessonStats[courseId] || 0;

                                                                // Count completed lessons for THIS user in THIS course
                                                                const completedInCourse = student.progresso?.filter(p =>
                                                                    p.concluida && aulaIdToCursoId[p.aula_id] === courseId
                                                                ).length || 0;

                                                                const percent = totalAulas > 0 ? Math.round((completedInCourse / totalAulas) * 100) : 0;

                                                                return (
                                                                    <span key={ins.id} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 flex items-center gap-1">
                                                                        {ins.cursos?.titulo}
                                                                        <span className="font-bold opacity-70">({percent}%)</span>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                                    status === 'Ativo' ? "bg-green-900/30 text-green-400 border-green-900" : "bg-red-900/30 text-red-400 border-red-900"
                                                )}>
                                                    {status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-text-muted">
                                                {activeInscr?.data_expiracao ? new Date(activeInscr.data_expiracao).toLocaleDateString() : 'Vitalício'}
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <Button variant="ghost" size="icon" onClick={() => openModal(student)}>
                                                    <Pencil className="h-4 w-4 text-primary" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => toggleStatus(student)}
                                                    title={status === 'Ativo' ? 'Bloquear aluno' : 'Desbloquear aluno'}
                                                >
                                                    {status === 'Ativo'
                                                        ? <ShieldOff className="h-4 w-4 text-red-500" />
                                                        : <ShieldCheck className="h-4 w-4 text-green-500" />
                                                    }
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(student)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Modal de Cadastro/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-lg border-primary/30">
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>{editingId ? 'Editar Aluno' : 'Novo Aluno'}</CardTitle>
                            <button onClick={() => setIsModalOpen(false)}><X className="h-5 w-5 text-text-muted" /></button>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <Input placeholder="Nome Completo" required value={newStudent.nome_completo} onChange={e => setNewStudent({ ...newStudent, nome_completo: e.target.value })} />
                                <Input placeholder="E-mail" type="email" required value={newStudent.email} onChange={e => setNewStudent({ ...newStudent, email: e.target.value })} />
                                <Input placeholder="Telefone (WhatsApp)" value={newStudent.telefone} onChange={e => setNewStudent({ ...newStudent, telefone: e.target.value })} />
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Senha de Acesso</label>
                                    <Input
                                        placeholder="Defina a senha do aluno"
                                        type="text"
                                        required={!editingId}
                                        value={newStudent.senha}
                                        onChange={e => setNewStudent({ ...newStudent, senha: e.target.value })}
                                    />
                                    {editingId && <p className="text-[10px] text-text-muted italic">Deixe como está ou mude para alterar a senha do aluno.</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-text-muted">Expiração de Acesso</label>
                                        <Input type="date" value={newStudent.data_expiracao} onChange={e => setNewStudent({ ...newStudent, data_expiracao: e.target.value })} />
                                    </div>
                                    <div className="col-span-2 space-y-2">
                                        <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Cursos com Acesso</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/20 p-3 rounded-md border border-border max-h-[150px] overflow-y-auto">
                                            {courses.map(c => (
                                                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        className="accent-primary"
                                                        checked={newStudent.curso_ids.includes(c.id)}
                                                        onChange={e => {
                                                            const ids = e.target.checked
                                                                ? [...newStudent.curso_ids, c.id]
                                                                : newStudent.curso_ids.filter(id => id !== c.id);
                                                            setNewStudent({ ...newStudent, curso_ids: ids });
                                                        }}
                                                    />
                                                    {c.titulo}
                                                </label>
                                            ))}
                                            {courses.length === 0 && <p className="text-xs text-text-muted italic">Nenhum curso cadastrado.</p>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                                    <Button type="submit" isLoading={loading}>{editingId ? 'Salvar Alterações' : 'Cadastrar e Liberar'}</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
