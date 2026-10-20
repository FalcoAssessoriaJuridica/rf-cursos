// RASCUNHO — importa os alunos atuais (perfis com senha em texto puro) para o Supabase Auth,
// preservando o MESMO id, para que inscricoes.perfil_id e progresso.perfil_id continuem válidos.
// Uso (na sua máquina, nunca no navegador):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-auth-users.mjs --dry-run
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-auth-users.mjs
import { createClient } from '@supabase/supabase-js';

const dry = process.argv.includes('--dry-run');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: perfis, error } = await sb.from('perfis').select('id, email, nome_completo, senha');
if (error) throw error;

let ok = 0, skip = 0, fail = 0;
for (const p of perfis) {
  if (!p.email) { console.warn('sem e-mail, ignorado:', p.id); skip++; continue; }
  const weak = !p.senha || p.senha.length < 8;           // política nova: mínimo 8
  if (dry) { console.log(`[dry] ${p.email} ${weak ? '(senha fraca/ausente → enviar redefinição)' : ''}`); continue; }

  const { error: e } = await sb.auth.admin.createUser({
    id: p.id,                                             // mantém o vínculo com inscrições/progresso
    email: p.email,
    password: weak ? crypto.randomUUID() : p.senha,       // senha fraca vira aleatória + e-mail de redefinição
    email_confirm: true,
    user_metadata: { nome_completo: p.nome_completo },
  });
  if (e) { console.error('falhou:', p.email, e.message); fail++; continue; }
  if (weak) await sb.auth.resetPasswordForEmail(p.email);
  ok++;
}
console.log({ total: perfis.length, importados: ok, ignorados: skip, falhas: fail });
// Depois de validar: rodar 0002 (remove a coluna `senha`) e apagar este script/saídas de log.
