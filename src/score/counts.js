// Contagem falada de cada posição do compasso, como nas videoaulas de bateria: 1 e 2 e..., 1 tri-plet, 1 la li e la li, 1 la li (6/8).
// pos = posição dentro do compasso em unidades da fórmula (semínima em 4/4, colcheia em 6/8).
const EPS = 1e-3;
const near = (a, b) => Math.abs(a - b) < EPS;

export function countLabel({ t, mstart, num, den }, ctx = {}) {
    const pos = (t - mstart) * den;
    const compound = den === 8 && num % 3 === 0 && num >= 6;
    if (compound) {
        const beat = Math.floor(pos / 3 + EPS);
        const r = pos - beat * 3;
        if (near(r, 0)) return { text: String(beat + 1), main: true };
        if (near(r, 1)) return { text: 'la', main: false };
        if (near(r, 2)) return { text: 'li', main: false };
        if (near(r, 0.5) || near(r, 1.5) || near(r, 2.5)) return { text: 'e', main: false }; // semicolcheias: 1 e la e li e
        return { text: '', main: false };
    }
    const beat = Math.floor(pos + EPS);
    const r = pos - beat;
    const six = ctx.sextuplet?.has(beat);
    const five = ctx.quintuplet?.has(beat);
    if (near(r, 0)) return { text: String(beat + 1), main: true };
    if (five) {
        const k = Math.round(r * 5);
        return { text: ['', 'la', 'li', 'ka', 'na'][k] || '', main: false };
    }
    if (six) return { text: { 1: 'la', 2: 'li', 3: '&', 4: 'la', 5: 'li' }[Math.round(r * 6)] || '', main: false };
    if (near(r, 0.5)) return { text: '&', main: false };
    if (near(r, 0.25)) return { text: 'e', main: false };
    if (near(r, 0.75)) return { text: 'a', main: false };
    if (near(r, 1 / 3)) return { text: 'tri', main: false };
    if (near(r, 2 / 3)) return { text: 'plet', main: false };
    if (near(r, 0.125) || near(r, 0.375) || near(r, 0.625) || near(r, 0.875)) return { text: '', main: false }; // fusas: sem texto
    return { text: '', main: false };
}

// descobre batidas com sextinas/quintinas olhando as posições usadas dentro de cada batida
export function tupletContext(events) {
    const six = new Set(); const five = new Set();
    events.forEach((e) => {
        if (e.mstart == null) return;
        const pos = (e.t - e.mstart) * e.den;
        const beat = Math.floor(pos + EPS);
        const r = pos - beat;
        const k6 = r * 6; const k5 = r * 5;
        if ((near(k6, 1) || near(k6, 5)) && !near(r * 4, Math.round(r * 4))) six.add(beat);
        if ((near(k5, 1) || near(k5, 2) || near(k5, 3) || near(k5, 4)) && !near(r * 4, Math.round(r * 4))) five.add(beat);
    });
    return { sextuplet: six, quintuplet: five };
}
