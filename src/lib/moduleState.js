import { useCallback, useState } from 'react';

// Módulos abertos por curso, lembrados no navegador. Por padrão tudo começa fechado.
const key = (courseId) => `rf_mods_open_${courseId}`;

function read(courseId) {
    try {
        const raw = JSON.parse(localStorage.getItem(key(courseId)) || '[]');
        return new Set(Array.isArray(raw) ? raw : []);
    } catch {
        return new Set();
    }
}

export function useOpenModules(courseId) {
    const [open, setOpen] = useState(() => read(courseId));

    const toggle = useCallback((moduleId) => {
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(moduleId)) next.delete(moduleId);
            else next.add(moduleId);
            try {
                localStorage.setItem(key(courseId), JSON.stringify([...next]));
            } catch {
                /* storage indisponível */
            }
            return next;
        });
    }, [courseId]);

    return [open, toggle];
}
