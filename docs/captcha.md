# CAPTCHA (Cloudflare Turnstile)

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

## Sobre a verificação em duas etapas (MFA) do administrador
Foi implementada e depois **removida** por decisão do responsável (não necessária por ora). O código ficou no histórico do Git (commit `1ae81b2`) e pode ser recuperado se for preciso.
