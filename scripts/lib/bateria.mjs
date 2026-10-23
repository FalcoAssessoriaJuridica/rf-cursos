// Gerador de partituras de bateria em MusicXML (divisions = 120 por semínima).
//
// Cada compasso é uma ou duas "vozes" de texto (mãos em cima, pés embaixo): "TOKEN TOKEN ...", com TOKEN =
//   TECLAS[marcas][@digitação]:DURAÇÃO        pausa: -:DURAÇÃO
//   TECLAS   K bumbo, S caixa, R aro, H chimbal, O chimbal aberto, P chimbal de pé, T1/T2/T3 tons, C prato, D condução
//            (várias com "+": acorde, ex. H+S)
//   marcas   >  acento      g  nota fantasma      f  flam (1 nota de graça)      d  drag (2 notas de graça)
//            z  rufo (buzz, tremolo de 3 barras)
//   @R @L @lR ...   digitação escrita sob a nota
//   DURAÇÃO  w h q e s t (semibreve, mínima, semínima, colcheia, semicolcheia, fusa); "." pontua;
//            quiálteras: e3 (tercina de colcheia) s3 (tercina de semicolcheia) s6 (sextina) s5 (quintina) q3 t3
export const INST = {
    K: { name: 'Bass Drum', midi: 36, step: 'F', oct: 4 },
    S: { name: 'Snare Drum', midi: 38, step: 'C', oct: 5 },
    R: { name: 'Side Stick', midi: 37, step: 'C', oct: 5, head: 'x' },
    H: { name: 'Hi-Hat', midi: 42, step: 'G', oct: 5, head: 'x' },
    O: { name: 'Open Hi-Hat', midi: 46, step: 'G', oct: 5, head: 'circle-x' },
    P: { name: 'Hi-Hat Pedal', midi: 44, step: 'D', oct: 4, head: 'x' },
    T1: { name: 'High Tom', midi: 50, step: 'E', oct: 5 },
    T2: { name: 'Mid Tom', midi: 47, step: 'D', oct: 5 },
    T3: { name: 'Floor Tom', midi: 43, step: 'A', oct: 4 },
    C: { name: 'Crash Cymbal', midi: 49, step: 'A', oct: 5, head: 'x' },
    D: { name: 'Ride Cymbal', midi: 51, step: 'F', oct: 5, head: 'x' },
};
const BASE = { w: 480, h: 240, q: 120, e: 60, s: 30, t: 15 };
const TYPES = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: '16th', t: '32nd' };
const LEVEL = { e: 1, s: 2, t: 3 };
const NORMAL = { 3: 2, 5: 4, 6: 4 };

export const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

function parseDur(d) {
    const m = /^([whqest])(\.?)(\d?)$/.exec(d);
    if (!m) throw new Error(`duração inválida "${d}"`);
    const n = m[3] ? Number(m[3]) : 0;
    let dur = BASE[m[1]] * (m[2] ? 1.5 : 1);
    let tup = null;
    if (n) { if (!NORMAL[n]) throw new Error(`quiáltera ${n} não suportada`); dur = (dur * NORMAL[n]) / n; tup = { actual: n, normal: NORMAL[n] }; }
    if (!Number.isInteger(dur)) throw new Error(`duração fracionária em "${d}"`);
    return { type: TYPES[m[1]], dot: !!m[2], dur, tup, level: LEVEL[m[1]] || 0 };
}

function parseTokens(spec) {
    return spec.trim().split(/\s+/).map((t) => {
        const m = /^(-|[A-Z][A-Z0-9+]*?)([>gfdz]*)(?:@([A-Za-z]+))?:(\S+)$/.exec(t);
        if (!m) throw new Error(`token inválido "${t}"`);
        const keys = m[1] === '-' ? [] : m[1].split('+');
        keys.forEach((k) => { if (!INST[k]) throw new Error(`instrumento "${k}" desconhecido em "${t}"`); });
        return { keys, mods: m[2], stick: m[3] || null, ...parseDur(m[4]) };
    });
}

function beamsFor(notes, spanSpec) {
    const out = notes.map(() => ({}));
    const bounds = Array.isArray(spanSpec) ? spanSpec.reduce((a, l) => [...a, (a[a.length - 1] || 0) + l], []) : null;
    const grp = (pos) => (bounds ? bounds.findIndex((b) => pos < b) : Math.floor(pos / spanSpec));
    let pos = 0;
    const start = notes.map((n) => { const p = pos; pos += n.dur; return p; });
    const beamable = (n) => n.keys.length && n.level >= 1;
    let i = 0;
    while (i < notes.length) {
        if (!beamable(notes[i])) { i += 1; continue; }
        let j = i;
        while (j < notes.length && beamable(notes[j]) && grp(start[j]) === grp(start[i])) j += 1;
        if (j - i >= 2) {
            for (let L = 1; L <= 3; L += 1) {
                let k = i;
                while (k < j) {
                    if (notes[k].level < L) { k += 1; continue; }
                    let m = k; while (m < j && notes[m].level >= L) m += 1;
                    if (m - k >= 2) for (let q = k; q < m; q += 1) out[q][L] = q === k ? 'begin' : q === m - 1 ? 'end' : 'continue';
                    else if (L > 1) out[k][L] = k === i ? 'forward hook' : 'backward hook';
                    k = m;
                }
            }
        }
        i = Math.max(j, i + 1);
    }
    return out;
}

function voiceXml(spec, voice, stem, barLen, span) {
    const notes = parseTokens(spec);
    const total = notes.reduce((a, n) => a + n.dur, 0);
    if (total !== barLen) throw new Error(`compasso com ${total}/${barLen} divisões: ${spec}`);
    const bm = beamsFor(notes, span);
    // colchetes de quiáltera: o grupo fecha quando a soma das durações escritas (sem a quiáltera) chega a
    // "actual" vezes a maior figura do grupo (3 x colcheia = tercina de colcheia; e3+s3+s3+e3 também fecha)
    const tupMark = notes.map(() => null);
    for (let i = 0; i < notes.length;) {
        const t = notes[i].tup;
        if (!t) { i += 1; continue; }
        let j = i; let sum = 0; let max = 0; let first = true;
        while (j < notes.length && notes[j].tup && notes[j].tup.actual === t.actual && notes[j].tup.normal === t.normal) {
            const nominal = (notes[j].dur * t.actual) / t.normal;
            sum += nominal; max = Math.max(max, nominal);
            if (first) { tupMark[j] = 'start'; first = false; }
            if (Math.abs(sum - t.actual * max) < 1e-6) {
                tupMark[j] = tupMark[j] === 'start' ? 'both' : 'stop';
                sum = 0; max = 0; first = true;
            }
            j += 1;
        }
        i = j;
    }
    const graceXml = (k, type, slash) => {
        const I = INST[k];
        return `<note><grace${slash ? ' slash="yes"' : ''}/><unpitched><display-step>${I.step}</display-step><display-octave>${I.oct}</display-octave></unpitched><instrument id="P1-${k}"/><voice>${voice}</voice><type>${type}</type><stem>${stem}</stem>${I.head ? `<notehead>${I.head}</notehead>` : ''}</note>`;
    };
    return notes.map((n, idx) => {
        const dot = n.dot ? '<dot/>' : '';
        const tm = n.tup ? `<time-modification><actual-notes>${n.tup.actual}</actual-notes><normal-notes>${n.tup.normal}</normal-notes></time-modification>` : '';
        const tupN = tupMark[idx] ? (tupMark[idx] === 'both' ? '' : `<tuplet type="${tupMark[idx]}" bracket="yes" show-number="actual"/>`) : '';
        if (!n.keys.length) {
            return `<note><rest/><duration>${n.dur}</duration><voice>${voice}</voice><type>${n.type}</type>${dot}${tm}${tupN ? `<notations>${tupN}</notations>` : ''}</note>`;
        }
        const b = [1, 2, 3].filter((L) => bm[idx][L]).map((L) => `<beam number="${L}">${bm[idx][L]}</beam>`).join('');
        let pre = '';
        if (n.mods.includes('f')) pre = graceXml(n.keys[0], '16th', true);
        if (n.mods.includes('d')) pre = graceXml(n.keys[0], '16th', false) + graceXml(n.keys[0], '16th', false);
        const main = n.keys.map((k, c) => {
            const I = INST[k];
            const ghost = n.mods.includes('g');
            const head = ghost ? `<notehead parentheses="yes">${I.head || 'normal'}</notehead>` : I.head ? `<notehead>${I.head}</notehead>` : '';
            const notes2 = [];
            if (c === 0 && tupN) notes2.push(tupN);
            if (c === 0 && n.mods.includes('>')) notes2.push('<articulations><accent/></articulations>');
            if (c === 0 && n.mods.includes('z')) notes2.push('<ornaments><tremolo type="single">3</tremolo></ornaments>');
            // a biblioteca de desenho não mostra parênteses: a nota fantasma leva a digitação entre parênteses
            const label = ghost ? `(${n.stick || 'g'})` : n.stick;
            const lyric = c === 0 && label ? `<lyric number="1"><syllabic>single</syllabic><text>${label}</text></lyric>` : '';
            return `<note>${c ? '<chord/>' : ''}<unpitched><display-step>${I.step}</display-step><display-octave>${I.oct}</display-octave></unpitched><duration>${n.dur}</duration><instrument id="P1-${k}${ghost ? 'g' : ''}"/><voice>${voice}</voice><type>${n.type}</type>${dot}${tm}<stem>${stem}</stem>${head}${c === 0 ? b : ''}${notes2.length ? `<notations>${notes2.join('')}</notations>` : ''}${lyric}</note>`;
        }).join('');
        return pre + main;
    }).join('');
}

// meter: [batidas, unidade]; compostos (6/8, 9/8, 12/8) agrupam colcheias de 3 em 3. beats: tamanho do grupo de ligadura.
export function build({ titulo, bpm, meter = [4, 4], bars, tempoUnit = null, groupSpan = null }) {
    const [beats, unit] = meter;
    const barLen = (beats * 480) / unit;
    const compound = unit === 8 && beats % 3 === 0 && beats >= 6;
    const span = groupSpan || (compound ? 180 : 120); // número ou lista, ex.: [120, 120, 180] para 7/8 = 2+2+3
    const unitDot = tempoUnit ? tempoUnit === 'q.' : compound;
    const sound = Math.round(bpm * (unitDot ? 1.5 : 1));
    const used = new Set();
    const ghosts = new Set();
    const barSpecs = bars.map((b) => (Array.isArray(b) ? b : [b, null]));
    barSpecs.forEach(([a, c]) => [a, c].filter(Boolean).forEach((s) => parseTokens(s).forEach((n) => n.keys.forEach((k) => { used.add(k); if (n.mods.includes('g')) ghosts.add(k); }))));
    // graças usam a primeira tecla: já está em used
    const ids = [...used.values()].map((k) => [k, k, INST[k].name]).concat([...ghosts].map((k) => [`${k}g`, k, `${INST[k].name} (ghost)`]));
    const si = ids.map(([id, , name]) => `<score-instrument id="P1-${id}"><instrument-name>${name}</instrument-name></score-instrument>`).join('');
    const mi = ids.map(([id, k]) => `<midi-instrument id="P1-${id}"><midi-channel>10</midi-channel><midi-unpitched>${INST[k].midi + 1}</midi-unpitched></midi-instrument>`).join('');
    const measures = barSpecs.map(([v1, v2], i) => {
        const attr = i === 0
            ? `<attributes><divisions>120</divisions><key><fifths>0</fifths></key><time><beats>${beats}</beats><beat-type>${unit}</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>${unitDot ? '<beat-unit-dot/>' : ''}<per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${sound}"/></direction>`
            : '';
        const second = v2 ? `<backup><duration>${barLen}</duration></backup>${voiceXml(v2, 2, 'down', barLen, span)}` : '';
        return `<measure number="${i + 1}">${attr}${voiceXml(v1, 1, 'up', barLen, span)}${second}</measure>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.1"><work><work-title>${titulo}</work-title></work><part-list><score-part id="P1"><part-name>Bateria</part-name>${si}${mi}</score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

export const rep = (bar, n) => Array.from({ length: n }, () => bar);
