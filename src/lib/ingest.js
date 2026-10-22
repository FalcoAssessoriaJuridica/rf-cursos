import { addLinks, createScore } from './scores';
import { convertToMusicXml, isMusicXml, isPdfOrImage } from '../score/omr';

const titleOf = (file) => file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

// Envia um arquivo ao acervo. MusicXML entra direto; PDF/imagem passa pela leitura (OMR) e guarda o MusicXML + o original.
// Com cursoId (e aulaId), já deixa a partitura disponível ali.
export async function ingestFile(file, { pastaId = null, cursoId = null, aulaId = null, onStatus = () => {} } = {}) {
    const titulo = titleOf(file);
    let score;
    if (isMusicXml(file)) {
        onStatus(`Salvando ${titulo}…`);
        score = await createScore({ pastaId, titulo, origem: 'musicxml', mxl: file });
    } else if (isPdfOrImage(file)) {
        onStatus(`Lendo ${titulo} (pode levar cerca de um minuto)…`);
        const mxl = await convertToMusicXml(file);
        onStatus(`Salvando ${titulo}…`);
        score = await createScore({ pastaId, titulo, origem: 'pdf', mxl, original: file, limpar: true });
    } else {
        throw new Error(`"${file.name}": envie PDF, imagem ou MusicXML (.mxl, .musicxml).`);
    }
    if (cursoId) await addLinks([score.id], { cursoId, aulaId });
    return score;
}
