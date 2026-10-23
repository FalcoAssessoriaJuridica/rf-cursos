// Backup das tabelas do sistema em JSON ANTES do cutover (enquanto a chave anônima ainda lê tudo).
// Atenção: os arquivos contêm as senhas em texto puro dos alunos (a coluna `senha`). Ficam FORA do repositório, em
// ~/rf-cursos-backups/<data>/, com permissão só do seu usuário. Apague-os depois de validar o cutover.
//   node scripts/backup-producao.mjs
import { createClient } from '@supabase/supabase-js';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=')+1).replace(/^"|"$/g, '').trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const dir = join(homedir(), 'rf-cursos-backups', stamp);
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);

const TABELAS = ['perfis', 'inscricoes', 'cursos', 'modulos', 'aulas', 'progresso', 'configuracoes', 'partitura_pastas', 'partituras', 'partitura_vinculos'];
let falhou = false;
for (const t of TABELAS) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(t).select('*').range(from, from + 999);
    if (error) { console.error(`✗ ${t}: ${error.message}`); falhou = true; break; }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const file = join(dir, `${t}.json`);
  writeFileSync(file, JSON.stringify(rows, null, 1), { mode: 0o600 });
  console.log(`✓ ${t.padEnd(20)} ${String(rows.length).padStart(5)} linhas`);
}
console.log(`\nBackup em ${dir}`);
if (falhou) { console.error('Alguma tabela não pôde ser lida. NÃO faça o cutover sem um backup completo.'); process.exit(1); }
