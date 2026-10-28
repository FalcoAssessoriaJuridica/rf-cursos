# Comunidade MAC: envio de vídeo dos alunos pelo Google Drive (gratuito)

Os vídeos dos alunos vão para uma pasta **privada** do Drive do professor ("Comunidade MAC - envios"). Ninguém recebe link do Drive: o aluno
envia direto do celular para o Google, e o vídeo é tocado pelo player do próprio app, através da função `comunidade-video`, com um link
assinado que expira em 4 horas. Só o aluno dono e o professor conseguem pedir esse link.

Custo: **zero**. Usa o Google Cloud sem cobrança (a API do Drive é gratuita) e o armazenamento do Drive da conta escolhida.

## O que fazer uma vez (cerca de 15 minutos, só você pode fazer)

1. **Banco (Supabase, SQL Editor):** rode `supabase/migrations/0019_comunidade_envios.sql` `0020_comunidade_visibilidade.sql` e `0021_comunidade_consentimento.sql`, nessa ordem.
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
   supabase functions deploy comunidade-video --no-verify-jwt --project-ref bghvzdfikfhceekoxtxg
   ```
   Se der erro 403, o `supabase login` está numa conta que não é dona do projeto: rode `supabase login` de novo com a conta certa e confira com
   `supabase projects list`. Alternativa sem terminal: Edge Functions > Deploy a new function > Via Editor, colar `index.ts`, `bunny.ts` e `drive.ts`
   e desligar "Verify JWT".
9. Publicar o app no Easypanel, como de costume.

A pasta "Comunidade MAC - envios" é criada sozinha no primeiro envio, na conta escolhida no passo 6.

## Quem pode ver cada vídeo

Ao enviar, o aluno escolhe: **"Só o professor"** (padrão) ou **"Toda a comunidade"**. Pode mudar depois, em "Meus envios". Vídeo compartilhado aparece
na aba "Vídeos da comunidade" com o primeiro nome e a inicial do sobrenome do autor ("Marina T."). O recado ao professor, as respostas e o e-mail
do aluno **nunca** aparecem para os outros membros. A regra está no banco (migração `0020_comunidade_visibilidade.sql`), não só na tela.
O link de reprodução vale por 4 horas; se o aluno voltar o vídeo para "só o professor", quem já abriu o player ainda assiste até esse link vencer.

## Avisos por e-mail (fase 5)

- Ao **professor**, quando um aluno termina de enviar um vídeo (com o recado e o link da caixa de entrada).
- Ao **aluno**, quando o professor responde (com o texto da resposta e o link do app).
Os e-mails saem pela API do Resend, com o remetente `nao-responda@falcotech.com.br` (domínio já verificado). Se o e-mail falhar, o envio e a resposta
continuam funcionando; o painel do professor mostra um aviso quando o e-mail do aluno não saiu.

Segredos a criar no Supabase (Edge Functions > Secrets), você digita:
- `RESEND_API_KEY`: no Resend, API Keys > Create API key, nome `RF Cursos (Comunidade)`, permissão **Sending access**, domínio `falcotech.com.br`. Chave própria
  (não reutilize a do SMTP do Supabase), para poder revogar sem afetar o resto.
- `COMUNIDADE_MAC_EMAIL_PROFESSOR`: o e-mail que recebe os avisos (vários, separados por vírgula).
Opcionais: `EMAIL_FROM` (padrão `RF Music Academy <nao-responda@falcotech.com.br>`) e `APP_URL` (padrão `https://rfcursos.falcotech.com.br`).
O limite gratuito do Resend (100 e-mails por dia) é da conta inteira, dividido com os outros projetos.

## Consentimento, menores de 18 anos e retirada (fase 6)

- **Antes do primeiro envio** a pessoa lê o termo (`src/legal/comunidade.js`), informa se tem 18 anos ou mais e marca que concorda. Sem isso, a função recusa o envio.
- **Menor de 18 anos:** informa o responsável (nome, parentesco, telefone ou e-mail). O envio fica **em espera** até o professor confirmar a autorização, na aba
  **Membros** (botão "Confirmar autorização do responsável", depois de falar com o responsável). O professor recebe um e-mail avisando do pedido. O menor só
  pode liberar o vídeo para "Toda a comunidade" se o responsável autorizou isso de forma expressa; senão fica só para o professor.
- **Retirar o consentimento:** o aluno tem o botão em "Meus envios". Apaga todos os vídeos dele (Drive e banco) e bloqueia novos envios até aceitar de novo.
- **Termo novo:** quando mudar o texto de forma relevante, edite `src/legal/comunidade.js` e atualize a versão no banco para todos aceitarem de novo:
  `update public.comunidades set termo_versao = '2026-11-v2' where slug = 'mac';`
- **O texto é uma proposta.** Revise o texto com quem cuida do jurídico antes de depender dele, principalmente as seções 4 (Google fora do Brasil), 5 (prazo e "guardar") e 7 (menores).

## Limpeza automática dos vídeos vencidos (fase 6)

Cada envio vence 90 dias depois (o professor pode marcar "Guardar (não expira)" na caixa de entrada). A limpeza apaga o arquivo no Drive e a linha no banco, e
também remove uploads abandonados há mais de 1 dia. Ela roda de dois jeitos:

1. **Todo dia, sozinha**, por um agendador do próprio Supabase (passos abaixo). É o que garante o prazo prometido no termo.
2. **Quando o professor abre o painel** da Comunidade (reforço, sem alarde).

Para ligar o agendador diário (você faz uma vez):
1. Supabase > Edge Functions > Secrets: crie `COMUNIDADE_MAC_CRON_SECRET` com uma senha longa e aleatória (ex.: 40 caracteres). Guarde a mesma senha para o passo 3.
2. Supabase > Database > Extensions: ative `pg_cron` e `pg_net`.
3. SQL Editor (troque `COLE_AQUI_A_SENHA` pela senha do passo 1 e rode):

   ```sql
   select cron.schedule(
     'comunidade-mac-expurgo', '0 6 * * *',   -- todo dia às 06:00 UTC (03:00 em Brasília)
     $$ select net.http_post(
          url     := 'https://bghvzdfikfhceekoxtxg.supabase.co/functions/v1/comunidade-video',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'COLE_AQUI_A_SENHA'),
          body    := '{}'::jsonb) $$);
   ```
4. Para conferir depois: `select jobname, schedule, active from cron.job;` e, no dia seguinte, `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;`.
   Para desligar: `select cron.unschedule('comunidade-mac-expurgo');`

## Limites do plano gratuito (vale saber)

- **Espaço do Drive:** depende da conta escolhida (uma conta gratuita tem 15 GB; a do Roberto, em produção, tem 10 TB, então não é um limite na prática). Com 40 alunos e 2 vídeos por mês de até 150 MB, o pior caso é 12 GB por mês; o normal (vídeos de
  30 a 60 MB) fica em 3 a 5 GB por mês. Os envios expiram em 90 dias; a rotina que apaga os vencidos é a fase 6. Até ela existir, apague pela
  aba Envios o que já foi respondido.
- **Banda do Supabase:** o **envio** não passa pelo Supabase (vai direto do celular para o Google). Já **assistir** passa: o Drive não entrega arquivo privado
  direto ao navegador, então a função busca no Google e repassa. Estimativa: 40 alunos x 2 vídeos x 50 MB, vistos 1 a 2 vezes pelo professor = 4 a 8 GB por mês.
  Vídeos compartilhados com a comunidade multiplicam isso pelo número de visualizações. Para sair do Supabase seria preciso trocar o armazenamento
  (Bunny, pago, ou Cloudflare R2, que cobra zero de saída mas exige cartão cadastrado). A função já separa o armazenamento do resto, então a troca não refaz o app.
  O plano gratuito do Supabase inclui 5 GB de banda por mês; o Pro inclui 250 GB. Só com o professor assistindo cabe no gratuito, no limite; com vídeos
  compartilhados e muita gente assistindo, o plano Pro é o que dá folga. Monitore em Settings > Usage do Supabase.

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
(Aplicar também a `0020_comunidade_visibilidade.sql` antes de rodar os testes.)
