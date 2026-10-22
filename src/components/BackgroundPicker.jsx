import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Check } from 'lucide-react';
import { BACKGROUNDS, useBackground } from '../lib/theme';
import { cn } from '../lib/utils';
import estudio from '../assets/bg/estudio.webp';
import lobby from '../assets/bg/lobby.webp';
import atrio from '../assets/bg/atrio.webp';
import salao from '../assets/bg/salao.webp';

const THUMBS = { estudio, lobby, atrio, salao };

export default function BackgroundPicker({ className }) {
    const { bg, setBg } = useBackground();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={ref} className={cn('relative', className)}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Trocar imagem de fundo"
                aria-expanded={open}
                title="Imagem de fundo"
                className="glass glass-hover h-10 w-10 rounded-full flex items-center justify-center text-text transition-colors"
            >
                <ImageIcon className="h-4 w-4" />
            </button>
            {open && (
                <div role="listbox" aria-label="Imagem de fundo" className="glass bg-picker-menu absolute right-0 top-12 z-50 w-64 rounded-2xl p-3">
                    <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-dim">Imagem de fundo</p>
                    <div className="grid grid-cols-2 gap-2">
                        {BACKGROUNDS.map((b) => (
                            <button
                                key={b.id}
                                type="button"
                                role="option"
                                aria-selected={bg === b.id}
                                onClick={() => setBg(b.id)}
                                className={cn(
                                    'relative h-16 overflow-hidden rounded-xl border text-left transition-all',
                                    bg === b.id ? 'border-primary ring-2 ring-primary/60' : 'border-border hover:border-primary/50'
                                )}
                            >
                                {THUMBS[b.id] ? (
                                    <img src={THUMBS[b.id]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                                ) : (
                                    <span className="absolute inset-0 bg-panel" />
                                )}
                                <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">{b.label}</span>
                                {bg === b.id && <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-primary p-0.5 text-black" strokeWidth={3} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
