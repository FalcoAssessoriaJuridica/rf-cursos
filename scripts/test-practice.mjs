// Teste da lógica do modo prática (node scripts/test-practice.mjs). Sem dependências.
import { PracticeSession, nomeNota } from '../src/score/practice.js';
let falhas = 0;
const ok = (nome, v, esperado) => { const bom = JSON.stringify(v) === JSON.stringify(esperado); if (!bom) falhas += 1; console.log(`${bom ? 'OK   ' : 'FALHA'} ${nome}: ${JSON.stringify(v)}${bom ? '' : ` (esperado ${JSON.stringify(esperado)})`}`); };

const n = (midi, staff = 0) => ({ midi, staff, part: 0, dur: 0.25 });
const events = [
    { notes: [n(60), n(48, 1)] },          // 0: mão direita C4 + esquerda C3
    { notes: [] },                         // 1: pausa
    { notes: [n(62), n(62), n(55, 1)] },   // 2: D4 (duplicada) + G2? (55 = G3)
    { notes: [{ drum: 'kick', dur: 0.25 }] }, // 3: só bateria (ignorada)
    { notes: [n(64), n(67), n(72)] },      // 4: acorde E4 G4 C5
];
const passos = [];
let feedbacks = [];
let resumo = null;
const s = new PracticeSession({ events, onStep: (i, exp) => passos.push([i, exp]), onFeedback: (r) => feedbacks.push(r), onDone: (r) => { resumo = r; } });
ok('total de passos com notas', s.stats.total, 3);
ok('começa no 1º passo', s.start(), true);
ok('1º passo espera C3 e C4', passos[0], [0, [48, 60]]);
ok('nota errada', s.press(61), 'erro');
ok('C4 certo', s.press(60), 'ok');
ok('C4 repetido não conta', s.press(60), 'repetida');
ok('ainda no passo 0', s.i, 0);
ok('C3 completa o passo e salta a pausa', s.press(48), 'ok');
ok('vai para o passo 2 (pula a pausa)', passos[1], [2, [55, 62]]);
ok('D4 certo', s.press(62), 'ok');
ok('G3 certo, avança pulando o passo de bateria', s.press(55), 'ok');
ok('chega ao acorde', passos[2], [4, [64, 67, 72]]);
ok('acorde fora de ordem: G4', s.press(67), 'ok');
ok('acorde: C5', s.press(72), 'ok');
ok('acorde: E4 termina', s.press(64), 'ok');
ok('terminou', s.done, true);
ok('resumo', resumo && { total: resumo.total, passos: resumo.passos, limpos: resumo.limpos, erros: resumo.erros, precisao: resumo.precisao }, { total: 3, passos: 3, limpos: 2, erros: 1, precisao: 67 });
ok('depois de terminar não reage', s.press(60), null);

// só a mão direita (pauta 0)
const d = new PracticeSession({ events, staves: new Set([0]) });
d.start();
ok('mão direita: espera só C4', d.exp, [60]);
// qualquer oitava
const o = new PracticeSession({ events, staves: new Set([0]), anyOctave: true });
o.start();
ok('qualquer oitava: C5 vale', o.press(72), 'ok');
ok('qualquer oitava: avançou', o.i, 2);
// partitura sem notas tocáveis
const v = new PracticeSession({ events: [{ notes: [{ drum: 'x' }] }] });
ok('sem notas: não inicia', v.start(), false);
ok('nomes', [nomeNota(60), nomeNota(61), nomeNota(69), nomeNota(21)], ['Dó4', 'Dó♯4', 'Lá4', 'Lá0']);
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
