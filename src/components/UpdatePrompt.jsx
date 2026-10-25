import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Registra o service worker e avisa quando há versão nova ou quando o app já pode abrir sem internet.
// A atualização só acontece quando a pessoa aceita (não interrompe uma aula em andamento).
export default function UpdatePrompt() {
    const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
        onRegisterError: (e) => console.warn('service worker:', e),
    });
    useEffect(() => {
        if (!offlineReady) return undefined;
        const t = setTimeout(() => setOfflineReady(false), 6000);
        return () => clearTimeout(t);
    }, [offlineReady, setOfflineReady]);

    if (!needRefresh && !offlineReady) return null;
    return (
        <div role="status" className="fixed inset-x-4 bottom-20 z-[90] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#15130f] px-4 py-3 text-sm text-white shadow-xl md:bottom-6">
            {needRefresh ? (
                <>
                    <span className="flex-1">Nova versão do app disponível.</span>
                    <button type="button" onClick={() => updateServiceWorker(true)} className="rounded-lg bg-primary px-3 py-1.5 font-bold text-black">Atualizar</button>
                    <button type="button" onClick={() => setNeedRefresh(false)} className="text-white/60 underline underline-offset-4">Depois</button>
                </>
            ) : (
                <>
                    <span className="flex-1">App pronto para abrir sem internet.</span>
                    <button type="button" onClick={() => setOfflineReady(false)} className="text-white/60 underline underline-offset-4">OK</button>
                </>
            )}
        </div>
    );
}
