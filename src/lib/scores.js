import { supabase } from './supabase';
import { uploadMaterial, removeMaterialFile } from './materials';

// Acervo de partituras (SQL em supabase/migrations/0005 e 0006): cada partitura existe uma vez, em uma pasta do acervo.
// Cursos e aulas apenas apontam para ela (partitura_vinculos), então a mesma partitura serve a vários cursos sem duplicar arquivo.
// Cursos de demonstração (ids locais) ficam de fora.
const T = 'partituras';
const FOLDERS = 'partitura_pastas';
const LINKS = 'partitura_vinculos';
export const SCORE_ACCEPT = '.mxl,.musicxml,.xml,.pdf,.png,.jpg,.jpeg,.tif,.tiff';

export const isRealId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

export class LibraryNotReady extends Error {
    constructor() {
        super('O acervo de partituras ainda não foi ativado no banco de dados.');
        this.name = 'LibraryNotReady';
    }
}

const isMissingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || /could not find the|does not exist|schema cache/i.test(String(e.message || '')));

function check(error) {
    if (!error) return;
    if (isMissingTable(error)) throw new LibraryNotReady();
    throw new Error(error.message || 'Falha ao acessar o acervo de partituras.');
}

const asFile = (buf, name, type) => new File([buf], name, { type });

/* ───────── Pastas ───────── */
export async function listFolders() {
    const { data, error } = await supabase.from(FOLDERS).select('*').order('ordem').order('nome');
    check(error);
    return data || [];
}

export async function createFolder(nome, paiId = null) {
    const { data, error } = await supabase.from(FOLDERS).insert({ nome: nome.trim(), pai_id: paiId }).select().single();
    if (error?.code === '23505') throw new Error('Já existe uma pasta com esse nome aqui.');
    check(error);
    return data;
}

export async function renameFolder(id, nome) {
    const { error } = await supabase.from(FOLDERS).update({ nome: nome.trim() }).eq('id', id);
    if (error?.code === '23505') throw new Error('Já existe uma pasta com esse nome aqui.');
    check(error);
}

// as partituras da pasta (e das subpastas) continuam no acervo, sem pasta
export async function deleteFolder(id) {
    const { error } = await supabase.from(FOLDERS).delete().eq('id', id);
    check(error);
}

/* ───────── Acervo ───────── */
export async function listAcervo() {
    const { data, error } = await supabase.from(T).select('*').order('titulo').limit(5000);
    check(error);
    return data || [];
}

export async function getScore(id) {
    const { data, error } = await supabase.from(T).select('*').eq('id', id).single();
    check(error);
    return data;
}

// draft: mxl (ArrayBuffer|File) obrigatório; original (PDF/imagem lida) opcional
export async function createScore({ pastaId = null, titulo, compositor = null, fonte = null, origem, mxl, original = null, compasso = null, limpar = false }) {
    const base = String(titulo || 'partitura').trim() || 'partitura';
    const mxlFile = mxl instanceof File ? mxl : asFile(mxl, `${base}.mxl`, 'application/vnd.recordare.musicxml');
    const where = { courseId: 'acervo', lessonId: pastaId || 'sem-pasta', accept: SCORE_ACCEPT };
    const stored = await uploadMaterial(mxlFile, where);
    let orig = null;
    if (original) {
        try { orig = await uploadMaterial(original, where); } catch { /* o PDF de origem é opcional */ }
    }
    const row = {
        pasta_id: pastaId,
        titulo: base,
        compositor: compositor || null,
        fonte: fonte || null,
        origem,
        arquivo_url: stored.url,
        arquivo_bucket: stored.bucket,
        arquivo_path: stored.path,
        original_url: orig?.url || null,
        original_bucket: orig?.bucket || null,
        original_path: orig?.path || null,
        compasso: compasso || null,
        limpar_anotacoes: !!limpar,
    };
    const { data, error } = await supabase.from(T).insert(row).select().single();
    if (error) {
        await removeMaterialFile(stored);
        if (orig) await removeMaterialFile(orig);
        check(error);
    }
    return data;
}

export async function updateScore(id, patch) {
    const { data, error } = await supabase.from(T).update(patch).eq('id', id).select().single();
    check(error);
    return data;
}

// remove do acervo (e, por cascata, de todos os cursos/aulas onde estava)
export async function removeScore(score) {
    const { error } = await supabase.from(T).delete().eq('id', score.id);
    check(error);
    await removeMaterialFile({ bucket: score.arquivo_bucket, path: score.arquivo_path });
    await removeMaterialFile({ bucket: score.original_bucket, path: score.original_path });
}

/* ───────── Vínculos com cursos e aulas ───────── */
// escopo { cursoId } -> só as do curso inteiro; { cursoId, aulaId } -> só as da aula. Cada item traz vinculo_id.
export async function listScores({ cursoId, aulaId = null } = {}) {
    if (!isRealId(cursoId)) return [];
    let q = supabase.from(LINKS).select('id, ordem, criado_em, partituras(*)').eq('curso_id', cursoId).order('ordem').order('criado_em');
    q = aulaId ? q.eq('aula_id', aulaId) : q.is('aula_id', null);
    const { data, error } = await q;
    check(error);
    return (data || []).filter((l) => l.partituras).map((l) => ({ ...l.partituras, vinculo_id: l.id }));
}

export async function addLinks(partituraIds, { cursoId, aulaId = null }) {
    if (!isRealId(cursoId)) throw new Error('O acervo não está disponível para cursos de demonstração.');
    // o índice único usa coalesce(aula_id), então o upsert do PostgREST não serve: filtra os já vinculados antes
    let q = supabase.from(LINKS).select('partitura_id').eq('curso_id', cursoId).in('partitura_id', partituraIds);
    q = aulaId ? q.eq('aula_id', aulaId) : q.is('aula_id', null);
    const { data: have, error: e1 } = await q;
    check(e1);
    const already = new Set((have || []).map((l) => l.partitura_id));
    const rows = partituraIds.filter((id) => !already.has(id)).map((partitura_id) => ({ partitura_id, curso_id: cursoId, aula_id: aulaId }));
    if (!rows.length) return;
    const { error } = await supabase.from(LINKS).insert(rows);
    check(error);
}

export async function removeLink(vinculoId) {
    const { error } = await supabase.from(LINKS).delete().eq('id', vinculoId);
    check(error);
}

// onde a partitura está disponível: [{ id, curso_id, aula_id }]
export async function listLinks(partituraId) {
    const { data, error } = await supabase.from(LINKS).select('id, curso_id, aula_id').eq('partitura_id', partituraId);
    check(error);
    return data || [];
}

// estrutura para escolher onde disponibilizar: cursos > módulos > aulas
export async function loadCourseTree() {
    const { data, error } = await supabase.from('cursos').select('id,titulo,modulos(id,titulo,ordem,aulas(id,titulo,ordem))').order('titulo');
    if (error) throw new Error(error.message);
    const byOrder = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0);
    return (data || []).map((c) => ({
        ...c,
        modulos: (c.modulos || []).sort(byOrder).map((m) => ({ ...m, aulas: (m.aulas || []).sort(byOrder) })),
    }));
}

// Substitui os vínculos de uma partitura pelo conjunto escolhido: targets = [{ cursoId, aulaId|null }]
export async function setLinks(partituraId, targets) {
    const current = await listLinks(partituraId);
    const key = (c, a) => `${c}|${a || ''}`;
    const want = new Map(targets.map((t) => [key(t.cursoId, t.aulaId), t]));
    const have = new Map(current.map((l) => [key(l.curso_id, l.aula_id), l]));
    const del = current.filter((l) => !want.has(key(l.curso_id, l.aula_id))).map((l) => l.id);
    const add = targets.filter((t) => !have.has(key(t.cursoId, t.aulaId)));
    if (del.length) {
        const { error } = await supabase.from(LINKS).delete().in('id', del);
        check(error);
    }
    if (add.length) {
        const { error } = await supabase.from(LINKS).insert(add.map((t) => ({ partitura_id: partituraId, curso_id: t.cursoId, aula_id: t.aulaId || null })));
        check(error);
    }
}

// Envia direto para um curso/aula: entra no acervo (na pasta escolhida) e já fica vinculada.
export async function addScore({ cursoId, aulaId = null, ...draft }) {
    if (!isRealId(cursoId)) throw new Error('O acervo não está disponível para cursos de demonstração.');
    const score = await createScore(draft);
    await addLinks([score.id], { cursoId, aulaId });
    return score;
}

/* ───────── Biblioteca do aluno ───────── */
// Cursos a que o aluno tem acesso (o admin vê todos), cada um com as partituras gerais e as de cada aula.
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
    const { data: links, error } = await supabase.from(LINKS).select('id, curso_id, aula_id, ordem, partituras(id,titulo,compositor,origem)').in('curso_id', ids).order('ordem');
    check(error);
    const rows = (links || []).filter((l) => l.partituras);
    if (!rows.length) return [];
    const { data: mods } = await supabase.from('modulos').select('id,curso_id,aulas(id,titulo)').in('curso_id', ids);
    const lessonTitle = new Map();
    (mods || []).forEach((m) => (m.aulas || []).forEach((a) => lessonTitle.set(a.id, a.titulo)));
    return courses
        .map((c) => {
            const mine = rows.filter((l) => l.curso_id === c.id);
            const lessonIds = [...new Set(mine.filter((l) => l.aula_id).map((l) => l.aula_id))];
            return {
                ...c,
                geral: mine.filter((l) => !l.aula_id).map((l) => l.partituras),
                aulas: lessonIds.map((id) => ({ id, titulo: lessonTitle.get(id) || 'Aula', scores: mine.filter((l) => l.aula_id === id).map((l) => l.partituras) })),
            };
        })
        .filter((c) => c.geral.length || c.aulas.length);
}
