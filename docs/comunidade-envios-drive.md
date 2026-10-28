# Comunidade MAC: envio de vídeo dos alunos pelo Google Drive (gratuito)

Os vídeos dos alunos vão para uma pasta **privada** do Drive do professor ("Comunidade MAC - envios"). Ninguém recebe link do Drive: o aluno
envia direto do celular para o Google, e o vídeo é tocado pelo player do próprio app, através da função `comunidade-video`, com um link
assinado que expira em 4 horas. Só o aluno dono e o professor conseguem pedir esse link.

Custo: **zero**. Usa o Google Cloud sem cobrança (a API do Drive é gratuita) e o armazenamento do Drive da conta escolhida.

## O que fazer uma vez (cerca de 15 minutos, só você pode fazer)

1. **Banco (Supabase, SQL Editor):** rode `supabase/migrations/0019_comunidade_envios.sql`.
2. **Google Cloud:** em https://console.cloud.google.com crie um projeto (ex.: "RF Cursos"). Não precisa ligar cobrança.
3. **Ative a API:** *APIs e serviços > Biblioteca > Google Drive API > Ativar*.
4. **Tela de consentimento OAuth:** *APIs e serviços > Tela de permissão OAuth*. Tipo de usuário **Externo**; nome do app e seu e-mail. Em
   *Escopos* inclua `.../auth/drive.file`. Depois clique em **Publicar app** (status "Em produção"). Isso é importante: em "Teste" o token do
   Google vence em 7 dias e os envios param de funcionar. O escopo `drive.file` não exige verificação do Google.
5. **Credenciais:** *Credenciais > Criar credenciais > ID do cliente OAuth*, tipo **Aplicativo da Web**, e em *URIs de redirecionamento
   autorizados* coloque `https://developers.google.com/oauthplayground`. Guarde o **ID do cliente** e a **chave secreta**.
6. **Gerar o token de acesso:** abra https://developers.google.com/oauthplayground, clique na engrenagem, marque *Use your own OAuth
   credentials* e cole o ID e a chave. No passo 1 digite o escopo `https://www.googleapis.com/auth/drive.file` e clique em *Authorize APIs*,
   entrando com a conta do Google cujo Drive vai guardar os vídeos. No passo 2 clique em *Exchange authorization code for tokens* e copie o
   **Refresh token**.
7. **Segredos no Supabase** (você digita; eu não vejo): *Edge Functions > Secrets*:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (e `ALLOWED_ORIGIN`, que já existe das outras funções).
8. **Publicar a função** (Terminal do Mac, na pasta do projeto):

   ```bash
   supabase functions deploy comunidade-video --no-verify-jwt
   ```
9. Publicar o app no Easypanel, como de costume.

A pasta "Comunidade MAC - envios" é criada sozinha no primeiro envio, na conta escolhida no passo 6.

## Limites do plano gratuito (vale saber)

- **Espaço do Drive:** 15 GB por conta Google. Com 40 alunos e 2 vídeos por mês de até 150 MB, o pior caso é 12 GB por mês; o normal (vídeos de
  30 a 60 MB) fica em 3 a 5 GB por mês. Os envios expiram em 90 dias; a rotina que apaga os vencidos é a fase 6. Até ela existir, apague pela
  aba Envios o que já foi respondido.
- **Banda do Supabase:** cada vez que alguém assiste um envio, o vídeo passa pela função. O plano gratuito do Supabase inclui 5 GB de banda
  por mês; o Pro inclui 250 GB. Para o uso previsto (o professor assiste cada vídeo uma ou duas vezes) cabe no gratuito, mas monitore.

## Trocar para o Bunny Stream no futuro (opcional, pago)

A função já tem o Bunny pronto e desligado. Para ligar: criar a biblioteca no Bunny, ativar a autenticação por token no player e na CDN, definir
os segredos `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY` e `COMUNIDADE_VIDEO_PROVIDER=bunny`. Os envios já feitos no Drive continuam
funcionando, porque cada envio guarda o provedor em que foi feito.

## Testes (rodam no computador, sem Google nem Bunny reais)

```bash
supabase start -x studio,imgproxy,logflare,vector,mailpit
supabase/local-test/run.sh base     # e aplicar 0009, 0017, 0018 e 0019
supabase/local-test/matriz.sh rls_comunidade.sql
deno run -A supabase/local-test/comunidade_video_drive_test.ts
deno run -A supabase/local-test/comunidade_video_bunny_test.ts
```
