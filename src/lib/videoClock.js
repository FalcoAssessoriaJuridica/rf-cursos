import { useEffect, useRef, useState } from 'react';

// Relógio do vídeo da aula: devolve o tempo (em segundos) de MP4 nativo, YouTube ou Vimeo e permite pular para um ponto.
// As APIs de terceiros informam o tempo poucas vezes por segundo; entre uma leitura e outra o relógio estima (interpolação),
// e cada nova leitura corrige o desvio aos poucos, para a bolinha não dar saltos.
export class Clock {
    constructor() { this.t = 0; this.at = performance.now(); this.playing = false; this.rate = 1; }
    sample(t, playing, rate = 1) {
        const predicted = this.now();
        const drift = t - predicted;
        // leitura próxima da estimada: corrige devagar; longe (pulo no vídeo, pausa): aceita na hora
        this.t = this.playing && playing && Math.abs(drift) < 0.3 ? predicted + drift * 0.35 : t;
        this.at = performance.now();
        this.playing = playing;
        this.rate = rate || 1;
    }
    now() { return this.playing ? this.t + ((performance.now() - this.at) / 1000) * this.rate : this.t; }
}

const loaders = {};
const loadScript = (key, src, ready) => {
    if (ready()) return Promise.resolve();
    if (!loaders[key]) {
        loaders[key] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error(`Não foi possível carregar ${src}`));
            document.head.appendChild(s);
        });
    }
    return loaders[key];
};
const loadYouTube = () => new Promise((resolve, reject) => {
    if (window.YT?.Player) { resolve(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    loadScript('yt', 'https://www.youtube.com/iframe_api', () => false).catch(reject);
});
const loadVimeo = () => loadScript('vimeo', 'https://player.vimeo.com/api/player.js', () => !!window.Vimeo?.Player).then(() => window.Vimeo);

export const clockSupported = (media) => media?.kind === 'video' || media?.provider === 'youtube' || media?.provider === 'vimeo';

// media: resultado de resolveMedia. videoRef: <video>. iframeRef: <iframe> do YouTube/Vimeo.
export function useVideoClock(media, { videoRef, iframeRef, lessonKey }) {
    const clock = useRef(new Clock()).current;
    const api = useRef({ seek: () => {} });
    const [ready, setReady] = useState(false);

    useEffect(() => {
        setReady(false);
        clock.sample(0, false);
        let alive = true;
        let cleanup = () => {};

        if (media?.kind === 'video') {
            const v = videoRef.current;
            if (!v) return undefined;
            const upd = () => clock.sample(v.currentTime, !v.paused && !v.ended, v.playbackRate);
            const evs = ['timeupdate', 'play', 'playing', 'pause', 'seeked', 'seeking', 'ratechange', 'ended', 'loadedmetadata'];
            evs.forEach((e) => v.addEventListener(e, upd));
            api.current = { seek: (s) => { v.currentTime = Math.max(0, s); } };
            upd(); setReady(true);
            cleanup = () => evs.forEach((e) => v.removeEventListener(e, upd));
        } else if (media?.provider === 'youtube') {
            loadYouTube().then((YT) => {
                if (!alive || !iframeRef.current) return;
                let timer;
                const player = new YT.Player(iframeRef.current, {
                    events: {
                        onReady: () => {
                            if (!alive) return;
                            api.current = { seek: (s) => player.seekTo(Math.max(0, s), true) };
                            timer = setInterval(() => {
                                try { clock.sample(player.getCurrentTime(), player.getPlayerState() === 1, player.getPlaybackRate()); } catch { /* player ainda carregando */ }
                            }, 120);
                            setReady(true);
                        },
                    },
                });
                cleanup = () => { clearInterval(timer); try { player.destroy?.(); } catch { /* ignora */ } };
            }).catch(() => {});
        } else if (media?.provider === 'vimeo') {
            loadVimeo().then((Vimeo) => {
                if (!alive || !iframeRef.current) return;
                const player = new Vimeo.Player(iframeRef.current);
                player.on('timeupdate', (d) => clock.sample(d.seconds, clock.playing, clock.rate));
                player.on('play', () => player.getCurrentTime().then((t) => clock.sample(t, true, clock.rate)));
                player.on('pause', () => player.getCurrentTime().then((t) => clock.sample(t, false, clock.rate)));
                player.on('seeked', (d) => clock.sample(d.seconds, clock.playing, clock.rate));
                player.on('playbackratechange', (d) => { clock.rate = d.playbackRate; });
                api.current = { seek: (s) => player.setCurrentTime(Math.max(0, s)) };
                player.ready().then(() => alive && setReady(true));
                cleanup = () => { try { player.off('timeupdate'); player.off('play'); player.off('pause'); player.off('seeked'); } catch { /* ignora */ } };
            }).catch(() => {});
        }
        return () => { alive = false; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [media?.kind, media?.provider, media?.src, lessonKey]);

    return { clock, ready, seek: (s) => api.current.seek(s), supported: clockSupported(media) };
}
