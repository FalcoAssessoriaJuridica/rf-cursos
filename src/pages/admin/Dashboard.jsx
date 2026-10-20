import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Users, PlayCircle, Settings, Download, X, Save } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { cn } from '../../lib/utils';

export default function Dashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalStudents: 0,
        activeSubscribers: 0,
        totalCourses: 0,
        metaEngajamento: 70,      // meta configurada (não é medição)
        completionPct: null,      // conclusão média REAL; null = sem dados
        lessonsDone: 0,
        lessonsTotal: 0,
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

            // Conclusão real: aulas concluídas ÷ aulas disponíveis, somando só as inscrições ativas
            let lessonsDone = 0;
            let lessonsTotal = 0;
            const [{ data: enrolls }, { data: mods }, { data: prog }] = await Promise.all([
                supabase.from('inscricoes').select('perfil_id, curso_id').eq('status', 'ativo'),
                supabase.from('modulos').select('curso_id, aulas(id)'),
                supabase.from('progresso').select('perfil_id, aula_id, concluida').eq('concluida', true),
            ]);
            const lessonsByCourse = {};
            (mods || []).forEach((m) => {
                (lessonsByCourse[m.curso_id] ||= new Set());
                (m.aulas || []).forEach((a) => lessonsByCourse[m.curso_id].add(a.id));
            });
            const doneByProfile = {};
            (prog || []).forEach((p) => { (doneByProfile[p.perfil_id] ||= new Set()).add(p.aula_id); });
            (enrolls || []).forEach((e) => {
                const lessons = lessonsByCourse[e.curso_id];
                if (!lessons || lessons.size === 0) return;
                lessonsTotal += lessons.size;
                const done = doneByProfile[e.perfil_id];
                if (done) lessons.forEach((id) => { if (done.has(id)) lessonsDone += 1; });
            });

            setStats({
                totalStudents: studentCount || 0,
                activeSubscribers: activeCount || 0,
                totalCourses: courseCount || 0,
                metaEngajamento: parseInt(metaValue) || 70,
                completionPct: lessonsTotal > 0 ? Math.round((lessonsDone / lessonsTotal) * 100) : null,
                lessonsDone,
                lessonsTotal,
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

    const { loading, completionPct, metaEngajamento: meta } = stats;
    const status = completionPct === null ? 'Sem dados ainda' : completionPct >= meta ? 'Acima da meta' : 'Abaixo da meta';
    const statusTone = completionPct === null ? 'text-text-muted' : completionPct >= meta ? 'text-green-500' : 'text-yellow-500';

    return (
        <div className="space-y-14 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-20">
                {/* Métrica principal: conclusão média real, sem caixa */}
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Conclusão média dos alunos</p>
                    <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                        <Value loading={loading} className="text-7xl font-semibold leading-none tracking-tighter text-text md:text-8xl" skeleton="w-40 h-20">
                            {completionPct === null ? '—' : completionPct}
                        </Value>
                        {completionPct !== null && <span className="text-3xl font-medium text-text-muted">%</span>}
                        {!loading && <span className={cn('ml-2 text-sm font-semibold', statusTone)}>{status}</span>}
                    </div>
                    <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-text-muted">
                        {loading
                            ? 'Calculando...'
                            : stats.lessonsTotal > 0
                                ? `${stats.lessonsDone} de ${stats.lessonsTotal} aulas concluídas nas inscrições ativas.`
                                : 'Assim que houver inscrições ativas e aulas concluídas, o percentual aparece aqui.'}
                    </p>

                    {/* Barra fina com a meta marcada acima */}
                    <div className="relative mt-10 max-w-2xl pt-6" role="img" aria-label={`Conclusão ${completionPct ?? 0}% — meta ${meta}%`}>
                        <div className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${meta}%` }}>
                            <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-text-muted">Meta {meta}%</span>
                            <span className="mt-0.5 h-2 w-px bg-text-muted/60" />
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-white/20 ring-1 ring-inset ring-white/10">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-[#f7e6a1] to-[#b8892a] transition-all duration-1000 ease-out"
                                style={{ width: `${completionPct ?? 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Métricas secundárias: linhas de relevo no lugar de caixas */}
                <dl className="emboss-y self-start">
                    <Metric loading={loading} label="Alunos" hint="cadastrados na base" value={stats.totalStudents} />
                    <Metric loading={loading} label="Inscrições ativas" hint="ciclos de acesso vigentes" value={stats.activeSubscribers} />
                    <Metric loading={loading} label="Cursos publicados" hint={!loading && stats.totalCourses === 0 ? 'crie o primeiro em Cursos' : 'conteúdo disponível'} value={stats.totalCourses} />
                </dl>
            </section>

            {/* Atalhos: botões de contorno com relevo, como no Higgsfield */}
            <section className="emboss-t pt-10">
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Atalhos</h2>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <QuickAction icon={PlayCircle} label="Gerenciar conteúdo" sub="Cursos, aulas e materiais" onClick={() => navigate('/admin/courses')} />
                    <QuickAction icon={Users} label="Base de alunos" sub="Inscrições e perfis" onClick={() => navigate('/admin/students')} />
                    <QuickAction icon={Settings} label="Configurações" sub="Meta de conclusão e suporte" onClick={openSettings} />
                    <QuickAction icon={Download} label="Dados e relatórios" sub="Exportar em CSV" onClick={() => setIsExportModalOpen(true)} />
                </div>
            </section>

            {/* Modal de Configurações */}
            {isSettingsModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-md border-primary/20 shadow-2xl">
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
                    <Card className="w-full max-w-md border-primary/20 shadow-2xl">
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

// Número com esqueleto enquanto carrega (mantém o tamanho do layout)
function Value({ loading, children, className, skeleton = 'w-12 h-8' }) {
    if (loading) return <span aria-hidden className={cn('inline-block animate-pulse rounded-md bg-white/10', skeleton)} />;
    return <span className={cn('tabular-nums', className)}>{children}</span>;
}

function Metric({ label, hint, value, loading }) {
    return (
        <div className="flex items-baseline justify-between gap-6 py-5 first:pt-0">
            <div>
                <dt className="text-sm font-medium text-text">{label}</dt>
                <dd className="mt-0.5 text-xs text-text-muted">{hint}</dd>
            </div>
            <Value loading={loading} className="text-4xl font-semibold tracking-tighter text-text" skeleton="w-14 h-9">{value}</Value>
        </div>
    );
}

function QuickAction({ icon: Icon, label, sub, onClick }) {
    return (
        <button
            onClick={onClick}
            className="bevel group flex items-center gap-4 rounded-2xl border border-white/15 px-5 py-4 text-left transition-all duration-200 hover:border-primary/60 hover:bg-white/[0.03] active:translate-y-px active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
            <Icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
            <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text">{label}</span>
                <span className="block truncate text-xs text-text-muted">{sub}</span>
            </span>
        </button>
    );
}
