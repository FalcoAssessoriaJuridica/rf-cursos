// Web MIDI: conecta o teclado MIDI do aluno. Funciona no Chrome/Edge (computador e Android); o Safari e o iPhone não têm Web MIDI.
export const midiSupported = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

// Pede acesso (o navegador mostra uma permissão). onNote({ on, midi, vel }); onChange(nomes dos teclados conectados).
export async function connectMidi({ onNote, onChange }) {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    const handler = (e) => {
        const [status, d1, d2] = e.data;
        const cmd = status & 0xf0;
        if (cmd === 0x90 && d2 > 0) onNote({ on: true, midi: d1, vel: d2 / 127 });
        else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) onNote({ on: false, midi: d1, vel: 0 });
    };
    const attach = () => {
        const nomes = [];
        access.inputs.forEach((input) => { input.onmidimessage = handler; nomes.push(input.name || 'Teclado MIDI'); });
        onChange?.(nomes);
    };
    access.onstatechange = attach;
    attach();
    return {
        dispose() {
            access.onstatechange = null;
            access.inputs.forEach((input) => { input.onmidimessage = null; });
        },
    };
}
