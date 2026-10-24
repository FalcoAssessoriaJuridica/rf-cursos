import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PRAZOS, STATUS_ASSINATURA, brl, pagamentos } from '../../lib/pagamentos';

const paraCentavos = (txt) => {
    const n = Number(String(txt).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const paraTexto = (centavos) => (centavos ? (centavos / 100).toFixed(2).replace('.', ',') : '');

function LinhaPreco({ curso, prazo, preco, onSaved }) {
    const [valor, setValor] = useState(paraTexto(preco?.valor_centavos));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const ativo = preco?.ativo && preco?.stripe_price_id;
    const alterado = paraCentavos(valor) !== (preco?.ativo ? preco?.valor_centavos : undefined);

    const rodar = async (action, extra, ok) => {
        setBusy(true); setMsg(null);
        try {
            await pagamentos(action, { curso_id: curso.id, prazo: prazo.id, ...extra });
            setMsg({ ok: true, text: ok });
            await onSaved();
        } catch (e) {
            setMsg({ ok: false, text: e.message });
        } finally { setBusy(false); }
    };

    return (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 py-3 first:border-t-0">
            <div className="w-28 shrink-0"><p className="text-sm font-bold">{prazo.label}</p><p className="text-[11px] text-text-muted">{ativo ? 'à venda' : 'não vendido'}</p></div>
            <label className="flex items-center gap-2">
                <span className="text-sm text-text-muted">R$</span>
                <input className="input-field h-10 w-32 tabular-nums" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Valor ${prazo.label} de ${curso.titulo}`} />
            </label>
            <button disabled={busy || !alterado || !(paraCentavos(valor) >= 500)} onClick={() => rodar('set_price', { valor_centavos: paraCentavos(valor) }, 'Preço salvo.')}
                className="btn-primary flex h-10 items-center gap-2 px-4 text-sm disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </button>
            {ativo && (
                <button disabled={busy} onClick={() => confirm(`Parar de vender "${prazo.label}" de ${curso.titulo}? Quem já assina continua.`) && rodar('remove_price', {}, 'Removido da venda.')}
                    className="flex h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-text-muted hover:border-red-500/50 hover:text-red-500 disabled:opacity-40" title="Parar de vender">
                    <Trash2 className="h-4 w-4" /> Remover
                </button>
            )}
            {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-xs font-semibold text-green-600' : 'text-xs font-semibold text-red-500'}>{msg.text}</p>}
        </div>
    );
}

export default function Precos() {
    const [cursos, setCursos] = useState([]);
    const [precos, setPrecos] = useState([]);
    const [assinaturas, setAssinaturas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');

    const carregar = useCallback(async () => {
        const [c, p, a] = await Promise.all([
            supabase.from('cursos').select('id, titulo').order('titulo'),
            supabase.from('precos_curso').select('*'),
            supabase.from('assinaturas').select('id, status, prazo, periodo_fim, cancela_no_fim, perfis(nome_completo, email), cursos(titulo)').order('atualizado_em', { ascending: false }).limit(50),
        ]);
        const falha = c.error || p.error || a.error;
        if (falha) { setErro(falha.message); return; }
        setCursos(c.data); setPrecos(p.data); setAssinaturas(a.data); setErro('');
    }, []);

    useEffect(() => { carregar().finally(() => setLoading(false)); }, [carregar]);

    return (
        <div className="mx-auto max-w-5xl space-y-10 pb-10">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Preços e assinaturas</h1>
                <p className="mt-2 max-w-2xl text-sm text-text-muted">
                    Defina o valor de cada prazo por curso. Salvar cria o preço no Stripe. Quem já assina continua no valor antigo; novas assinaturas usam o novo.
                    O teste grátis de 7 dias vale só no plano de 30 dias, na primeira assinatura do aluno em cada curso.
                </p>
            </header>
            {erro && <p role="alert" className="text-sm font-semibold text-red-500">{erro}</p>}
            {loading && <div className="h-40 animate-pulse rounded-[2rem] bg-white/5" aria-busy="true" />}

            <section className="space-y-4">
                {cursos.map((curso) => (
                    <div key={curso.id} className="liquid-glass rounded-[2rem] p-5 md:p-6">
                        <h2 className="mb-1 text-lg font-bold">{curso.titulo}</h2>
                        {PRAZOS.map((prazo) => (
                            <LinhaPreco key={prazo.id + (precos.find((p) => p.curso_id === curso.id && p.prazo === prazo.id)?.stripe_price_id ?? '')}
                                curso={curso} prazo={prazo} preco={precos.find((p) => p.curso_id === curso.id && p.prazo === prazo.id)} onSaved={carregar} />
                        ))}
                    </div>
                ))}
            </section>

            <section className="space-y-3">
                <h2 className="text-xl font-bold">Últimas assinaturas</h2>
                {assinaturas.length === 0 ? (
                    <p className="text-sm text-text-muted">Nenhuma assinatura ainda.</p>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="text-[11px] uppercase tracking-widest text-text-muted"><tr>
                                <th className="px-4 py-3">Aluno</th><th className="px-4 py-3">Curso</th><th className="px-4 py-3">Prazo</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Até</th>
                            </tr></thead>
                            <tbody>
                                {assinaturas.map((a) => (
                                    <tr key={a.id} className="border-t border-white/5">
                                        <td className="px-4 py-3"><span className="block font-semibold">{a.perfis?.nome_completo}</span><span className="block text-xs text-text-muted">{a.perfis?.email}</span></td>
                                        <td className="px-4 py-3">{a.cursos?.titulo}</td>
                                        <td className="px-4 py-3">{PRAZOS.find((p) => p.id === a.prazo)?.label ?? '—'}</td>
                                        <td className="px-4 py-3">{STATUS_ASSINATURA[a.status] ?? a.status}{a.cancela_no_fim && a.status !== 'canceled' ? ' (cancela no fim)' : ''}</td>
                                        <td className="px-4 py-3 tabular-nums">{a.periodo_fim ? new Date(a.periodo_fim).toLocaleDateString('pt-BR') : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
