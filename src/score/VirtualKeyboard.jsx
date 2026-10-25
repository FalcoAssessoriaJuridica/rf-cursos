import React, { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

// Teclado de piano na tela (para quem não tem teclado MIDI, ou usa Safari/iPhone). Destaca em dourado as teclas que o passo pede.
const PRETAS = new Set([1, 3, 6, 8, 10]);

export default function VirtualKeyboard({ from, to, expected = [], pressed = [], onDown, onUp }) {
    const caixa = useRef(null);
    const brancas = [];
    for (let m = from; m <= to; m += 1) if (!PRETAS.has(m % 12)) brancas.push(m);
    const esperado = new Set(expected);
    const tocado = new Set(pressed);
    const LARG = 100 / brancas.length;       // largura de uma tecla branca, em %
    const pos = (m) => brancas.indexOf(m);

    // em telas estreitas o teclado rola: leva a tecla esperada para o meio da vista
    useEffect(() => {
        const alvo = caixa.current?.querySelector(`[data-midi="${expected[0]}"]`);
        if (!alvo || !caixa.current) return;
        const c = caixa.current;
        c.scrollTo({ left: Math.max(0, alvo.offsetLeft - c.clientWidth / 2 + alvo.offsetWidth / 2), behavior: 'smooth' });
    }, [expected.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    const tecla = (m, preta) => {
        const left = preta ? (pos(m - 1) + 1) * LARG - LARG * 0.3 : pos(m) * LARG;
        return (
            <button
                key={m} type="button" tabIndex={-1} aria-label={`Tecla ${m}`} data-midi={m}
                onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); onDown?.(m); }}
                onPointerUp={() => onUp?.(m)} onPointerCancel={() => onUp?.(m)}
                style={{ left: `${left}%`, width: `${preta ? LARG * 0.6 : LARG}%` }}
                className={cn(
                    'absolute top-0 touch-none select-none rounded-b-md border transition-colors',
                    preta ? 'z-10 h-[58%] border-black bg-zinc-900' : 'h-full border-zinc-400 bg-white',
                    esperado.has(m) && (preta ? '!bg-amber-500' : '!bg-amber-300'),
                    tocado.has(m) && '!bg-primary',
                )}
            >
                {!preta && m % 12 === 0 && <span className="pointer-events-none absolute bottom-1 left-0 right-0 text-center text-[10px] font-bold text-zinc-500">C{Math.floor(m / 12) - 1}</span>}
            </button>
        );
    };

    return (
        <div ref={caixa} className="overflow-x-auto rounded-xl bg-zinc-800 p-2" aria-label="Teclado na tela">
            <div className="relative mx-auto h-28 max-w-3xl" style={{ minWidth: `${brancas.length * 2.1}rem` }}>
                {brancas.map((m) => tecla(m, false))}
                {Array.from({ length: to - from + 1 }, (_, k) => from + k).filter((m) => PRETAS.has(m % 12)).map((m) => tecla(m, true))}
            </div>
        </div>
    );
}
