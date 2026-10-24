import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { PRAZOS, brl, carregarCatalogo, pagamentos } from '../../lib/pagamentos';
import { cn } from '../../lib/utils';

function CursoPlano({ curso }) {
    const [prazo, setPrazo] = useState(curso.precos?.[0]?.prazo);
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');
    const preco = curso.precos?.find((p) => p.prazo === prazo);
    const comTeste = curso.trial && prazo === 'mensal';

    const assinar = async () => {
        setErro(''); setBusy(true);
        try {
            const { url } = await pagamentos('checkout', { curso_id: curso.id, prazo });
            window.location.assign(url);
        } catch (e) {
            setErro(e.message);
            setBusy(false);
        }
    };

    return (
        <article className="liquid-glass flex flex-col overflow-hidden rounded-[2rem]">
            <div className="relative h-40 bg-panel">
                {curso.capa_url && <img src={curso.capa_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <h2 className="absolute bottom-3 left-5 right-5 text-xl font-bold leading-tight text-white">{curso.titulo}</h2>
            </div>
            <div className="flex flex-1 flex-col gap-5 p-5">
                {curso.descricao && <p className="line-clamp-3 text-sm text-text-muted">{curso.descricao}</p>}

                {curso.ativo ? (
                    <div className="mt-auto flex items-center gap-2 rounded-xl bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-500">
                        <Check className="h-4 w-4" /> Você já tem acesso a este curso.
                        <Link to={`/student/course/${curso.id}`} className="ml-auto underline underline-offset-4">Abrir</Link>
                    </div>
                ) : (
                    <>
                        <div role="radiogroup" aria-label={`Prazo de ${curso.titulo}`} className="grid gap-2">
                            {curso.precos.map((p) => {
                                const info = PRAZOS.find((x) => x.id === p.prazo);
                                const on = p.prazo === prazo;
                                return (
                                    <button key={p.prazo} type="button" role="radio" aria-checked={on} onClick={() => setPrazo(p.prazo)}
                                        className={cn('flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors',
                                            on ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/30')}>
                                        <span>
                                            <span className="block text-sm font-bold">{info?.label}</span>
                                            <span className="block text-[11px] text-text-muted">renova {info?.renova}</span>
                                        </span>
                                        <span className="text-base font-bold tabular-nums">{brl(p.valor_centavos)}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-auto space-y-2">
                            <button onClick={assinar} disabled={busy} className="btn-primary flex h-12 w-full items-center justify-center gap-2 disabled:opacity-60">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : comTeste && <Sparkles className="h-4 w-4" />}
                                {busy ? 'Abrindo pagamento...' : comTeste ? 'Começar 7 dias grátis' : 'Assinar'}
                            </button>
                            <p className="text-center text-[11px] text-text-muted">
                                {comTeste
                                    ? `Cartão obrigatório; um teste grátis por cartão. Sem cobrança por 7 dias; depois ${brl(preco?.valor_centavos)} a cada 30 dias. Cancele quando quiser.`
                                    : `Cobrança recorrente de ${brl(preco?.valor_centavos)} ${PRAZOS.find((x) => x.id === prazo)?.renova}. Cancele quando quiser.`}
                            </p>
                            {erro && <p role="alert" className="text-center text-xs font-semibold text-red-500">{erro}</p>}
                        </div>
                    </>
                )}
            </div>
        </article>
    );
}

export default function Planos() {
    const [state, setState] = useState({ loading: true, cursos: [], erro: '' });

    useEffect(() => {
        carregarCatalogo()
            .then((cursos) => setState({ loading: false, cursos, erro: '' }))
            .catch((e) => setState({ loading: false, cursos: [], erro: e.message }));
    }, []);

    return (
        <div className="mx-auto max-w-6xl space-y-8 pb-10">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Planos</h1>
                <p className="mt-2 max-w-2xl text-sm text-text-muted">Escolha o curso e o prazo. O acesso é liberado assim que o pagamento é confirmado.</p>
            </header>

            {state.loading && (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                    {[0, 1, 2].map((i) => <div key={i} className="h-96 animate-pulse rounded-[2rem] bg-white/5" />)}
                </div>
            )}
            {state.erro && <p role="alert" className="text-sm font-semibold text-red-500">{state.erro}</p>}
            {!state.loading && !state.erro && state.cursos.length === 0 && (
                <div className="liquid-glass rounded-[2rem] border-dashed border-white/10 py-16 text-center">
                    <h2 className="text-lg font-bold">Nenhum plano disponível ainda</h2>
                    <p className="mt-1 text-sm text-text-muted">Em breve os cursos estarão à venda por aqui.</p>
                </div>
            )}
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {state.cursos.map((c) => <CursoPlano key={c.id} curso={c} />)}
            </div>
        </div>
    );
}
