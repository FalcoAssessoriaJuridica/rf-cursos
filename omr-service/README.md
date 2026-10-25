# Serviço OMR (PDF/imagem → MusicXML)

Lê partituras em PDF ou imagem e devolve MusicXML (`.mxl`), usando o [Audiveris](https://github.com/Audiveris/audiveris) 5.11.0
(licença AGPL-3.0, usado como ferramenta de linha de comando, sem modificações).

## Rodar localmente (teste)
```bash
docker build -t rf-omr omr-service
docker run -d --name rf-omr-dev -p 8080:8080 -e OMR_API_KEY=dev-omr-key-local rf-omr
```
No `.env` da plataforma: `OMR_API_KEY=dev-omr-key-local` (para testar bilhetes, acrescente `-e OMR_TICKET_SECRET=... -e OMR_ALLOWED_ORIGIN=http://localhost:5200` ao `docker run`). Em desenvolvimento o Vite encaminha `/__omr` para `localhost:8080` e
acrescenta a chave (ela não entra no site).

## Produção (Easypanel + Supabase)
Como funciona: o aluno ou o administrador escolhe o PDF; o site pede uma **autorização** à função `omr-convert` do Supabase (confere o login,
se há curso ativo e o limite de 5 leituras por dia para aluno; administrador sem limite) e recebe um **bilhete de uso único (5 min)**.
O navegador envia o PDF **direto ao serviço** com esse bilhete. O serviço confere a assinatura do bilhete, lê a partitura e devolve o `.mxl`.

1. **Gerar dois segredos** longos (no Terminal do Mac; rode duas vezes e guarde cada resultado):
   `openssl rand -base64 48` → um será `OMR_API_KEY`, o outro `OMR_TICKET_SECRET`.
2. **Easypanel**: novo serviço a partir do GitHub (`FalcoAssessoriaJuridica/rf-cursos`), **caminho de build `omr-service`**, build pelo `Dockerfile`. Variáveis:
   - `OMR_API_KEY` (uso técnico), `OMR_TICKET_SECRET` (o mesmo valor do passo 4)
   - `OMR_ALLOWED_ORIGIN` = `https://rfcursos.falcotech.com.br`
   - opcionais: `OMR_MAX_QUEUE` (3), `OMR_MAX_MB` (30), `OMR_TIMEOUT_S` (420)
   Reserve **pelo menos 2 GB de memória** (o Audiveris é em Java) e use um servidor x86.
3. **Domínio com HTTPS** para o serviço (ex.: `rfcursos-omr.falcotech.com.br`): crie o registro DNS apontando para o VPS e associe o domínio no Easypanel (porta 8080).
4. **Supabase → Edge Functions → Secrets**: `OMR_URL` (`https://rfcursos-omr.falcotech.com.br`) e `OMR_TICKET_SECRET` (igual ao do serviço); opcional `OMR_DAILY_LIMIT`.
5. **SQL Editor**: rode `supabase/migrations/0016_omr_uso.sql`.
6. **Publicar a função** `omr-convert` (Verify JWT ligado) e fazer o **deploy do site**.
7. Teste: em Partituras, "Abrir do seu computador" com um PDF; o resultado deve abrir em cerca de um minuto.

Verificações rápidas do serviço: `GET https://rfcursos-omr.falcotech.com.br/health` → `{"ok":true,"configured":true}`; um `POST /convert` sem bilhete deve dar 401.

## Limites conhecidos
- O resultado precisa ser conferido: letras de hino podem ser lidas como dinâmicas/ornamentos e a fórmula de compasso às vezes
  não é reconhecida (a tela de partituras tem "Limpar anotações" e "Compasso" para isso).
- Partituras manuscritas ou fotografadas têm qualidade bem pior que PDFs digitais.
- Imagem `linux/amd64`: em Mac com Apple Silicon roda emulada (mais lenta); no VPS x86 roda nativa.
