import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/utils';
import BackgroundPicker from './BackgroundPicker';

export default function ThemeToggle({ className }) {
    const { theme, toggle } = useTheme();
    const isLight = theme === 'light';
    return (
        <div className={cn('flex items-center gap-2', className)}>
        <BackgroundPicker />
        <button
            type="button"
            onClick={toggle}
            aria-label={isLight ? 'Ativar modo escuro' : 'Ativar modo claro'}
            title={isLight ? 'Modo escuro' : 'Modo claro'}
            className="glass glass-hover h-10 w-10 rounded-full flex items-center justify-center text-text transition-colors"
        >
            {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
        </div>
    );
}
