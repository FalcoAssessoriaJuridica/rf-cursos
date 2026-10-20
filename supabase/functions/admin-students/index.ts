// RASCUNHO — Edge Function `admin-students` (Deno). Operações que exigem service_role e que
// o navegador NUNCA deve fazer sozinho: criar/atualizar/remover aluno e redefinir senha.
// Deploy: supabase functions deploy admin-students   (verify_jwt = true)
// Segredos: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (já injetados pelo Supabase).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*', // restringir ao domínio do app
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1) Quem está chamando? (JWT do usuário) — precisa ser admin.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  // 2) A partir daqui, service_role (ignora RLS) — só depois de validar o admin.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { action, ...p } = await req.json();

  switch (action) {
    case 'create': {
      // p: { nome_completo, email, telefone?, password?, cursos: [{ curso_id, data_expiracao?, status? }] }
      const { data, error } = await admin.auth.admin.createUser({
        email: p.email,
        password: p.password, // se vazio, usar inviteUserByEmail
        email_confirm: true,
        user_metadata: { nome_completo: p.nome_completo },
      });
      if (error) return json({ error: error.message }, 400);
      const id = data.user.id;
      const { error: e1 } = await admin.from('perfis').insert({ id, nome_completo: p.nome_completo, email: p.email, telefone: p.telefone ?? null });
      if (e1) { await admin.auth.admin.deleteUser(id); return json({ error: e1.message }, 400); }
      if (p.cursos?.length) {
        const { error: e2 } = await admin.from('inscricoes').insert(
          p.cursos.map((c: any) => ({ perfil_id: id, curso_id: c.curso_id, data_expiracao: c.data_expiracao ?? null, status: c.status ?? 'ativo' })),
        );
        if (e2) return json({ error: e2.message, user_id: id }, 400);
      }
      return json({ id });
    }
    case 'update': {
      // p: { id, email?, password?, nome_completo?, telefone? }
      const patch: Record<string, unknown> = {};
      if (p.email) patch.email = p.email;
      if (p.password) patch.password = p.password;
      if (Object.keys(patch).length) {
        const { error } = await admin.auth.admin.updateUserById(p.id, patch);
        if (error) return json({ error: error.message }, 400);
      }
      const prof: Record<string, unknown> = {};
      for (const k of ['nome_completo', 'telefone', 'email']) if (p[k] !== undefined) prof[k] = p[k];
      if (Object.keys(prof).length) await admin.from('perfis').update(prof).eq('id', p.id);
      return json({ ok: true });
    }
    case 'delete': {
      // perfis/inscricoes/progresso caem em cascata (FK on delete cascade — conferir no schema)
      const { error } = await admin.auth.admin.deleteUser(p.id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    case 'reset-password': {
      const { error } = await admin.auth.resetPasswordForEmail(p.email, { redirectTo: p.redirectTo });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    default:
      return json({ error: 'unknown action' }, 400);
  }
});
