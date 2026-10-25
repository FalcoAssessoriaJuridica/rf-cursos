// Modo prática: o cursor ESPERA o aluno tocar as notas certas (teclado MIDI ou teclado na tela) e só então avança.
// Lógica pura, sem som nem tela: recebe os passos da partitura (events do ScorePlayer) e as notas tocadas.
//
//   events : [{ notes: [{ midi, staff, ... }] }]  (as notas de bateria, sem `midi`, são ignoradas)
//   staves : Set de pautas que o aluno toca (null = todas)
//   anyOctave : aceita a nota certa em qualquer oitava (útil em teclados pequenos)

const NOMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
export const nomeNota = (midi) => `${NOMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

export class PracticeSession {
    constructor({ events, staves = null, anyOctave = false, onStep, onFeedback, onDone } = {}) {
        this.events = events || [];
        this.staves = staves;
        this.anyOctave = anyOctave;
        this.onStep = onStep;
        this.onFeedback = onFeedback;
        this.onDone = onDone;
        this.i = -1;
        this.exp = [];
        this.got = new Set();
        this.clean = true;
        this.done = false;
        this.stats = { total: this.events.filter((_, k) => this.expectedAt(k).length).length, passos: 0, limpos: 0, erros: 0, inicio: null, fim: null };
    }

    // notas (MIDI, sem repetição) que o aluno deve tocar neste passo
    expectedAt(i) {
        const ev = this.events[i];
        if (!ev) return [];
        const set = new Set();
        for (const n of ev.notes) {
            if (n.drum || typeof n.midi !== 'number') continue;
            if (this.staves && !this.staves.has(n.staff)) continue;
            set.add(n.midi);
        }
        return [...set].sort((a, b) => a - b);
    }

    _next(from) {
        for (let j = Math.max(0, from); j < this.events.length; j += 1) if (this.expectedAt(j).length) return j;
        return -1;
    }

    _enter(j) {
        this.i = j;
        this.exp = this.expectedAt(j);
        this.got = new Set();
        this.clean = true;
        this.onStep?.(j, this.exp);
    }

    start(from = 0) {
        this.done = false;
        this.stats = { ...this.stats, passos: 0, limpos: 0, erros: 0, inicio: Date.now(), fim: null };
        const j = this._next(from);
        if (j < 0) { this._finish(); return false; }
        this._enter(j);
        return true;
    }

    _key(m) { return this.anyOctave ? ((m % 12) + 12) % 12 : m; }

    // nota tocada: devolve 'ok' (acertou), 'repetida' (já tocada neste passo), 'erro' ou null (sem prática ativa)
    press(midi) {
        if (this.done || this.i < 0) return null;
        const k = this._key(midi);
        const alvo = this.exp.find((e) => this._key(e) === k && !this.got.has(e));
        let resultado;
        if (alvo !== undefined) {
            this.got.add(alvo);
            resultado = 'ok';
        } else if (this.exp.some((e) => this._key(e) === k)) {
            resultado = 'repetida';
        } else {
            this.stats.erros += 1;
            this.clean = false;
            resultado = 'erro';
        }
        this.onFeedback?.(resultado, midi);
        if (this.got.size === this.exp.length) {
            this.stats.passos += 1;
            if (this.clean) this.stats.limpos += 1;
            const j = this._next(this.i + 1);
            if (j < 0) this._finish(); else this._enter(j);
        }
        return resultado;
    }

    _finish() {
        this.done = true;
        this.i = -1;
        this.exp = [];
        this.stats.fim = Date.now();
        this.onDone?.(this.summary());
    }

    stop() { this.done = true; this.i = -1; this.exp = []; }

    summary() {
        const s = this.stats;
        const fim = s.fim ?? Date.now();
        return {
            total: s.total, passos: s.passos, limpos: s.limpos, erros: s.erros,
            precisao: s.passos ? Math.round((s.limpos / s.passos) * 100) : 0,
            segundos: s.inicio ? Math.round((fim - s.inicio) / 1000) : 0,
        };
    }
}
