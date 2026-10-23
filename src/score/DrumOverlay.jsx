import React, { useEffect, useRef, useState } from 'react';

// Acompanhamento visual da bateria: destaque na nota atual, bolinha que pula entre as figuras e a contagem (1 e 2 e...).
// Fica por cima da partitura (que o OpenSheetMusicDisplay desenha) e usa a posição do áudio, não do cursor, por isso o movimento é suave.
export default function DrumOverlay({ player, ready, playing, step, layoutKey }) {
    const barRef = useRef(null);
    const ballRef = useRef(null);
    const countRefs = useRef([]);
    const [layout, setLayout] = useState(null);

    // mede a partitura depois de desenhada e de novo ao redimensionar
    useEffect(() => {
        if (!player || !ready) return undefined;
        let timer;
        const calc = () => setLayout(player.computeLayout());
        calc();
        const onResize = () => { clearTimeout(timer); timer = setTimeout(calc, 600); };
        window.addEventListener('resize', onResize);
        return () => { window.removeEventListener('resize', onResize); clearTimeout(timer); };
    }, [player, ready, layoutKey]);

    useEffect(() => {
        if (!layout || !layout.steps.length) return undefined;
        const steps = layout.steps;
        let raf = 0;
        let lastI = -1;

        const place = (pos) => {
            let lo = 0; let hi = steps.length - 1;
            while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (steps[mid].t <= pos) lo = mid; else hi = mid - 1; }
            const a = steps[lo];
            const b = steps[lo + 1];
            const same = b && b.line === a.line;
            const u = same ? Math.min(1, Math.max(0, (pos - a.t) / (b.t - a.t))) : 0;
            const x = same ? a.cx + (b.cx - a.cx) * u : a.cx;
            const gap = same ? b.cx - a.cx : 0;
            const apex = same ? Math.min(30, 9 + gap * 0.32) : 0;
            const y = a.top - 50 - apex * 4 * u * (1 - u); // a bolinha pula acima das hastes
            if (barRef.current) {
                barRef.current.style.transform = `translate(${a.cx - 13}px, ${a.top - 44}px)`;
                barRef.current.style.height = `${a.h + 54}px`;
            }
            if (ballRef.current) {
                const squash = same ? 1 + 0.16 * Math.max(0, 1 - Math.abs(u - 0.5) * 6) : 1;
                ballRef.current.style.transform = `translate(${x - 9}px, ${y - 18}px) scale(${1 / squash}, ${squash})`;
            }
            if (lo !== lastI) {
                if (lastI >= 0) countRefs.current[lastI]?.classList.remove('on');
                countRefs.current[lo]?.classList.add('on');
                lastI = lo;
            }
        };

        if (playing) {
            const loop = () => { place(player.positionWhole()); raf = requestAnimationFrame(loop); };
            loop();
        } else {
            place(steps[Math.min(step ?? 0, steps.length - 1)]?.t ?? 0);
        }
        return () => cancelAnimationFrame(raf);
    }, [layout, playing, step, player]);

    if (!layout) return null;
    return (
        <div className="dp-overlay" aria-hidden>
            {layout.steps.map((s, i) => (s.label && (s.main || s.cx - (layout.steps[i - 1]?.line === s.line ? layout.steps[i - 1].cx : -99) > 15) ? (
                <span key={i} ref={(el) => { countRefs.current[i] = el; }} className={`dp-count${s.main ? ' main' : ''}`} style={{ left: s.cx, top: s.top - 100 }}>{s.label}</span>
            ) : null))}
            <div ref={barRef} className="dp-bar" />
            <div ref={ballRef} className="dp-ball" />
        </div>
    );
}
