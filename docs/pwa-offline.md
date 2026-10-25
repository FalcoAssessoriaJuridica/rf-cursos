# App instalável e modo offline (PWA)

## O que funciona sem internet
- **O aplicativo** (telas e os sons da bateria) é guardado no aparelho por um service worker (`vite-plugin-pwa`, 49 arquivos, ~5 MB) e abre sem conexão.
- **Partituras salvas**: na tela de uma partitura, "Salvar para usar sem internet" guarda o arquivo MusicXML no IndexedDB (`src/lib/offlineScores.js`).
  Sem internet, a página Partituras mostra "Salvas neste aparelho" e abre a cópia local (tocar, cursor, metrônomo, tudo roda no aparelho).
- A sessão (login) é mantida enquanto o aparelho está sem rede; quem protege os dados continua sendo o banco: sem internet nenhuma consulta é feita.

## O que NÃO funciona sem internet
Vídeos, cursos, pagamentos, perfil e a biblioteca dos cursos (precisam de conexão). Nada vindo do Supabase ou do Stripe é guardado pelo service worker.

## Regras de segurança das cópias
- Cada cópia pertence a quem estava logado ao salvar; outro usuário do mesmo aparelho não a vê.
- Valem por 30 dias. Ao abrir a biblioteca **com internet**, as cópias de partituras a que a pessoa ainda tem acesso são renovadas e as demais, apagadas
  (assinatura encerrada = cópias somem na próxima abertura com internet, ou ao vencer os 30 dias).
- Ao **sair da conta**, todas as cópias do aparelho são apagadas.

## Atualização
O app avisa "Nova versão disponível" e só atualiza quando a pessoa clica em **Atualizar** (não interrompe uma aula). O servidor (`nginx.conf`) nunca guarda `sw.js` e `index.html` em cache.

## Instalação
Em Meu perfil: botão **Instalar** (Android/Chrome) ou instrução "Compartilhar > Adicionar à Tela de Início" (iPhone). Ícones em `public/icons/`.

## Como foi testado
Chrome isolado controlado por script: service worker ativado, 49 arquivos em cache, login e `/termos` abrem offline, sons da bateria servidos do cache,
API do Supabase **não** servida do cache, partitura salva/lida/removida, isolamento entre usuários, poda e limpeza; e o fluxo completo de um aluno sem internet
abrindo a lista de salvas e uma partitura (notação desenhada a partir da cópia local). O navegador embutido do app Claude bloqueia service workers, então não serve para esse teste.
