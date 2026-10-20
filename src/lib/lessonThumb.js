// Miniatura de aula. Cursos novos podem ter `thumb`; as aulas antigas não têm, então derivamos
// da origem do vídeo (Drive / YouTube). Se não houver, o componente usa a capa do curso.
const driveId = (url) => {
    const u = url || ''; // o banco devolve null (não undefined) quando o campo está vazio
    return (u.match(/\/d\/([^/?#]+)/) || u.match(/[?&]id=([^&?#]+)/) || u.match(/\/file\/d\/([^/?#]+)/) || [])[1];
};

export function lessonThumbUrl(aula = {}) {
    if (aula.thumb) return aula.thumb;
    const drive = driveId(aula.url_video_drive);
    if (drive) return `https://drive.google.com/thumbnail?id=${drive}&sz=w640`;
    const raw = aula.id_video_profissional || '';
    const yt = raw.match(/[?&]v=([^&]+)/) || raw.match(/youtu\.be\/([^?]+)/) || raw.match(/embed\/([^?]+)/);
    if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
    return null;
}
