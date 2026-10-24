import React, { useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { driveFetch, driveProxyUrl } from '../lib/driveProxy';

// Áudio do Drive: carrega só quando a pessoa pede (o arquivo vem autenticado, como blob). Outros links tocam direto.
export default function ProtectedAudio({ driveFileId, name, url }) {
    const [state, setState] = useState({ status: 'idle', src: null, error: '' });

    useEffect(() => () => { if (state.src) URL.revokeObjectURL(state.src); }, [state.src]);

    if (!driveFileId) {
        return <audio controls crossOrigin="anonymous" preload="none" className="w-full h-8 filter invert opacity-80"><source src={url} type="audio/mpeg" /></audio>;
    }
    if (state.status === 'ready') {
        return <audio controls autoPlay src={state.src} className="w-full h-8 filter invert opacity-80" />;
    }
    const load = async () => {
        setState({ status: 'loading', src: null, error: '' });
        try {
            const res = await driveFetch(driveProxyUrl(driveFileId, { filename: name || 'arquivo.mp3' }));
            const blob = await res.blob();
            setState({ status: 'ready', src: URL.createObjectURL(new Blob([blob], { type: 'audio/mpeg' })), error: '' });
        } catch (e) {
            setState({ status: 'error', src: null, error: e.message });
        }
    };
    return (
        <div className="flex items-center gap-3">
            <button onClick={load} disabled={state.status === 'loading'} className="h-8 px-3 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center gap-2 hover:bg-primary/25 disabled:opacity-60">
                {state.status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                {state.status === 'loading' ? 'Carregando áudio...' : 'Ouvir'}
            </button>
            {state.status === 'error' && <span className="text-xs text-red-400">{state.error}</span>}
        </div>
    );
}
