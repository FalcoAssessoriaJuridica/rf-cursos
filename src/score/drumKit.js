// Bateria sintetizada (Tone.js, sem amostras: nada para baixar nem licenciar) e o mapeamento das notas de percussão.
import * as Tone from 'tone';

// Escolhe o som de uma nota de percussão. Ordem: nome do instrumento (o mais confiável entre exportadores),
// número MIDI General MIDI (o MusicXML conta a partir de 1, por isso o -1) e, por fim, a posição na pauta.
const NAMES = [
    [/kick|bass ?drum|bumbo|bombo/i, 'kick'],
    [/side ?stick|rim ?shot|cross ?stick|rimshot/i, 'rim'],
    [/snare|caixa|clap/i, 'snare'],
    [/hi.?hat.*open|open.*hi.?hat|chimbal.*abert/i, 'hatO'],
    [/pedal.*hat|hat.*pedal/i, 'hatP'],
    [/hi.?hat|hihat|chimbal/i, 'hatC'],
    [/floor|low.*tom|surdo/i, 'tomL'],
    [/high.*tom|hi.*tom/i, 'tomH'],
    [/tom/i, 'tomM'],
    [/crash|china|splash|prato/i, 'crash'],
    [/ride|bell|cowbell/i, 'ride'],
];
const GM = {
    35: 'kick', 36: 'kick', 37: 'rim', 38: 'snare', 39: 'snare', 40: 'snare',
    41: 'tomL', 43: 'tomL', 45: 'tomM', 47: 'tomM', 48: 'tomH', 50: 'tomH',
    42: 'hatC', 44: 'hatP', 46: 'hatO', 49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash', 51: 'ride', 53: 'ride', 59: 'ride', 56: 'ride',
};
// altura exibida (MIDI) na clave de percussão padrão
const POS = { 65: 'kick', 69: 'tomL', 72: 'snare', 74: 'tomM', 76: 'tomH', 77: 'ride', 79: 'hatC', 81: 'crash' };

export function drumVoice({ name = '', midiUnpitched = null, shown = null }) {
    for (const [re, v] of NAMES) if (re.test(name)) return v;
    if (midiUnpitched != null && GM[midiUnpitched - 1]) return GM[midiUnpitched - 1];
    if (midiUnpitched != null && GM[midiUnpitched]) return GM[midiUnpitched];
    if (shown != null) {
        if (POS[shown]) return POS[shown];
        return shown < 67 ? 'kick' : shown < 73 ? 'snare' : shown < 78 ? 'tomM' : 'hatC';
    }
    return 'snare';
}

// Bateria sintetizada: usada só no aro (side stick), que o kit gravado não traz, e como reserva se as amostras não carregarem.
export class SynthKit {
    constructor() {
        const limiter = new Tone.Limiter(-2).toDestination();
        const out = new Tone.Gain(0.5).connect(limiter);
        const hp = new Tone.Filter(1500, 'highpass').connect(out);
        this.nodes = [out, hp, limiter];
        const add = (n) => { this.nodes.push(n); return n; };
        this.kick = add(new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6, envelope: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.1 } }).connect(out));
        this.kick.volume.value = -2;
        this.snareNoise = add(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 } }).connect(hp));
        this.snareBody = add(new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 } }).connect(out));
        this.snareBody.volume.value = -8;
        this.snareNoise.volume.value = -5;
        this.rim = add(new Tone.MembraneSynth({ pitchDecay: 0.005, octaves: 1.5, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 } }).connect(out));
        this.tom = add(new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 2.5, envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.1 } }).connect(out));
        const metal = (decay, res) => add(new Tone.MetalSynth({ envelope: { attack: 0.001, decay, release: 0.02 }, harmonicity: 5.1, modulationIndex: 32, resonance: res, octaves: 1.5 }).connect(out));
        this.hatC = metal(0.06, 7000); this.hatO = metal(0.3, 7000); this.hatP = metal(0.03, 6000);
        this.crash = metal(1.4, 4000); this.ride = metal(0.7, 5000);
        this.hatC.volume.value = -8; this.hatO.volume.value = -9; this.hatP.volume.value = -10;
        this.crash.volume.value = -15; this.ride.volume.value = -14;
    }

    // vel: 0 a 1 (acento = 1, normal = 0,8, fantasma = 0,28)
    trigger(voice, time, vel = 0.8) {
        switch (voice) {
            case 'kick': this.kick.triggerAttackRelease('C1', 0.3, time, vel); break;
            case 'snare': this.snareNoise.triggerAttackRelease(0.15, time, vel); this.snareBody.triggerAttackRelease('E2', 0.1, time, vel); break;
            case 'rim': this.rim.triggerAttackRelease('A3', 0.04, time, vel); break;
            case 'tomL': this.tom.triggerAttackRelease('F2', 0.3, time, vel); break;
            case 'tomM': this.tom.triggerAttackRelease('A2', 0.3, time, vel); break;
            case 'tomH': this.tom.triggerAttackRelease('D3', 0.3, time, vel); break;
            case 'hatO': this.hatO.triggerAttackRelease('C5', 0.3, time, vel); break;
            case 'hatP': this.hatP.triggerAttackRelease('C5', 0.03, time, vel); break;
            case 'crash': this.crash.triggerAttackRelease('C4', 1.2, time, vel); break;
            case 'ride': this.ride.triggerAttackRelease('E4', 0.6, time, vel); break;
            default: this.hatC.triggerAttackRelease('C5', 0.05, time, vel);
        }
    }

    dispose() { this.nodes.forEach((n) => { try { n.dispose(); } catch { /* ignora */ } }); }
}

// Bateria acústica de verdade: MuldjordKit (Lars Muldjord, CC BY 4.0), amostras em /drums/muldjord (créditos em CREDITOS.txt).
// Cada peça tem 3 forças (suave, média, forte) e, no bumbo, na caixa e nos pratos, duas fontes que se alternam para não soar "metralhadora".
const BASE = '/drums/muldjord/';
// equilíbrio entre as peças (as amostras vêm normalizadas pelo mais forte de cada uma)
const TRIM = { kick: 1.1, snare: 1.5, hatC: 1.6, hatO: 1.3, hatP: 4, crash: 1.4, ride: 1.5, bell: 1.5, tomH: 1.1, tomM: 1.1, tomL: 1.1 };

export class DrumKit {
    constructor() {
        this.synth = new SynthKit();   // aro + reserva
        this.samples = null;           // voz -> [{ buf, layer }]
        this.rr = {};                  // rodízio por voz e camada
        this.openHat = null;           // chimbal aberto soando, para o chimbal fechado "abafar"
        // compressor + limitador: vários golpes fortes no mesmo instante (bumbo + prato + caixa) não podem estourar
        const limiter = new Tone.Limiter(-1.5).toDestination();
        const makeup = new Tone.Gain(1).connect(limiter);
        const comp = new Tone.Compressor({ threshold: -16, ratio: 8, attack: 0.002, release: 0.18 }).connect(makeup);
        this.out = new Tone.Gain(0.85).connect(comp);
        this.nodes = [this.out, comp, makeup, limiter];
    }

    async load() {
        try {
            const manifest = await (await fetch(`${BASE}kit.json`)).json();
            const entries = await Promise.all(Object.entries(manifest).map(async ([voice, list]) => [
                voice,
                await Promise.all(list.map(async ({ file, layer }) => ({ layer, buf: await Tone.ToneAudioBuffer.fromUrl(`${BASE}${file}`) }))),
            ]));
            this.samples = Object.fromEntries(entries);
        } catch {
            this.samples = null; // sem rede ou arquivos ausentes: cai na bateria sintetizada
        }
        return !!this.samples;
    }

    _pick(voice, vel) {
        const list = this.samples?.[voice];
        if (!list?.length) return null;
        const want = vel < 0.6 ? 0 : vel < 0.9 ? 1 : 2;
        const layers = [...new Set(list.map((x) => x.layer))].sort();
        const layer = layers.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
        const pool = list.filter((x) => x.layer === layer);
        const k = `${voice}${layer}`;
        this.rr[k] = ((this.rr[k] ?? -1) + 1) % pool.length;
        return pool[this.rr[k]];
    }

    // vel: 0 a 1 (acento = 1, normal = 0,8, fantasma = 0,28, nota de graça = 0,5)
    trigger(voice, time, vel = 0.8) {
        const map = { rim: null, hatP: 'hatP' };
        const pick = voice === 'rim' ? null : this._pick(map[voice] || voice, vel);
        if (!pick) { this.synth.trigger(voice, time, vel); return; }
        const src = new Tone.ToneBufferSource(pick.buf);
        const g = new Tone.Gain((0.62 + 0.38 * vel) * (TRIM[map[voice] || voice] ?? 1)).connect(this.out);
        src.connect(g);
        src.start(time);
        src.onended = () => { try { src.dispose(); g.dispose(); } catch { /* ignora */ } };
        if (voice === 'hatC' || voice === 'hatP') {
            if (this.openHat) { this.openHat.gain.cancelScheduledValues(time); this.openHat.gain.setTargetAtTime(0, time, 0.015); this.openHat = null; }
        } else if (voice === 'hatO') this.openHat = g;
    }

    dispose() {
        this.nodes.forEach((n) => { try { n.dispose(); } catch { /* ignora */ } });
        this.synth.dispose();
    }
}
