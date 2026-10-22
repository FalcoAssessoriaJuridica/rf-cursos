# Serviço OMR (PDF/imagem → MusicXML)

Lê partituras em PDF ou imagem e devolve MusicXML (`.mxl`), usando o [Audiveris](https://github.com/Audiveris/audiveris) 5.11.0
(licença AGPL-3.0, usado como ferramenta de linha de comando, sem modificações).

## Rodar localmente (teste)
```bash
docker build -t rf-omr omr-service
docker run -d --name rf-omr-dev -p 8080:8080 -e OMR_API_KEY=dev-omr-key-local rf-omr
```
No `.env` da plataforma: `OMR_API_KEY=dev-omr-key-local`. Em desenvolvimento o Vite encaminha `/__omr` para `localhost:8080` e
acrescenta a chave (ela não entra no site).

## Produção (Easypanel)
1. Novo serviço a partir do GitHub, pasta `omr-service`, build pelo `Dockerfile`. Variáveis: `OMR_API_KEY` (longa e aleatória),
   opcionalmente `OMR_MAX_MB` (30) e `OMR_TIMEOUT_S` (420). Reserve pelo menos 2 GB de memória.
2. Publique em um domínio próprio com HTTPS (ex.: `omr.seudominio.com.br`).
3. Função do Supabase `supabase/functions/omr-convert` com os segredos `OMR_URL` e `OMR_API_KEY`; na plataforma, `VITE_OMR_ENDPOINT`
   aponta para a função.

## Limites conhecidos
- O resultado precisa ser conferido: letras de hino podem ser lidas como dinâmicas/ornamentos e a fórmula de compasso às vezes
  não é reconhecida (a tela de partituras tem "Limpar anotações" e "Compasso" para isso).
- Partituras manuscritas ou fotografadas têm qualidade bem pior que PDFs digitais.
- Imagem `linux/amd64`: em Mac com Apple Silicon roda emulada (mais lenta); no VPS x86 roda nativa.
