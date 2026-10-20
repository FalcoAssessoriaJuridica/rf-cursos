import React, { useEffect, useRef, useState } from 'react';
import { Move, RotateCcw, ZoomIn } from 'lucide-react';
import { clamp, coverStyle } from '../lib/cover';

// Editor de enquadramento: arraste a imagem para escolher a parte visível e use o zoom para aproximar.
// `value` = { x, y, zoom } (x/y em %, zoom 1–3). O quadro tem a proporção em que a capa é exibida.
export default function CoverCropper({ src, value, onChange, aspect = '16 / 9' }) {
    const frameRef = useRef(null);
    const dragRef = useRef(null);
    const [nat, setNat] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [frameSize, setFrameSize] = useState(null);
    const [hint, setHint] = useState('');
    const { x, y, zoom } = value;

    useEffect(() => {
        const el = frameRef.current;
        if (!el) return undefined;
        const update = () => setFrameSize({ w: el.clientWidth, h: el.clientHeight });
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Folga em cada eixo (px): só dá para mover a imagem onde ela é maior que o quadro.
    // Ex.: foto em pé num quadro 16:9 já ocupa 100% da largura -> sem folga horizontal até aplicar zoom.
    const slack = (() => {
        if (!nat || !frameSize) return { x: Infinity, y: Infinity };
        const s = Math.max(frameSize.w / nat.w, frameSize.h / nat.h);
        return { x: zoom * nat.w * s - frameSize.w, y: zoom * nat.h * s - frameSize.h };
    })();
    const canX = slack.x > 1;
    const canY = slack.y > 1;

    const set = (patch) => onChange({ x, y, zoom, ...patch });

    // Quanto o canto da imagem se desloca (px) por 1% de posição, considerando object-fit: cover + zoom.
    // Permite que o arraste acompanhe o ponteiro 1:1 ("segurar a imagem").
    const pxPerPercent = () => {
        const frame = frameRef.current;
        if (!frame || !nat) return null;
        const fw = frame.clientWidth;
        const fh = frame.clientHeight;
        const s = Math.max(fw / nat.w, fh / nat.h);
        const ovx = nat.w * s - fw;
        const ovy = nat.h * s - fh;
        return {
            x: (fw * (1 - zoom) - zoom * ovx) / 100,
            y: (fh * (1 - zoom) - zoom * ovy) / 100,
        };
    };

    const onPointerDown = (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { px: e.clientX, py: e.clientY, x, y, k: pxPerPercent() };
        setDragging(true);
    };
    const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const k = d.k;
        const dx = e.clientX - d.px;
        const dy = e.clientY - d.py;
        const moveX = k && Math.abs(k.x) > 0.01;
        const moveY = k && Math.abs(k.y) > 0.01;
        if (Math.abs(dx) > 6 && !moveX && Math.abs(dx) > Math.abs(dy)) setHint('A imagem já ocupa toda a largura. Aumente o zoom para mover na horizontal.');
        else if (Math.abs(dy) > 6 && !moveY && Math.abs(dy) > Math.abs(dx)) setHint('A imagem já ocupa toda a altura. Aumente o zoom para mover na vertical.');
        else setHint('');
        const nx = moveX ? d.x + dx / k.x : d.x;
        const ny = moveY ? d.y + dy / k.y : d.y;
        set({ x: Math.round(clamp(nx, 0, 100)), y: Math.round(clamp(ny, 0, 100)) });
    };
    const onPointerUp = () => {
        dragRef.current = null;
        setDragging(false);
        setTimeout(() => setHint(''), 3500);
    };
    const onKeyDown = (e) => {
        const step = e.shiftKey ? 5 : 1;
        const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (!moves[e.key]) return;
        e.preventDefault();
        set({ x: clamp(x + moves[e.key][0], 0, 100), y: clamp(y + moves[e.key][1], 0, 100) });
    };

    const changed = x !== 50 || y !== 50 || zoom !== 1;

    return (
        <div className="space-y-3">
            <div
                ref={frameRef}
                tabIndex={0}
                role="slider"
                aria-label="Enquadramento da capa (arraste ou use as setas)"
                aria-valuetext={`Posição ${x}% / ${y}%, zoom ${zoom.toFixed(2)}x`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={onKeyDown}
                style={{ aspectRatio: aspect, touchAction: 'none' }}
                className={`relative w-full overflow-hidden rounded-lg border border-border bg-black/40 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            >
                <img
                    src={src}
                    alt="Capa do curso"
                    draggable={false}
                    onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    className="h-full w-full object-cover pointer-events-none"
                    style={coverStyle({ capa_posicao_x: x, capa_posicao_y: y, capa_zoom: zoom })}
                />
                {/* guias de terços: ajudam a compor o enquadramento */}
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity hover:opacity-100" style={{ opacity: dragging ? 1 : undefined }}>
                    <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                    <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                    <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                    <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
                </div>
                {hint && (
                    <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-black/75 px-3 py-2 text-center text-xs font-semibold text-white">{hint}</div>
                )}
                <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    <Move className="h-3 w-3" /> Arraste para enquadrar
                </div>
            </div>

            <div className="rounded-lg border border-border bg-black/20 p-3 space-y-3">
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-text-muted">
                        <span className="flex items-center gap-1"><ZoomIn className="h-3 w-3" /> Zoom</span>
                        <span className="text-primary">{Math.round(zoom * 100)}%</span>
                    </div>
                    <input type="range" min="1" max="3" step="0.05" value={zoom}
                        onChange={(e) => set({ zoom: parseFloat(e.target.value) })}
                        className="w-full accent-primary cursor-pointer" aria-label="Zoom da capa" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-text-muted"><span>Horizontal</span><span className="text-primary">{x}%</span></div>
                        <input type="range" min="0" max="100" value={x} disabled={!canX} onChange={(e) => set({ x: parseInt(e.target.value) })} className="w-full accent-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Ajuste horizontal" />
                        {!canX && <p className="text-[10px] leading-tight text-text-muted">Sem folga: a imagem já preenche a largura. <button type="button" className="text-primary underline" onClick={() => set({ zoom: Math.max(zoom, 1.5) })}>Aplicar zoom</button></p>}
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-text-muted"><span>Vertical</span><span className="text-primary">{y}%</span></div>
                        <input type="range" min="0" max="100" value={y} disabled={!canY} onChange={(e) => set({ y: parseInt(e.target.value) })} className="w-full accent-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Ajuste vertical" />
                        {!canY && <p className="text-[10px] leading-tight text-text-muted">Sem folga: a imagem já preenche a altura. <button type="button" className="text-primary underline" onClick={() => set({ zoom: Math.max(zoom, 1.5) })}>Aplicar zoom</button></p>}
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <p className="text-[10px] italic text-text-muted">Setas do teclado ajustam a posição (Shift = passo maior).</p>
                    <button type="button" disabled={!changed} onClick={() => onChange({ x: 50, y: 50, zoom: 1 })}
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-white/10 disabled:opacity-40">
                        <RotateCcw className="h-3 w-3" /> Centralizar
                    </button>
                </div>
            </div>
        </div>
    );
}
