import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import StudentsList from '../../components/StudentsList';
import { Plus, Search, MoreVertical, ShieldCheck, ShieldOff, Calendar, UserPlus, Pencil, X, Trash2, LogIn } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DEMO_COURSES, DEMO_STUDENTS, DEMO_PASSWORD, getDemoEnrollments, setDemoEnrollments, readDemoProgress, accessStatus, accessLabel, addDaysISO } from '../../lib/demoCourses';

// Criar/editar/excluir contas exige service_role: roda na Edge Function `admin-students` (só responde a administradores).
async function callAdmin(action, payload) {
    const { data, error } = await supabase.functions.invoke('admin-students', { body: { action, ...payload } });
    if (error) {
        // 401/403: a sessão deste navegador não vale mais como administrador (expirou ou é anterior a uma troca de conta)
        if ([401, 403].includes(error.context?.status)) {
            await signOut();
            alert('Sua sessão expirou. Entre novamente para continuar.');
            window.location.assign('/login');
            throw new Error('Sessão expirada');
        }
        let msg = error.message;
        try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* mantém a mensagem */ }
        throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
}

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
    const [credentials, setCredentials] = useState(null); // acesso recém-criado (senha temporária mostrada uma vez)
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
                senha: '' // a senha nunca é lida nem exibida; aqui só se define uma nova
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
                const current = students.find(s => s.id === editingId);
                // 1. Conta e perfil (e-mail e senha só mudam pela função)
                await callAdmin('update', {
                    id: editingId,
                    nome_completo: newStudent.nome_completo,
                    telefone: newStudent.telefone,
                    email: newStudent.email && newStudent.email !== current?.email ? newStudent.email : undefined,
                    password: newStudent.senha || undefined,
                });

                // 2. Matrículas (o administrador escreve direto, pela regra de acesso do banco)
                const existingInscriptions = current?.inscricoes || [];
                const existingCourseIds = existingInscriptions.map(i => i.curso_id);

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

                const idsToRemove = existingCourseIds.filter(id => !newStudent.curso_ids.includes(id));
                if (idsToRemove.length > 0) {
                    const { error: delError } = await supabase
                        .from('inscricoes')
                        .delete()
                        .eq('perfil_id', editingId)
                        .in('curso_id', idsToRemove);
                    if (delError) throw delError;
                }

                if (newStudent.curso_ids.length > 0) {
                    await supabase
                        .from('inscricoes')
                        .update({ data_expiracao: newStudent.data_expiracao || null })
                        .eq('perfil_id', editingId);
                }

                alert("Dados do aluno atualizados com sucesso!");
            } else {
                const res = await callAdmin('create', {
                    nome_completo: newStudent.nome_completo,
                    email: newStudent.email,
                    telefone: newStudent.telefone,
                    password: newStudent.senha || undefined,
                    cursos: newStudent.curso_ids.map(id => ({ curso_id: id, data_expiracao: newStudent.data_expiracao || null, status: 'ativo' })),
                });

                // Mensagem de boas-vindas: a senha é a que você digitou ou a temporária gerada agora (aparece só desta vez)
                const senha = newStudent.senha || res.senha_temporaria;
                const expirationDate = newStudent.data_expiracao ? new Date(newStudent.data_expiracao + 'T12:00:00').toLocaleDateString('pt-BR') : 'Vitalício';
                const message = `Olá ${newStudent.nome_completo}! Boas-vindas à RF MUSIC. Seu acesso ao ${window.location.origin} está liberado. Usuário: ${newStudent.email}. Senha temporária: ${senha}. Você pode trocá-la depois em "Meu perfil" ou em "Esqueci minha senha". Acesso válido até: ${expirationDate}.`;
                const phone = (newStudent.telefone || '').replace(/\D/g, '');
                setCredentials({ nome: newStudent.nome_completo, email: newStudent.email, senha, message, link: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null });
            }

            setIsModalOpen(false);
            fetchStudents();
        } catch (error) {
            console.error("Error in handleSubmit:", error);
            if (error.message !== 'Sessão expirada') alert("Erro ao processar: " + error.message);
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
        const confirmed = window.confirm(`Tem certeza que deseja apagar a conta e os dados de ${student.nome_completo}? Esta ação não pode ser desfeita.`);

        if (confirmed) {
            try {
                setLoading(true);
                await callAdmin('delete', { id: student.id }); // apaga progresso, matrículas, perfil e a conta de acesso
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
        localStorage.setItem('rf_return_admin', '1'); // permite voltar ao painel admin depois
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

    // Uma única lista alimenta a tabela (computador) e os cartões (celular)
    const rows = [
        ...(filteredStudents || []).filter(Boolean).map((student) => {
            const activeInscr = student.inscricoes?.[0];
            const isExpired = activeInscr?.data_expiracao && new Date(activeInscr.data_expiracao) < new Date();
            const status = activeInscr?.status === 'bloqueado' || isExpired ? 'Bloqueado' : 'Ativo';
            const ativo = status === 'Ativo';
            return {
                key: student.id,
                nome: student.nome_completo || 'Sem Nome',
                email: student.email,
                demo: false,
                chips: (student.inscricoes || []).map((ins) => {
                    const total = lessonStats[ins.curso_id] || 0;
                    const feitas = student.progresso?.filter((p) => p.concluida && aulaIdToCursoId[p.aula_id] === ins.curso_id).length || 0;
                    return { key: ins.id, titulo: ins.cursos?.titulo, percent: total > 0 ? Math.round((feitas / total) * 100) : 0, tone: 'ok' };
                }),
                semCursos: false,
                statusLabel: status,
                statusTone: ativo ? 'ok' : 'bad',
                expira: activeInscr?.data_expiracao ? new Date(activeInscr.data_expiracao).toLocaleDateString() : 'Vitalício',
                acoes: [
                    { key: 'edit', label: 'Editar', title: 'Editar aluno', Icon: Pencil, cor: 'text-primary', onClick: () => openModal(student) },
                    { key: 'toggle', label: ativo ? 'Bloquear' : 'Liberar', title: ativo ? 'Bloquear aluno' : 'Desbloquear aluno', Icon: ativo ? ShieldOff : ShieldCheck, cor: ativo ? 'text-red-500' : 'text-green-500', onClick: () => toggleStatus(student) },
                    { key: 'del', label: 'Excluir', title: 'Excluir aluno', Icon: Trash2, cor: 'text-red-500', onClick: () => handleDelete(student) },
                ],
            };
        }),
        ...filteredDemoStudents.map((st) => {
            const enr = st.cursos_info;
            const ativos = enr.filter((e) => e.status === 'ativo').length;
            const label = enr.length === 0 ? 'Sem cursos' : ativos === enr.length ? 'Ativo' : ativos === 0 ? 'Bloqueado' : 'Parcial';
            const todosBloqueados = enr.length > 0 && enr.every((e) => e.bloqueado);
            return {
                key: st.id,
                nome: st.nome_completo,
                email: `${st.email} · senha: ${DEMO_PASSWORD}`,
                demo: true,
                chips: enr.map((ci) => ({
                    key: ci.curso_id, titulo: ci.titulo, percent: ci.percent,
                    sufixo: ci.status === 'bloqueado' ? 'Bloqueado' : accessLabel(ci.expira_em),
                    tone: ci.status === 'ativo' ? 'ok' : 'bad',
                })),
                semCursos: enr.length === 0,
                statusLabel: label,
                statusTone: label === 'Ativo' ? 'ok' : label === 'Parcial' ? 'warn' : 'bad',
                expira: enr.length === 0 ? '—' : enr.every((e) => !e.expira_em) ? 'Vitalício' : 'Por curso',
                acoes: [
                    { key: 'edit', label: 'Editar', title: 'Editar acesso, expiração e bloqueio', Icon: Pencil, cor: 'text-primary', onClick: () => openDemoAccess(st) },
                    { key: 'toggle', label: todosBloqueados ? 'Liberar' : 'Bloquear', title: todosBloqueados ? 'Desbloquear aluno' : 'Bloquear aluno (todos os cursos)', Icon: todosBloqueados ? ShieldCheck : ShieldOff, cor: todosBloqueados ? 'text-green-500' : 'text-red-500', onClick: () => toggleDemoBlock(st) },
                    { key: 'login', label: 'Entrar', title: 'Entrar como este aluno (teste)', Icon: LogIn, cor: 'text-green-500', onClick: () => impersonateDemo(st) },
                ],
            };
        }),
    ];
    const semLinhas = loading && students.length === 0;

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

            <StudentsList rows={rows} carregando={semLinhas} />

            {/* Modal de Cadastro/Edição */}
            {credentials && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-label="Acesso criado">
                    <Card className="w-full max-w-lg border-primary/30">
                        <CardHeader><CardTitle>Aluno cadastrado</CardTitle></CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <p>Envie estes dados para <b>{credentials.nome}</b>. A senha temporária <b>não aparece de novo</b> depois que você fechar esta janela.</p>
                            <div className="rounded-lg border border-white/10 p-3 space-y-1">
                                <p>Usuário: <b>{credentials.email}</b></p>
                                <p>Senha temporária: <b className="font-mono tracking-wide">{credentials.senha}</b></p>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                                <Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(credentials.message)}>Copiar mensagem</Button>
                                {credentials.link && <a href={credentials.link} target="_blank" rel="noreferrer"><Button type="button">Abrir no WhatsApp</Button></a>}
                                <Button type="button" variant="ghost" onClick={() => setCredentials(null)}>Fechar</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

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
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">{editingId ? 'Nova senha (opcional)' : 'Senha inicial (opcional)'}</label>
                                    <Input
                                        placeholder={editingId ? 'Deixe em branco para não alterar' : 'Em branco = gerar senha temporária'}
                                        type="text"
                                        minLength={8}
                                        autoComplete="off"
                                        value={newStudent.senha}
                                        onChange={e => setNewStudent({ ...newStudent, senha: e.target.value })}
                                    />
                                    <p className="text-[10px] text-text-muted italic">{editingId ? 'A senha atual não é exibida em nenhum lugar. Informe uma só se quiser trocá-la (mínimo de 8 caracteres).' : 'Mínimo de 8 caracteres. Se deixar em branco, geramos uma senha temporária e mostramos uma vez.'}</p>
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
