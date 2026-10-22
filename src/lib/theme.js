import { useCallback, useEffect, useState } from 'react';

const KEY = 'rf_theme';
const THEMES = ['dark', 'light'];

export function getTheme() {
    try {
        const saved = localStorage.getItem(KEY);
        if (THEMES.includes(saved)) return saved;
    } catch {
        /* storage indisponível */
    }
    return 'dark';
}

export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#eeeef1' : '#09090b');
}

export function useTheme() {
    const [theme, setThemeState] = useState(getTheme);

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    const setTheme = useCallback((next) => {
        try {
            localStorage.setItem(KEY, next);
        } catch {
            /* storage indisponível */
        }
        setThemeState(next);
    }, []);

    const toggle = useCallback(() => setTheme(theme === 'light' ? 'dark' : 'light'), [theme, setTheme]);

    return { theme, setTheme, toggle };
}

// ── Fundos (fotos) ──
const BG_KEY = 'rf_bg';
export const DEFAULT_BG = 'lobby';
export const BACKGROUNDS = [
    { id: 'lobby', label: 'Lobby' },
    { id: 'estudio', label: 'Estúdio' },
    { id: 'atrio', label: 'Átrio' },
    { id: 'salao', label: 'Salão de pianos' },
    { id: 'gravacao', label: 'Gravação' },
];

export function getBackground() {
    try {
        const saved = localStorage.getItem(BG_KEY);
        if (BACKGROUNDS.some((b) => b.id === saved)) return saved;
    } catch {
        /* storage indisponível */
    }
    return DEFAULT_BG;
}

export function applyBackground(id) {
    document.documentElement.dataset.bg = id;
}

export function useBackground() {
    const [bg, setBgState] = useState(getBackground);

    useEffect(() => {
        applyBackground(bg);
    }, [bg]);

    const setBg = useCallback((next) => {
        try {
            localStorage.setItem(BG_KEY, next);
        } catch {
            /* storage indisponível */
        }
        setBgState(next);
    }, []);

    return { bg, setBg };
}
