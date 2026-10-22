import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

// Pauta que se desenha, notas que entram e um cursor dourado que "lê" a partitura (as notas acendem ao serem tocadas).
export const STAFF_REEL = { width: 1000, height: 520, fps: 30, durationInFrames: 210 };

const LEFT = 130;
const RIGHT = 940;
const TOP = 170;
const GAP = 34;
const GOLD = '#d4af37';
// posição na pauta (0 = linha de baixo; cada passo = meia distância entre linhas)
const NOTES = [2, 4, 6, 5, 3, 1, 4, 7, 6, 4, 2, 5];
const NOTE_X = NOTES.map((_, i) => LEFT + 70 + i * 62 + Math.floor(i / 4) * 24);
const BARS = [NOTE_X[4] - 36, NOTE_X[8] - 36];

export const StaffReel = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const draw = interpolate(frame, [0, 34], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
    const playX = interpolate(frame, [70, 170], [LEFT + 30, RIGHT - 10], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const playOpacity = interpolate(frame, [64, 76, 164, 180], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const fadeAll = interpolate(frame, [190, 209], [1, 0.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const yOf = (pos) => TOP + 4 * GAP - pos * (GAP / 2);

    return (
        <AbsoluteFill style={{ background: 'linear-gradient(160deg,#101013 0%,#09090b 100%)', opacity: 0.2 + fadeAll * 0.8 }}>
            <svg width={STAFF_REEL.width} height={STAFF_REEL.height} viewBox={`0 0 ${STAFF_REEL.width} ${STAFF_REEL.height}`} style={{ position: 'absolute', inset: 0 }}>
                <defs>
                    <linearGradient id="staffPlay" x1="0" x2="1">
                        <stop offset="0" stopColor={GOLD} stopOpacity="0" />
                        <stop offset="1" stopColor={GOLD} stopOpacity="0.5" />
                    </linearGradient>
                </defs>
                {[0, 1, 2, 3, 4].map((i) => (
                    <line key={i} x1={LEFT} x2={LEFT + (RIGHT - LEFT) * draw} y1={TOP + i * GAP} y2={TOP + i * GAP} stroke="#f4efe4" strokeOpacity="0.55" strokeWidth="1.6" />
                ))}
                <line x1={LEFT} x2={LEFT} y1={TOP} y2={TOP + 4 * GAP} stroke="#f4efe4" strokeOpacity={0.7 * draw} strokeWidth="2.4" />
                {BARS.map((x) => (
                    <line key={x} x1={x} x2={x} y1={TOP} y2={TOP + 4 * GAP} stroke="#f4efe4" strokeOpacity={0.4 * draw} strokeWidth="1.6" />
                ))}
                <text x={LEFT + 14} y={TOP + 2.7 * GAP} fontFamily='"Bodoni Moda", serif' fontWeight="700" fontSize="58" fill="#f4efe4" opacity={draw}>4</text>
                <text x={LEFT + 14} y={TOP + 4.0 * GAP + 4} fontFamily='"Bodoni Moda", serif' fontWeight="700" fontSize="58" fill="#f4efe4" opacity={draw}>4</text>

                {NOTES.map((pos, i) => {
                    const enter = spring({ frame: frame - (26 + i * 3), fps, config: { damping: 14, stiffness: 180 } });
                    const x = NOTE_X[i];
                    const y = yOf(pos);
                    const hit = interpolate(playX - x, [-6, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                    const pop = 1 + Math.max(0, 1 - Math.abs(playX - x) / 26) * 0.35 * playOpacity;
                    const stemUp = pos < 4;
                    const color = hit > 0.5 && playOpacity > 0 ? GOLD : '#f4efe4';
                    return (
                        <g key={i} transform={`translate(${x} ${y + (1 - enter) * 28}) scale(${pop})`} opacity={enter} fill={color} stroke={color}>
                            <ellipse cx="0" cy="0" rx="12.5" ry="9" transform="rotate(-20)" stroke="none" />
                            {stemUp ? <line x1="11" y1="-1" x2="11" y2="-62" strokeWidth="3" /> : <line x1="-11" y1="1" x2="-11" y2="62" strokeWidth="3" />}
                            {pos < 0 && <line x1="-22" x2="22" y1="0" y2="0" strokeWidth="1.6" />}
                        </g>
                    );
                })}

                <g opacity={playOpacity}>
                    <rect x={playX - 90} y={TOP - 40} width="90" height={4 * GAP + 80} fill="url(#staffPlay)" />
                    <line x1={playX} x2={playX} y1={TOP - 44} y2={TOP + 4 * GAP + 44} stroke={GOLD} strokeWidth="3" strokeLinecap="round" />
                    <circle cx={playX} cy={TOP - 44} r="6" fill={GOLD} />
                </g>
            </svg>
            <div style={{ position: 'absolute', left: 130, top: 52, fontFamily: 'Outfit, sans-serif', fontSize: 14, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD, opacity: draw }}>
                Leitura guiada
            </div>
            <div style={{ position: 'absolute', left: 130, bottom: 56, fontFamily: '"Bodoni Moda", serif', fontStyle: 'italic', fontSize: 40, color: '#f4efe4', opacity: interpolate(frame, [96, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * fadeAll }}>
                da partitura ao ouvido
            </div>
        </AbsoluteFill>
    );
};
