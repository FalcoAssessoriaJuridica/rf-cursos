import React from 'react';
import { Link } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import useOnline from '../lib/useOnline';

// Faixa fina quando o aparelho está sem internet
export default function OfflineBanner() {
    const online = useOnline();
    if (online) return null;
    return (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-500">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Sem internet. Vídeos e cursos precisam de conexão; as partituras salvas neste aparelho continuam disponíveis.</span>
            <Link to="/student/partituras" className="font-semibold underline underline-offset-4">Abrir partituras</Link>
        </div>
    );
}
