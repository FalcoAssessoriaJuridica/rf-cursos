import { supabase } from './supabase';
import { isDemoId, getDemoCourse, readDemoProgress, writeDemoProgress, demoAccessState, withDemoCover } from './demoCourses';

// Normaliza progresso: { [aulaId]: { concluida, pct, seconds } }

export async function loadCourse(courseId, userId) {
    if (isDemoId(courseId)) {
        const course = getDemoCourse(courseId);
        if (!course) return { notFound: true };
        const access = demoAccessState(courseId);
        if (!access.ok) return { blocked: true, reason: access.reason, expira_em: access.expira_em };
        const stored = readDemoProgress();
        const progress = {};
        Object.entries(stored).forEach(([id, p]) => {
            progress[id] = { concluida: !!p.concluida, pct: p.pct || 0, seconds: p.seconds || 0 };
        });
        const modules = course.modulos.map((m) => ({ ...m, aulas: [...m.aulas].sort((a, b) => a.ordem - b.ordem) }));
        return { course: withDemoCover(course), modules, progress, blocked: false };
    }

    const { data: inscription } = await supabase
        .from('inscricoes')
        .select('*')
        .eq('curso_id', courseId)
        .eq('perfil_id', userId)
        .single();

    if (!inscription) return { blocked: true, reason: 'sem_acesso' };
    const exp = inscription.data_expiracao ? new Date(inscription.data_expiracao) : null;
    if (inscription.status === 'bloqueado') return { blocked: true, reason: 'bloqueado' };
    if (exp && exp < new Date()) return { blocked: true, reason: 'expirado', expira_em: inscription.data_expiracao };

    const { data: modulesData } = await supabase
        .from('modulos')
        .select('*, aulas(*), cursos(*)')
        .eq('curso_id', courseId)
        .order('ordem');

    const modules = (modulesData || []).map((m) => ({
        ...m,
        aulas: [...(m.aulas || [])].sort((a, b) => a.ordem - b.ordem),
    }));
    const course = modulesData?.[0]?.cursos || null;

    const { data: allProg } = await supabase
        .from('progresso')
        .select('aula_id, concluida, porcentagem_concluida, segundos_assistidos')
        .eq('perfil_id', userId);

    const progress = {};
    allProg?.forEach((p) => {
        progress[p.aula_id] = {
            concluida: !!p.concluida,
            pct: p.porcentagem_concluida || 0,
            seconds: p.segundos_assistidos || 0,
        };
    });
    return { course, modules, progress, blocked: false };
}

export async function saveProgress(courseId, userId, aulaId, { concluida, pct, seconds }) {
    if (isDemoId(courseId)) {
        const patch = {};
        if (concluida !== undefined) patch.concluida = concluida;
        if (pct !== undefined) patch.pct = pct;
        if (seconds !== undefined) patch.seconds = seconds;
        writeDemoProgress(aulaId, patch);
        return;
    }
    if (!userId) return;
    const row = { perfil_id: userId, aula_id: aulaId };
    if (concluida !== undefined) row.concluida = concluida;
    if (pct !== undefined) row.porcentagem_concluida = pct;
    if (seconds !== undefined) row.segundos_assistidos = seconds;
    await supabase.from('progresso').upsert(row, { onConflict: 'perfil_id, aula_id' });
}

export const flatLessons = (modules) => modules.flatMap((m) => m.aulas);

export function courseProgress(modules, progress) {
    const all = flatLessons(modules);
    const done = all.filter((a) => progress[a.id]?.concluida).length;
    return { total: all.length, done, percent: all.length ? Math.round((done / all.length) * 100) : 0 };
}

// Próxima aula a assistir: primeira não concluída (ou a primeira do curso)
export function nextLesson(modules, progress) {
    const all = flatLessons(modules);
    return all.find((a) => !progress[a.id]?.concluida) || all[0] || null;
}

// Aluno logado, ou admin visualizando a área do aluno (só cursos demo, sem matrícula real)
export const canAccessStudentArea = () =>
    !!localStorage.getItem('rf_user_id') || localStorage.getItem('rf_role') === 'admin';
