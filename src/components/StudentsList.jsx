import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { cn } from '../lib/utils';

const PILL = { ok: 'bg-green-900/30 text-green-400 border-green-900', warn: 'bg-yellow-900/30 text-yellow-400 border-yellow-900', bad: 'bg-red-900/30 text-red-400 border-red-900' };
const CHIP = { ok: 'bg-primary/10 text-primary border-primary/20', bad: 'bg-red-500/10 text-red-400 border-red-500/30' };

const StatusPill = ({ tone, children }) => (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', PILL[tone])}>{children}</span>
);
const DemoBadge = () => <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-black tracking-widest text-black">DEMO</span>;

// Cursos do aluno com o andamento de cada um; `grande` aumenta o texto para o celular
const CursoChips = ({ row, grande }) => {
    if (row.semCursos) return <span className={cn('italic text-text-muted', grande ? 'text-xs' : 'mt-1 text-[9px]')}>Sem acesso a nenhum curso</span>;
    if (row.chips.length === 0) return null;
    return (
        <div className={cn('flex flex-wrap gap-1', !grande && 'mt-1')}>
            {row.chips.map((c) => (
                <span key={c.key} className={cn('flex items-center gap-1 rounded border', grande ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[9px]', CHIP[c.tone])}>
                    {c.titulo}
                    <span className="font-bold opacity-70">({c.percent}%)</span>
                    {c.sufixo && <span className="opacity-80">· {c.sufixo}</span>}
                </span>
            ))}
        </div>
    );
};

// Lista de alunos do painel: tabela no computador e um cartão por aluno no celular.
// Cada linha: { key, nome, email, demo, chips[{key,titulo,percent,sufixo?,tone}], semCursos, statusLabel, statusTone, expira, acoes[{key,label,title,Icon,cor,onClick}] }
export default function StudentsList({ rows, carregando }) {
    return (
        <Card>
                {/* Computador: tabela */}
                <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-text-muted uppercase bg-black/20">
                            <tr>
                                <th className="px-6 py-3">Nome / E-mail</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Expiração</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando ? (
                                <tr><td colSpan="4" className="text-center py-8">Carregando...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan="4" className="text-center py-8 text-text-muted">Nenhum aluno encontrado.</td></tr>
                            ) : rows.map((row) => (
                                <tr key={row.key} className="border-b border-border hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-text">
                                        <div className="flex flex-col">
                                            <span className="flex items-center gap-2">{row.nome}{row.demo && <DemoBadge />}</span>
                                            <span className="text-[10px] text-text-muted">{row.email}</span>
                                            <CursoChips row={row} />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4"><StatusPill tone={row.statusTone}>{row.statusLabel}</StatusPill></td>
                                    <td className="px-6 py-4 text-text-muted">{row.expira}</td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        {row.acoes.map(({ key, title, Icon, cor, onClick }) => (
                                            <Button key={key} variant="ghost" size="icon" title={title} onClick={onClick}>
                                                <Icon className={cn('h-4 w-4', cor)} />
                                            </Button>
                                        ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Celular: um cartão por aluno, com botões grandes e com texto */}
                <ul className="divide-y divide-border md:hidden" aria-label="Alunos">
                    {carregando ? (
                        <li className="py-8 text-center text-text-muted">Carregando...</li>
                    ) : rows.length === 0 ? (
                        <li className="py-8 text-center text-text-muted">Nenhum aluno encontrado.</li>
                    ) : rows.map((row) => (
                        <li key={row.key} className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 font-semibold text-text">{row.nome}{row.demo && <DemoBadge />}</p>
                                    <p className="break-all text-xs text-text-muted">{row.email}</p>
                                </div>
                                <StatusPill tone={row.statusTone}>{row.statusLabel}</StatusPill>
                            </div>
                            <CursoChips row={row} grande />
                            <p className="text-xs text-text-muted">Expiração: <span className="font-semibold text-text">{row.expira}</span></p>
                            <div className="grid grid-cols-3 gap-2">
                                {row.acoes.map(({ key, label, title, Icon, cor, onClick }) => (
                                    <button key={key} type="button" title={title} onClick={onClick}
                                        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-xs font-semibold text-text transition-transform active:scale-[0.98] hover:bg-white/5">
                                        <Icon className={cn('h-4 w-4 shrink-0', cor)} />{label}
                                    </button>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
            </Card>
    );
}
