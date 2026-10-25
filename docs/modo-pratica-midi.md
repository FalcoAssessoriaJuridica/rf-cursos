# Modo prática (teclado MIDI ou teclado na tela)

Na tela de uma partitura com piano/melodia, o botão **Praticar com teclado** abre o modo prática: o cursor **espera** o aluno tocar as notas certas
e só então avança (no ritmo do aluno, sem tempo marcado). Não aparece em partituras de bateria.

## Como o aluno usa
1. **Conectar teclado MIDI** (Chrome ou Edge, no computador ou no Android; o navegador pede permissão). Sem teclado, usa-se o **teclado na tela**
   (também no Safari/iPhone, que não têm Web MIDI).
2. Escolhe quem toca: todas as pautas, só a mão direita (pauta de cima) ou só a esquerda (pauta de baixo); em partituras com várias partes, cada parte.
3. **Começar a praticar**: "Toque agora: Dó4 + Mi4" (acordes valem em qualquer ordem). Acerto avança; nota errada avisa em vermelho, conta como erro e **não** avança.
4. No fim: passos, tempo, % sem errar e número de notas erradas.
- "Aceitar qualquer oitava" vale para teclados pequenos.
- O som do piano toca ao apertar cada tecla (resposta imediata).

## Código
- `src/score/practice.js`: lógica pura (sessão de prática); teste: `node scripts/test-practice.mjs`.
- `src/score/midi.js`: Web MIDI; `src/score/VirtualKeyboard.jsx`: teclado na tela; `src/score/PracticePanel.jsx`: painel.
- `ScorePlayer` ganhou `playLive/releaseLive/moveTo/prepareAudio` e a pauta (`staff`) de cada nota.

## Como foi testado
- Lógica: 23 verificações (acordes fora de ordem, pausas, bateria ignorada, uma só mão, oitava, resumo).
- Navegador (Chrome isolado, teclado MIDI **simulado** com as mesmas mensagens de um teclado real): conexão, escolha de mão, passos esperados, erro e acerto,
  resumo (83% com um erro; 100% só na mão direita) e cursor chegando ao fim.
- **Não testado com um teclado MIDI de verdade** (não havia um disponível): vale um teste real em Chrome/Edge antes de divulgar.
