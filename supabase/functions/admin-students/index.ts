// Edge Function `admin-students` (Deno). Operações que exigem service_role e que o navegador NUNCA faz sozinho:
// criar, atualizar, excluir aluno e enviar link de redefinição de senha.
// Deploy: supabase functions deploy admin-students   (verify_jwt = true, o padrão)
// Segredos: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (já injetados pelo Supabase) e
//           ALLOWED_ORIGIN (o domínio do app, ex.: https://rfcursos.falcotech.com.br — sem isso a função recusa chamadas de navegador).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowed = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const corsFor = (origin: string | null) => {
  const ok = !!origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// senha temporária legível, sem caracteres ambíguos (0/O, 1/l/I)
const temp = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
};

// nível da sessão (aal1 = só senha; aal2 = senha + código do 2º fator), lido do JWT já validado pelo Supabase
const aalDe = (authHeader: string): string | undefined => {
  try {
    const t = authHeader.replace(/^Bearer\s+/i, '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(t)).aal;
  } catch { return undefined; }
};
// administrador com verificação em duas etapas ativada só vale com a sessão em aal2
const adminValido = (user: any, authHeader: string) =>
  user?.app_metadata?.role === 'admin' && (!user.factors?.some((f: any) => f.status === 'verified') || aalDe(authHeader) === 'aal2');

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('Origin'));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // 1) Quem chamou? O JWT precisa ser de um ADMIN (app_metadata.role, que só o service_role altera).
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await asUser.auth.getUser();
  if (authErr || !user || !adminValido(user, authHeader)) return json({ error: 'forbidden' }, 403);

  // 2) Só depois de validar o admin entra o service_role (ignora RLS).
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const { action, ...p } = body;

  const isAdminUser = async (id: string) => {
    const { data } = await admin.auth.admin.getUserById(id);
    return data?.user?.app_metadata?.role === 'admin';
  };

  switch (action) {
    case 'create': {
      // p: { nome_completo, email, telefone?, password?, cursos: [{ curso_id, data_expiracao?, status? }] }
      const email = String(p.email ?? '').trim().toLowerCase();
      if (!EMAIL.test(email)) return json({ error: 'E-mail inválido.' }, 400);
      if (!String(p.nome_completo ?? '').trim()) return json({ error: 'Informe o nome.' }, 400);
      if (p.password && String(p.password).length < MIN_PASSWORD) return json({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.` }, 400);
      const password = p.password ? String(p.password) : temp();
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome_completo: p.nome_completo } });
      if (error) return json({ error: /already|registered/i.test(error.message) ? 'Já existe um cadastro com este e-mail.' : error.message }, 400);
      const id = data.user.id;
      const { error: e1 } = await admin.from('perfis').insert({ id, nome_completo: p.nome_completo, email, telefone: p.telefone ?? null });
      if (e1) { await admin.auth.admin.deleteUser(id); return json({ error: e1.message }, 400); }
      if (p.cursos?.length) {
        const rows = p.cursos.filter((c: any) => UUID.test(c.curso_id)).map((c: any) => ({ perfil_id: id, curso_id: c.curso_id, data_expiracao: c.data_expiracao || null, status: c.status ?? 'ativo' }));
        const { error: e2 } = await admin.from('inscricoes').insert(rows);
        if (e2) return json({ error: e2.message, id }, 400);
      }
      // a senha só volta quando foi gerada aqui (se o admin digitou, ele já a conhece)
      return json({ id, senha_temporaria: p.password ? undefined : password });
    }
    case 'update': {
      // p: { id, email?, password?, nome_completo?, telefone? }
      if (!UUID.test(p.id)) return json({ error: 'id inválido' }, 400);
      if (await isAdminUser(p.id) && p.id !== user.id) return json({ error: 'Contas de administrador não são editadas por aqui.' }, 403);
      const patch: Record<string, unknown> = {};
      if (p.email) {
        const email = String(p.email).trim().toLowerCase();
        if (!EMAIL.test(email)) return json({ error: 'E-mail inválido.' }, 400);
        patch.email = email; patch.email_confirm = true;
      }
      if (p.password) {
        if (String(p.password).length < MIN_PASSWORD) return json({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.` }, 400);
        patch.password = String(p.password);
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.auth.admin.updateUserById(p.id, patch);
        if (error) return json({ error: error.message }, 400);
      }
      const prof: Record<string, unknown> = {};
      for (const k of ['nome_completo', 'telefone']) if (p[k] !== undefined) prof[k] = p[k];
      if (patch.email) prof.email = patch.email;
      if (Object.keys(prof).length) {
        const { error } = await admin.from('perfis').update(prof).eq('id', p.id);
        if (error) return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }
    case 'delete': {
      if (!UUID.test(p.id)) return json({ error: 'id inválido' }, 400);
      if (p.id === user.id || await isAdminUser(p.id)) return json({ error: 'Contas de administrador não podem ser excluídas por aqui.' }, 403);
      // não depende de ON DELETE CASCADE: apaga os dados do aluno explicitamente e só então a conta
      await admin.from('progresso').delete().eq('perfil_id', p.id);
      await admin.from('inscricoes').delete().eq('perfil_id', p.id);
      await admin.from('perfis').delete().eq('id', p.id);
      const { error } = await admin.auth.admin.deleteUser(p.id);
      if (error && !/not found/i.test(error.message)) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    case 'reset-password': {
      // envia o e-mail de redefinição (exige SMTP configurado; o Supabase padrão limita poucos e-mails por hora)
      const email = String(p.email ?? '').trim().toLowerCase();
      if (!EMAIL.test(email)) return json({ error: 'E-mail inválido.' }, 400);
      const redirectTo = allowed[0] ? `${allowed[0]}/redefinir-senha` : undefined;
      const { error } = await asUser.auth.resetPasswordForEmail(email, { redirectTo });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    default:
      return json({ error: 'unknown action' }, 400);
  }
});
