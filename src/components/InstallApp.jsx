import React, { useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';

// Instalar o app na tela inicial. Android/Chrome: botão (evento do navegador). iPhone/iPad: instrução (o Safari não oferece o botão).
let adiado = null;
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); adiado = e; });
}
const jaInstalado = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
const ehIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function InstallApp() {
    const [evento, setEvento] = useState(adiado);
    const [instalado, setInstalado] = useState(jaInstalado());

    useEffect(() => {
        const on = (e) => { e.preventDefault(); adiado = e; setEvento(e); };
        const done = () => { adiado = null; setEvento(null); setInstalado(true); };
        window.addEventListener('beforeinstallprompt', on);
        window.addEventListener('appinstalled', done);
        return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
    }, []);

    if (instalado || (!evento && !ehIos())) return null;
    return (
        <section className="liquid-glass profile-card space-y-4 rounded-[2rem] p-6 md:p-8" aria-label="Instalar o app">
            <h2 className="text-lg font-bold text-text">Instalar o app</h2>
            <p className="text-sm text-text-muted">Abra a plataforma pela tela inicial, em tela cheia, e use as partituras salvas mesmo sem internet.</p>
            {evento ? (
                <button type="button" onClick={async () => { evento.prompt(); await evento.userChoice.catch(() => {}); adiado = null; setEvento(null); }} className="btn-primary flex h-12 items-center gap-2 px-8">
                    <Download className="h-4 w-4" /> Instalar
                </button>
            ) : (
                <p className="flex items-start gap-2 text-sm text-text">
                    <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</span>
                </p>
            )}
        </section>
    );
}
