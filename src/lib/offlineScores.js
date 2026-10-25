// Partituras salvas no aparelho para uso sem internet (IndexedDB). Só o arquivo da partitura (MusicXML) e seus dados básicos.
// - Cada cópia pertence a quem estava logado ao salvar e vale por DIAS; ao abrir a biblioteca com internet, as cópias de partituras
//   a que a pessoa ainda tem acesso são renovadas e as demais são apagadas. Ao sair da conta, tudo é apagado.
// - Vídeos e o restante dos cursos não são guardados: exigem internet.
const DB = 'rf-offline';
const STORE = 'scores';
const DIAS = 30;

const hasIdb = () => typeof indexedDB !== 'undefined';

function open() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// executa `fn(store)` numa transação e devolve o resultado do pedido devolvido por `fn`
async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => { db.close(); resolve(req?.result); };
        t.onerror = t.onabort = () => { db.close(); reject(t.error); };
    });
}

// "dono" das cópias: o aluno logado ou o administrador
export const offlineOwner = () => {
    try { return localStorage.getItem('rf_user_id') || (localStorage.getItem('rf_role') === 'admin' ? 'admin' : null); } catch { return null; }
};
const keyOf = (owner, id) => `${owner}|${id}`;
const expiry = () => Date.now() + DIAS * 24 * 3600 * 1000;

export async function saveScoreOffline(score) {
    const owner = offlineOwner();
    if (!hasIdb() || !owner) throw new Error('Este aparelho não permite salvar para uso sem internet.');
    const res = await fetch(score.arquivo_url);
    if (!res.ok) throw new Error('Não foi possível baixar a partitura. Tente de novo.');
    const buffer = await res.arrayBuffer();
    await run('readwrite', (s) => s.put({
        key: keyOf(owner, score.id), owner, id: score.id, titulo: score.titulo, compositor: score.compositor || null, origem: score.origem,
        compasso: score.compasso || null, limpar: !!score.limpar_anotacoes, buffer, salvoEm: Date.now(), validoAte: expiry(),
    }));
}

export async function getOfflineScore(id) {
    const owner = offlineOwner();
    if (!hasIdb() || !owner) return null;
    const rec = await run('readonly', (s) => s.get(keyOf(owner, id)));
    return rec && rec.validoAte > Date.now() ? rec : null;
}

export const isSavedOffline = async (id) => !!(await getOfflineScore(id).catch(() => null));

export async function removeOfflineScore(id) {
    const owner = offlineOwner();
    if (!hasIdb() || !owner) return;
    await run('readwrite', (s) => s.delete(keyOf(owner, id)));
}

// partituras salvas por quem está logado (e ainda válidas), sem o arquivo
export async function listOfflineScores() {
    const owner = offlineOwner();
    if (!hasIdb() || !owner) return [];
    const all = (await run('readonly', (s) => s.getAll())) || [];
    const now = Date.now();
    const expiradas = all.filter((r) => r.validoAte <= now);
    if (expiradas.length) await run('readwrite', (s) => { expiradas.forEach((r) => s.delete(r.key)); return null; }).catch(() => {});
    return all
        .filter((r) => r.owner === owner && r.validoAte > now)
        .map(({ buffer, ...meta }) => meta)
        .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

// com internet e a biblioteca carregada: renova o que ainda é acessível e apaga o que a pessoa não alcança mais
export async function renewOfflineScores(accessibleIds) {
    const owner = offlineOwner();
    if (!hasIdb() || !owner) return;
    const ok = new Set(accessibleIds);
    const all = (await run('readonly', (s) => s.getAll())) || [];
    await run('readwrite', (s) => {
        all.filter((r) => r.owner === owner).forEach((r) => {
            if (ok.has(r.id)) s.put({ ...r, validoAte: expiry() }); else s.delete(r.key);
        });
        return null;
    });
}

export async function clearOfflineScores() {
    if (!hasIdb()) return;
    await run('readwrite', (s) => s.clear()).catch(() => {});
}
