// Origem e tipo do vídeo de uma aula.
export const driveId = (url) => {
    const u = url || ''; // o banco devolve null (não undefined) quando o campo está vazio
    return (u.match(/\/d\/([^/?#]+)/) || u.match(/[?&]id=([^&?#]+)/) || u.match(/\/file\/d\/([^/?#]+)/) || [])[1];
};

// Decide como renderizar a aula: { kind: 'video' | 'iframe' | 'none', src }
//  - video : <video> nativo (MP4/WebM/HLS) -> o app recebe o tempo assistido (progresso REAL)
//  - iframe: Drive, YouTube, Vimeo, Panda... -> o player é de terceiros e não informa o tempo assistido
export function resolveMedia(lesson, startTime = 0) {
    if (lesson.url_video_drive) {
        const id = driveId(lesson.url_video_drive);
        return { kind: 'iframe', provider: 'drive', src: id ? `https://drive.google.com/file/d/${id}/preview` : lesson.url_video_drive };
    }
    const id = lesson.id_video_profissional;
    if (!id) return { kind: 'none' };

    if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(id)) return { kind: 'video', src: id };

    if (id.includes('youtube.com') || id.includes('youtu.be')) {
        const m = id.match(/[?&]v=([^&]+)/) || id.match(/youtu\.be\/([^?]+)/) || id.match(/embed\/([^?]+)/);
        const ytId = m ? m[1] : id.split('/').pop();
        return { kind: 'iframe', provider: 'youtube', src: `https://www.youtube.com/embed/${ytId}?autoplay=1${startTime > 0 ? `&start=${startTime}` : ''}` };
    }
    if (id.includes('vimeo.com')) {
        const m = id.match(/vimeo\.com\/(\d+)/) || id.match(/video\/(\d+)/);
        const vId = m ? m[1] : id.split('/').pop();
        return { kind: 'iframe', provider: 'vimeo', src: `https://player.vimeo.com/video/${vId}?autoplay=1${startTime > 0 ? `#t=${startTime}s` : ''}` };
    }
    if (id.includes('pandavideo.com.br')) {
        const base = id.includes('embed') ? id : id.replace('app.pandavideo', 'player-vz-xxx.pandavideo');
        let url = base.includes('?') ? `${base}&autoplay=true` : `${base}?autoplay=true`;
        if (startTime > 0) url += `&t=${startTime}`;
        return { kind: 'iframe', provider: 'panda', src: url };
    }
    return { kind: 'iframe', provider: 'outro', src: id };
}

// Só vídeos nativos têm progresso parcial confiável (% e tempo). Nos demais, vale a conclusão manual.
export const isTimeTracked = (lesson) => resolveMedia(lesson || {}).kind === 'video';
