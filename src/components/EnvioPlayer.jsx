import React, { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { urlDoEnvio } from '../lib/comunidadeVideo';

// Vídeo privado de um envio da Comunidade. O link do player é assinado pelo servidor e só sai para o dono do envio e o professor;
// por isso a URL só é pedida quando a pessoa toca em "Assistir" (e expira depois de algumas horas).
export default function EnvioPlayer({ envioId, titulo = 'Vídeo enviado' }) {
    const [fonte, setFonte] = useState(null);   // { tipo: 'video' | 'iframe', url }
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');

    const carregar = async () => {
        setBusy(true); setErro('');
        try { setFonte(await urlDoEnvio(envioId)); } catch (e) { setErro(e.message); } finally { setBusy(false); }
    };

    if (fonte?.tipo === 'video') {
        // Player nativo do navegador: funciona inline no iPhone, tem pausa/tela cheia e não leva ninguém para o Drive.
        return (
            <div className="aspect-video overflow-hidden rounded-2xl bg-black">
                <video title={titulo} src={fonte.url} controls playsInline preload="metadata" controlsList="nodownload noplaybackrate"
                    onContextMenu={(e) => e.preventDefault()} className="h-full w-full" />
            </div>
        );
    }
    if (fonte?.tipo === 'iframe') {
        return (
            <div className="aspect-video overflow-hidden rounded-2xl bg-black">
                <iframe title={titulo} src={fonte.url} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="h-full w-full border-0" />
            </div>
        );
    }
    return (
        <div className="space-y-2">
            <button type="button" onClick={carregar} disabled={busy} aria-label={`Assistir ${titulo}`}
                className="relative flex aspect-video w-full items-center justify-center rounded-2xl bg-black active:scale-[0.99] disabled:opacity-80">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-black shadow-lg">
                    {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <Play className="ml-1 h-7 w-7 fill-current" />}
                </span>
                <span className="absolute bottom-3 left-4 text-sm font-semibold text-white/90">{busy ? 'Abrindo…' : 'Toque para assistir'}</span>
            </button>
            {erro && <p role="alert" className="text-xs font-semibold text-red-500">{erro}</p>}
        </div>
    );
}
