import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileMusic } from 'lucide-react';
import { listScores, isRealId } from '../lib/scores';

// Partituras de uma aula (ou do curso, sem aulaId) para o aluno. Some sozinha quando não há nenhuma ou a biblioteca não está ativa.
export default function ScoreList({ cursoId, aulaId = null, title = 'Partituras' }) {
    const [items, setItems] = useState([]);
    useEffect(() => {
        let alive = true;
        if (!isRealId(cursoId)) return undefined;
        listScores({ cursoId, aulaId }).then((r) => alive && setItems(r)).catch(() => alive && setItems([]));
        return () => { alive = false; };
    }, [cursoId, aulaId]);
    if (!items.length) return null;
    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><FileMusic className="h-4 w-4 text-primary" /> {title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((s) => (
                    <Link key={s.id} to={`/student/partituras/${s.id}`} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:border-primary/40 hover:bg-primary/5 transition-all">
                        <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0"><FileMusic className="h-5 w-5 text-primary" /></div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate">{s.titulo}</p>
                            <p className="text-[10px] text-text-muted uppercase tracking-tighter">Abrir e ouvir</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
