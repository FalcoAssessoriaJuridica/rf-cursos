import React, { useEffect, useState } from 'react';
import { useAvatar, initialsOf } from '../lib/profile';
import { cn } from '../lib/utils';

// Foto de perfil em anel dourado; sem foto, mostra as iniciais.
export default function Avatar({ userId, name, className }) {
    const src = useAvatar(userId);
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);

    return (
        <span className={cn('avatar-ring relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/70 bg-panel font-bold text-primary', className)}>
            {src && !failed ? (
                <img src={src} alt={name ? `Foto de ${name}` : 'Foto de perfil'} onError={() => setFailed(true)} className="h-full w-full object-cover" />
            ) : (
                <span aria-hidden className="select-none">{initialsOf(name)}</span>
            )}
        </span>
    );
}
