import { supabase } from './supabase';

// Envio de materiais de aula (PDF, DOCX, XLSX, PPTX, ZIP, áudio...) para o Storage do Supabase.
// Bucket preferido: `course-materials` (SQL em supabase/migrations/0000_storage_course_materials.sql).
// Enquanto ele não existir, usa o bucket de capas (`course-covers`) numa pasta própria.
export const PRIMARY_BUCKET = 'course-materials';
export const FALLBACK_BUCKET = 'course-covers';
export const MAX_FILE_MB = 50;

export const DOC_ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.zip,.rar,.7z,.epub';
export const AUDIO_ACCEPT = '.mp3,.m4a,.wav,.ogg,.aac';

let bucketInUse = PRIMARY_BUCKET;

export const extOf = (name = '') => (String(name).split('?')[0].match(/\.([a-zA-Z0-9]{1,5})$/) || [])[1]?.toLowerCase() || '';

const slug = (name) =>
    String(name)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'arquivo';

export function formatBytes(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

// Tipo do arquivo para ícone/rótulo
const KINDS = {
    pdf: { label: 'PDF', tone: 'red' },
    doc: { label: 'DOC', tone: 'blue' }, docx: { label: 'DOCX', tone: 'blue' }, odt: { label: 'ODT', tone: 'blue' }, rtf: { label: 'RTF', tone: 'blue' }, txt: { label: 'TXT', tone: 'gray' },
    xls: { label: 'XLS', tone: 'green' }, xlsx: { label: 'XLSX', tone: 'green' }, ods: { label: 'ODS', tone: 'green' }, csv: { label: 'CSV', tone: 'green' },
    ppt: { label: 'PPT', tone: 'orange' }, pptx: { label: 'PPTX', tone: 'orange' }, odp: { label: 'ODP', tone: 'orange' },
    zip: { label: 'ZIP', tone: 'gray' }, rar: { label: 'RAR', tone: 'gray' }, '7z': { label: '7Z', tone: 'gray' }, epub: { label: 'EPUB', tone: 'gray' },
    mp3: { label: 'MP3', tone: 'gold' }, m4a: { label: 'M4A', tone: 'gold' }, wav: { label: 'WAV', tone: 'gold' }, ogg: { label: 'OGG', tone: 'gold' }, aac: { label: 'AAC', tone: 'gold' },
};
export function fileKind(item = {}) {
    const ext = item.tipo || extOf(item.arquivo) || extOf(item.nome) || extOf(item.url);
    return KINDS[ext] || { label: ext ? ext.toUpperCase() : 'ARQUIVO', tone: 'gray' };
}

export const isStorageUrl = (url = '') => /\/storage\/v1\/object\//.test(url);

// Link que força o download (Content-Disposition) em arquivos do Storage
export function downloadHref(item) {
    if (!isStorageUrl(item.url)) return item.url;
    const name = item.arquivo || item.nome || 'arquivo';
    return `${item.url}${item.url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`;
}

function friendly(error, bucket) {
    const msg = String(error?.message || error || '');
    if (/mime|not allowed|invalid.*type/i.test(msg)) {
        return `O bucket "${bucket}" não aceita este tipo de arquivo. Crie o bucket "course-materials" (SQL em supabase/migrations/0000_storage_course_materials.sql).`;
    }
    if (/exceeded|too large|payload|size/i.test(msg)) return `Arquivo maior que o limite do servidor (máx. ${MAX_FILE_MB} MB).`;
    if (/row-level security|policy|unauthorized|403/i.test(msg)) return 'Sem permissão para enviar. Confira as políticas do Storage.';
    return msg || 'Falha no envio.';
}

// Envia um arquivo e devolve o item pronto para salvar em materiais_pdf / materiais_audio
export async function uploadMaterial(file, { courseId = 'curso', lessonId = 'novas', accept } = {}) {
    const ext = extOf(file.name);
    if (accept && ext && !accept.split(',').includes(`.${ext}`)) {
        throw new Error(`Tipo ".${ext}" não permitido aqui.`);
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`"${file.name}" tem ${formatBytes(file.size)} (máx. ${MAX_FILE_MB} MB).`);

    const rand = (crypto.randomUUID?.() || String(Date.now())).slice(0, 8);
    const key = `${courseId}/${lessonId}/${rand}-${slug(file.name)}${ext ? `.${ext}` : ''}`;

    const attempt = async (bucket, path) =>
        supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined, cacheControl: '3600' });

    let bucket = bucketInUse;
    let path = bucket === FALLBACK_BUCKET ? `materiais/${key}` : key;
    let { error } = await attempt(bucket, path);

    // bucket novo ainda não criado → usa a pasta de materiais do bucket de capas
    if (error && bucket === PRIMARY_BUCKET && /bucket not found|not found/i.test(String(error.message))) {
        bucketInUse = FALLBACK_BUCKET;
        bucket = FALLBACK_BUCKET;
        path = `materiais/${key}`;
        ({ error } = await attempt(bucket, path));
    }
    if (error) throw new Error(friendly(error, bucket));

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return {
        nome: file.name.replace(/\.[^.]+$/, ''),
        arquivo: file.name,
        url: data.publicUrl,
        tipo: ext,
        tamanho: file.size,
        bucket,
        path,
    };
}

// Remove do Storage (melhor esforço: não bloqueia a edição se falhar)
export async function removeMaterialFile(item) {
    if (!item?.bucket || !item?.path) return;
    try {
        await supabase.storage.from(item.bucket).remove([item.path]);
    } catch {
        /* ignorar */
    }
}
