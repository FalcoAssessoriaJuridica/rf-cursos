# Comunidade MAC (Ministério Adoradores de Cristo) — plano de implementação

Status: plano, nada construído. Decisões já tomadas: gratuita, acesso por código de convite, vídeos dos alunos **privados** (só o aluno e o professor), cerca de 40 pessoas e 2 vídeos por mês cada, começar pelo Google Drive com possibilidade de trocar depois.

## 1. O que o usuário vê

**Membro (aluno da igreja)** — rota `/student/comunidade`, menu só aparece para quem entrou:
- Lista de espaços (Teclado, Violão, Bateria, Vocal… o Roberto cria os que quiser).
- Em cada espaço, duas abas: **Mural** (aulas, introduções e solos de hinos postados pelo professor, com vídeo e PDF/partitura) e **Meus envios** (enviar um vídeo, ver o status e a resposta).

**Professor (admin)** — rota `/admin/comunidade`:
- Membros (aprovar, remover, trocar de espaço), espaços, publicar no mural.
- **Caixa de envios**: fila de vídeos novos por instrumento, abrir, responder por texto (e, depois, por vídeo), marcar como respondido.

**Entrada**: o membro cria a conta normal (`/cadastro`), digita o código da igreja em `/student/comunidade/entrar` e passa a ver a área. O código pode ser trocado ou desligado pelo professor.

## 2. Banco de dados (migração `0017_comunidade.sql`)

| Tabela | Campos principais |
|---|---|
| `comunidades` | id, slug (`mac`), nome, codigo_convite, ativa |
| `comunidade_membros` | comunidade_id, user_id, papel (`membro`/`professor`), status (`ativo`/`bloqueado`), entrou_em |
| `comunidade_codigos` | comunidade_id, codigo, ativo (tabela à parte, só o admin lê) |
| `comunidade_tentativas` | user_id, em (limite de 10 códigos errados por hora) |
| `comunidade_espacos` | id, comunidade_id, nome, ordem |
| `comunidade_posts` | id, espaco_id, autor_id, titulo, texto, video_provider, video_ref, pdf_ref, partitura_id (opcional), criado_em |
| `comunidade_envios` | id, espaco_id, aluno_id, video_provider, video_ref, duracao_s, tamanho_bytes, mensagem, status (`novo`/`respondido`), expira_em, criado_em |
| `comunidade_respostas` | id, envio_id, autor_id, texto, video_ref (opcional), criado_em |

Regras de acesso (RLS):
- `posts`: leitura para membros ativos da comunidade; escrita só admin.
- `envios`: o aluno lê e cria só os **dele**; admin lê todos. Nenhum membro enxerga envio de outro.
- `respostas`: lê quem é dono do envio ou admin; escreve só admin.
- `membros`: o usuário lê só a própria linha; entrada só pela função com código (nunca insert direto).
- Função `comunidade_pode_ver(ref text)` no mesmo estilo de `drive_file_allowed` (migração 0009), usada pelos serviços de vídeo.

## 3. Vídeo: onde fica e como é entregue

Uma camada de armazenamento com dois "provedores" (`drive` e `bunny`), escolhida por configuração, para trocar sem refazer telas. Cada registro guarda `video_provider` + `video_ref`.

**Aulas e solos do professor (mural)** — Drive, como já é nos cursos: link do Drive em iframe de pré-visualização. Custo zero. Limitação conhecida: o link precisa estar compartilhado como "qualquer pessoa com o link", então não é privado de verdade (aceitável para conteúdo que o professor publica).

**Envios dos alunos (privados)** — aqui o Drive tem um problema real:
- O `drive-proxy` atual só lê arquivos com link público. Vídeo de aluno público não atende à exigência de privacidade.
- Para ser privado no Drive é preciso uma **conta de serviço do Google** (projeto no Google Cloud, pasta compartilhada com ela, chave guardada como segredo do Supabase). O envio vai direto do celular para o Drive por sessão de upload; a reprodução passa por uma Edge Function que lê o arquivo pela API do Drive com checagem de dono.
- Efeito colateral: a reprodução passa pela banda do Supabase (cota do plano) e o Drive não converte o vídeo, então arquivo grande de celular pode engasgar.

**Recomendação para os envios**: começar com Bunny Stream (envio direto por TUS, link assinado com validade curta, conversão automática; cerca de US$ 5 por mês na escala atual) e manter o Drive para o mural. Se o Roberto preferir Drive também nos envios, o plano continua válido, mas a Fase 4 cresce (conta de serviço) e precisa do plano do Supabase com banda suficiente.

Limites de envio (valem nos dois casos): 3 minutos, 150 MB, só `video/mp4|quicktime|webm`, 1 envio por vez por aluno, envios apagados automaticamente após 90 dias (`expira_em`). O professor pode marcar "guardar" para não expirar.

## 4. Fases

1. **Banco e acesso** — FEITO e testado localmente: `supabase/migrations/0017_comunidade.sql` (tabelas, RLS, função `comunidade_entrar`, sem Edge Function) e `supabase/local-test/rls_comunidade.sql` (54 verificações). Falta rodar em produção. Todo membro vê todos os espaços; o envio vai para o espaço escolhido.
2. **Painel do professor (FEITO, testado em ambiente local)** — `/admin/comunidade`: criar espaços, ver membros, publicar no mural (título, texto, link do Drive, PDF/partitura do acervo).
3. **Área do membro**: entrar com código, ver espaços e mural, página do post com o player.
4. **Envio de vídeo e caixa de entrada**: upload com barra de progresso e validação, fila do professor, resposta por texto. Aqui entra o provedor escolhido (Bunny ou Drive com conta de serviço).
5. **Avisos por e-mail** (Resend, já configurado): ao professor quando chega envio; ao aluno quando é respondido.
6. **Expurgo e LGPD**: rotina diária que apaga envios vencidos (no banco e no provedor); texto de consentimento no primeiro envio (uso de imagem, vídeo privado, prazo de guarda); campo de autorização do responsável para menores de 18.
7. **Revisão de design e teste de ponta a ponta** com as skills design-ux e design-taste-frontend; teste com 3 contas (professor, membro, intruso sem código).

Ordem sugerida de entrega: 1 a 3 primeiro (já publicam as aulas dele), depois 4 a 6.

## 5. Custo estimado

| Item | Por mês |
|---|---|
| Mural no Drive | R$ 0 |
| Envios no Bunny (cerca de 100 GB guardados, 80 GB assistidos) | cerca de US$ 5 (R$ 30) |
| Escala 10 vezes maior | US$ 30 a 50 |

Valores do Bunny conferidos em bunny.net/pricing/stream (armazenamento US$ 0,01/GB; entrega na América do Sul US$ 0,045/GB; mínimo US$ 1/mês). Volumes são suposições.

## 6. O que depende do Roberto

- Escolher o provedor dos envios: Bunny (recomendado) ou Drive com conta de serviço.
- Se Bunny: criar a conta e digitar a chave da API no Supabase (eu nunca vejo a chave).
- Lista inicial de espaços (instrumentos) e o código de convite.
- Texto de consentimento e regra para menores (validar com o jurídico da igreja).
- Aprovar commit e publicação (Easypanel e Supabase) quando cada fase estiver pronta.

## 7. Riscos

- Link público do Drive no mural: qualquer pessoa com o link vê a aula.
- Vídeos grandes de celular: o limite de tamanho e duração evita travamentos e custo.
- Crescimento futuro (outras igrejas): o modelo já tem `comunidades`, então uma segunda comunidade é só uma nova linha.
