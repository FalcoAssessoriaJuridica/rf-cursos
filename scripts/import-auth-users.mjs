// Importa os perfis atuais (senha em texto puro) para o Supabase Auth, preservando o MESMO id, para que
// inscricoes.perfil_id e progresso.perfil_id continuem válidos sem reescrever chave nenhuma.
//
// Uso (na sua máquina, no terminal; a chave service_role NUNCA vai para o navegador, para o Git nem para este chat):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chave> ADMIN_INITIAL_PASSWORD='<senha forte do admin>' \
//     node scripts/import-auth-users.mjs --dry-run
//   (confira a lista) e depois o mesmo comando sem --dry-run.
//
// Opções:  --min-len=8   senhas mais curtas viram senha aleatória e entram no relatório "precisam redefinir" (padrão 8)
//          --dry-run     não cria nada
// Variáveis: ADMIN_EMAIL (padrão falco.adv@gmail.com), ADMIN_INITIAL_PASSWORD (obrigatória para criar o admin)
//
// O admin é criado com app_metadata.role = 'admin' (só o service_role altera esse campo; o próprio usuário não se promove).
// É reexecutável: quem já existe no Auth é pulado. Nenhuma senha é impressa.
import { createClient } from '@supabase/supabase-js';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] ?? d;
const dry = process.argv.includes('--dry-run');
const minLen = Number(arg('min-len', 8));
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'falco.adv@gmail.com').toLowerCase();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_INITIAL_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
if (!dry && !ADMIN_INITIAL_PASSWORD) { console.error('Defina ADMIN_INITIAL_PASSWORD (a senha nova do administrador).'); process.exit(1); }
if (!dry && ADMIN_INITIAL_PASSWORD.length < 10) { console.error('A senha do administrador precisa ter pelo menos 10 caracteres.'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: perfis, error } = await sb.from('perfis').select('id, email, nome_completo, senha');
if (error) { console.error('Não foi possível ler perfis:', error.message); process.exit(1); }

const stats = { total: perfis.length, criados: 0, jaExistiam: 0, ignorados: 0, falhas: 0 };
const redefinir = [];
let admin = null;

for (const p of perfis) {
  const email = (p.email || '').trim().toLowerCase();
  if (!email) { console.warn('sem e-mail, ignorado:', p.id); stats.ignorados += 1; continue; }
  const isAdmin = email === ADMIN_EMAIL;
  const weak = !p.senha || p.senha.length < minLen;

  const { data: found } = await sb.auth.admin.getUserById(p.id);
  if (found?.user) {
    stats.jaExistiam += 1;
    if (isAdmin) admin = 'já existia';
    continue;
  }
  if (dry) { console.log(`[dry] ${email}${isAdmin ? ' (ADMIN)' : ''}${!isAdmin && weak ? ' → senha ausente/curta: precisará redefinir' : ''}`); continue; }

  const { error: e } = await sb.auth.admin.createUser({
    id: p.id,                                              // mantém o vínculo com inscrições/progresso
    email,
    password: isAdmin ? ADMIN_INITIAL_PASSWORD : weak ? crypto.randomUUID() : p.senha,
    email_confirm: true,
    user_metadata: { nome_completo: p.nome_completo },
    app_metadata: isAdmin ? { role: 'admin' } : undefined,
  });
  if (e) { console.error('falhou:', email, '-', e.message); stats.falhas += 1; continue; }
  stats.criados += 1;
  if (isAdmin) admin = 'criado';
  else if (weak) redefinir.push(email);
}

// O administrador PODE não ter linha em `perfis` (hoje ele entra por uma senha mestra no código). Então é criado/ajustado pelo e-mail,
// sem criar perfil de aluno (ele não deve aparecer na lista de alunos).
if (!admin) {
  let found = null;
  for (let page = 1; !found; page += 1) {
    const { data, error: le } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (le || !data?.users?.length) break;
    found = data.users.find((u) => (u.email || '').toLowerCase() === ADMIN_EMAIL) || null;
    if (data.users.length < 1000) break;
  }
  if (found) {
    admin = found.app_metadata?.role === 'admin' ? 'já existia' : 'promovido';
    if (!dry && admin === 'promovido') await sb.auth.admin.updateUserById(found.id, { app_metadata: { ...found.app_metadata, role: 'admin' } });
  } else if (dry) {
    console.log(`[dry] ${ADMIN_EMAIL} (ADMIN, sem linha em perfis) será criado com a senha de ADMIN_INITIAL_PASSWORD`);
  } else {
    const { error: ce } = await sb.auth.admin.createUser({ email: ADMIN_EMAIL, password: ADMIN_INITIAL_PASSWORD, email_confirm: true, user_metadata: { nome_completo: 'Administrador' }, app_metadata: { role: 'admin' } });
    if (ce) { console.error('falhou ao criar o admin:', ce.message); stats.falhas += 1; } else admin = 'criado';
  }
}

console.log('\nResumo:', stats);
console.log('Administrador:', admin ?? (dry ? '(dry-run)' : `NÃO ENCONTRADO em perfis (${ADMIN_EMAIL}) — crie/ajuste o perfil do admin`));
if (redefinir.length) {
  console.log(`\nPrecisam definir senha nova (a antiga era vazia/curta; entram pelo "Esqueci minha senha" ou o admin envia o link):\n  - ${redefinir.join('\n  - ')}`);
}
