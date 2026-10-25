import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Cloudflare Turnstile. A chave pública vem de VITE_TURNSTILE_SITE_KEY; sem ela, o componente não aparece e tudo funciona como antes.
// Cada token vale para uma única verificação: antes de cada ação sensível, chame ref.current.fresh() para obter um novo.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading = null;
const loadScript = () => {
    if (window.turnstile) return Promise.resolve();
    if (!loading) {
        loading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = SRC; s.async = true; s.defer = true;
            s.onload = resolve;
            s.onerror = () => { loading = null; reject(new Error('Não foi possível carregar a verificação de segurança.')); };
            document.head.appendChild(s);
        });
    }
    return loading;
};

const Captcha = forwardRef(function Captcha(_props, ref) {
    const box = useRef(null);
    const widget = useRef(null);
    const pending = useRef(null);

    useEffect(() => {
        if (!SITE_KEY) return undefined;
        let vivo = true;
        loadScript().then(() => {
            if (!vivo || !box.current || widget.current != null) return;
            widget.current = window.turnstile.render(box.current, {
                sitekey: SITE_KEY,
                execution: 'execute',                 // só roda quando a ação é pedida
                appearance: 'interaction-only',       // só aparece se for preciso um desafio
                theme: 'auto',
                callback: (token) => { pending.current?.resolve(token); pending.current = null; },
                'error-callback': () => { pending.current?.reject(new Error('A verificação de segurança falhou. Tente de novo.')); pending.current = null; return true; },
                'timeout-callback': () => { pending.current?.reject(new Error('A verificação de segurança expirou. Tente de novo.')); pending.current = null; },
            });
        }).catch(() => {});
        return () => { vivo = false; if (widget.current != null) { try { window.turnstile.remove(widget.current); } catch { /* já removido */ } widget.current = null; } };
    }, []);

    useImperativeHandle(ref, () => ({
        // devolve um token novo (ou null, se a verificação não estiver configurada)
        async fresh() {
            if (!SITE_KEY) return null;
            await loadScript();
            for (let i = 0; i < 50 && widget.current == null; i++) await new Promise((r) => setTimeout(r, 100));
            if (widget.current == null) throw new Error('Verificação de segurança indisponível. Recarregue a página.');
            return new Promise((resolve, reject) => {
                const t = setTimeout(() => { pending.current = null; reject(new Error('A verificação de segurança demorou demais. Tente de novo.')); }, 30000);
                pending.current = { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } };
                window.turnstile.reset(widget.current);
                window.turnstile.execute(widget.current);
            });
        },
    }), []);

    if (!SITE_KEY) return null;
    return <div ref={box} className="flex justify-center" />;
});

export default Captcha;
