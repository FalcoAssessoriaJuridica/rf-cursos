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
