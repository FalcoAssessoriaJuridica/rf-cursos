import { supabase } from './supabase';
import { uploadMaterial, removeMaterialFile } from './materials';

// Biblioteca de partituras por curso e por aula (tabela `partituras`, SQL em supabase/migrations/0005_partituras.sql).
// Vale para todo curso/aula, existente ou novo: não há nada a "criar" por curso. Cursos de demonstração (ids locais) ficam de fora.
const TABLE = 'partituras';
export const SCORE_ACCEPT = '.mxl,.musicxml,.xml,.pdf,.png,.jpg,.jpeg,.tif,.tiff';
export const SCORE_SOURCE_ACCEPT = '.mxl,.musicxml,.xml';

export const isRealId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

export class LibraryNotReady extends Error {
    constructor() {
        super('A biblioteca de partituras ainda não foi ativada no banco de dados.');
        this.name = 'LibraryNotReady';
    }
}

const isMissingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /could not find the table|does not exist|schema cache/i.test(String(e.message || '')));

function check(error) {
    if (!error) return;
    if (isMissingTable(error)) throw new LibraryNotReady();
    throw new Error(error.message || 'Falha ao acessar a biblioteca de partituras.');
}

// escopo: { cursoId, aulaId } -> só as da aula; { cursoId } -> só as do curso (sem aula); { cursoId, all: true } -> todas do curso
export async function listScores({ cursoId, aulaId, all = false } = {}) {
    if (!isRealId(cursoId) && !isRealId(aulaId)) return [];
    let q = supabase.from(TABLE).select('*').order('ordem').order('criado_em');
    if (aulaId) q = q.eq('aula_id', aulaId);
    else {
        q = q.eq('curso_id', cursoId);
        if (!all) q = q.is('aula_id', null);
    }
    const { data, error } = await q;
    check(error);
    return data || [];
}

export async function listScoresForCourses(cursoIds) {
    const ids = (cursoIds || []).filter(isRealId);
    if (!ids.length) return [];
    const { data, error } = await supabase.from(TABLE).select('*').in('curso_id', ids).order('ordem').order('criado_em');
    check(error);
    return data || [];
}

export async function getScore(id) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    check(error);
    return data;
}

const asFile = (buf, name, type) => new File([buf], name, { type });

// draft: { titulo, origem: 'musicxml'|'pdf', mxl: ArrayBuffer|File, original?: File, compasso?, limpar? }
export async function addScore({ cursoId, aulaId = null, titulo, origem, mxl, original = null, compasso = null, limpar = false, ordem = 0 }) {
    if (!isRealId(cursoId)) throw new Error('A biblioteca de partituras não está disponível para cursos de demonstração.');
    const base = String(titulo || 'partitura').trim() || 'partitura';
    const mxlFile = mxl instanceof File ? mxl : asFile(mxl, `${base}.mxl`, 'application/vnd.recordare.musicxml');
    const where = { courseId: cursoId, lessonId: aulaId || 'curso', accept: SCORE_ACCEPT };
    const stored = await uploadMaterial(mxlFile, where);
    let orig = null;
    if (original) {
        try { orig = await uploadMaterial(original, where); } catch { /* o PDF de origem é opcional */ }
    }
    const row = {
        curso_id: cursoId,
        aula_id: aulaId,
        titulo: base,
        origem,
        arquivo_url: stored.url,
        arquivo_bucket: stored.bucket,
        arquivo_path: stored.path,
        original_url: orig?.url || null,
        original_bucket: orig?.bucket || null,
        original_path: orig?.path || null,
        compasso: compasso || null,
        limpar_anotacoes: !!limpar,
        ordem,
    };
    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    if (error) {
        await removeMaterialFile(stored);
        if (orig) await removeMaterialFile(orig);
        check(error);
    }
    return data;
}

export async function updateScore(id, patch) {
    const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
    check(error);
    return data;
}

export async function removeScore(score) {
    const { error } = await supabase.from(TABLE).delete().eq('id', score.id);
    check(error);
    await removeMaterialFile({ bucket: score.arquivo_bucket, path: score.arquivo_path });
    await removeMaterialFile({ bucket: score.original_bucket, path: score.original_path });
}

// Biblioteca do aluno: cursos a que ele tem acesso (o admin vê todos), cada um com suas partituras gerais e as de cada aula.
export async function loadLibrary() {
    const role = localStorage.getItem('rf_role');
    const userId = localStorage.getItem('rf_user_id');
    let courses = [];
    if (role === 'admin') {
        const { data } = await supabase.from('cursos').select('id,titulo').order('titulo');
        courses = data || [];
    } else if (isRealId(userId)) {
        const { data } = await supabase.from('inscricoes').select('status, data_expiracao, cursos(id,titulo)').eq('perfil_id', userId).neq('status', 'bloqueado');
        const now = Date.now();
        courses = (data || [])
            .filter((i) => i.cursos && (!i.data_expiracao || new Date(i.data_expiracao).getTime() > now))
            .map((i) => i.cursos);
    }
    courses = courses.filter((c) => isRealId(c.id));
    if (!courses.length) return [];
    const ids = courses.map((c) => c.id);
    const scores = await listScoresForCourses(ids);
    const withScores = new Set(scores.map((s) => s.curso_id));
    const { data: mods } = await supabase.from('modulos').select('id,curso_id,ordem,aulas(id,titulo,ordem)').in('curso_id', ids).order('ordem');
    const lessonTitle = new Map();
    (mods || []).forEach((m) => (m.aulas || []).forEach((a) => lessonTitle.set(a.id, a.titulo)));
    return courses
        .filter((c) => withScores.has(c.id))
        .map((c) => {
            const mine = scores.filter((s) => s.curso_id === c.id);
            const lessonIds = [...new Set(mine.filter((s) => s.aula_id).map((s) => s.aula_id))];
            return {
                ...c,
                geral: mine.filter((s) => !s.aula_id),
                aulas: lessonIds.map((id) => ({ id, titulo: lessonTitle.get(id) || 'Aula', scores: mine.filter((s) => s.aula_id === id) })),
            };
        });
}
