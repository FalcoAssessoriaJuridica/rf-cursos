// Sincroniza a CONFIGURAÇÃO dos cursos demo (enquadramento de capa e matrículas) com um arquivo
// (`demo-state.json`) via o servidor de desenvolvimento. Assim o ajuste vale em qualquer navegador
// da máquina, não só naquele onde foi feito (o localStorage é separado por navegador).
// Só existe em desenvolvimento com o modo demo ligado; em produção não faz nada.
const ENABLED = typeof __DEMO_ENABLED__ !== 'undefined' && __DEMO_ENABLED__ && import.meta.env.DEV;
const SYNCED = ['rf_demo_covers', 'rf_demo_enrollments'];

const parse = (raw) => {
    try {
        const v = JSON.parse(raw);
        return v && typeof v === 'object' ? v : {};
    } catch {
        return {};
    }
};

// Mescla entrada a entrada: vale a mais recente (`_t`); sem `_t` conta como a mais antiga; empate fica com o local.
function mergeEntries(local, server) {
    const out = { ...server };
    for (const [id, entry] of Object.entries(local)) {
        const s = server[id];
        if (!s || (entry?._t || 0) >= (s?._t || 0)) out[id] = entry;
    }
    return out;
}

export async function hydrateDemoState() {
    if (!ENABLED) return;
    try {
        const res = await fetch('/__demo-state');
        if (!res.ok) return;
        const data = await res.json();
        SYNCED.forEach((key) => {
            const server = parse(data[key]);
            const local = parse(localStorage.getItem(key));
            const merged = mergeEntries(local, server);
            const mergedRaw = JSON.stringify(merged);
            if (Object.keys(merged).length) localStorage.setItem(key, mergedRaw);
            // o navegador tinha algo mais novo (ou que o arquivo ainda não tinha): devolve ao arquivo
            if (mergedRaw !== JSON.stringify(server) && Object.keys(merged).length) pushDemoState(key, mergedRaw);
        });
    } catch {
        /* servidor sem o endpoint ou storage indisponível: segue só com o localStorage */
    }
}

let pending = {};
let timer = null;

export function pushDemoState(key, value) {
    if (!ENABLED || !SYNCED.includes(key)) return;
    pending[key] = value;
    clearTimeout(timer);
    timer = setTimeout(() => {
        const body = JSON.stringify(pending);
        pending = {};
        fetch('/__demo-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
    }, 250);
}
