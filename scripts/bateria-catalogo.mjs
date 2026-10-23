// Catálogo de exercícios de bateria originais (MusicXML) para o acervo, organizado em pastas.
//   node scripts/bateria-catalogo.mjs            -> só gera os .musicxml em acervo-importar/_bateria-gerada
//   node scripts/bateria-catalogo.mjs --enviar   -> também envia ao Storage e cadastra/organiza no acervo
//   (com --atualizar, troca também o arquivo das partituras que já existem no acervo)
// Os padrões são rítmicos básicos e rudimentos de uso comum, escritos para a plataforma (sem direitos de terceiros).
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, rep, slug } from './lib/bateria.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/* ───────── ajudantes ───────── */
// Digitação de rudimentos: "R L >R fL dR T1/R zL R~e -~q >fR=RR"
//   [TECLA/][>][f flam | d drag | z rufo]MÃO[=RÓTULO][~duração]   (duração padrão = o 2º argumento)
//   O rótulo padrão do flam/drag é a mão contrária (lR, rL, llR, rrL); "=RR" troca o texto sob a nota.
function P(str, dur) {
    return str.trim().split(/\s+/).map((t) => {
        const m = /^(?:([A-Z0-9]+)\/)?(>?)([fdz]?)([RL])(?:=([A-Za-z]+))?(?:~(\S+))?$|^-~(\S+)$/.exec(t);
        if (!m) throw new Error(`rudimento: token inválido "${t}"`);
        if (m[7]) return `-:${m[7]}`;
        const [, key = 'S', acc, kind, hand, custom, d = dur] = m;
        const label = custom || (kind === 'f' ? (hand === 'R' ? 'lR' : 'rL') : kind === 'd' ? (hand === 'R' ? 'llR' : 'rrL') : hand);
        return `${key}${acc}${kind}@${label}:${d}`;
    }).join(' ');
}
const REST_BAR = '-:w';
// compasso final: uma batida e silêncio até o fim, para qualquer fórmula de compasso
const DUR = [['w', 480], ['h.', 360], ['h', 240], ['q.', 180], ['q', 120], ['e.', 90], ['e', 60]];
function closeBar([beats, unit] = [4, 4]) {
    let rem = (beats * 480) / unit - 120;
    const rests = [];
    for (const [d, v] of DUR) while (rem >= v) { rests.push(`-~${d}`); rem -= v; }
    return P(['>R~q', ...rests].join(' '), 's');
}
const bars = (...b) => [...b, closeBar()];
const barsIn = (meter, ...b) => [...b, closeBar(meter)];

/* ───────── pastas ───────── */
const F = {
    ritmos: 'Bateria/Ritmos e subdivisões',
    rock: 'Bateria/Levadas/Rock',
    funk: 'Bateria/Levadas/Funk',
    disco: 'Bateria/Levadas/Disco e reggae',
    jazz: 'Bateria/Levadas/Jazz e swing',
    blues: 'Bateria/Levadas/Blues e shuffle',
    latin: 'Bateria/Levadas/Latinas e brasileiras',
    odd: 'Bateria/Levadas/Compassos compostos e ímpares',
    rud: 'Bateria/Rudimentos',
    exrud: 'Bateria/Exercícios de rudimentos',
    fills: 'Bateria/Viradas',
};

const EX = [];
const add = (pasta, titulo, bpm, barList, extra = {}) => EX.push({ pasta, titulo, bpm, bars: barList, ...extra });

/* ───────── ritmos e subdivisões (na caixa) ───────── */
const R4 = (tok, n) => rep(Array.from({ length: n }, () => tok).join(' '), 4);
add(F.ritmos, '01 · Semínimas', 80, R4('S:q', 4));
add(F.ritmos, '02 · Colcheias', 80, R4('S:e', 8));
add(F.ritmos, '03 · Tercinas de colcheia', 70, R4('S:e3', 12));
add(F.ritmos, '04 · Semicolcheias', 70, R4('S:s', 16));
add(F.ritmos, '05 · Quintinas (5 notas por tempo)', 60, R4('S:s5', 20));
add(F.ritmos, '06 · Sextinas (6 notas por tempo)', 60, R4('S:s6', 24));
add(F.ritmos, '07 · Fusas (32 notas por compasso)', 50, rep(Array.from({ length: 32 }, () => 'S:t').join(' '), 2));
add(F.ritmos, '08 · Colcheia pontuada e semicolcheia', 80, rep(Array.from({ length: 4 }, () => 'S:e. S:s').join(' '), 4));
add(F.ritmos, '09 · Semicolcheia e colcheia pontuada', 80, rep(Array.from({ length: 4 }, () => 'S:s S:e.').join(' '), 4));
add(F.ritmos, '10 · Contratempos (pausa no tempo)', 80, rep(Array.from({ length: 4 }, () => '-:e S:e').join(' '), 4));
add(F.ritmos, '11 · Síncopa: semicolcheia no meio', 80, rep(Array.from({ length: 4 }, () => 'S:s S:e S:s').join(' '), 4));
add(F.ritmos, '12 · Pausas e figuras mistas', 80, rep('S:q -:q S:e -:e S:s -:s S:s S:s', 4));
add(F.ritmos, '13 · Da semínima à sextina (um tempo de cada)', 70, [
    'S:q S:e S:e S:e3 S:e3 S:e3 S:s S:s S:s S:s',
    'S:s5 S:s5 S:s5 S:s5 S:s5 S:s6 S:s6 S:s6 S:s6 S:s6 S:s6 S:e S:e S:q',
    'S:q S:e S:e S:e3 S:e3 S:e3 S:s S:s S:s S:s',
    'S:s5 S:s5 S:s5 S:s5 S:s5 S:s6 S:s6 S:s6 S:s6 S:s6 S:s6 S:e S:e S:q',
]);
add(F.ritmos, '14 · Tercinas e sextinas nos tons', 70, rep('S:e3 S:e3 S:e3 T1:e3 T1:e3 T1:e3 T2:s6 T2:s6 T2:s6 T3:s6 T3:s6 T3:s6 T3:q', 4));
add(F.ritmos, '15 · Compasso 3/4', 90, rep('S:q S:q S:q', 4), { meter: [3, 4] });
add(F.ritmos, '16 · Compasso 5/4 (3+2)', 90, rep('S:q S:q S:q S:q S:q', 4), { meter: [5, 4] });
add(F.ritmos, '17 · Compasso 6/8', 80, rep('S:e S:e S:e S:e S:e S:e', 4), { meter: [6, 8] });
add(F.ritmos, '18 · Compasso 7/8 (2+2+3)', 90, rep('S:e S:e S:e S:e S:e S:e S:e', 4), { meter: [7, 8], groupSpan: [120, 120, 180] });
add(F.ritmos, '19 · Compasso 9/8', 70, rep('S:e S:e S:e S:e S:e S:e S:e S:e S:e', 4), { meter: [9, 8] });
add(F.ritmos, '20 · Compasso 12/8', 60, rep('S:e S:e S:e S:e S:e S:e S:e S:e S:e S:e S:e S:e', 4), { meter: [12, 8] });

/* ───────── levadas: rock ───────── */
const rock8 = ['H:e H:e H+S:e H:e H:e H:e H+S:e H:e', 'K:q -:q K:q -:q'];
add(F.rock, 'Rock básico em colcheias', 90, rep(rock8, 4));
add(F.rock, 'Rock com bumbo sincopado', 96, rep(['H:e H:e H+S:e H:e H:e H:e H+S:e H:e', 'K:q -:q K:e K:e -:q'], 4));
add(F.rock, 'Rock com chimbal aberto', 100, rep(['H:e H:e H+S:e H:e H:e H:e H+S:e O:e', 'K:q -:q K:q -:q'], 4));
add(F.rock, 'Rock em semicolcheias no chimbal', 80, rep(['H:s H:s H:s H:s H+S:s H:s H:s H:s H:s H:s H:s H:s H+S:s H:s H:s H:s', 'K:q -:q K:q -:q'], 4));
add(F.rock, 'Rock com prato de condução', 100, rep(['D:e D:e D+S:e D:e D:e D:e D+S:e D:e', 'K:q -:q K:e K:e -:q'], 4));
add(F.rock, 'Rock pesado: bumbo duplo em semicolcheias', 90, rep(['H:e H:e H+S:e H:e H:e H:e H+S:e H:e', 'K:s K:s -:e K:s K:s -:e K:s K:s -:e K:s K:s -:e'], 4));

/* ───────── funk ───────── */
add(F.funk, 'Funk em semicolcheias', 92, rep(['H:s H:s H:s H:s H+S:s H:s H:s H:s H:s H:s H:s H:s H+S:s H:s H:s H:s', 'K:e. -:s -:q K:q -:q'], 4));
add(F.funk, 'Funk: caixa com notas fantasma', 90, rep([
    'H:s H:s H:s H:s S>:s Sg:s Sg:s Sg:s H:s H:s H:s H:s S>:s Sg:s H:s Sg:s',
    'K:e. -:s -:q K:e. -:s -:q',
], 4));
add(F.funk, 'Funk: acentos no chimbal em semicolcheias', 96, rep([
    'H>:s H:s H:s H:s H>:s H:s H:s H:s H>:s H:s H:s H:s H>:s H:s H:s H:s',
    'K:e. -:s -:q K:e. -:s -:q',
], 4));

/* ───────── disco e reggae ───────── */
add(F.disco, 'Disco: bumbo em quatro e chimbal aberto', 118, rep(['H:e O:e H+S:e O:e H:e O:e H+S:e O:e', 'K:q K:q K:q K:q'], 4));
add(F.disco, 'Reggae: one drop', 76, rep(['H:e H:e H:e H:e R+H:e H:e H:e H:e', '-:h K:q -:q'], 4));
add(F.disco, 'Reggae: rockers (bumbo em todos os tempos)', 80, rep(['H:e H:e R+H:e H:e H:e H:e R+H:e H:e', 'K:q -:q K:q -:q'], 4));

/* ───────── jazz e swing ───────── */
const ride = 'D:q D:e3 -:e3 D:e3 D:q D:e3 -:e3 D:e3';
add(F.jazz, 'Swing: condução básica (ding-ding-a-ding)', 120, rep([ride, '-:q P:q -:q P:q'], 4));
add(F.jazz, 'Swing com bumbo em quatro (feathering)', 120, rep([ride, 'Kg:q Kg:q Kg:q Kg:q'], 4));
add(F.jazz, 'Swing com caixa fantasma (comping)', 120, rep([ride, '-:q P:q Sg:q P:q'], 4));
add(F.jazz, 'Swing rápido: condução em semínimas e tercinas', 180, rep([ride, '-:q P:q -:q P:q'], 4));

/* ───────── blues e shuffle ───────── */
add(F.blues, 'Shuffle em tercinas', 100, rep(['H:e3 -:e3 H:e3 H+S:e3 -:e3 H:e3 H:e3 -:e3 H:e3 H+S:e3 -:e3 H:e3', 'K:q -:q K:q -:q'], 4));
add(F.blues, 'Blues lento em 12/8', 56, rep(['H:e H:e H:e H+S:e H:e H:e H:e H:e H:e H+S:e H:e H:e', 'K:q. -:q. K:q. -:q.'], 4), { meter: [12, 8] });

/* ───────── latinas e brasileiras ───────── */
add(F.latin, 'Bossa nova: base com clave', 110, [0, 1, 0, 1, 0, 1, 0, 1].map((b) => [b === 0 ? 'H+R:e H:e H:e H+R:e H:e H:e H+R:e H:e' : 'H:e H:e H+R:e H:e H+R:e H:e H:e H:e', 'K:q. K:e K:q. K:e']));
add(F.latin, 'Bossa nova: condução no prato', 110, [0, 1, 0, 1].map((b) => [b === 0 ? 'D+R:e D:e D:e D+R:e D:e D:e D+R:e D:e' : 'D:e D:e D+R:e D:e D+R:e D:e D:e D:e', 'K:q. K:e K:q. K:e']));
add(F.latin, 'Samba: base simples com chimbal em semicolcheias', 100, rep(['H>:s H:s H:s H:s H:s H:s H:s H:s H>:s H:s H:s H:s H:s H:s H:s H:s', 'K:q K:q K:q K:q'], 4));
add(F.latin, 'Afro-cubano em 12/8: padrão de campana', 80, rep(['D:e -:e D:e -:e D:e D:e -:e D:e -:e D:e -:e D:e', 'K:q. -:q. K:q. -:q.'], 4), { meter: [12, 8] });

/* ───────── compassos compostos e ímpares ───────── */
add(F.odd, 'Balada em 6/8', 66, rep(['H:e H:e H:e S+H:e H:e H:e', 'K:q. -:q.'], 4), { meter: [6, 8] });
add(F.odd, 'Groove em 7/8 (2+2+3)', 110, rep(['H:e H:e H:e H:e S+H:e H:e H:e', 'K:q -:q K:q -:e'], 4), { meter: [7, 8], groupSpan: [120, 120, 180] });
add(F.odd, 'Groove em 5/4 (3+2)', 100, rep(['H:e H:e S+H:e H:e H:e H:e S+H:e H:e H:e H:e', 'K:q -:q K:q -:q -:q'], 4), { meter: [5, 4] });
add(F.odd, 'Valsa em 3/4', 100, rep(['H:e H:e H+S:e H:e H+S:e H:e', 'K:q -:q -:q'], 4), { meter: [3, 4] });

/* ───────── rudimentos (numeração e digitação conferidas com a lista oficial da PAS) ───────── */
// Rulos de 5 a 17 golpes: a PAS escreve com rufo ligado a uma nota; aqui estão na versão aberta (cada golpe escrito).
const R2 = (b) => bars(b, b);
const R2m = (meter, b) => barsIn(meter, b, b);
add(F.rud, '01 · Single Stroke Roll', 80, R2(P('R L R L R L R L R L R L R L R L', 's')));
add(F.rud, '02 · Single Stroke Four', 80, R2(P('>R L R L >R L R L >R L R L >R L R L', 's')));
add(F.rud, '03 · Single Stroke Seven', 80, R2(P('R L R L R L >R~e L R L R L R >L~e', 's')));
add(F.rud, '04 · Multiple Bounce Roll', 70, R2(P('zR~q zL~q zR~q zL~q', 'q')));
add(F.rud, '05 · Triple Stroke Roll', 70, R2(P('>R~s6 R~s6 R~s6 L~s6 L~s6 L~s6 >R~s6 R~s6 R~s6 L~s6 L~s6 L~s6 >R~s6 R~s6 R~s6 L~s6 L~s6 L~s6 >R~s6 R~s6 R~s6 L~s6 L~s6 L~s6', 's6')));
add(F.rud, '06 · Double Stroke Roll', 80, R2(P('R R L L R R L L R R L L R R L L', 's')));
add(F.rud, '07 · Five Stroke Roll', 80, R2(P('R R L L >R~q L L R R >L~q', 's')));
add(F.rud, '08 · Six Stroke Roll', 80, R2(P('>R~e L L R R >L~e >L~e R R L L >R~e', 's')));
add(F.rud, '09 · Seven Stroke Roll', 80, R2(P('R R L L R R >L~e L L R R L L >R~e', 's')));
add(F.rud, '10 · Nine Stroke Roll', 80, bars(P('R R L L R R L L >R~q -~q', 's'), P('L L R R L L R R >L~q -~q', 's')));
add(F.rud, '11 · Ten Stroke Roll', 80, bars(P('R R L L R R L L R~e >L~e -~q', 's'), P('L L R R L L R R L~e >R~e -~q', 's')));
add(F.rud, '12 · Eleven Stroke Roll', 80, bars(P('R R L L R R L L R R >L~q -~e', 's'), P('L L R R L L R R L L >R~q -~e', 's')));
add(F.rud, '13 · Thirteen Stroke Roll', 80, bars(P('R R L L R R L L R R L L >R~q', 's'), P('L L R R L L R R L L R R >L~q', 's')));
add(F.rud, '14 · Fifteen Stroke Roll', 80, bars(P('R R L L R R L L R R L L R R >L~e', 's'), P('L L R R L L R R L L R R L L >R~e', 's')));
add(F.rud, '15 · Seventeen Stroke Roll', 80, [P('R R L L R R L L R R L L R R L L', 's'), P('>R~q -~h.', 's')]);
add(F.rud, '16 · Single Paradiddle', 80, R2(P('>R L R R >L R L L >R L R R >L R L L', 's')));
add(F.rud, '17 · Double Paradiddle', 80, R2m([3, 4], P('>R L R L R R >L R L R L L', 's')), { meter: [3, 4] });
add(F.rud, '18 · Triple Paradiddle', 80, R2(P('>R L R L R L R R >L R L R L R L L', 's')));
add(F.rud, '19 · Paradiddle-Diddle', 80, [...R2m([3, 4], P('>R L R R L L >R L R R L L', 's')).slice(0, 2), P('>L R L L R R >L R L L R R', 's'), closeBar([3, 4])], { meter: [3, 4] });
add(F.rud, '20 · Flam', 70, R2(P('fR~q fL~q fR~q fL~q', 'q')));
add(F.rud, '21 · Flam Accent', 70, R2(P('>fR~e3 L~e3 R~e3 >fL~e3 R~e3 L~e3 >fR~e3 L~e3 R~e3 >fL~e3 R~e3 L~e3', 'e3')));
add(F.rud, '22 · Flam Tap', 80, R2(P('>fR R >fL L >fR R >fL L >fR R >fL L >fR R >fL L', 's')));
add(F.rud, '23 · Flamacue', 80, R2(P('fR~s >L~s R~s L~s fR~q fL~s >R~s L~s R~s fL~q', 's')));
add(F.rud, '24 · Flam Paradiddle', 80, R2(P('>fR L R R >fL R L L >fR L R R >fL R L L', 's')));
add(F.rud, '25 · Single Flammed Mill', 80, R2(P('>fR R L R >fL L R L >fR R L R >fL L R L', 's')));
add(F.rud, '26 · Flam Paradiddle-Diddle', 80, R2m([6, 8], P('>fR L R R L L >fL R L L R R', 's')), { meter: [6, 8], groupSpan: 180 });
add(F.rud, '27 · Pataflafla', 80, bars(P('>fR L R >fL >fR L R >fL >fR L R >fL >fR L R >fL', 's'), P('>fL R L >fR >fL R L >fR >fL R L >fR >fL R L >fR', 's')));
add(F.rud, '28 · Swiss Army Triplet', 70, R2(P('>fR~s3 R~s3 L~s3 >fR~s3 R~s3 L~s3 >fR~s3 R~s3 L~s3 >fR~s3 R~s3 L~s3 >fL~s3 L~s3 R~s3 >fL~s3 L~s3 R~s3 >fL~s3 L~s3 R~s3 >fL~s3 L~s3 R~s3', 's3')));
add(F.rud, '29 · Inverted Flam Tap', 80, R2(P('>fR L >fL R >fR L >fL R >fR L >fL R >fR L >fL R', 's')));
add(F.rud, '30 · Flam Drag', 70, R2(P('>fR~e3 L~s3 L~s3 R~e3 >fL~e3 R~s3 R~s3 L~e3 >fR~e3 L~s3 L~s3 R~e3 >fL~e3 R~s3 R~s3 L~e3', 'e3')));
add(F.rud, '31 · Drag (ruff)', 70, R2(P('dR~q dL~q dR~q dL~q', 'q')));
add(F.rud, '32 · Single Drag Tap', 80, R2(P('dR~e >L~e dL~e >R~e dR~e >L~e dL~e >R~e', 'e')));
add(F.rud, '35 · Single Dragadiddle', 80, R2(P('>fR=RR L R R >fL=LL R L L >fR=RR L R R >fL=LL R L L', 's')));
add(F.rud, '36 · Drag Paradiddle #1', 80, R2(P('>R~e L~s L~s R~s L~s R~s R~s >L~e R~s R~s L~s R~s L~s L~s', 's')));
add(F.rud, '37 · Drag Paradiddle #2', 80, barsIn([6, 8], P('>R~e L~s L~s R~e L~s L~s R~s L~s R~s R~s', 's'), P('>L~e R~s R~s L~e R~s R~s L~s R~s L~s L~s', 's'), P('>R~e L~s L~s R~e L~s L~s R~s L~s R~s R~s', 's'), P('>L~e R~s R~s L~e R~s R~s L~s R~s L~s L~s', 's')), { meter: [6, 8], groupSpan: 180 });
add(F.rud, '38 · Single Ratamacue', 80, R2(P('dR~s3 L~s3 R~s3 >L~e dL~s3 R~s3 L~s3 >R~e dR~s3 L~s3 R~s3 >L~e dL~s3 R~s3 L~s3 >R~e', 's3')));
add(F.rud, '39 · Double Ratamacue', 70, R2m([6, 8], P('dR~e dR~s3 L~s3 R~s3 >L~e dL~e dL~s3 R~s3 L~s3 >R~e', 's3')), { meter: [6, 8], groupSpan: 180 });
add(F.rud, '40 · Triple Ratamacue', 80, R2(P('dR~e dR~e dR~s3 L~s3 R~s3 >L~e dL~e dL~e dL~s3 R~s3 L~s3 >R~e', 's3')));

/* ───────── exercícios de rudimentos e viradas ───────── */
const para = (k1, k2) => `${k1}/>R ${k2}/L ${k2}/R ${k2}/R`;
add(F.exrud, 'Paradiddle na caixa com bumbo em semínimas', 80, [[P('>R L R R >L R L L >R L R R >L R L L', 's'), 'K:q K:q K:q K:q'], [P('>R L R R >L R L L >R L R R >L R L L', 's'), 'K:q K:q K:q K:q'], [P('>R L R R >L R L L >R L R R >L R L L', 's'), 'K:q K:q K:q K:q'], [P('>R~q -~h.', 's'), 'K:q -:h.']]);
add(F.exrud, 'Paradiddle orquestrado: acento nos tons', 80, rep([P('T1/>R S/L S/R S/R T3/>L S/R S/L S/L T1/>R S/L S/R S/R T3/>L S/R S/L S/L', 's'), 'K:q -:q K:q -:q'], 4));
add(F.exrud, 'Paradiddle com chimbal e caixa', 90, rep([P('H/>R S/L H/R H/R S/>L H/R S/L S/L H/>R S/L H/R H/R S/>L H/R S/L S/L', 's'), 'K:q -:q K:q -:q'], 4));
add(F.fills, 'Viradas de rock (5 viradas após o groove)', 80, [
    rock8,
    ['S:e S:e S:e S:e T1:e T1:e T3:e T3:e', REST_BAR],
    rock8,
    ['S+T1:e S+T1:e S+T1:e S+T1:e S+T3:e S+T3:e S+T3:e S+T3:e', REST_BAR],
    rock8,
    ['S:e S:e -:e T1:e T1:e T3:e T3:e T3:e', '-:q K:e -:e -:h'],
    rock8,
    ['-:e S:e S:e T1:e T1:e T3:e -:e S:e', 'K:e -:h -:e K:e -:e'],
    rock8,
    ['T1:s S:s S:s T1:s T3:s S:s S:s T1:s C:q -:q', '-:h K:q -:q'],
]);
add(F.fills, 'Virada de rulo duplo (RRLL) pelos tons', 80, rep([P('S/R S/R S/L S/L T1/R T1/R T1/L T1/L T3/R T3/R T3/L T3/L C/>R~q', 's'), '-:q -:q -:q K:q'], 2));
add(F.fills, 'Virada em sextinas descendo pelos tons', 70, rep([P('S/R~s6 S/L~s6 S/R~s6 S/L~s6 S/R~s6 S/L~s6 T1/R~s6 T1/L~s6 T1/R~s6 T1/L~s6 T1/R~s6 T1/L~s6 T2/R~s6 T2/L~s6 T2/R~s6 T2/L~s6 T2/R~s6 T2/L~s6 T3/R~s6 T3/L~s6 T3/R~s6 T3/L~s6 T3/R~s6 T3/L~s6', 's6'), '-:w'], 2));
add(F.fills, 'Virada com flam accent em tercinas', 80, rep([P('S/>fR~e3 S/L~e3 S/R~e3 T1/>fL~e3 T1/R~e3 T1/L~e3 T3/>fR~e3 T3/L~e3 T3/R~e3 C/>R~q', 'e3'), '-:q -:q -:q K:q'], 2));
add(F.fills, 'Virada com paradiddle-diddle em sextinas', 70, rep([P('S/>R~s6 S/L~s6 S/R~s6 S/R~s6 S/L~s6 S/L~s6 T1/>R~s6 T1/L~s6 T1/R~s6 T1/R~s6 T1/L~s6 T1/L~s6 T2/>R~s6 T2/L~s6 T2/R~s6 T2/R~s6 T2/L~s6 T2/L~s6 T3/>R~s6 T3/L~s6 T3/R~s6 T3/R~s6 T3/L~s6 T3/L~s6', 's6'), '-:w'], 2));
add(F.fills, 'Virada com rulo de cinco golpes', 80, rep([P('S/R S/R S/L S/L S/>R~q T3/L T3/L T3/R T3/R C/>L~q', 's'), '-:h -:q K:q'], 2));

/* ───────── gera ───────── */
const outDir = join(root, 'acervo-importar', '_bateria-gerada');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const files = EX.map((e) => {
    const xml = build({ titulo: e.titulo, bpm: e.bpm, meter: e.meter, groupSpan: e.groupSpan, bars: e.bars });
    writeFileSync(join(outDir, `${slug(e.pasta + ' ' + e.titulo)}.musicxml`), xml);
    return { ...e, xml };
});
console.log(`${files.length} exercícios gerados em ${outDir}`);
if (!process.argv.includes('--enviar')) process.exit(0);

/* ───────── envia ───────── */
const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '').trim()]));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const cache = new Map();
async function ensureFolder(path) {
    if (cache.has(path)) return cache.get(path);
    let parent = null;
    let acc = '';
    for (const nome of path.split('/')) {
        acc = acc ? `${acc}/${nome}` : nome;
        if (cache.has(acc)) { parent = cache.get(acc); continue; }
        let q = supabase.from('partitura_pastas').select('id').eq('nome', nome);
        q = parent ? q.eq('pai_id', parent) : q.is('pai_id', null);
        const { data: found } = await q.maybeSingle();
        if (found) parent = found.id;
        else {
            const r = await supabase.from('partitura_pastas').insert({ nome, pai_id: parent }).select().single();
            if (r.error) throw new Error(`pasta ${acc}: ${r.error.message}`);
            parent = r.data.id;
        }
        cache.set(acc, parent);
    }
    return parent;
}
// títulos antigos -> numeração oficial da PAS
const RENAMES = {
    '05 · Double Stroke Open Roll': '06 · Double Stroke Roll',
    '06 · Triple Stroke Roll': '05 · Triple Stroke Roll',
    '19 · Single Paradiddle-Diddle': '19 · Paradiddle-Diddle',
    '27 · Flam Paradiddle-Diddle': '26 · Flam Paradiddle-Diddle',
};
for (const [antigo, novo] of Object.entries(RENAMES)) {
    const { data } = await supabase.from('partituras').select('id').eq('titulo', antigo).limit(1);
    const { data: jaTem } = await supabase.from('partituras').select('id').eq('titulo', novo).limit(1);
    if (data?.length && !jaTem?.length) { await supabase.from('partituras').update({ titulo: novo }).eq('id', data[0].id); console.log(`~ renomeada: ${antigo} -> ${novo}`); }
}
const atualizar = process.argv.includes('--atualizar');
const sobe = async (pasta, e) => {
    const path = `acervo/${pasta}/${crypto.randomUUID().slice(0, 8)}-${slug(e.titulo)}.musicxml`;
    const up = await supabase.storage.from('course-materials').upload(path, new Blob([e.xml], { type: 'application/xml' }), { contentType: 'application/xml', upsert: false });
    if (up.error) throw new Error(`${e.titulo}: ${up.error.message}`);
    return { path, url: supabase.storage.from('course-materials').getPublicUrl(path).data.publicUrl };
};
let added = 0, moved = 0, updated = 0;
for (const e of files) {
    const pasta = await ensureFolder(e.pasta);
    const { data: dup } = await supabase.from('partituras').select('id,pasta_id,arquivo_path,arquivo_bucket').eq('titulo', e.titulo).limit(1);
    if (dup?.length) {
        const upd = {};
        if (dup[0].pasta_id !== pasta) { upd.pasta_id = pasta; moved += 1; console.log(`~ movida: ${e.titulo}`); }
        if (atualizar) {
            const f = await sobe(pasta, e);
            Object.assign(upd, { arquivo_url: f.url, arquivo_path: f.path, arquivo_bucket: 'course-materials' });
            if (dup[0].arquivo_path) await supabase.storage.from(dup[0].arquivo_bucket || 'course-materials').remove([dup[0].arquivo_path]);
            updated += 1;
        }
        if (Object.keys(upd).length) await supabase.from('partituras').update(upd).eq('id', dup[0].id);
        continue;
    }
    const f = await sobe(pasta, e);
    const ins = await supabase.from('partituras').insert({ pasta_id: pasta, titulo: e.titulo, compositor: 'RF Music', fonte: 'Exercício original criado para a plataforma (sem direitos de terceiros)', origem: 'musicxml', arquivo_url: f.url, arquivo_bucket: 'course-materials', arquivo_path: f.path });
    if (ins.error) throw new Error(`${e.titulo}: ${ins.error.message}`);
    added += 1;
    console.log(`+ ${e.pasta} / ${e.titulo}`);
}
console.log(`\n${added} novas, ${moved} reorganizadas, ${updated} atualizadas.`);
