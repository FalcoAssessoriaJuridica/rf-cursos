// Importa em lote partituras em PDF para o acervo (pastas + leitura OMR + Storage + banco).
//
//   acervo-importar/
//     Gospel/            <- cada subpasta vira uma pasta do acervo
//       _fonte.txt       <- (opcional) procedência/licença gravada em todas as partituras da pasta
//       Amazing Grace.pdf
//     Jazz/
//       Joplin - The Entertainer.pdf   <- "Compositor - Título" preenche o compositor
//
// Uso:  node scripts/importar-acervo.mjs [--so-converter]
//   1) converte cada PDF em MusicXML pelo serviço OMR local (guarda em acervo-importar/.mxl, não repete o que já foi lido)
//   2) cria as pastas, envia os arquivos ao Storage e cadastra no acervo (pula o que já existe na pasta com o mesmo título)
// Requer: serviço OMR rodando (docker run -p 8080:8080 -e OMR_API_KEY=... rf-omr), .env com VITE_SUPABASE_URL/ANON_KEY/OMR_API_KEY
// e o SQL 0006_acervo_partituras.sql já executado (a etapa 1 funciona antes dele).
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '').trim()]));
const OMR = process.env.OMR_URL || 'http://localhost:8080/convert';
const src = join(root, 'acervo-importar');
const cache = join(src, '.mxl');
const onlyConvert = process.argv.includes('--so-converter');
mkdirSync(cache, { recursive: true });

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'partitura';
const folders = readdirSync(src).filter((d) => !d.startsWith('.') && statSync(join(src, d)).isDirectory());
const jobs = folders.flatMap((folder) => readdirSync(join(src, folder)).filter((f) => /\.pdf$/i.test(f)).map((f) => ({ folder, file: f, pdf: join(src, folder, f), mxl: join(cache, `${slug(folder)}__${slug(basename(f, extname(f)))}.mxl`) })));
console.log(`${jobs.length} PDFs em ${folders.length} pastas`);

// 1) leitura (OMR)
let n = 0;
for (const j of jobs) {
    n += 1;
    if (existsSync(j.mxl)) continue;
    const t0 = Date.now();
    process.stdout.write(`[${n}/${jobs.length}] lendo ${j.folder}/${j.file} … `);
    try {
        const body = new FormData();
        body.append('file', new Blob([readFileSync(j.pdf)], { type: 'application/pdf' }), j.file);
        const res = await fetch(OMR, { method: 'POST', body, headers: { 'X-API-Key': env.OMR_API_KEY } });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
        writeFileSync(j.mxl, Buffer.from(await res.arrayBuffer()));
        console.log(`ok (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (e) {
        console.log(`FALHOU: ${e.message}`);
    }
}
if (onlyConvert) process.exit(0);

// 2) envio
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const probe = await supabase.from('partitura_pastas').select('id').limit(1);
if (probe.error) { console.error(`\nO acervo ainda não existe no banco (${probe.error.message}). Rode o SQL 0006_acervo_partituras.sql e execute de novo.`); process.exit(2); }

const BUCKET = 'course-materials';
const upload = async (buf, key, type) => {
    let bucket = BUCKET, path = key;
    let { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: type, upsert: false });
    if (error && /not found/i.test(error.message)) { bucket = 'course-covers'; path = `materiais/${key}`; ({ error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: type, upsert: false })); }
    if (error) throw new Error(error.message);
    return { bucket, path, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
};

const folderId = {};
for (const name of folders) {
    const { data: found } = await supabase.from('partitura_pastas').select('id').eq('nome', name).is('pai_id', null).maybeSingle();
    if (found) { folderId[name] = found.id; continue; }
    const { data, error } = await supabase.from('partitura_pastas').insert({ nome: name }).select().single();
    if (error) throw new Error(`pasta ${name}: ${error.message}`);
    folderId[name] = data.id;
}

let added = 0, skipped = 0, failed = 0;
for (const j of jobs) {
    const base = basename(j.file, extname(j.file));
    const m = base.match(/^(.+?)\s+-\s+(.+)$/);
    const titulo = m ? m[2] : base, compositor = m ? m[1] : null;
    const fontePath = join(src, j.folder, '_fonte.txt');
    const fonte = existsSync(fontePath) ? readFileSync(fontePath, 'utf8').trim() : null;
    const { data: dup } = await supabase.from('partituras').select('id').eq('pasta_id', folderId[j.folder]).eq('titulo', titulo).limit(1);
    if (dup?.length) { skipped += 1; continue; }
    if (!existsSync(j.mxl)) { failed += 1; console.log(`sem leitura: ${j.file}`); continue; }
    try {
        const key = `acervo/${folderId[j.folder]}/${crypto.randomUUID().slice(0, 8)}-${slug(base)}`;
        const mxl = await upload(readFileSync(j.mxl), `${key}.mxl`, 'application/vnd.recordare.musicxml');
        const pdf = await upload(readFileSync(j.pdf), `${key}.pdf`, 'application/pdf');
        const { error } = await supabase.from('partituras').insert({
            pasta_id: folderId[j.folder], titulo, compositor, fonte, origem: 'pdf', limpar_anotacoes: true,
            arquivo_url: mxl.url, arquivo_bucket: mxl.bucket, arquivo_path: mxl.path,
            original_url: pdf.url, original_bucket: pdf.bucket, original_path: pdf.path,
        });
        if (error) throw new Error(error.message);
        added += 1;
        console.log(`+ ${j.folder} / ${titulo}`);
    } catch (e) { failed += 1; console.log(`FALHOU ${j.file}: ${e.message}`); }
}
console.log(`\nConcluído: ${added} adicionadas, ${skipped} já existiam, ${failed} com falha.`);
