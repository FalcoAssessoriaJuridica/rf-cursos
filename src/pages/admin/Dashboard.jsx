import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Users, PlayCircle, Clock, TrendingUp, Settings, Download, X, Save } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalStudents: 0,
        activeSubscribers: 0,
        totalCourses: 0,
        metaEngajamento: 0,
        loading: true
    });

    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState('complete'); // 'students', 'courses', 'complete'
    const [settingsForm, setSettingsForm] = useState({
        whatsapp_suporte: '',
        meta_conclusao: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [previewData, setPreviewData] = useState({ headers: [], rows: [], loading: false });

    useEffect(() => {
        async function fetchStats() {
            try {
                const { count: studentCount } = await supabase.from('perfis').select('*', { count: 'exact', head: true });
                const { count: activeCount } = await supabase.from('inscricoes').select('*', { count: 'exact', head: true }).eq('status', 'ativo');
                const { count: courseCount } = await supabase.from('cursos').select('*', { count: 'exact', head: true });

                // Fetch meta from settings
                const { data: configData } = await supabase.from('configuracoes').select('*');
                const metaValue = configData?.find(c => c.chave === 'meta_conclusao')?.valor || 70;

                setStats({
                    totalStudents: studentCount || 0,
                    activeSubscribers: activeCount || 0,
                    totalCourses: courseCount || 0,
                    metaEngajamento: parseInt(metaValue),
                    loading: false
                });
            } catch (err) {
                console.error(err);
            }
        }
        fetchStats();
    }, []);

    const openSettings = async () => {
        const { data } = await supabase.from('configuracoes').select('*');
        if (data) {
            const form = {};
            data.forEach(item => {
                form[item.chave] = item.valor;
            });
            setSettingsForm(form);
            setIsSettingsModalOpen(true);
        }
    };

    const handleSaveSettings = async () => {
        setIsSaving(true);
        try {
            for (const [chave, valor] of Object.entries(settingsForm)) {
                await supabase.from('configuracoes').update({ valor }).eq('chave', chave);
            }
            await fetchStats();
            setIsSettingsModalOpen(false);
        } catch (err) {
            console.error('Erro ao salvar configurações:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const getReportData = async (type, isPreview = false) => {
        let headers = [];
        let rows = [];
        let filename = '';

        if (type === 'students') {
            const query = supabase.from('perfis').select('*');
            if (isPreview) query.limit(5);
            const { data: students } = await query;

            headers = ['Nome', 'Email', 'Telefone', 'Data Cadastro'];
            rows = students?.map(s => [
                s.nome_completo || 'N/A',
                s.email,
                s.telefone || 'N/A',
                new Date(s.data_cadastro).toLocaleDateString('pt-BR')
            ]) || [];
            filename = 'relatorio_alunos';
        } else if (type === 'courses') {
            const query = supabase.from('cursos').select('*, modulos(aulas(id))');
            if (isPreview) query.limit(5);
            const { data: courses } = await query;

            headers = ['Título', 'Descrição', 'Tipo Acesso', 'Total Aulas'];
            rows = courses?.map(c => {
                const totalAulas = c.modulos?.reduce((acc, mod) => acc + (mod.aulas?.length || 0), 0) || 0;
                return [
                    c.titulo,
                    isPreview ? c.descricao : `"${c.descricao?.replace(/"/g, '""') || ''}"`,
                    c.tipo_acesso,
                    totalAulas
                ];
            }) || [];
            filename = 'relatorio_cursos';
        } else {
            // Complete
            const { data: students } = await supabase.from('perfis').select('id, nome_completo, email, telefone, inscricoes(status, curso_id, cursos(titulo))');
            const { data: allAulas } = await supabase.from('aulas').select('id, modulo_id, modulos(curso_id)');
            const { data: allProgress } = await supabase.from('progresso').select('perfil_id, aula_id').eq('concluida', true);

            const aulasPerCourse = {};
            allAulas?.forEach(aula => {
                const cursoId = aula.modulos?.curso_id;
                if (cursoId) aulasPerCourse[cursoId] = (aulasPerCourse[cursoId] || 0) + 1;
            });

            const completedPerStudentCourse = {};
            allProgress?.forEach(p => {
                const aulaInfo = allAulas?.find(a => a.id === p.aula_id);
                const cursoId = aulaInfo?.modulos?.curso_id;
                if (cursoId) {
                    const key = `${p.perfil_id}_${cursoId}`;
                    completedPerStudentCourse[key] = (completedPerStudentCourse[key] || 0) + 1;
                }
            });

            headers = ['Aluno', 'Email', 'Curso', 'Status', 'Total Aulas', 'Aulas Concluídas', 'Progresso (%)'];

            const processedRows = [];
            students?.forEach(s => {
                if (!s) return;
                const studentInscriptions = s.inscricoes || [];
                studentInscriptions.forEach(ins => {
                    const cursoId = ins.curso_id;
                    if (!cursoId) return;

                    const total = (aulasPerCourse || {})[cursoId] || 0;
                    const completedKey = `${s.id}_${cursoId}`;
                    const concluido = (completedPerStudentCourse || {})[completedKey] || 0;
                    const percent = total > 0 ? Math.round((concluido / total) * 100) : 0;

                    processedRows.push([
                        s.nome_completo || 'N/A',
                        s.email || 'N/A',
                        ins.cursos?.titulo || 'N/A',
                        ins.status || 'N/A',
                        total,
                        concluido,
                        `${percent}%`
                    ]);
                });
            });

            rows = isPreview ? processedRows.slice(0, 5) : processedRows;
            filename = 'relatorio_completo';
        }

        return { headers, rows, filename };
    };

    const fetchPreview = async () => {
        setPreviewData(prev => ({ ...prev, loading: true }));
        try {
            const { headers, rows } = await getReportData(exportType, true);
            setPreviewData({ headers, rows, loading: false });
        } catch (err) {
            console.error('Erro no preview:', err);
            setPreviewData(prev => ({ ...prev, loading: false }));
        }
    };

    useEffect(() => {
        if (isExportModalOpen) {
            fetchPreview();
        }
    }, [exportType, isExportModalOpen]);

    const handleExportReports = async () => {
        setIsExporting(true);
        try {
            const { headers, rows, filename } = await getReportData(exportType, false);
            const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setIsExportModalOpen(false);
        } catch (err) {
            console.error('Erro ao exportar:', err);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div>
                <h2 className="text-3xl font-bold text-text tracking-tight">Dashboard Administrativo</h2>
                <p className="text-text-muted mt-1">Bem-vindo, Roberto. Aqui está o resumo da RF MUSIC.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatsCard
                    title="Total de Alunos"
                    value={stats.loading ? '...' : stats.totalStudents}
                    icon={Users}
                    description="Alunos cadastrados na base"
                />
                <StatsCard
                    title="Inscrições Ativas"
                    value={stats.loading ? '...' : stats.activeSubscribers}
                    icon={TrendingUp}
                    description="Ciclos de acesso vigentes"
                />
                <StatsCard
                    title="Cursos Publicados"
                    value={stats.loading ? '...' : stats.totalCourses}
                    icon={PlayCircle}
                    description="Conteúdo disponível"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-primary/20 bg-surface/30 backdrop-blur-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-medium">Metas de Engajamento</CardTitle>
                        <Clock className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm text-text-muted mb-4">Média de conclusão de aulas: {stats.metaEngajamento}%</div>
                        <div className="w-full bg-black/40 rounded-full h-3 border border-border">
                            <div className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full transition-all duration-1000" style={{ width: `${stats.metaEngajamento}%` }} />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-primary/20 bg-surface/30 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">Ações Rápidas</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => navigate('/admin/courses')}
                            className="flex flex-col items-center gap-2 p-4 bg-black/40 border border-border rounded-lg text-xs hover:border-primary/50 hover:bg-black/60 transition-all text-text-muted group"
                        >
                            <PlayCircle className="h-5 w-5 group-hover:text-primary transition-colors" />
                            Gerenciar Cursos
                        </button>
                        <button
                            onClick={openSettings}
                            className="flex flex-col items-center gap-2 p-4 bg-black/40 border border-border rounded-lg text-xs hover:border-primary/50 hover:bg-black/60 transition-all text-text-muted group"
                        >
                            <Settings className="h-5 w-5 group-hover:text-primary transition-colors" />
                            Configurações globais
                        </button>
                        <button
                            onClick={() => setIsExportModalOpen(true)}
                            className="flex flex-col items-center gap-2 p-4 bg-black/40 border border-border rounded-lg text-xs hover:border-primary/50 hover:bg-black/60 transition-all text-text-muted group"
                        >
                            <Download className="h-5 w-5 group-hover:text-primary transition-colors" />
                            Exportar Relatórios
                        </button>
                    </CardContent>
                </Card>
            </div>

            {/* Modal de Configurações */}
            {isSettingsModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-md border-primary/20 bg-surface shadow-2xl">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <Settings className="h-5 w-5 text-primary" />
                                Configurações Globais
                            </CardTitle>
                            <button
                                onClick={() => setIsSettingsModalOpen(false)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">WhatsApp de Suporte</label>
                                    <Input
                                        placeholder="Ex: 5511999999999"
                                        value={settingsForm.whatsapp_suporte}
                                        onChange={e => setSettingsForm({ ...settingsForm, whatsapp_suporte: e.target.value })}
                                    />
                                    <p className="text-[10px] text-text-muted">Inclua o DDI (55) e o DDD.</p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs text-text-muted uppercase font-bold tracking-wider">Meta de Engajamento (%)</label>
                                    <Input
                                        type="number"
                                        placeholder="Ex: 75"
                                        value={settingsForm.meta_conclusao}
                                        onChange={e => setSettingsForm({ ...settingsForm, meta_conclusao: e.target.value })}
                                    />
                                    <p className="text-[10px] text-text-muted">Define a porcentagem exibida na barra de progresso do dashboard.</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                                <Button variant="secondary" onClick={() => setIsSettingsModalOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="gap-2"
                                    onClick={handleSaveSettings}
                                    disabled={isSaving}
                                >
                                    {isSaving ? 'Salvando...' : (
                                        <>
                                            <Save className="h-4 w-4" />
                                            Salvar Alterações
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Modal de Exportação */}
            {isExportModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-md border-primary/20 bg-surface shadow-2xl">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <Download className="h-5 w-5 text-primary" />
                                Exportar Relatórios
                            </CardTitle>
                            <button
                                onClick={() => setIsExportModalOpen(false)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div className="space-y-4">
                                <p className="text-sm text-text-muted">Selecione o tipo de relatório que deseja gerar em formato CSV:</p>

                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { id: 'students', label: '📋 Somente Alunos', desc: 'Dados cadastrais básicos' },
                                        { id: 'courses', label: '📚 Somente Cursos', desc: 'Estatísticas de aulas' },
                                        { id: 'complete', label: '⭐ Completo (Alunos + Cursos)', desc: 'Inclui porcentagem de progresso' }
                                    ].map(type => (
                                        <button
                                            key={type.id}
                                            onClick={() => setExportType(type.id)}
                                            className={`p-3 text-left rounded-lg border transition-all ${exportType === type.id
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                : 'border-border bg-black/20 hover:border-primary/50'
                                                }`}
                                        >
                                            <p className={`font-bold text-sm ${exportType === type.id ? 'text-primary' : 'text-text'}`}>{type.label}</p>
                                            <p className="text-[10px] text-text-muted">{type.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Preview Table */}
                            <div className="space-y-2">
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Pré-visualização (Amostra)</p>
                                <div className="border border-border rounded-lg overflow-hidden bg-black/40">
                                    <div className="overflow-x-auto max-h-[200px]">
                                        {previewData.loading ? (
                                            <div className="p-8 text-center text-xs text-text-muted">Carregando preview...</div>
                                        ) : (
                                            <table className="w-full text-[10px] text-left">
                                                <thead className="bg-white/5 border-b border-border/50">
                                                    <tr>
                                                        {previewData.headers.map((h, i) => (
                                                            <th key={i} className="p-2 font-bold text-primary">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/30 text-text/80">
                                                    {previewData.rows.length > 0 ? previewData.rows.map((row, i) => (
                                                        <tr key={i} className="hover:bg-white/5 transition-colors">
                                                            {row.map((cell, j) => (
                                                                <td key={j} className="p-2 truncate max-w-[120px]">{cell}</td>
                                                            ))}
                                                        </tr>
                                                    )) : (
                                                        <tr>
                                                            <td colSpan={previewData.headers.length} className="p-4 text-center text-text-muted italic">Nenhum registro encontrado.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                    <div className="bg-primary/5 p-1 text-[8px] text-center text-primary border-t border-border/50">
                                        Exibindo os primeiros 5 registros.
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                                <Button variant="secondary" onClick={() => setIsExportModalOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="gap-2"
                                    onClick={handleExportReports}
                                    disabled={isExporting}
                                >
                                    {isExporting ? 'Processando...' : (
                                        <>
                                            <Download className="h-4 w-4" />
                                            Gerar Relatório
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}

function StatsCard({ title, value, icon: Icon, description }) {
    return (
        <Card className="bg-surface border-primary/10 hover:border-primary/50 transition-all duration-300 group">
            <CardContent className="p-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                    <p className="text-sm font-medium text-text-muted group-hover:text-text transition-colors">{title}</p>
                    <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-3xl font-bold text-text tabular-nums">{value}</span>
                    <p className="text-xs text-text-muted">{description}</p>
                </div>
            </CardContent>
        </Card>
    );
}
