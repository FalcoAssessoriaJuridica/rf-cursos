# Virada do login para o Supabase Auth — roteiro de produção

Ensaiado de ponta a ponta num Supabase local (`supabase/local-test/`, ver `README.md` lá): base com os SQLs, importação, login de admin e de
alunos, função `admin-students`, recuperação de senha, matriz de testes de RLS (49 verificações de aluno/admin + 17 do visitante anônimo) e o
próprio cutover. Todas passaram. Este roteiro repete o que foi ensaiado, na ordem.

**Estado hoje em produção (conferido em 23/10/2026):** o `0001` ainda não foi aplicado; a chave pública do site lê e escreve em todas as tabelas
e consegue listar a coluna `senha` (4 de 5 perfis têm senha em texto puro: 1 com 11 caracteres, 3 com 4 a 5 e 1 vazia).
Não existe perfil do administrador em `perfis` (ele entra por uma senha mestra no código).

Legenda: **[Mac]** terminal do seu computador · **[SQL]** SQL Editor do Supabase · **[Supabase]** painel do Supabase · **[Easypanel]**

O sistema atual continua funcionando até a Fase 5: as fases 1 a 4 não quebram nada (as políticas `legacy_anon_*` preservam o acesso antigo).

---

## Fase 0 — Preparação (15 min)

1. **[Mac]** Backup (grava em `~/rf-cursos-backups/<data>/`, fora do repositório; contém as senhas atuais, apague depois):
   ```bash
   node scripts/backup-producao.mjs
   ```
2. **[Supabase] Authentication → Sign In / Providers → Email**
   - **Allow new users to sign up: DESLIGADO** (senão qualquer pessoa com a chave pública cria conta).
   - Minimum password length: **8**. Confirm email: pode ficar desligado (as contas são criadas já confirmadas).
3. **[Supabase] Authentication → URL Configuration**
   - Site URL: `https://rfcursos.falcotech.com.br`
   - Redirect URLs: acrescentar `https://rfcursos.falcotech.com.br/redefinir-senha`
4. **E-mail (recomendado):** o envio padrão do Supabase aceita só poucos e-mails por hora. Para "Esqueci minha senha" funcionar para todos,
   configure um SMTP próprio em **Authentication → SMTP Settings** (Resend, Brevo, Amazon SES...). Sem isso o botão funciona, mas pode
   falhar por limite; a alternativa é você definir a senha do aluno pelo painel (Fase 4).

## Fase 1 — Regras de acesso, ainda com o acesso antigo ligado (5 min)

**[SQL]** rodar, nesta ordem, o conteúdo de cada arquivo (abra o arquivo, copie tudo, cole no editor e clique em Run):
1. `supabase/migrations/0001_auth_rls_prepare.sql`
2. `supabase/migrations/0008_partituras_rls.sql`

Conferir: o site atual continua funcionando como antes (login, cursos, aulas).
**Reverter:** `alter table public.<tabela> disable row level security;` nas tabelas, ou rodar o backup de volta.

## Fase 2 — Função de administração (10 min)

**[Mac]** (precisa do CLI do Supabase logado: `supabase login`)
```bash
supabase functions deploy admin-students --project-ref bghvzdfikfhceekoxtxg
supabase secrets set ALLOWED_ORIGIN=https://rfcursos.falcotech.com.br --project-ref bghvzdfikfhceekoxtxg
```
Conferir: chamar a função sem login deve responder **401**.

## Fase 3 — Importar os usuários (5 min)

A chave **service_role** (Supabase → Settings → API) vai só na linha de comando abaixo, **nunca** em arquivo do projeto, no site ou em conversa.

**[Mac]** primeiro o ensaio (não cria nada):
```bash
SUPABASE_URL=https://bghvzdfikfhceekoxtxg.supabase.co SUPABASE_SERVICE_ROLE_KEY='<service_role>' \
  node scripts/import-auth-users.mjs --dry-run
```
Depois, de verdade (escolha uma senha forte, com 10+ caracteres, para o administrador `falco.adv@gmail.com`):
```bash
SUPABASE_URL=https://bghvzdfikfhceekoxtxg.supabase.co SUPABASE_SERVICE_ROLE_KEY='<service_role>' \
  ADMIN_INITIAL_PASSWORD='<senha-forte-do-admin>' node scripts/import-auth-users.mjs
```
O relatório mostra: o admin criado, os alunos importados com o **mesmo id** (matrículas e progresso continuam valendo) e quem **precisa de senha nova**
(senha atual vazia ou com menos de 8 caracteres: hoje são 4 de 5). Quem tinha senha de 8+ caracteres mantém a mesma.
**Reverter:** apagar os usuários em Authentication → Users (os dados das tabelas não são tocados).

## Fase 4 — Publicar o site novo e validar (30 min)

1. **[Mac]** commit e push da `main` (o site novo usa o Supabase Auth). **[Easypanel]** fazer o deploy.
   As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` já existem; **`VITE_ADMIN_MASTER_PASSWORD` não é mais usada** (pode remover depois).
2. Validar com contas reais, **ainda antes do cutover**:
   - Entrar como **admin** (`falco.adv@gmail.com` + a senha da Fase 3): abre o painel, lista os alunos, abre um curso.
   - Em **Alunos**, editar cada aluno que precisa de senha nova e informar uma "Nova senha" (mínimo 8); enviar a ele pelo WhatsApp.
   - Entrar como **um aluno**: vê só os cursos dele, assiste uma aula, grava progresso; em "Meu perfil" troca a senha e a foto.
   - "Esqueci minha senha": o e-mail chega e o link abre a tela de senha nova.
   - Cadastrar um aluno de teste pela tela e apagar em seguida.
3. Se algo falhar: reverter o deploy do Easypanel (o acesso antigo ainda está ligado, então o site antigo volta a funcionar).

## Fase 5 — Cutover (fora do horário de uso, 5 min)

Só depois de tudo da Fase 4 estar validado e com o backup recente (`node scripts/backup-producao.mjs` de novo, na hora).

**[SQL]** rodar `supabase/migrations/0002_auth_rls_cutover.sql`. Ele se recusa a rodar se existir perfil sem conta no Auth.
Remove o acesso anônimo e **apaga a coluna `senha`**.

Verificar (o visitante sem login não pode ler nada; esperado: `[]` nos três):
```bash
KEY=<a anon key do site>; URL=https://bghvzdfikfhceekoxtxg.supabase.co
for t in perfis aulas inscricoes; do curl -s "$URL/rest/v1/$t?select=*&limit=1" -H "apikey: $KEY"; echo; done
```
**Reverter (emergência):** recriar as políticas `legacy_anon_*` do `0001` §4 e a coluna (`alter table public.perfis add column senha text;`),
restaurando as senhas do backup. Evite: preferível corrigir para frente.

## Fase 6 — Depois

- Apagar `~/rf-cursos-backups/` (tem senhas em texto puro) e a linha `VITE_ADMIN_MASTER_PASSWORD` do Easypanel.
- Opcional: rotacionar a anon key e a service_role (Settings → API). A anon key deixa de ser sensível após a Fase 5; se rotacionar, redeploy do site com a chave nova.
- Mensagem de boas-vindas do painel passa a enviar **senha temporária** (e o aluno pode trocar em "Meu perfil").

## Pendências que este roteiro NÃO resolve

- **`drive-proxy`** (função usada para áudio/PDF): o código dela não está neste repositório, então não foi endurecida (hoje qualquer um chama).
  Ver `docs/migracao-supabase-auth-rls.md` §4: ativar `verify_jwt` e checar acesso à aula. Preciso do código para fazer.
- **Link do vídeo/arquivo:** quem já tem a URL (Drive, YouTube, Panda, Storage público) consegue repassá-la. A RLS protege quem **recebe** o link.
- **MFA do administrador** e CAPTCHA no login: recomendados, não feitos.
- Funções `omr-convert` (leitura de PDF): ainda não publicada.
