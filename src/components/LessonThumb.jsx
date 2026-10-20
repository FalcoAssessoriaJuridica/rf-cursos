import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { lessonThumbUrl } from '../lib/lessonThumb';
import { coverStyle } from '../lib/cover';

// Miniatura 16:9 de uma aula. O container pai define o tamanho; aqui preenchemos 100%.
// Base: capa do curso (com o enquadramento escolhido) ou ícone — nunca um quadro vazio.
// Por cima: a miniatura própria/do vídeo (Drive, YouTube), que aparece quando carrega.
export default function LessonThumb({ aula, course, className = '' }) {
    const own = lessonThumbUrl(aula);
    const [ownState, setOwnState] = useState(own ? 'loading' : 'none'); // loading | ready | failed | none

    useEffect(() => {
        setOwnState(own ? 'loading' : 'none');
    }, [own]);

    return (
        <div className={`relative h-full w-full overflow-hidden bg-panel ${className}`}>
            {course?.capa_url ? (
                <img src={course.capa_url} alt="" loading="lazy" style={coverStyle(course)} className="absolute inset-0 h-full w-full object-cover opacity-60" />
            ) : null}

            {ownState !== 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <Play className="h-5 w-5 fill-white/80 text-white/80" />
                </div>
            )}

            {own && ownState !== 'failed' && (
                <img
                    src={own}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onLoad={() => setOwnState('ready')}
                    onError={() => setOwnState('failed')}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${ownState === 'ready' ? 'opacity-100' : 'opacity-0'}`}
                />
            )}
        </div>
    );
}
