import React, { useRef, useState } from 'react';
import { FileText, FileSpreadsheet, FileArchive, FileAudio, File as FileIcon, Link2, Loader2, Presentation, Trash2, UploadCloud, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { fileKind, formatBytes, uploadMaterial, MAX_FILE_MB } from '../lib/materials';

const TONES = {
    red: 'bg-red-500/15 text-red-400',
    blue: 'bg-blue-500/15 text-blue-400',
    green: 'bg-green-500/15 text-green-500',
    orange: 'bg-orange-500/15 text-orange-400',
    gold: 'bg-primary/15 text-primary',
    gray: 'bg-white/10 text-text-muted',
};

export function KindIcon({ item, className = 'h-5 w-5' }) {
    const { label, tone } = fileKind(item);
    const Icon = tone === 'green' ? FileSpreadsheet : tone === 'orange' ? Presentation : tone === 'gold' ? FileAudio : label === 'ZIP' || label === 'RAR' || label === '7Z' ? FileArchive : label === 'ARQUIVO' ? FileIcon : FileText;
    return (
        <div className={cn('flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg', TONES[tone])}>
            <Icon className={className} />
        </div>
    );
}

// Lista de materiais com envio de arquivo (arrastar/clicar) e opção de colar link (Drive etc.)
export default function MaterialUploader({ title, icon: Icon, items, onChange, accept, courseId, lessonId, hint }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(0);
    const [errors, setErrors] = useState([]);
    const [over, setOver] = useState(false);

    const addFiles = async (fileList) => {
        const files = [...fileList];
        if (!files.length) return;
        setErrors([]);
        setBusy((n) => n + files.length);
        const done = [];
        const errs = [];
        await Promise.all(
            files.map(async (f) => {
                try {
                    done.push(await uploadMaterial(f, { courseId, lessonId: lessonId || 'novas', accept }));
                } catch (e) {
                    errs.push(e.message);
                } finally {
                    setBusy((n) => n - 1);
                }
            })
        );
        if (done.length) onChange([...items, ...done]);
        setErrors(errs);
    };

    const patch = (idx, p) => onChange(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));
    // Só tira da lista; os arquivos do Storage são limpos ao salvar/cancelar a aula (ver CourseContent)
    const remove = (idx) => onChange(items.filter((_, i) => i !== idx));

    return (
        <div className="space-y-3 rounded-lg border border-border/50 bg-black/20 p-4">
            <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <Icon className="h-4 w-4" /> {title}
                </label>
                <button type="button" onClick={() => onChange([...items, { nome: '', url: '' }])}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-text-muted transition-colors hover:bg-white/10 hover:text-text">
                    <Link2 className="h-3 w-3" /> Adicionar por link
                </button>
            </div>

            {/* área de envio */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
                className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
                    over ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-white/5'
                )}
            >
                {busy > 0 ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <UploadCloud className="h-6 w-6 text-primary" />}
                <p className="text-sm font-semibold text-text">{busy > 0 ? `Enviando ${busy} arquivo(s)...` : 'Arraste arquivos aqui ou clique para escolher'}</p>
                <p className="text-[10px] text-text-muted">{hint} · máx. {MAX_FILE_MB} MB por arquivo</p>
                <input ref={inputRef} type="file" multiple accept={accept} className="hidden"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            {errors.length > 0 && (
                <div className="space-y-1 rounded-md border border-red-500/30 bg-red-500/10 p-2">
                    {errors.map((m, i) => (
                        <p key={i} className="flex items-start justify-between gap-2 text-xs text-red-400"><span>{m}</span>
                            {i === 0 && <button type="button" onClick={() => setErrors([])} aria-label="Fechar"><X className="h-3 w-3" /></button>}
                        </p>
                    ))}
                </div>
            )}

            {items.length === 0 && busy === 0 && <p className="text-[10px] italic text-text-muted">Nenhum arquivo anexado.</p>}

            <ul className="space-y-2">
                {items.map((it, idx) => {
                    const uploaded = Boolean(it.path);
                    const kind = fileKind(it);
                    return (
                        <li key={`${it.path || it.url || 'novo'}-${idx}`} className="flex items-center gap-3 rounded-md border border-border/50 bg-black/20 p-2">
                            <KindIcon item={it} />
                            <div className="min-w-0 flex-1 space-y-1">
                                <input
                                    value={it.nome}
                                    onChange={(e) => patch(idx, { nome: e.target.value })}
                                    placeholder="Nome exibido ao aluno"
                                    className="h-8 w-full rounded-md border border-border bg-black/20 px-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                {uploaded ? (
                                    <p className="truncate text-[10px] text-text-muted">
                                        <span className="font-bold text-primary">{kind.label}</span> · {formatBytes(it.tamanho)} · {it.arquivo}
                                    </p>
                                ) : (
                                    <input
                                        value={it.url}
                                        onChange={(e) => patch(idx, { url: e.target.value })}
                                        placeholder="Cole o link (Google Drive etc.)"
                                        className="h-8 w-full rounded-md border border-border bg-black/20 px-2 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                )}
                            </div>
                            <button type="button" onClick={() => remove(idx)} aria-label="Remover" className="rounded-md p-2 text-red-500 transition-colors hover:bg-red-500/10">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
