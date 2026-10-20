import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Plus, Search, MoreVertical, ShieldCheck, ShieldOff, Calendar, UserPlus, Pencil, X, Trash2, LogIn } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DEMO_COURSES, DEMO_STUDENTS, DEMO_PASSWORD, getDemoEnrollments, setDemoEnrollments, readDemoProgress, accessStatus, accessLabel, addDaysISO } from '../../lib/demoCourses';

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
    const [demoTick, setDemoTick] = useState(0); // força releitura dos alunos demo após editar acesso
    const [demoEditing, setDemoEditing] = useState(null); // aluno demo em edição de acesso
    const [demoDraft, setDemoDraft] = useState([]);
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

    // ── Alunos de demonstração (locais) ──
    const demoStudents = DEMO_STUDENTS.map(st => {
        const prog = readDemoProgress(st.id);
        return {
            ...st,
            is_demo: true,
            cursos_info: getDemoEnrollments(st.id).map(e => {
                const c = DEMO_COURSES.find(x => x.id === e.curso_id);
                const aulas = c ? c.modulos.flatMap(m => m.aulas) : [];
                const done = aulas.filter(a => prog[a.id]?.concluida).length;
                return {
                    ...e,
                    titulo: c?.titulo || e.curso_id,
                    status: accessStatus(e),
                    percent: aulas.length ? Math.round((done / aulas.length) * 100) : 0,
                };
            }),
        };
    });

    const impersonateDemo = (st) => {
        localStorage.setItem('rf_role', 'student');
        localStorage.setItem('rf_user_id', st.id);
        localStorage.setItem('rf_user_email', st.email);
        localStorage.setItem('rf_user_name', st.nome_completo);
        navigate('/student');
    };

    const openDemoAccess = (st) => {
        setDemoEditing(st);
        setDemoDraft(getDemoEnrollments(st.id));
    };

    const saveDemoAccess = () => {
        setDemoEnrollments(demoEditing.id, demoDraft);
        setDemoEditing(null);
        setDemoTick(t => t + 1);
    };

    // Bloqueio manual de todas as matrículas do aluno (ou desbloqueio, se já estiver tudo bloqueado)
    const toggleDemoBlock = (st) => {
        const enr = getDemoEnrollments(st.id);
        if (enr.length === 0) return;
        const allBlocked = enr.every(e => e.bloqueado);
        setDemoEnrollments(st.id, enr.map(e => ({ ...e, bloqueado: !allBlocked })));
        setDemoTick(t => t + 1);
    };

    const patchDraft = (cursoId, patch) =>
        setDemoDraft(d => d.map(e => e.curso_id === cursoId ? { ...e, ...patch } : e));

    const filteredDemoStudents = demoStudents.filter(s =>
        s.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6" data-demo-tick={demoTick}>
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

            <div className="glass flex items-center gap-4 p-4 rounded-lg">
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
                            ) : (filteredStudents || []).length === 0 && filteredDemoStudents.length === 0 ? (
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
                            {filteredDemoStudents.map((st) => (
                                <tr key={st.id} className="border-b border-border hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-text">
                                        <div className="flex flex-col">
                                            <span className="flex items-center gap-2">
                                                {st.nome_completo}
                                                <span className="rounded bg-primary text-black px-1.5 py-0.5 text-[9px] font-black tracking-widest">DEMO</span>
                                            </span>
                                            <span className="text-[10px] text-text-muted">{st.email} · senha: {DEMO_PASSWORD}</span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {st.cursos_info.length === 0 && <span className="text-[9px] text-text-muted italic">Sem acesso a nenhum curso</span>}
                                                {st.cursos_info.map(ci => (
                                                    <span key={ci.curso_id} className={cn(
                                                        "text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1",
                                                        ci.status === 'ativo' ? "bg-primary/10 text-primary border-primary/20" : "bg-red-500/10 text-red-400 border-red-500/30"
                                                    )}>
                                                        {ci.titulo}
                                                        <span className="font-bold opacity-70">({ci.percent}%)</span>
                                                        <span className="opacity-80">· {ci.status === 'bloqueado' ? 'Bloqueado' : ci.status === 'expirado' ? accessLabel(ci.expira_em) : accessLabel(ci.expira_em)}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            const enr = st.cursos_info;
                                            const active = enr.filter(e => e.status === 'ativo').length;
                                            const label = enr.length === 0 ? 'Sem cursos' : active === enr.length ? 'Ativo' : active === 0 ? 'Bloqueado' : 'Parcial';
                                            return (
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                                    label === 'Ativo' ? "bg-green-900/30 text-green-400 border-green-900" : label === 'Parcial' ? "bg-yellow-900/30 text-yellow-400 border-yellow-900" : "bg-red-900/30 text-red-400 border-red-900"
                                                )}>{label}</span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 text-text-muted text-xs">
                                        {st.cursos_info.length === 0 ? '—' : st.cursos_info.every(e => !e.expira_em) ? 'Vitalício' : 'Por curso'}
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <Button variant="ghost" size="icon" title="Editar acesso, expiração e bloqueio" onClick={() => openDemoAccess(st)}>
                                            <Pencil className="h-4 w-4 text-primary" />
                                        </Button>
                                        <Button variant="ghost" size="icon"
                                            title={st.cursos_info.length > 0 && st.cursos_info.every(e => e.bloqueado) ? 'Desbloquear aluno' : 'Bloquear aluno (todos os cursos)'}
                                            onClick={() => toggleDemoBlock(st)}>
                                            {st.cursos_info.length > 0 && st.cursos_info.every(e => e.bloqueado)
                                                ? <ShieldCheck className="h-4 w-4 text-green-500" />
                                                : <ShieldOff className="h-4 w-4 text-red-500" />}
                                        </Button>
                                        <Button variant="ghost" size="icon" title="Entrar como este aluno (teste)" onClick={() => impersonateDemo(st)}>
                                            <LogIn className="h-4 w-4 text-green-500" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
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
                                        <Input type="date" value={newStudent.data_expiracao ? String(newStudent.data_expiracao).slice(0, 10) : ''} onChange={e => setNewStudent({ ...newStudent, data_expiracao: e.target.value })} />
                                        <div className="flex gap-2 pt-1">
                                            <button type="button" onClick={() => setNewStudent({ ...newStudent, data_expiracao: addDaysISO(30).slice(0, 10) })}
                                                className="text-xs px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors">+30 dias</button>
                                            <button type="button" onClick={() => setNewStudent({ ...newStudent, data_expiracao: '' })}
                                                className="text-xs px-2.5 py-1 rounded-md border border-border text-text-muted hover:bg-white/5 transition-colors">Vitalício</button>
                                        </div>
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
            {/* Modal: cursos, expiração e bloqueio (aluno demo) */}
            {demoEditing && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-xl border-primary/30 max-h-[90vh] flex flex-col">
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>Acesso de {demoEditing.nome_completo}</CardTitle>
                            <button onClick={() => setDemoEditing(null)}><X className="h-5 w-5 text-text-muted" /></button>
                        </CardHeader>
                        <CardContent className="space-y-4 overflow-y-auto">
                            <div className="space-y-3">
                                {DEMO_COURSES.map(c => {
                                    const enr = demoDraft.find(e => e.curso_id === c.id);
                                    const status = enr ? accessStatus(enr) : null;
                                    return (
                                        <div key={c.id} className="rounded-md border border-border bg-black/20 p-3 space-y-3">
                                            <label className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                                                <span className="flex items-center gap-2 hover:text-primary transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        className="accent-primary"
                                                        checked={!!enr}
                                                        onChange={e => setDemoDraft(e.target.checked
                                                            ? [...demoDraft, { curso_id: c.id, expira_em: null, bloqueado: false }]
                                                            : demoDraft.filter(x => x.curso_id !== c.id))}
                                                    />
                                                    {c.titulo}
                                                </span>
                                                {enr && (
                                                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", status === 'ativo' ? 'text-green-400' : 'text-red-400')}>
                                                        {status === 'ativo' ? accessLabel(enr.expira_em) : status === 'bloqueado' ? 'Bloqueado' : accessLabel(enr.expira_em)}
                                                    </span>
                                                )}
                                            </label>

                                            {enr && (
                                                <div className="flex flex-wrap items-center gap-2 pl-6">
                                                    <span className="text-[10px] uppercase tracking-wider text-text-muted">Expiração</span>
                                                    <button type="button" onClick={() => patchDraft(c.id, { expira_em: addDaysISO(30) })}
                                                        className="text-xs px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors">30 dias</button>
                                                    <button type="button" onClick={() => patchDraft(c.id, { expira_em: null })}
                                                        className="text-xs px-2.5 py-1 rounded-md border border-border text-text-muted hover:bg-white/5 transition-colors">Vitalício</button>
                                                    <input
                                                        type="date"
                                                        className="h-8 rounded-md bg-black/20 backdrop-blur-md border border-border px-2 text-xs text-text"
                                                        value={enr.expira_em ? enr.expira_em.slice(0, 10) : ''}
                                                        onChange={e => patchDraft(c.id, { expira_em: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null })}
                                                    />
                                                    <label className="ml-auto flex items-center gap-2 text-xs cursor-pointer">
                                                        <input type="checkbox" className="accent-red-500" checked={enr.bloqueado} onChange={e => patchDraft(c.id, { bloqueado: e.target.checked })} />
                                                        <span className={enr.bloqueado ? 'text-red-400 font-semibold' : 'text-text-muted'}>Bloquear acesso</span>
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-text-muted italic">Alterações valem só para a demonstração (salvas neste navegador). "30 dias" conta a partir de hoje.</p>
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setDemoEditing(null)}>Cancelar</Button>
                                <Button onClick={saveDemoAccess}>Salvar acesso</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
