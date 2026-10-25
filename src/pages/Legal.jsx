import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TERMOS, PRIVACIDADE } from '../legal/textos';
import { MARCA, VERSAO_TERMOS } from '../legal/dados';
import ThemeToggle from '../components/ThemeToggle';

const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Termos de Uso e Política de Privacidade (rotas públicas /termos e /privacidade)
export default function Legal() {
    const { pathname } = useLocation();
    const doc = pathname.startsWith('/privacidade') ? PRIVACIDADE() : TERMOS();
    const outro = pathname.startsWith('/privacidade') ? { to: '/termos', label: 'Termos de Uso' } : { to: '/privacidade', label: 'Política de Privacidade' };

    return (
        <div className="min-h-screen bg-background text-text">
            <ThemeToggle className="fixed top-4 right-4 z-20" />
            <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 md:grid-cols-[14rem_1fr] md:py-16">
                <aside className="md:sticky md:top-10 md:self-start">
                    <Link to="/cadastro" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary">
                        <ArrowLeft className="h-4 w-4" /> Voltar
                    </Link>
                    <nav aria-label="Seções" className="hidden space-y-1 text-sm md:block">
                        {doc.secoes.map((s) => (
                            <a key={s.titulo} href={`#${slug(s.titulo)}`} className="block rounded-md px-2 py-1 text-text-muted hover:text-primary">{s.titulo}</a>
                        ))}
                    </nav>
                </aside>

                <main>
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">{MARCA}</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{doc.titulo}</h1>
                    <p className="mt-2 text-sm text-text-muted">Versão {VERSAO_TERMOS}</p>

                    <div className="mt-10 space-y-10">
                        {doc.secoes.map((s) => (
                            <section key={s.titulo} id={slug(s.titulo)} className="scroll-mt-10">
                                <h2 className="text-xl font-bold">{s.titulo}</h2>
                                <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-text-muted">
                                    {s.blocos.map((b, i) => typeof b === 'string'
                                        ? <p key={i}>{b}</p>
                                        : <ul key={i} className="list-disc space-y-2 pl-5">{b.lista.map((li) => <li key={li}>{li}</li>)}</ul>)}
                                </div>
                            </section>
                        ))}
                    </div>

                    <p className="mt-14 border-t border-white/10 pt-6 text-sm text-text-muted">
                        Veja também: <Link to={outro.to} className="text-primary underline underline-offset-4">{outro.label}</Link>
                    </p>
                </main>
            </div>
        </div>
    );
}
