import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ScoreViewer from '../../score/ScoreViewer';
import { getScore } from '../../lib/scores';
import { getOfflineScore } from '../../lib/offlineScores';
import OfflineScoreButton from '../../components/OfflineScoreButton';

export default function PartituraView() {
    const { scoreId } = useParams();
    const navigate = useNavigate();
    const [score, setScore] = useState(null);
    const [error, setError] = useState('');

    // Com internet, abre a versão do servidor; sem internet (ou se falhar), abre a cópia salva neste aparelho
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if (!navigator.onLine) throw new Error('Sem conexão com a internet.');
                const s = await getScore(scoreId);
                if (alive) setScore(s);
            } catch (e) {
                const off = await getOfflineScore(scoreId).catch(() => null);
                if (!alive) return;
                if (off) setScore({ id: off.id, titulo: off.titulo, compositor: off.compositor, origem: off.origem, compasso: off.compasso, limpar_anotacoes: off.limpar, arquivo_url: off.buffer, _offline: true });
                else setError(e.message);
            }
        })();
        return () => { alive = false; };
    }, [scoreId]);

    return (
        <div className="mx-auto max-w-5xl space-y-6 pb-16">
            <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/student/partituras'))} className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> Voltar</button>
            {error && <p role="alert" className="text-sm font-semibold text-red-500">Não foi possível abrir esta partitura. <Link to="/student/partituras" className="underline">Ir para a biblioteca</Link></p>}
            {score && (
                <>
                    <h1 className="text-3xl font-black tracking-tight text-text">{score.titulo}</h1>
                    {score._offline
                        ? <p className="text-sm text-text-muted">Aberta da cópia salva neste aparelho (sem internet).</p>
                        : <OfflineScoreButton score={score} />}
                    <ScoreViewer source={score.arquivo_url} title={score.titulo} fromOmr={score.origem === 'pdf'} initialTimeSig={score.compasso || ''} initialClean={score.limpar_anotacoes} />
                </>
            )}
        </div>
    );
}
