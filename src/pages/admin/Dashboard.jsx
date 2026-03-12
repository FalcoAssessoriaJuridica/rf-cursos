import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Users, PlayCircle, Clock, TrendingUp, Settings, Download, X, Save } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { cn } from '../../lib/utils';

export default function Dashboard() {
    const navigate = useNavigate();
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

    useEffect(() => {
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
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatsCard
                    title="Total de Alunos"
                    value={stats.loading ? '...' : stats.totalStudents}
                    icon={Users}
                    description="Alunos cadastrados na base"
                    trend="+12% este mês"
                    color="from-primary to-yellow-600"
                />
                <StatsCard
                    title="Inscrições Ativas"
                    value={stats.loading ? '...' : stats.activeSubscribers}
                    icon={TrendingUp}
                    description="Ciclos de acesso vigentes"
                    trend="+5% vs ontem"
                    color="from-blue-500 to-indigo-600"
                />
                <StatsCard
                    title="Cursos Publicados"
                    value={stats.loading ? '...' : stats.totalCourses}
                    icon={PlayCircle}
                    description="Conteúdo disponível"
                    color="from-emerald-500 to-teal-600"
                />
                <StatsCard
                    title="Taxa de Conclusão"
                    value={`${stats.metaEngajamento}%`}
                    icon={Clock}
                    description="Média de progresso atual"
                    color="from-orange-500 to-red-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Meta de Engajamento Detail */}
                <Card className="lg:col-span-2 border-white/5 bg-surface/30 backdrop-blur-md overflow-hidden group">
                    <CardHeader className="border-b border-white/5 pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-xl font-bold">Saúde da Base</CardTitle>
                                <p className="text-sm text-text-muted mt-1">Visão geral do engajamento dos alunos</p>
                            </div>
                            <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                                <TrendingUp className="h-6 w-6 text-primary" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-8 px-8 pb-10">
                        <div className="flex items-end justify-between mb-4">
                            <div>
                                <span className="text-5xl font-black text-white">{stats.metaEngajamento}%</span>
                                <span className="text-text-muted ml-2 font-medium">de conclusão média</span>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-text-muted uppercase font-bold tracking-widest mb-1">Status</p>
                                <span className="px-3 py-1 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full text-xs font-bold">
                                    Consistente
                                </span>
                            </div>
                        </div>
                        <div className="relative pt-4">
                            <div className="w-full bg-white/5 rounded-full h-4 overflow-hidden border border-white/5">
                                <div
                                    className="h-full bg-gradient-to-r from-primary via-yellow-500 to-primary rounded-full transition-all duration-1000 ease-out relative"
                                    style={{ width: `${stats.metaEngajamento}%` }}
                                >
                                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250px_100%] animate-shimmer" />
                                </div>
                            </div>
                            {/* Marker */}
                            <div className="absolute top-0 flex flex-col items-center" style={{ left: '70%', transform: 'translateX(-50%)' }}>
                                <div className="h-4 w-0.5 bg-primary/50" />
                                <span className="text-[10px] text-primary/80 font-bold mt-1 uppercase tracking-tighter">Meta Global (70%)</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Ações Rápidas Premium */}
                <Card className="border-white/5 bg-surface/30 backdrop-blur-md">
                    <CardHeader className="border-b border-white/5">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <Save className="h-5 w-5 text-primary" />
                            Atalhos Estratégicos
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 flex flex-col gap-3">
                        <QuickAction
                            icon={PlayCircle}
                            label="Gerenciar Conteúdo"
                            sub="Cursos, aulas e materiais"
                            onClick={() => navigate('/admin/courses')}
                            color="text-primary"
                        />
                        <QuickAction
                            icon={Users}
                            label="Base de Alunos"
                            sub="Inscrições e perfis"
                            onClick={() => navigate('/admin/students')}
                            color="text-blue-400"
                        />
                        <QuickAction
                            icon={Settings}
                            label="Configurações"
                            sub="Ajustes globais do sistema"
                            onClick={openSettings}
                            color="text-text-muted"
                        />
                        <QuickAction
                            icon={Download}
                            label="Faturamento & Dados"
                            sub="Exportação de relatórios"
                            onClick={() => setIsExportModalOpen(true)}
                            color="text-emerald-400"
                        />
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

function StatsCard({ title, value, icon: Icon, description, trend, color }) {
    return (
        <Card className="bg-surface/40 backdrop-blur-md border-white/5 hover:border-primary/30 transition-all duration-500 group overflow-hidden relative">
            {/* Ambient Background Gradient */}
            <div className={`absolute -right-4 -top-4 h-24 w-24 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-10 blur-2xl transition-opacity duration-500`} />

            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-1">{title}</p>
                        <h3 className="text-3xl font-black text-white tabular-nums tracking-tighter">{value}</h3>
                    </div>
                    <div className={`h-10 w-10 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center border border-white/10 shadow-lg transition-transform group-hover:scale-110 duration-500`}>
                        <Icon className="h-5 w-5 text-white" />
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                    <p className="text-[10px] text-text-muted font-medium italic">{description}</p>
                    {trend && (
                        <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                            {trend}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function QuickAction({ icon: Icon, label, sub, onClick, color }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/40 hover:bg-white/10 transition-all duration-300 group text-left"
        >
            <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center bg-black/40 border border-white/5 transition-transform group-hover:scale-110",
                color
            )}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-sm font-bold text-text group-hover:text-primary transition-colors">{label}</p>
                <p className="text-[10px] text-text-muted font-medium">{sub}</p>
            </div>
        </button>
    );
}
