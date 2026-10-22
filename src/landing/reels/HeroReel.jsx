import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

// Composição do Remotion: teclado que "toca" uma progressão (Cmaj7 → Am7 → Dm7 → G7), onda dourada que
// pulsa a cada acorde e notas que sobem. Tudo é função de useCurrentFrame() (sem CSS transition).
export const HERO_REEL = { width: 1280, height: 800, fps: 30, durationInFrames: 240 };

const WHITE_KEYS = 14;
const KEY_W = HERO_REEL.width / WHITE_KEYS;
const KEY_H = 330;
const CHORD_FRAMES = 60;
const CHORDS = [
    { name: 'Cmaj7', keys: [0, 2, 4, 6, 9] },
    { name: 'Am7', keys: [5, 7, 9, 11] },
    { name: 'Dm7', keys: [1, 3, 5, 7] },
    { name: 'G7', keys: [4, 6, 8, 10] },
];
// teclas pretas: depois das brancas 0,1,3,4,5 de cada oitava
const BLACK_AFTER = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];
const GOLD = '#d4af37';
const GOLD_LIGHT = '#fde68a';

const pressOf = (frame, fps, keyIdx) => {
    const chordIdx = Math.floor(frame / CHORD_FRAMES) % CHORDS.length;
    const f = frame - Math.floor(frame / CHORD_FRAMES) * CHORD_FRAMES;
    const pos = CHORDS[chordIdx].keys.indexOf(keyIdx);
    if (pos < 0) return { press: 0, f };
    const down = spring({ frame: f - pos * 2, fps, config: { damping: 18, stiffness: 260 } });
    const release = interpolate(f, [46, 58], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return { press: down * (1 - release), f };
};

const Wave = ({ frame, pulse, phase, opacity, width }) => {
    const pts = [];
    const amp = 26 + pulse * 70;
    for (let x = 0; x <= HERO_REEL.width; x += 12) {
        const y =
            Math.sin(x * 0.011 + frame * 0.09 + phase) * amp +
            Math.sin(x * 0.027 - frame * 0.06 + phase * 2) * amp * 0.45 +
            Math.sin(x * 0.004 + frame * 0.03) * amp * 0.6;
        pts.push(`${x === 0 ? 'M' : 'L'}${x},${(HERO_REEL.height * 0.36 + y).toFixed(1)}`);
    }
    return <path d={pts.join(' ')} fill="none" stroke="url(#heroGold)" strokeWidth={width} strokeLinecap="round" opacity={opacity} />;
};

const Note = ({ frame, i }) => {
    const travel = 520;
    const speed = 1.1 + (i % 3) * 0.35;
    const t = (frame * speed + i * 83) % travel;
    const x = 120 + ((i * 173) % 1040) + Math.sin((frame + i * 20) * 0.04) * 18;
    const y = 560 - t;
    const opacity = interpolate(t, [0, 80, travel - 140, travel], [0, 0.8, 0.5, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
        <g transform={`translate(${x} ${y}) rotate(${Math.sin(frame * 0.03 + i) * 8})`} opacity={opacity} fill="#f4efe4">
            <ellipse cx="0" cy="0" rx="11" ry="8" transform="rotate(-20)" />
            <rect x="8" y="-34" width="2.6" height="34" />
            {i % 2 === 0 && <path d="M10.6 -34 C 24 -28, 26 -16, 18 -8 C 22 -18, 16 -24, 10.6 -22 Z" />}
        </g>
    );
};

export const HeroReel = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const chordIdx = Math.floor(frame / CHORD_FRAMES) % CHORDS.length;
    const f = frame % CHORD_FRAMES;
    const pulse = interpolate(f, [0, 36], [1, 0], { extrapolateRight: 'clamp' });
    const labelIn = spring({ frame: f, fps, config: { damping: 200 } });
    const labelOut = interpolate(f, [50, 59], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const glowX = (CHORDS[chordIdx].keys.reduce((a, b) => a + b, 0) / CHORDS[chordIdx].keys.length + 0.5) * KEY_W;

    return (
        <AbsoluteFill style={{ background: '#09090b', overflow: 'hidden' }}>
            <AbsoluteFill style={{ background: `radial-gradient(60% 55% at ${(glowX / HERO_REEL.width) * 100}% 62%, rgba(212,175,55,${0.22 + pulse * 0.16}) 0%, rgba(9,9,11,0) 70%)` }} />
            <svg width={HERO_REEL.width} height={HERO_REEL.height} viewBox={`0 0 ${HERO_REEL.width} ${HERO_REEL.height}`} style={{ position: 'absolute', inset: 0 }}>
                <defs>
                    <linearGradient id="heroGold" x1="0" x2="1">
                        <stop offset="0" stopColor={GOLD} stopOpacity="0" />
                        <stop offset="0.25" stopColor={GOLD} />
                        <stop offset="0.55" stopColor={GOLD_LIGHT} />
                        <stop offset="1" stopColor={GOLD} stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="beam" x1="0" x2="0" y1="1" y2="0">
                        <stop offset="0" stopColor={GOLD_LIGHT} stopOpacity="0.55" />
                        <stop offset="1" stopColor={GOLD} stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="ivory" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="#f6f1e6" />
                        <stop offset="1" stopColor="#cfc6b3" />
                    </linearGradient>
                    <linearGradient id="ebony" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="#1c1c21" />
                        <stop offset="1" stopColor="#050506" />
                    </linearGradient>
                </defs>

                <Wave frame={frame} pulse={pulse} phase={0} opacity={0.95} width={3} />
                <Wave frame={frame} pulse={pulse} phase={1.4} opacity={0.5} width={2} />
                {Array.from({ length: 4 }).map((_, i) => <Note key={i} frame={frame} i={i * 2} />)}

                {/* luz saindo das teclas pressionadas */}
                {Array.from({ length: WHITE_KEYS }).map((_, k) => {
                    const { press } = pressOf(frame, fps, k);
                    if (press < 0.02) return null;
                    return <rect key={`b${k}`} x={k * KEY_W + 6} y={HERO_REEL.height - KEY_H - 380 * press} width={KEY_W - 12} height={380 * press} fill="url(#beam)" opacity={press * 0.9} />;
                })}

                {/* teclas brancas */}
                {Array.from({ length: WHITE_KEYS }).map((_, k) => {
                    const { press } = pressOf(frame, fps, k);
                    const dy = press * 9;
                    return (
                        <g key={`w${k}`} transform={`translate(0 ${dy})`}>
                            <rect x={k * KEY_W + 2} y={HERO_REEL.height - KEY_H} width={KEY_W - 4} height={KEY_H} rx="10" fill="url(#ivory)" />
                            <rect x={k * KEY_W + 2} y={HERO_REEL.height - KEY_H} width={KEY_W - 4} height={KEY_H} rx="10" fill={GOLD} opacity={press * 0.42} />
                            <rect x={k * KEY_W + 2} y={HERO_REEL.height - KEY_H} width={KEY_W - 4} height="4" rx="2" fill="#fff" opacity="0.7" />
                        </g>
                    );
                })}
                {/* teclas pretas */}
                {BLACK_AFTER.map((k) => {
                    const { press } = pressOf(frame, fps, k);
                    const x = (k + 1) * KEY_W - 29;
                    return (
                        <g key={`k${k}`} transform={`translate(0 ${press * 5})`}>
                            <rect x={x} y={HERO_REEL.height - KEY_H} width="58" height="205" rx="7" fill="url(#ebony)" />
                            <rect x={x + 6} y={HERO_REEL.height - KEY_H + 4} width="46" height="6" rx="3" fill="#fff" opacity="0.16" />
                        </g>
                    );
                })}
            </svg>

            <div style={{ position: 'absolute', left: 56, top: 52, color: '#f4efe4', opacity: labelIn * (1 - labelOut), transform: `translateY(${(1 - labelIn) * 18}px)` }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, letterSpacing: '0.32em', textTransform: 'uppercase', color: GOLD }}>Acorde</div>
                <div style={{ fontFamily: '"Bodoni Moda", serif', fontStyle: 'italic', fontWeight: 500, fontSize: 92, lineHeight: 1, marginTop: 8 }}>{CHORDS[chordIdx].name}</div>
            </div>
        </AbsoluteFill>
    );
};
