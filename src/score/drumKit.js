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

export class DrumKit {
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

    trigger(voice, time) {
        switch (voice) {
            case 'kick': this.kick.triggerAttackRelease('C1', 0.3, time); break;
            case 'snare': this.snareNoise.triggerAttackRelease(0.15, time); this.snareBody.triggerAttackRelease('E2', 0.1, time); break;
            case 'rim': this.rim.triggerAttackRelease('A3', 0.04, time); break;
            case 'tomL': this.tom.triggerAttackRelease('F2', 0.3, time); break;
            case 'tomM': this.tom.triggerAttackRelease('A2', 0.3, time); break;
            case 'tomH': this.tom.triggerAttackRelease('D3', 0.3, time); break;
            case 'hatO': this.hatO.triggerAttackRelease('C5', 0.3, time); break;
            case 'hatP': this.hatP.triggerAttackRelease('C5', 0.03, time); break;
            case 'crash': this.crash.triggerAttackRelease('C4', 1.2, time); break;
            case 'ride': this.ride.triggerAttackRelease('E4', 0.6, time); break;
            default: this.hatC.triggerAttackRelease('C5', 0.05, time);
        }
    }

    dispose() { this.nodes.forEach((n) => { try { n.dispose(); } catch { /* ignora */ } }); }
}
