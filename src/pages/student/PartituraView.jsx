import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ScoreViewer from '../../score/ScoreViewer';
import { getScore } from '../../lib/scores';

export default function PartituraView() {
    const { scoreId } = useParams();
    const navigate = useNavigate();
    const [score, setScore] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        getScore(scoreId).then((s) => alive && setScore(s)).catch((e) => alive && setError(e.message));
        return () => { alive = false; };
    }, [scoreId]);

    return (
        <div className="mx-auto max-w-5xl space-y-6 pb-16">
            <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/student/partituras'))} className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Voltar</button>
            {error && <p role="alert" className="text-sm font-semibold text-red-500">Não foi possível abrir esta partitura. <Link to="/student/partituras" className="underline">Ir para a biblioteca</Link></p>}
            {score && (
                <>
                    <h1 className="text-3xl font-black tracking-tight text-text">{score.titulo}</h1>
                    <ScoreViewer source={score.arquivo_url} title={score.titulo} fromOmr={score.origem === 'pdf'} initialTimeSig={score.compasso || ''} initialClean={score.limpar_anotacoes} />
                </>
            )}
        </div>
    );
}
