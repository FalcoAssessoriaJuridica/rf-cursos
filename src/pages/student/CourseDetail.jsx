import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, Play, Search } from 'lucide-react';
import { loadCourse, courseProgress, nextLesson, canAccessStudentArea } from '../../lib/courseData';
import { formatDuration } from '../../lib/demoCourses';
import { cn } from '../../lib/utils';
import AccessBlocked from '../../components/AccessBlocked';
import { coverStyle } from '../../lib/cover';

export default function CourseDetail() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [state, setState] = useState({ loading: true });
    const [tab, setTab] = useState('conteudos');
    const [query, setQuery] = useState('');
    const [showMore, setShowMore] = useState(false);
    const [collapsed, setCollapsed] = useState(new Set());

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const userId = localStorage.getItem('rf_user_id');
                if (!canAccessStudentArea()) return navigate('/login');
                const data = await loadCourse(courseId, userId);
                if (alive) setState({ loading: false, ...data });
            } catch (err) {
                console.error(err);
                if (alive) setState({ loading: false, notFound: true });
            }
        })();
        return () => { alive = false; };
    }, [courseId, navigate]);

    const { course, modules = [], progress = {} } = state;
    const stats = useMemo(() => courseProgress(modules, progress), [modules, progress]);
    const next = useMemo(() => nextLesson(modules, progress), [modules, progress]);
    const started = Object.values(progress).some((p) => p.concluida || p.pct > 0) && stats.done > 0;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return modules;
        return modules
            .map((m) => ({ ...m, aulas: m.aulas.filter((a) => a.titulo?.toLowerCase().includes(q)) }))
            .filter((m) => m.aulas.length > 0);
    }, [modules, query]);

    const open = (aula) => navigate(`/student/course/${courseId}/lesson/${aula.id}`);

    if (state.loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
        );
    }

    if (state.blocked) return <AccessBlocked reason={state.reason} expiraEm={state.expira_em} />;
    if (state.notFound || !course) return <AccessBlocked reason="sem_acesso" />;

    const description = course.descricao || '';
    const long = description.length > 180;

    return (
        <div className="pb-10 glass rounded-2xl p-4 md:p-6">
            {/* ── HERO ── */}
            <section className="glass relative overflow-hidden rounded-2xl">
                {course.capa_url && (
                    <img
                        src={course.capa_url}
                        alt=""
                        aria-hidden
                        className="absolute inset-y-0 right-0 h-full w-full md:w-1/2 object-cover opacity-40 md:opacity-70"
                        style={{ ...coverStyle(course), maskImage: 'linear-gradient(to left, black 40%, transparent)', WebkitMaskImage: 'linear-gradient(to left, black 40%, transparent)' }}
                    />
                )}
                <div className="relative z-10 p-6 md:p-10 max-w-2xl">
                    <button onClick={() => navigate('/student')} className="flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white mb-6">
                        <ArrowLeft className="h-4 w-4" /> Voltar
                    </button>
                    <h1 className="text-3xl md:text-4xl font-bold leading-tight">{course.titulo}</h1>
                    {description && (
                        <div className="mt-4 text-sm text-white/80 leading-relaxed">
                            <p className={cn(!showMore && long && 'line-clamp-3')}>{description}</p>
                            {long && (
                                <button onClick={() => setShowMore((v) => !v)} className="mt-2 font-semibold underline underline-offset-4 hover:text-primary">
                                    {showMore ? 'Mostrar menos' : 'Mostrar mais'}
                                </button>
                            )}
                        </div>
                    )}
                    <div className="mt-5 flex items-center gap-3 text-xs text-white/80">
                        <span>{stats.total} conteúdos</span>
                        <span>—</span>
                        <span className="font-bold">{stats.percent}%</span>
                        <div className="h-1 w-40 rounded-full bg-white/20 overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${stats.percent}%` }} />
                        </div>
                    </div>
                    <button
                        disabled={!next}
                        onClick={() => next && open(next)}
                        className="mt-6 h-10 px-4 rounded-md bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        <Play className="h-4 w-4 fill-current" />
                        {stats.percent >= 100 ? 'Rever' : started ? 'Continuar' : 'Assistir'}
                    </button>
                </div>
            </section>

            {/* ── TABS ── */}
            <div className="mt-8 border-b border-white/10 flex gap-2" role="tablist">
                {[['conteudos', 'Conteúdos'], ['sobre', 'Sobre']].map(([id, label]) => (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={tab === id}
                        onClick={() => setTab(id)}
                        className={cn(
                            'px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
                            tab === id ? 'border-white text-white' : 'border-transparent text-dim hover:text-white'
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'sobre' ? (
                <div className="mt-6 max-w-3xl text-sm leading-relaxed text-white/80 whitespace-pre-line">{description || 'Sem descrição.'}</div>
            ) : (
                <div className="mt-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <h2 className="text-base font-semibold">Todos os conteúdos</h2>
                        <div className="relative w-full md:w-80">
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar conteúdo"
                                className="w-full h-10 rounded-md bg-transparent border border-white/20 pl-3 pr-9 text-sm placeholder:text-white/40 focus:outline-none focus:border-white/60"
                            />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                        </div>
                    </div>

                    <div className="mt-4">
                        {filtered.length === 0 && <p className="text-sm text-white/50 py-8 text-center">Nenhum conteúdo encontrado.</p>}
                        {filtered.map((mod, idx) => {
                            const done = mod.aulas.filter((a) => progress[a.id]?.concluida).length;
                            const pct = mod.aulas.length ? Math.round((done / mod.aulas.length) * 100) : 0;
                            const isOpen = !collapsed.has(mod.id);
                            return (
                                <div key={mod.id} className="border-b border-white/10 pt-2 pb-4">
                                    <button
                                        aria-expanded={isOpen}
                                        onClick={() => setCollapsed((prev) => { const n = new Set(prev); n.has(mod.id) ? n.delete(mod.id) : n.add(mod.id); return n; })}
                                        className="w-full flex items-center p-3 text-left"
                                    >
                                        <div className="h-10 w-10 shrink-0 mr-4 rounded-full bg-panel flex items-center justify-center text-sm font-semibold">{idx + 1}</div>
                                        <div className="flex-1 min-w-0">
                                            <span className="block truncate text-sm">{mod.titulo}</span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-sm font-bold">{pct}%</span>
                                                <div className="h-1 w-32 rounded-full bg-primary/20 overflow-hidden">
                                                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronDown className={cn('h-5 w-5 transition-transform', isOpen && 'rotate-180')} />
                                    </button>

                                    {isOpen && (
                                        <ul className="mt-1 space-y-1">
                                            {mod.aulas.map((aula) => {
                                                const p = progress[aula.id];
                                                return (
                                                    <li key={aula.id}>
                                                        <button onClick={() => open(aula)} className="group w-full flex items-center gap-4 rounded-lg p-2 text-left hover:bg-white/5 transition-colors">
                                                            <div className="relative h-[72px] w-32 md:h-20 md:w-36 shrink-0 overflow-hidden rounded-md bg-panel">
                                                                {aula.thumb ? (
                                                                    <img src={aula.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                                                                ) : (
                                                                    <div className="h-full w-full flex items-center justify-center"><Play className="h-6 w-6 text-white/30" /></div>
                                                                )}
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                                    <Play className="h-6 w-6 fill-white text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                </div>
                                                                {aula.duracao > 0 && (
                                                                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold">{formatDuration(aula.duracao)}</span>
                                                                )}
                                                                {p?.pct > 0 && !p.concluida && (
                                                                    <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20"><div className="h-full bg-primary" style={{ width: `${p.pct}%` }} /></div>
                                                                )}
                                                            </div>
                                                            <span className="flex-1 min-w-0 text-sm line-clamp-2">{aula.titulo}</span>
                                                            <span className={cn('h-5 w-5 shrink-0 mr-2 rounded-full border flex items-center justify-center', p?.concluida ? 'border-green-500 bg-green-500' : 'border-white/30')}>
                                                                {p?.concluida && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                                                            </span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
