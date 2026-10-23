// Motor da partitura: carrega MusicXML/MXL com o OpenSheetMusicDisplay, extrai a linha do tempo (notas por posição do cursor)
// e toca com Tone.js, movendo o cursor em sincronia. Aceita 1 pauta (clave de Sol, solo/melodia) ou várias partes.
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import * as Tone from 'tone';
import JSZip from 'jszip';
import { DrumKit, drumVoice } from './drumKit';

// piano de amostras (Salamander) hospedado pelo Tone.js; sem rede cai num sintetizador
const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';
const SAMPLE_URLS = { A0: 'A0.mp3', C2: 'C2.mp3', A2: 'A2.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', A5: 'A5.mp3', C6: 'C6.mp3', A6: 'A6.mp3' };

const midiToName = (m) => Tone.Frequency(m, 'midi').toNote();

// Lê File, ArrayBuffer ou URL e devolve o texto MusicXML (descompacta .mxl), já preparado:
//  - clean: remove dinâmicas, textos e ornamentos (o reconhecimento de PDF costuma confundir a letra do hino com eles)
//  - timeSig: "3/4" etc. quando o reconhecimento não achou a fórmula de compasso
async function toBuffer(source) {
    if (typeof source === 'string') {
        const res = await fetch(source);
        if (!res.ok) throw new Error('Não foi possível abrir a partitura.');
        return res.arrayBuffer();
    }
    if (source instanceof ArrayBuffer) return source;
    return source.arrayBuffer();
}

async function toXmlText(buf) {
    const b = new Uint8Array(buf);
    if (!(b[0] === 0x50 && b[1] === 0x4b)) return new TextDecoder('utf-8').decode(b);
    const zip = await JSZip.loadAsync(buf);
    let path = null;
    const container = zip.file('META-INF/container.xml');
    if (container) path = /full-path="([^"]+)"/.exec(await container.async('string'))?.[1];
    if (!path || !zip.file(path)) path = Object.keys(zip.files).find((n) => /\.(xml|musicxml)$/i.test(n) && !n.startsWith('META-INF'));
    if (!path) throw new Error('Arquivo MusicXML inválido.');
    return zip.file(path).async('string');
}

export function prepareXml(xml, { clean = false, timeSig = null } = {}) {
    if (!clean && !timeSig) return { xml, hasTime: /<time[ >]/.test(xml) };
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) return { xml, hasTime: /<time[ >]/.test(xml) };
    if (clean) {
        doc.querySelectorAll('direction').forEach((d) => {
            const keep = d.querySelector('metronome') || d.querySelector('sound[tempo]');
            if (!keep) d.remove();
        });
        doc.querySelectorAll('ornaments, technical').forEach((n) => n.remove());
        const work = doc.querySelector('work-title, movement-title');
        if (work && /untitled/i.test(work.textContent)) work.textContent = ' ';
    }
    if (timeSig) {
        const [beats, type] = timeSig.split('/');
        doc.querySelectorAll('part').forEach((part) => {
            const first = part.querySelector('measure');
            if (!first) return;
            let attrs = first.querySelector('attributes');
            if (!attrs) { attrs = doc.createElement('attributes'); first.insertBefore(attrs, first.firstChild); }
            attrs.querySelectorAll('time').forEach((t) => t.remove());
            const time = doc.createElement('time');
            const bt = doc.createElement('beats'); bt.textContent = beats;
            const ty = doc.createElement('beat-type'); ty.textContent = type;
            time.append(bt, ty);
            const anchor = attrs.querySelector('key') || attrs.querySelector('divisions');
            if (anchor?.nextSibling) attrs.insertBefore(time, anchor.nextSibling); else attrs.appendChild(time);
        });
    }
    return { xml: new XMLSerializer().serializeToString(doc), hasTime: !!doc.querySelector('time') };
}

// Partes de percussão (têm <unpitched>) e o nome/número MIDI de cada instrumento, para escolher o som de cada nota.
export function readDrumInfo(xml) {
    const info = { parts: new Set(), instruments: new Map() };
    if (!/<unpitched>/.test(xml)) return info;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) return info;
    [...doc.querySelectorAll('part')].forEach((part, i) => { if (part.querySelector('unpitched')) info.parts.add(i); });
    doc.querySelectorAll('score-part').forEach((sp) => {
        sp.querySelectorAll('score-instrument').forEach((si) => {
            const id = si.getAttribute('id');
            const mi = [...sp.querySelectorAll('midi-instrument')].find((m) => m.getAttribute('id') === id);
            const mu = mi?.querySelector('midi-unpitched')?.textContent;
            info.instruments.set(id, { name: si.querySelector('instrument-name')?.textContent || '', midiUnpitched: mu ? Number(mu) : null });
        });
    });
    return info;
}

export async function readScoreXml(source, opts) {
    const xml = await toXmlText(await toBuffer(source));
    return prepareXml(xml, opts);
}

export class ScorePlayer {
    constructor(container, { onStep, onEnd } = {}) {
        this.container = container;
        this.onStep = onStep;
        this.onEnd = onEnd;
        this.osmd = new OpenSheetMusicDisplay(container, {
            autoResize: true,
            backend: 'svg',
            drawTitle: false,
            drawingParameters: 'compact',
            drawPartNames: false,
            followCursor: true,
            cursorsOptions: [{ type: 0, color: '#d4af37', alpha: 0.55, follow: true }],
        });
        this.events = [];
        this.parts = [];
        this.baseBpm = 90;
        this.speed = 1;
        this.index = 0;
        this.muted = new Set();
        this.metronome = false;
        this.playing = false;
        this._ids = [];
        this.sampler = null;
        this.kit = null;
        this.drum = { parts: new Set(), instruments: new Map() };
        this.click = null;
    }

    async load(source, opts = {}) {
        const { xml, hasTime } = await readScoreXml(source, opts);
        this.drum = readDrumInfo(xml);
        await this.osmd.load(xml);
        this.osmd.render();
        this.osmd.cursor.show();
        this._extract();
        this.index = 0;
        return { parts: this.parts, steps: this.events.length, bpm: this.baseBpm, hasTime };
    }

    _extract() {
        const osmd = this.osmd;
        const insts = osmd.Sheet.Instruments;
        this.parts = insts.map((inst, i) => {
            const clef = inst.Staves?.[0]?.StaffEntries ? null : null; // a clave exibida vem da pauta; o nome basta para a lista
            return { index: i, name: inst.NameLabel?.text || inst.Name || `Parte ${i + 1}`, staves: inst.Staves?.length || 1, clef };
        });
        const tempo = osmd.Sheet.DefaultStartTempoInBpm;
        this.baseBpm = tempo && tempo > 20 ? tempo : 90;

        const cur = osmd.cursor;
        cur.reset();
        const it = cur.Iterator;
        const events = [];
        let guard = 0;
        while (!it.EndReached && guard++ < 20000) {
            const t = it.currentTimeStamp.RealValue; // em semibreves
            const notes = [];
            for (const ve of it.CurrentVoiceEntries) {
                const part = insts.indexOf(ve.ParentVoice.Parent);
                for (const n of ve.Notes) {
                    if (n.isRest()) continue;
                    // ligadura: só a primeira nota soa e leva a duração somada
                    let dur = n.Length.RealValue;
                    const tie = n.NoteTie;
                    if (tie) {
                        if (tie.StartNote !== n) continue;
                        dur = tie.Notes.reduce((a, x) => a + x.Length.RealValue, 0);
                    }
                    if (this.drum.parts.has(part)) {
                        const ins = this.drum.instruments.get(n.playbackInstrumentId) || {};
                        notes.push({ drum: drumVoice({ name: ins.name, midiUnpitched: ins.midiUnpitched, shown: n.halfTone + 12 }), dur, part: part < 0 ? 0 : part });
                    } else {
                        notes.push({ midi: n.halfTone + 12, dur, part: part < 0 ? 0 : part });
                    }
                }
            }
            events.push({ t, notes });
            it.moveToNext();
        }
        cur.reset();
        this.events = events;
        this.totalWhole = events.length ? events[events.length - 1].t + 0.25 : 0;
    }

    async _ensureAudio() {
        await Tone.start();
        if (!this.kit && this.events.some((e) => e.notes.some((n) => n.drum))) this.kit = new DrumKit();
        if (!this.click) {
            this.click = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).toDestination();
            this.click.volume.value = -8;
        }
        if (this.sampler || !this.events.some((e) => e.notes.some((n) => !n.drum))) return;
        const synthFallback = () => new Tone.PolySynth(Tone.Synth, { envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 1 } }).toDestination();
        try {
            this.sampler = await new Promise((resolve) => {
                const s = new Tone.Sampler({ urls: SAMPLE_URLS, baseUrl: SAMPLE_BASE, release: 1, onload: () => resolve(s), onerror: () => resolve(synthFallback()) }).toDestination();
                setTimeout(() => resolve(s.loaded ? s : synthFallback()), 6000);
            });
        } catch {
            this.sampler = synthFallback();
        }
    }

    // quartos de nota = semibreves * 4; o Transport trabalha em ticks (PPQ) e o BPM muda ao vivo
    _ticks(whole) { return Math.round(whole * 4 * Tone.Transport.PPQ); }

    _clearSchedule() {
        this._ids.forEach((id) => Tone.Transport.clear(id));
        this._ids = [];
    }

    _schedule(fromIndex) {
        this._clearSchedule();
        Tone.Transport.bpm.value = this.baseBpm * this.speed;
        const t0 = this.events[fromIndex]?.t ?? 0;
        this.events.forEach((ev, i) => {
            if (i < fromIndex) return;
            const tick = this._ticks(ev.t - t0);
            this._ids.push(Tone.Transport.schedule((time) => {
                const secPerWhole = (60 / Tone.Transport.bpm.value) * 4;
                const voices = ev.notes.filter((n) => !this.muted.has(n.part));
                voices.forEach((n) => {
                    if (n.drum) this.kit?.trigger(n.drum, time);
                    else this.sampler?.triggerAttackRelease(midiToName(n.midi), Math.max(0.12, n.dur * secPerWhole * 0.95), time);
                });
                Tone.Draw.schedule(() => this._moveCursorTo(i), time);
            }, `${tick}i`));
        });
        const endTick = this._ticks(this.totalWhole - t0);
        this._ids.push(Tone.Transport.schedule(() => Tone.Draw.schedule(() => this.stop(true), Tone.now()), `${endTick}i`));
        // metrônomo: um clique por tempo (em 4/4, a cada quarto)
        this._ids.push(Tone.Transport.scheduleRepeat((time) => { if (this.metronome) this.click.triggerAttackRelease('C3', '32n', time); }, '4n', 0));
    }

    _moveCursorTo(i) {
        const cur = this.osmd.cursor;
        if (i < this.index) { cur.reset(); this.index = 0; }
        while (this.index < i) { cur.next(); this.index += 1; }
        this.onStep?.(this.index, this.events.length);
    }

    async play() {
        if (!this.events.length) return;
        await this._ensureAudio();
        if (this.index >= this.events.length - 1) this._moveCursorTo(0);
        Tone.Transport.stop();
        Tone.Transport.position = 0;
        this._schedule(this.index);
        Tone.Transport.start('+0.05');
        this.playing = true;
    }

    pause() {
        Tone.Transport.stop();
        this._clearSchedule();
        this.playing = false;
    }

    stop(ended = false) {
        this.pause();
        this._moveCursorTo(0);
        if (ended) this.onEnd?.();
    }

    seek(i) {
        const was = this.playing;
        if (was) this.pause();
        this._moveCursorTo(Math.max(0, Math.min(i, this.events.length - 1)));
        if (was) this.play();
    }

    setSpeed(x) { this.speed = x; Tone.Transport.bpm.rampTo(this.baseBpm * x, 0.05); }
    setMuted(part, muted) { if (muted) this.muted.add(part); else this.muted.delete(part); }
    setMetronome(on) { this.metronome = on; }

    // notas de um compasso/posição, para tocar só um trecho (usado pelo "ouvir esta nota")
    dispose() {
        this.pause();
        try { this.osmd.clear(); } catch { /* ignora */ }
        this.sampler?.dispose?.();
        this.kit?.dispose?.();
        this.click?.dispose?.();
    }
}
