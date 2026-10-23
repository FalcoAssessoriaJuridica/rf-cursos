# Migração para Supabase Auth + RLS — desenho

> **Status (23/10/2026): implementado no código e ensaiado num Supabase local; falta aplicar em produção.**
> O passo a passo de produção, com verificação e reversão, está em [`virada-login-producao.md`](virada-login-producao.md).
> O front já usa o Supabase Auth (`src/lib/auth.js`, `Login.jsx`, `RecuperarSenha.jsx`, `RedefinirSenha.jsx`, `Students.jsx` via função).
> Este documento fica como o desenho e a justificativa.

## 1. Por que migrar

Hoje a "autenticação" é uma convenção do front-end:

| Situação atual | Consequência |
|---|---|
| Login consulta `perfis` com `email` + `senha` **em texto puro**, usando a chave pública (`anon`) | Qualquer pessoa com a chave (que está no bundle) pode listar todos os e-mails e senhas |
| Sessão = `localStorage` (`rf_role`, `rf_user_id`) | Dá para se passar por admin ou por qualquer aluno pelo DevTools |
| Senha mestra do admin no front (agora só como hash) | Barreira de interface; não protege dados |
| Bloqueio/expiração checados só no navegador | Quem chama a API direto ignora o bloqueio |
| `aulas` expõe `id_video_profissional`, `url_video_drive` e materiais a quem tiver a chave | Conteúdo pago acessível sem matrícula |
| `progresso` gravável por qualquer um | Dá para alterar o progresso de outro aluno |
| Bucket `course-covers` aceita upload com a chave pública | Qualquer um sobe arquivos |

**Meta:** identidade verificada pelo servidor (Supabase Auth) e **autorização no banco** (RLS), de modo que
a chave pública não dê acesso a nada além do login.

## 2. Arquitetura alvo

```
Navegador ──(email+senha)──▶ Supabase Auth ──▶ JWT (sub = auth.uid(), app_metadata.role)
    │                                              │
    └─ supabase-js com o JWT ───────────────▶ Postgres + RLS  (decide por linha)
    └─ ações de admin que precisam de service_role ─▶ Edge Function `admin-students`
```

- **Aluno:** `auth.users` + linha 1:1 em `perfis` (`perfis.id = auth.users.id`).
- **Admin:** usuário normal com `app_metadata.role = 'admin'`. Esse campo só o `service_role` altera; o próprio
  usuário não consegue se promover (diferente de `user_metadata`).
- **Acesso a curso** (`has_course_access`) = admin **ou** matrícula com `status <> 'bloqueado'` e não expirada.
  Bloqueio manual e expiração passam a valer **no banco, a cada consulta**, sem depender do front.

## 3. Matriz de permissões (RLS)

| Tabela | Aluno | Admin |
|---|---|---|
| `perfis` | lê o próprio; edita só `nome_completo`, `telefone` | tudo |
| `inscricoes` | lê as próprias | tudo (única forma de mudar `status`/`data_expiracao`) |
| `cursos`, `modulos` | lê somente cursos com acesso ativo | tudo |
| `aulas` | lê somente aulas de cursos com acesso ativo (inclui URLs/materiais) | tudo |
| `progresso` | lê/cria/atualiza o próprio, e só em aulas com acesso ativo | lê tudo; apaga |
| `configuracoes` | — | tudo |
| Storage `course-covers` | leitura pública (capas) | upload/alteração/remoção |

SQL completo: [`0001_auth_rls_prepare.sql`](../supabase/migrations/0001_auth_rls_prepare.sql).
Pontos de atenção:
- As funções `is_admin`, `has_course_access` e `has_lesson_access` são `security definer` para evitar recursão
  de políticas entre `inscricoes` ↔ `aulas` ↔ `modulos`.
- `data_expiracao` é comparada como `timestamptz > now()`, igual à lógica atual do front
  (`new Date(exp) < new Date()`): uma data `2026-11-19` vale até 00:00 daquele dia. Se preferirem "até o fim do dia",
  trocar por `data_expiracao::date >= current_date`.
- Aluno **não** consegue alterar a própria expiração/bloqueio: não há política de escrita em `inscricoes` para ele.

## 4. Edge Function `admin-students`

O navegador não pode criar usuários nem trocar senha de terceiros (exige `service_role`). Uma única função
([`index.ts`](../supabase/functions/admin-students/index.ts)) expõe `create`, `update`, `delete` e `reset-password`:

1. valida o JWT de quem chamou e exige `app_metadata.role = 'admin'`;
2. só então usa o `service_role`;
3. `CORS` restrito ao domínio do app (`ALLOWED_ORIGIN`).

`Students.jsx` passa a chamar `supabase.functions.invoke('admin-students', { body: { action, ... } })` em vez de
escrever em `perfis`/`inscricoes` com senha. A tela **deixa de mostrar/editar `senha`**; entram "Enviar link de
redefinição" e "Definir senha temporária".

Também revisar a função existente **`drive-proxy`** (usada em áudio/PDF): ativar `verify_jwt` e checar
`has_lesson_access` do material pedido; hoje ela é chamável por qualquer um.

## 5. Migração dos usuários atuais

Os alunos já têm senha em texto puro, o que permite importar **sem trocar a senha de ninguém**:

1. Criar o admin em *Authentication → Users* e rodar [`0003_seed_admin_role.sql`](../supabase/migrations/0003_seed_admin_role.sql).
2. Rodar `scripts/import-auth-users.mjs --dry-run` e conferir a lista; depois sem `--dry-run`.
   - O script cria cada usuário **com o mesmo `id`** de `perfis`, então `inscricoes.perfil_id` e `progresso.perfil_id`
     continuam valendo, sem reescrever chaves.
   - Senhas ausentes ou com menos de 8 caracteres viram senha aleatória + e-mail de redefinição.
3. Só após validar tudo, o `0002` apaga a coluna `senha`.

Alternativa mais "limpa": mandar e-mail de redefinição para **todos** (ninguém tem a senha antiga guardada), ao custo
de atrito para os alunos. Recomendo a importação com senha + convite de redefinição opcional.

## 6. Mudanças no front-end

| Arquivo | Mudança |
|---|---|
| novo `src/lib/auth.js` | `AuthProvider`/`useAuth()`: `supabase.auth.getSession()` + `onAuthStateChange`, expõe `user`, `role` (`user.app_metadata.role`), `signIn`, `signOut`, `loading` |
| `src/pages/Login.jsx` | `supabase.auth.signInWithPassword({ email, password })`; some a consulta a `perfis` e o login "mestre" |
| `src/App.jsx` | `AdminRoute`/`StudentRoute` usam `useAuth()` (com tela de carregamento); admin pré-visualizando a área do aluno continua permitido |
| `src/layout/MainLayout.jsx` | `signOut()` real; nome vem de `perfis` do usuário logado |
| `src/pages/student/*`, `src/lib/courseData.js` | trocar `localStorage.rf_user_id` por `user.id`; remover os `eq('perfil_id', ...)` redundantes (a RLS já filtra, manter por clareza é opcional) |
| `src/pages/admin/Students.jsx` | criar/editar/excluir via Edge Function; sem campo `senha`; "30 dias"/bloqueio continuam escrevendo em `inscricoes` (permitido ao admin) |
| `src/pages/admin/Courses.jsx` | upload de capa passa a exigir admin (já é o caso) |
| remover | `src/lib/adminAuth.js`, `VITE_ADMIN_MASTER_PASSWORD`, `rf_role`/`rf_user_*` |
| novo | `/recuperar-senha` e `/redefinir-senha` (`resetPasswordForEmail` + `updateUser`) |
| modo demo | continua local (`DEMO_ENABLED`); a sessão demo é simulada e **nunca** chama o Supabase |

Habilitar também: senha mínima de 10 caracteres e proteção contra senhas vazadas (Pro), CAPTCHA (Turnstile) no
login, limite de tentativas, e **MFA (TOTP) para o admin**.

## 7. Plano de rollout (sem tirar o sistema do ar)

O front atual depende do acesso anônimo; ligar RLS "de uma vez" o quebraria. Por isso há uma fase de transição
com políticas `legacy_anon_*` que preservam o comportamento atual.

| Fase | O que faz | Risco | Reversão |
|---|---|---|---|
| 0 | Backup (`pg_dump`) e dump do schema atual; congelar mudanças de schema | — | — |
| 1 | Rodar `0001` (funções + RLS + políticas novas + `legacy_anon_*`) | Baixo: app atual continua igual | `disable row level security` + `drop policy` |
| 2 | Criar admin, importar alunos, publicar Edge Function | Baixo | apagar usuários importados |
| 3 | Publicar o front novo (Auth); validar com alunos-teste | Médio | reverter o deploy (RLS ainda permissiva) |
| 4 | Rodar **matriz de testes** (abaixo) e `0002` (remove `legacy_anon_*`, FK, apaga `senha`) | Alto: aqui o front antigo para de funcionar | recriar `legacy_anon_*` e a coluna `senha` (guardar backup) |
| 5 | Rotacionar `anon` e `service_role`; remover o login mestre | Baixo | — |

Fazer a fase 4 fora do horário de uso e com o backup à mão.

### Matriz de testes de RLS (rodar antes da fase 4)

Em SQL (`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated","app_metadata":{"role":"admin"}}', true);`)
e depois ponta a ponta com contas reais de teste:

1. `anon` não lê nem escreve nada em nenhuma tabela.
2. Aluno A (curso X ativo): vê só o curso X; **não** vê o curso Y nem suas aulas/URLs.
3. Aluno A não lê `inscricoes`, `perfis` nem `progresso` do aluno B; não grava progresso em nome de B.
4. Matrícula **bloqueada** ou **expirada**: some de `cursos/modulos/aulas` na mesma consulta e o `progresso` não grava.
5. Aluno não consegue `update inscricoes set status='ativo'` nem `update perfis set ...` fora de nome/telefone.
6. Aluno não consegue se promover (`app_metadata` não é gravável pelo cliente).
7. Admin lê/escreve tudo; chamadas à Edge Function de quem não é admin retornam 403.
8. Upload em `course-covers` só funciona como admin.

Esses mesmos cenários podem virar testes automatizados (Playwright + contas de teste), reaproveitando a matriz
que já usamos nos alunos demo.

## 8. O que isto **não** resolve

- **Vídeo/arquivo em si:** a RLS protege *quem recebe o link*; quem já viu o link do Drive/YouTube/Panda pode
  repassá-lo. Mitigações: vídeos privados com domínio permitido (Panda/Vimeo), URLs assinadas e `drive-proxy` com JWT.
- **Compartilhamento de conta:** continua possível; mitigar com limite de sessões/dispositivos se for preciso.
- **Chave `service_role`:** nunca vai para o front nem para variáveis `VITE_*`; só na Edge Function/ambiente seguro.

## 9. Pendências para fechar o desenho (preciso de você)

1. **Schema real:** `supabase db dump --schema public --schema storage -f schema.sql` (ou acesso ao projeto pelo
   conector). Preciso confirmar tipos (`uuid`? `data_expiracao` é `date`?), FKs/`on delete`, se já existe RLS ou
   política e se `inscricoes.status` só tem `ativo|bloqueado`.
2. **Chave/ambiente:** o `.env` desta pasta devolve *Invalid API key*; confirmar o projeto certo (`bghvzdfikfhceekoxtxg`?)
   e quem tem permissão de rodar SQL e publicar funções.
3. **Admin:** só `falco.adv@gmail.com` ou haverá outros (equipe)? Se outros, vale uma tabela de papéis.
4. **E-mail:** há SMTP/domínio para os e-mails de convite e redefinição? (o Supabase padrão tem limite baixo.)
5. **Quantos alunos** existem hoje e quantos têm senha fraca/ausente.
6. **Mensagem de boas-vindas** (WhatsApp) que hoje inclui a senha: passará a mandar link de definição de senha.
7. **`drive-proxy`:** quem o consome além do app? (para endurecer sem quebrar.)

## 10. Esforço estimado

| Bloco | Estimativa |
|---|---|
| Levantar schema + ajustar SQLs + ambiente de teste (branch do Supabase) | 0,5–1 dia |
| Edge Function + importação | 0,5–1 dia |
| Front (auth, guards, Login, Students, recuperação de senha) | 1,5–2 dias |
| Testes de RLS + e2e e ensaio da virada | 1 dia |
| **Total** | **≈ 3,5–5 dias**, mais a janela de cutover |

Recomendo ensaiar tudo num **branch do Supabase** (ou projeto de staging) antes de tocar no banco de produção.
