import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { carregarCatalogo, minhasAssinaturas } from '../../lib/pagamentos';

// O Stripe confirma o pagamento ao webhook (segundos). Esta tela consulta até o curso aparecer como liberado.
export default function PagamentoSucesso() {
    const [params] = useSearchParams();
    const cursoId = params.get('curso');
    const [liberado, setLiberado] = useState(false);
    const [demorou, setDemorou] = useState(false);
    const [negado, setNegado] = useState(false);
    const tentativas = useRef(0);

    useEffect(() => {
        let vivo = true;
        const checar = async () => {
            try {
                const cursos = await carregarCatalogo();
                if (vivo && cursos.some((c) => c.id === cursoId && c.ativo)) { setLiberado(true); return; }
                const subs = await minhasAssinaturas();
                if (vivo && subs.some((a) => a.curso_id === cursoId && a.motivo === 'teste_cartao_repetido')) { setNegado(true); return; }
            } catch { /* tenta de novo */ }
            tentativas.current += 1;
            if (!vivo) return;
            if (tentativas.current >= 20) { setDemorou(true); return; }
            setTimeout(checar, 2000);
        };
        checar();
        return () => { vivo = false; };
    }, [cursoId]);

    return (
        <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-5 text-center">
            {liberado ? (
                <>
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 text-green-500"><Check className="h-8 w-8" /></span>
                    <h1 className="text-2xl font-bold">Pagamento confirmado</h1>
                    <p className="text-sm text-text-muted">Seu acesso já está liberado.</p>
                    <Link to={cursoId ? `/student/course/${cursoId}` : '/student'} className="btn-primary flex h-12 items-center px-8">Ir para o curso</Link>
                </>
            ) : negado ? (
                <>
                    <h1 className="text-2xl font-bold">Este cartão já usou o teste grátis</h1>
                    <p className="text-sm text-text-muted">Sua assinatura não foi iniciada e <strong>nada foi cobrado</strong>. O teste de 7 dias vale uma vez por cartão. Você pode assinar agora, sem o período grátis.</p>
                    <Link to="/student/planos" className="btn-primary flex h-12 items-center px-8">Ver planos</Link>
                </>
            ) : demorou ? (
                <>
                    <h1 className="text-2xl font-bold">Estamos confirmando seu pagamento</h1>
                    <p className="text-sm text-text-muted">Está demorando mais que o normal. Não precisa pagar de novo: o acesso é liberado sozinho assim que o banco confirmar. Você pode sair desta tela e voltar em alguns minutos.</p>
                    <Link to="/student" className="btn-primary flex h-12 items-center px-8">Meus cursos</Link>
                </>
            ) : (
                <>
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <h1 className="text-2xl font-bold">Confirmando seu pagamento...</h1>
                    <p className="text-sm text-text-muted">Leva alguns segundos. Não feche esta página.</p>
                </>
            )}
        </div>
    );
}
