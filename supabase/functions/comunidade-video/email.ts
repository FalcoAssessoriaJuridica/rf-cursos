// Avisos por e-mail da Comunidade MAC, pela API do Resend (o domínio falcotech.com.br já está verificado lá).
// O envio é "de melhor esforço": se falhar ou se a chave não existir, a ação do usuário (enviar vídeo, responder) NÃO falha.

// Só os testes locais trocam o endereço (contra um Resend de mentira).
const API = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com/emails';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export const emailConfigurado = () => !!Deno.env.get('RESEND_API_KEY');

export async function enviarEmail(o: { para: string[]; assunto: string; html: string; texto: string }): Promise<boolean> {
  const chave = Deno.env.get('RESEND_API_KEY');
  const para = o.para.filter(Boolean);
  if (!chave || para.length === 0) return false;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') ?? 'RF Music Academy <nao-responda@falcotech.com.br>',
        to: para, subject: o.assunto, html: o.html, text: o.texto,
      }),
    });
    if (!r.ok) console.error('comunidade-video e-mail', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error('comunidade-video e-mail', (e as Error).message);
    return false;
  }
}

// Moldura simples, legível em qualquer leitor de e-mail (sem imagens, sem rastreadores).
const moldura = (titulo: string, corpoHtml: string, link: string, botao: string) => `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7a6a2f">Comunidade MAC</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(titulo)}</h1>
${corpoHtml}
<p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#c9a227;color:#1d1d1b;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${esc(botao)}</a></p>
<p style="margin:0;font-size:12px;color:#6b6b66">Ministério Adoradores de Cristo · RF Music Academy. Você recebe este aviso porque participa da Comunidade MAC.</p>
</div></body></html>`;

export function emailNovoEnvio(o: { aluno: string; instrumento: string; duracao: string; recado: string | null; compartilhado: boolean; link: string }) {
  const linhas = [`${o.aluno} enviou um vídeo de ${o.instrumento} (${o.duracao}).`, o.compartilhado ? 'O aluno liberou o vídeo para toda a comunidade.' : 'O vídeo é visível só para você.'];
  const recado = o.recado ? corta(o.recado, 400) : null;
  return {
    assunto: `Novo vídeo de ${o.aluno} · ${o.instrumento}`,
    texto: [...linhas, recado ? `Recado: ${recado}` : '', `Abra a caixa de entrada: ${o.link}`].filter(Boolean).join('\n'),
    html: moldura(`Novo vídeo de ${o.aluno}`,
      `<p style="margin:0 0 8px;line-height:1.5">${esc(linhas[0])}</p><p style="margin:0 0 8px;line-height:1.5;color:#55554f">${esc(linhas[1])}</p>`
      + (recado ? `<p style="margin:12px 0 0;padding:12px;background:#fff;border-radius:8px;line-height:1.5"><strong>Recado do aluno:</strong><br>${esc(recado).replace(/\n/g, '<br>')}</p>` : ''),
      o.link, 'Abrir a caixa de entrada'),
  };
}

export function emailResposta(o: { texto: string; link: string }) {
  const t = corta(o.texto, 500);
  return {
    assunto: 'O professor respondeu ao seu vídeo',
    texto: `O professor respondeu ao seu vídeo na Comunidade MAC:\n\n${t}\n\nVeja no app: ${o.link}`,
    html: moldura('O professor respondeu ao seu vídeo',
      `<p style="margin:0 0 12px;line-height:1.5">Você recebeu uma resposta na Comunidade MAC:</p><p style="margin:0;padding:14px;background:#fff;border-radius:8px;line-height:1.55">${esc(t).replace(/\n/g, '<br>')}</p>`,
      o.link, 'Ver no app'),
  };
}
