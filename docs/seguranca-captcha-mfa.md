# CAPTCHA e verificação em duas etapas (MFA)

## CAPTCHA (Cloudflare Turnstile, gratuito)
Protege o **cadastro**, o **login** e o **"Esqueci minha senha"** contra robôs (cadastros em massa, tentativas de senha, envio de e-mails em série).
Sem a chave configurada, nada muda (o componente simplesmente não aparece). Cada ação pede um token novo; só aparece desafio quando o Cloudflare desconfia.

### Configuração (nesta ordem)
1. Cloudflare → **Turnstile → Add widget**: nome `RF Cursos`, domínio `rfcursos.falcotech.com.br`, modo **Managed**. Copie a **Site Key** (pública) e a **Secret Key**.
2. **Easypanel**: acrescente o argumento de build `VITE_TURNSTILE_SITE_KEY` com a Site Key e refaça o deploy do site.
3. **Supabase → Edge Functions → Secrets**: `TURNSTILE_SECRET_KEY` = Secret Key. Republique a função `signup` (ela passa a exigir e conferir o token).
4. **Só depois** de confirmar que o site novo está no ar com o desafio funcionando: Supabase → **Authentication → Attack Protection** (ou "Bot and Abuse Protection") → **Enable CAPTCHA protection** → Turnstile → cole a Secret Key.
   Se ligar esse passo antes do deploy do site, ninguém consegue entrar (o site antigo não envia o token).
5. Teste: cadastro, login e "Esqueci minha senha" (em janela anônima).

## MFA do administrador (app autenticador, TOTP)
Com o MFA ativo, entrar no painel exige **senha + código de 6 dígitos**. A regra vale também no banco e nas funções: uma sessão só de senha não age como administrador.

### Ativação (nesta ordem)
1. Supabase → **Authentication → Sign In / Providers → Multi-Factor**: TOTP com **Enroll** e **Verify** habilitados (costuma vir ligado).
2. Republique as funções `admin-students` e `pagamentos` (passam a exigir a sessão com código quando o administrador tem MFA) e faça o deploy do site.
3. Entre como administrador → **Segurança** (menu) → **Ativar verificação em duas etapas** → leia o QR no Google/Microsoft Authenticator, Authy ou 1Password → digite o código.
   Se puder, cadastre o mesmo QR em dois aparelhos.
4. Saia e entre de novo: depois da senha, o site pede o código.
5. **Só depois de confirmar o passo 4**, rode no SQL Editor `supabase/migrations/0015_mfa_admin.sql` (trava o banco: administrador com MFA só vale em sessão com código). Quem não ativou o MFA não é afetado.

### Se perder o celular
Não há código de recuperação automático. Remova o fator pelo Supabase: **Authentication → Users →** a conta **→ Multi-factor →** excluir
(ou no SQL: `delete from auth.mfa_factors where user_id = '<id do usuário>';`). Depois entre só com a senha e cadastre o MFA de novo.

### Reverter a trava do banco
Rode de novo o `is_admin()` original do `0001_auth_rls_prepare.sql` (a função sem a checagem de `aal`).

## Como foi testado (Supabase local + Chrome isolado)
- MFA no banco: sem MFA o administrador age normalmente; depois de ativar, uma sessão só com senha **deixa de ser administrador** (`is_admin` falso, não lê dados de outros); com o código volta; código errado é recusado; desativar normaliza.
- Funções: `admin-students` responde **403** à sessão só de senha e passa da verificação com o código.
- Interface: ativar pela página Segurança (QR + código), login pedindo o código, recarregar no meio mantém o passo, código errado mostra aviso, código certo entra no painel, desativar.
- CAPTCHA (chaves de teste do Cloudflare): cadastro conclui com o token; com a chave que reprova mostra o aviso e não cria a conta; sem token a função responde 400.
