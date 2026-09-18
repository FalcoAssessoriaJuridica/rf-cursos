/**
 * ============================================================================
 * 🎨 FALCO VISUAL STUDIO - MOTOR UNIVERSAL DE DESIGN & EDIÇÃO VISUAL
 * ============================================================================
 * @author Falco Assessoria Jurídica / Roberto Falco
 * @version 2.6.0 (Zero-Overlap Header & Floating Dock Edition)
 * 
 * Correções & Recursos:
 * 1. 🛡️ ZERO SOBREPOSIÇÃO: O cabeçalho / navbar da página desce automaticamente (top: 54px) quando a barra está no topo, permitindo selecionar o logo e menu com 100% de clareza.
 * 2. ↕️ ACESSO FLEXÍVEL: Botão para mover a Barra do Studio entre o TOPO e o RODAPÉ (Bottom Dock), liberando 100% da parte superior quando desejado.
 * 3. 🎯 Bounding Box Interativo com Alças nos 4 cantos para redimensionamento livre por arrasto do mouse.
 * 4. ✋ Move Tool (Arrastar e Mover livremente qualquer elemento).
 * 5. 🕹️ Mini-Toolbar flutuante sobre o elemento com Escala (+15% / -15%), Posição e Troca de Fotos.
 * 6. 💾 Persistência limpa em LocalStorage + Baixar HTML Limpo + Copiar Código.
 * ============================================================================
 */

(function () {
    // 🛡️ AMBIENTE: O Studio Visual roda EXCLUSIVAMENTE em ambiente de desenvolvimento (localhost / 127.0.0.1).
    // Em producao (*.falcotech.com.br), ele e 100% silencioso e NUNCA renderiza nenhum elemento.
    const isLocal = window.location.hostname === "localhost" || 
                    window.location.hostname === "127.0.0.1" || 
                    window.location.hostname.endsWith(".local") ||
                    window.location.search.includes("studio=1");

    if (!isLocal) {
        return; // Encerra imediatamente em producao
    }

    if (window.FalcoVisualStudioLoaded) return;
    window.FalcoVisualStudioLoaded = true;


    
    function getNormalizedStorageKey() {
        let pathname = window.location.pathname || '/';
        pathname = pathname.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '') || '/';
        if (pathname === '/') return 'falco_studio_saved_root';
        return 'falco_studio_saved_' + pathname.replace(/[^a-zA-Z0-9]/g, '_');
    }
    const STORAGE_KEY = getNormalizedStorageKey();
    const DB_NAME = 'FalcoStudioDB';
    const DB_VERSION = 2;
    const STORE_NAME = 'page_snapshots';

    // ── HISTÓRICO DE DESFAZER (UNDO STACK) ──
    const undoStack = [];
    const MAX_UNDO = 50;

    function recordState() {
        try {
            const pageElements = Array.from(document.body.children).filter(el => {
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
                if (el.id && el.id.startsWith('falco-')) return false;
                return true;
            });

            const snapshot = pageElements.map(el => {
                const clone = el.cloneNode(true);
                clone.querySelectorAll('#falco-top-studio-bar, #falco-editor-bar, #falco-floating-inspector, #falco-transform-gizmo, #falco-alignment-overlay, #falco-studio-launcher-btn, #falco-studio-styles, #falco-studio-fonts, #falco-studio-toast').forEach(c => c.remove());
                clone.querySelectorAll('.fvs-selected-element').forEach(c => c.classList.remove('fvs-selected-element'));
                clone.querySelectorAll('[contenteditable]').forEach(c => c.removeAttribute('contenteditable'));
                return {
                    id: el.id || '',
                    tagName: el.tagName,
                    outerHTML: clone.outerHTML
                };
            });

            undoStack.push(snapshot);
            if (undoStack.length > MAX_UNDO) undoStack.shift();
            updateUndoButton();
        } catch (e) {
            console.warn('Falha ao registrar estado no histórico:', e);
        }
    }

    function updateUndoButton() {
        const btn = document.getElementById('fvs-btn-undo');
        if (btn) {
            btn.disabled = undoStack.length === 0;
            btn.style.opacity = undoStack.length === 0 ? '0.4' : '1';
        }
    }

    // ── MOTOR DE PERSISTÊNCIA INDEXEDDB (Sem limite de 5MB) ──
    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                resolve(null);
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    }

    async function saveToDB(key, data) {
        try {
            const db = await openDatabase();
            if (db) {
                return new Promise((resolve) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    store.put({ key: key, data: data, updatedAt: Date.now() });
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                });
            }
        } catch (e) {
            console.warn('Erro ao salvar no IndexedDB:', e);
        }
        return false;
    }

    async function loadFromDB(key) {
        try {
            const db = await openDatabase();
            if (db) {
                return new Promise((resolve) => {
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.get(key);
                    req.onsuccess = () => {
                        resolve(req.result ? req.result.data : null);
                    };
                    req.onerror = () => resolve(null);
                });
            }
        } catch (e) {
            console.warn('Erro ao carregar do IndexedDB:', e);
        }
        return null;
    }

    function showToast(msg, icon = '✅') {
        let toast = document.getElementById('falco-studio-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'falco-studio-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = '<span>' + icon + '</span><span>' + msg + '</span>';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);
    }


    let isEditMode = true;
    let barPosition = 'top'; // 'top' ou 'bottom'
    let activeElement = null;
    let isInspectorCollapsed = false;

    // Estados de Drag & Resize
    let isDragging = false;
    let isResizing = false;
    let currentHandle = null;
    let startX = 0, startY = 0;
    let startWidth = 0, startHeight = 0;
    let startLeft = 0, startTop = 0;

    function injectGoogleFonts() {
        const fontId = 'falco-studio-fonts';
        if (!document.getElementById(fontId)) {
            const link = document.createElement('link');
            link.id = fontId;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,400&family=Inter:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=Poppins:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap';
            document.head.appendChild(link);
        }
    }

    function injectStyles() {
        const styleId = 'falco-studio-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            :root {
                --fvs-gold-primary: #c9a961;
                --fvs-gold-light: #dfc079;
                --fvs-gold-dark: #967637;
                --fvs-bg-dark: #09090c;
                --fvs-panel-bg: rgba(12, 12, 16, 0.96);
                --fvs-border: rgba(201, 169, 97, 0.35);
                --fvs-text-light: #f4f4f5;
                --fvs-text-muted: #a1a1aa;
            }

            
            /* ── DESATIVAÇÃO FORÇADA DE 3D E LEVITAÇÃO ── */
            .fvs-no-3d,
            .fvs-no-3d *,
            .portrait-3d-wrapper.fvs-no-3d,
            .portrait-frame-card.fvs-no-3d,
            [data-fvs-disable-3d="true"],
            [data-fvs-disable-3d="true"] * {
                animation: none !important;
                transform: none !important;
                perspective: none !important;
                transform-style: flat !important;
                transition: none !important;
            }

            /* Toast Notification */
            #falco-studio-toast {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: #0c0c10;
                border: 1px solid var(--fvs-gold-primary);
                color: #f4f4f5;
                padding: 12px 20px;
                border-radius: 16px;
                font-family: 'Outfit', sans-serif;
                font-size: 13px;
                font-weight: 600;
                box-shadow: 0 10px 30px rgba(0,0,0,0.8);
                z-index: 2147483647;
                display: flex;
                align-items: center;
                gap: 10px;
                transform: translateY(100px);
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                pointer-events: none;
            }
            #falco-studio-toast.show {
                transform: translateY(0);
                opacity: 1;
            }

            /* ── DESLOCAMENTO INTELIGENTE DO CABEÇALHO PARA NUNCA TRUNCAR ── */
            body.falco-studio-active.fvs-dock-top {
                padding-top: 54px !important;
            }

            body.falco-studio-active.fvs-dock-top header,
            body.falco-studio-active.fvs-dock-top .navbar,
            body.falco-studio-active.fvs-dock-top [class*="navbar"],
            body.falco-studio-active.fvs-dock-top header.fixed,
            body.falco-studio-active.fvs-dock-top .fixed.top-0,
            body.falco-studio-active.fvs-dock-top [class*="fixed"][class*="top-0"] {
                top: 54px !important;
                transition: top 0.2s ease !important;
            }

            body.falco-studio-active.fvs-dock-bottom {
                padding-top: 0 !important;
                padding-bottom: 54px !important;
            }

            body.falco-studio-active.fvs-dock-bottom header,
            body.falco-studio-active.fvs-dock-bottom .navbar,
            body.falco-studio-active.fvs-dock-bottom [class*="navbar"],
            body.falco-studio-active.fvs-dock-bottom header.fixed,
            body.falco-studio-active.fvs-dock-bottom .fixed.top-0,
            body.falco-studio-active.fvs-dock-bottom [class*="fixed"][class*="top-0"] {
                top: 0px !important;
                transition: top 0.2s ease !important;
            }

            /* Contornos de Seleção */
            .falco-studio-active [data-fvs-editable="true"],
            .falco-studio-active h1, 
            .falco-studio-active h2, 
            .falco-studio-active h3, 
            .falco-studio-active h4, 
            .falco-studio-active p, 
            .falco-studio-active span, 
            .falco-studio-active a, 
            .falco-studio-active button, 
            .falco-studio-active img,
            .falco-studio-active [class*="card"],
            .falco-studio-active [class*="hero"],
            .falco-studio-active [class*="badge"],
            .falco-studio-active [class*="logo"] {
                cursor: pointer !important;
            }

            .falco-studio-active [data-fvs-editable="true"]:hover,
            .falco-studio-active h1:hover, 
            .falco-studio-active h2:hover, 
            .falco-studio-active h3:hover, 
            .falco-studio-active h4:hover, 
            .falco-studio-active p:hover, 
            .falco-studio-active a:hover, 
            .falco-studio-active button:hover, 
            .falco-studio-active img:hover {
                outline: 1.5px dashed rgba(223, 192, 121, 0.6) !important;
                outline-offset: 2px !important;
            }

            .falco-studio-active .fvs-selected-element {
                outline: 2px solid var(--fvs-gold-light) !important;
                outline-offset: 2px !important;
            }

            /* ── GIZMO DE TRANSFORMAÇÃO INTERATIVO ── */
            #falco-transform-gizmo {
                position: absolute;
                pointer-events: none;
                z-index: 2147483630;
                border: 2px solid var(--fvs-gold-light);
                box-shadow: 0 0 15px rgba(223, 192, 121, 0.4);
                display: none;
                transition: border-color 0.15s;
            }

            #falco-transform-gizmo.active {
                display: block;
            }

            .fvs-handle {
                position: absolute;
                width: 12px;
                height: 12px;
                background: var(--fvs-gold-light);
                border: 2px solid #060608;
                border-radius: 50%;
                pointer-events: auto;
                cursor: pointer;
                transition: transform 0.15s, background-color 0.15s;
                box-shadow: 0 2px 6px rgba(0,0,0,0.8);
            }

            .fvs-handle:hover {
                transform: scale(1.4);
                background: #ffffff;
            }

            .fvs-handle-nw { top: -6px; left: -6px; cursor: nwse-resize; }
            .fvs-handle-ne { top: -6px; right: -6px; cursor: nesw-resize; }
            .fvs-handle-sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
            .fvs-handle-se { bottom: -6px; right: -6px; cursor: nwse-resize; }
            .fvs-handle-n  { top: -6px; left: 50%; margin-left: -6px; cursor: ns-resize; }
            .fvs-handle-s  { bottom: -6px; left: 50%; margin-left: -6px; cursor: ns-resize; }
            .fvs-handle-e  { right: -6px; top: 50%; margin-top: -6px; cursor: ew-resize; }
            .fvs-handle-w  { left: -6px; top: 50%; margin-top: -6px; cursor: ew-resize; }

            /* Mini Barra de Ações Rápidas */
            #falco-gizmo-toolbar {
                position: absolute;
                top: -46px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(10, 10, 14, 0.98);
                border: 1px solid var(--fvs-gold-primary);
                border-radius: 9999px;
                padding: 4px 8px;
                display: flex;
                align-items: center;
                gap: 6px;
                pointer-events: auto;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.85);
                font-family: 'Inter', -apple-system, sans-serif;
                white-space: nowrap;
            }

            .fvs-gizmo-btn {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #ffffff;
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
            }

            .fvs-gizmo-btn:hover {
                background: var(--fvs-gold-primary);
                color: #060608;
                transform: scale(1.05);
            }

            .fvs-gizmo-move-handle {
                cursor: grab !important;
                background: linear-gradient(135deg, var(--fvs-gold-primary), var(--fvs-gold-dark));
                color: #060608;
                font-weight: 800;
            }

            .fvs-gizmo-move-handle:active {
                cursor: grabbing !important;
            }

            /* ── RÉGUA & LINHAS GUIAS DE ALINHAMENTO INTELIGENTE ── */
            #falco-alignment-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                pointer-events: none;
                z-index: 2147483625;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.15s ease, visibility 0.15s ease;
            }

            #falco-alignment-overlay.active {
                opacity: 1;
                visibility: visible;
            }

            .fvs-guide-line {
                position: absolute;
                pointer-events: none;
            }

            .fvs-guide-v {
                top: 0;
                bottom: 0;
                width: 1px;
                background: rgba(223, 192, 121, 0.85);
                box-shadow: 0 0 6px rgba(201, 169, 97, 0.7);
            }

            .fvs-guide-h {
                left: 0;
                right: 0;
                height: 1px;
                background: rgba(223, 192, 121, 0.85);
                box-shadow: 0 0 6px rgba(201, 169, 97, 0.7);
            }

            .fvs-guide-accent {
                background: rgba(223, 192, 121, 0.95);
                border-left: 1px dashed #ffffff;
                border-top: 1px dashed #ffffff;
            }

            .fvs-guide-screen-center {
                top: 0;
                bottom: 0;
                width: 2px !important;
                background: #38bdf8 !important;
                box-shadow: 0 0 12px rgba(56, 189, 248, 0.95), 0 0 4px #ffffff !important;
                z-index: 2147483628;
            }

            .fvs-guide-badge {
                position: absolute;
                top: 32px;
                left: 8px;
                background: #0284c7;
                color: #ffffff;
                font-family: 'Inter', sans-serif;
                font-size: 10px;
                font-weight: 700;
                padding: 3px 8px;
                border-radius: 4px;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                letter-spacing: 0.3px;
            }

            /* Réguas Milimétricas no Topo e na Esquerda */
            #falco-ruler-top {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 24px;
                pointer-events: none;
                z-index: 2147483638;
            }

            #falco-ruler-left {
                position: fixed;
                top: 0;
                left: 0;
                width: 24px;
                height: 100vh;
                pointer-events: none;
                z-index: 2147483638;
            }

            /* HUD Flutuante de Medidas e Coordenadas */
            #falco-hud-dimensions {
                position: fixed;
                background: rgba(9, 9, 12, 0.96);
                border: 1px solid var(--fvs-gold-primary);
                box-shadow: 0 8px 24px rgba(0,0,0,0.85), 0 0 12px rgba(201, 169, 97, 0.35);
                color: #f4f4f5;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                font-weight: 600;
                padding: 6px 12px;
                border-radius: 8px;
                pointer-events: none;
                z-index: 2147483640;
                display: none;
                align-items: center;
                gap: 8px;
                white-space: nowrap;
                backdrop-filter: blur(10px);
                transition: opacity 0.1s ease;
            }

            .fvs-hud-divider {
                color: rgba(201, 169, 97, 0.5);
            }

            .fvs-hud-snap-badge {
                background: rgba(56, 189, 248, 0.2);
                border: 1px solid #38bdf8;
                color: #38bdf8;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 700;
            }

            /* ── BARRA FIXA DO STUDIO (TOPO OU RODAPÉ) ── */
            #falco-top-studio-bar {
                position: fixed;
                left: 0;
                right: 0;
                height: 52px;
                z-index: 2147483640;
                background: var(--fvs-panel-bg);
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85);
                font-family: 'Inter', -apple-system, sans-serif;
                font-size: 12px;
                user-select: none;
                transition: all 0.2s ease;
            }

            #falco-top-studio-bar.fvs-dock-top {
                top: 0;
                bottom: auto;
                border-bottom: 2px solid var(--fvs-gold-primary);
                border-top: none;
            }

            #falco-top-studio-bar.fvs-dock-bottom {
                top: auto;
                bottom: 0;
                border-top: 2px solid var(--fvs-gold-primary);
                border-bottom: none;
            }

            .fvs-bar-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .fvs-brand-badge {
                background: linear-gradient(135deg, var(--fvs-gold-primary), var(--fvs-gold-dark));
                color: #060608;
                font-weight: 800;
                font-size: 11px;
                letter-spacing: 0.08em;
                padding: 4px 8px;
                border-radius: 6px;
                text-transform: uppercase;
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .fvs-chip-active {
                background: rgba(201, 169, 97, 0.15);
                border: 1px solid var(--fvs-border);
                color: var(--fvs-gold-light);
                padding: 4px 10px;
                border-radius: 9999px;
                font-size: 11px;
                font-weight: 700;
                max-width: 260px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .fvs-bar-center {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .fvs-bar-right {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .fvs-btn {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.16);
                color: #ffffff;
                padding: 5px 10px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                transition: all 0.2s ease;
                white-space: nowrap;
            }

            .fvs-btn:hover {
                background: rgba(201, 169, 97, 0.25);
                border-color: var(--fvs-gold-primary);
                color: var(--fvs-gold-light);
            }

            .fvs-btn.active {
                background: var(--fvs-gold-primary);
                color: #060608;
                font-weight: 800;
                border-color: var(--fvs-gold-light);
            }

            .fvs-btn-gold-action {
                background: linear-gradient(135deg, var(--fvs-gold-primary), var(--fvs-gold-light));
                color: #060608;
                font-weight: 800;
                border: none;
                box-shadow: 0 0 12px rgba(201, 169, 97, 0.4);
            }

            .fvs-btn-gold-action:hover {
                transform: scale(1.03);
                background: linear-gradient(135deg, var(--fvs-gold-light), #fff);
            }

            /* ── PAINEL INSPECTOR FLUTUANTE ── */
            #falco-floating-inspector {
                position: fixed;
                top: 64px;
                right: 18px;
                width: 350px;
                max-height: calc(100vh - 80px);
                z-index: 2147483645;
                background: var(--fvs-panel-bg);
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                border: 1.5px solid var(--fvs-border);
                border-radius: 14px;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.9), 0 0 30px rgba(201, 169, 97, 0.15);
                font-family: 'Inter', -apple-system, sans-serif;
                font-size: 12px;
                color: var(--fvs-text-light);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                animation: fvsSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }

            @keyframes fvsSlideIn {
                from { opacity: 0; transform: translateY(-10px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            .fvs-inspector-header {
                padding: 10px 14px;
                background: rgba(255, 255, 255, 0.04);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: grab;
            }

            .fvs-inspector-title {
                font-weight: 700;
                font-size: 11px;
                letter-spacing: 0.06em;
                color: var(--fvs-gold-light);
                text-transform: uppercase;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .fvs-inspector-tabs {
                display: flex;
                background: rgba(0, 0, 0, 0.4);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                overflow-x: auto;
            }

            .fvs-tab-btn {
                flex: 1;
                padding: 8px 3px;
                text-align: center;
                background: transparent;
                border: none;
                border-bottom: 2px solid transparent;
                color: var(--fvs-text-muted);
                font-size: 10.5px;
                font-weight: 600;
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s;
            }

            .fvs-tab-btn.active {
                color: var(--fvs-gold-light);
                border-bottom-color: var(--fvs-gold-primary);
                background: rgba(201, 169, 97, 0.1);
            }

            /* ANIMAÇÕES & EFEITOS DINÂMICOS */
            @keyframes fvs-float-3d {
                0% { transform: translateY(0px) rotateX(1deg) rotateY(-2deg); }
                100% { transform: translateY(-14px) rotateX(-1deg) rotateY(2deg) scale(1.02); }
            }

            @keyframes fvs-pulse-heartbeat {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.04); }
            }

            @keyframes fvs-shimmer-sweep {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }

            @keyframes fvs-beacon-pulse-green {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
                70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
            }

            @keyframes fvs-beacon-pulse-red {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.8); }
                70% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
            }

            @keyframes fvs-beacon-pulse-gold {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(201, 169, 97, 0.8); }
                70% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(201, 169, 97, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(201, 169, 97, 0); }
            }

            .fvs-fx-float-3d {
                animation: fvs-float-3d 5.5s ease-in-out infinite alternate !important;
                perspective: 1000px !important;
                transform-style: preserve-3d !important;
            }

            .fvs-fx-pulse {
                animation: fvs-pulse-heartbeat 2.5s ease-in-out infinite !important;
            }

            .fvs-fx-shimmer {
                background-size: 200% auto !important;
                background-image: linear-gradient(110deg, #c9a961 0%, #ffffff 50%, #c9a961 100%) !important;
                animation: fvs-shimmer-sweep 3s linear infinite !important;
                color: #060608 !important;
            }

            .fvs-fx-glow-gold {
                box-shadow: 0 0 25px rgba(201, 169, 97, 0.65), 0 10px 30px rgba(0,0,0,0.8) !important;
            }

            .fvs-fx-glass-gold {
                background: rgba(14, 14, 20, 0.72) !important;
                backdrop-filter: blur(18px) !important;
                -webkit-backdrop-filter: blur(18px) !important;
                border: 1px solid rgba(201, 169, 97, 0.4) !important;
                box-shadow: 0 15px 35px rgba(0,0,0,0.7) !important;
            }

            .fvs-fx-glass-dark {
                background: rgba(8, 8, 12, 0.85) !important;
                backdrop-filter: blur(20px) !important;
                -webkit-backdrop-filter: blur(20px) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                box-shadow: 0 20px 40px rgba(0,0,0,0.9) !important;
            }

            .fvs-fx-neon-border {
                border: 2px solid #dfc079 !important;
                box-shadow: 0 0 15px rgba(201, 169, 97, 0.5), inset 0 0 15px rgba(201, 169, 97, 0.3) !important;
            }

            .fvs-fx-uppercase-pro {
                text-transform: uppercase !important;
                letter-spacing: 0.14em !important;
                font-weight: 800 !important;
            }

            .fvs-status-beacon {
                display: inline-block !important;
                width: 10px !important;
                height: 10px !important;
                border-radius: 50% !important;
                margin-right: 8px !important;
                vertical-align: middle !important;
                position: relative !important;
                flex-shrink: 0 !important;
            }

            .fvs-beacon-green {
                background-color: #22c55e !important;
                animation: fvs-beacon-pulse-green 1.8s infinite ease-in-out !important;
            }

            .fvs-beacon-red {
                background-color: #ef4444 !important;
                animation: fvs-beacon-pulse-red 1.5s infinite ease-in-out !important;
            }

            .fvs-beacon-gold {
                background-color: #c9a961 !important;
                animation: fvs-beacon-pulse-gold 2s infinite ease-in-out !important;
            }

            .fvs-inspector-body {
                padding: 14px;
                overflow-y: auto;
                max-height: calc(100vh - 180px);
            }

            .fvs-field {
                margin-bottom: 12px;
            }

            .fvs-field-label {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 10px;
                font-weight: 700;
                color: var(--fvs-text-muted);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 5px;
            }

            .fvs-field-val {
                color: var(--fvs-gold-light);
                font-weight: 700;
            }

            .fvs-input, .fvs-select {
                width: 100%;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #fff;
                padding: 6px 8px;
                border-radius: 6px;
                font-size: 12px;
                outline: none;
                box-sizing: border-box;
            }

            .fvs-input:focus, .fvs-select:focus {
                border-color: var(--fvs-gold-primary);
                box-shadow: 0 0 8px rgba(201, 169, 97, 0.3);
            }

            .fvs-range-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .fvs-range-row input[type="range"] {
                flex: 1;
                accent-color: var(--fvs-gold-primary);
                cursor: pointer;
            }

            .fvs-color-row {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .fvs-color-picker {
                width: 32px;
                height: 30px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                cursor: pointer;
                background: transparent;
                padding: 0;
            }

            .fvs-swatches {
                display: flex;
                gap: 4px;
                margin-top: 5px;
            }

            .fvs-swatch-dot {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.3);
                cursor: pointer;
                transition: transform 0.15s;
            }

            .fvs-swatch-dot:hover {
                transform: scale(1.3);
            }

            .fvs-btn-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 6px;
                margin-top: 6px;
            }

            .fvs-preset-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: #fff;
                padding: 6px 8px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                text-align: center;
                transition: all 0.2s;
            }

            .fvs-preset-btn:hover {
                border-color: var(--fvs-gold-primary);
                background: rgba(201, 169, 97, 0.2);
                color: var(--fvs-gold-light);
            }

            /* Botão Flutuante Launcher */
            #falco-studio-launcher-btn {
                position: fixed;
                bottom: 24px;
                left: 24px;
                z-index: 2147483640;
                background: rgba(14, 14, 20, 0.95);
                border: 1.5px solid var(--fvs-gold-primary);
                color: var(--fvs-gold-light);
                padding: 10px 18px;
                border-radius: 9999px;
                font-family: 'Inter', -apple-system, sans-serif;
                font-weight: 700;
                font-size: 12px;
                cursor: pointer;
                box-shadow: 0 10px 30px rgba(0,0,0,0.85), 0 0 20px rgba(201, 169, 97, 0.3);
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }

            #falco-studio-launcher-btn:hover {
                transform: scale(1.06) translateY(-2px);
                background: var(--fvs-gold-primary);
                color: #060608;
            }

            .fvs-hidden {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function injectStudioUI() {
        if (document.getElementById('falco-top-studio-bar')) return;

        // Barra Superior / Inferior
        const topBar = document.createElement('div');
        topBar.id = 'falco-top-studio-bar';
        topBar.className = 'fvs-dock-top';
        topBar.innerHTML = `
            <div class="fvs-bar-left">
                <span class="fvs-brand-badge">✨ STUDIO FALCO</span>
                <span id="fvs-selected-tag" class="fvs-chip-active">Clique em qualquer item para editar</span>
            </div>
            
            <div class="fvs-bar-center">
                <button type="button" class="fvs-btn active" id="fvs-btn-mode-toggle" onclick="window.FalcoStudio.toggleMode()">
                    <span>✏️ Modo Edição</span>
                </button>
                <button type="button" class="fvs-btn" id="fvs-btn-dock-toggle" onclick="window.FalcoStudio.toggleDockPosition()" title="Mover Barra para o Topo ou Rodapé">
                    <span id="fvs-dock-label">⬇ Barra em Baixo</span>
                </button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.quickScale(1.1)" title="Aumentar Tamanho (+10%)">🔍 +10%</button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.quickScale(0.9)" title="Diminuir Tamanho (-10%)">🔍 -10%</button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.moveElement(0, -10)" title="Subir (10px)">⬆ Subir</button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.moveElement(0, 10)" title="Descer (10px)">⬇ Descer</button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.moveElement(-10, 0)" title="Mover Esquerda">⬅</button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.moveElement(10, 0)" title="Mover Direita">➡</button>
                <button type="button" class="fvs-btn active" onclick="window.FalcoStudio.toggleInspector()" id="fvs-btn-toggle-inspector" title="Abrir/Fechar Painel Completo">
                    <span>🎛️ Painel</span>
                </button>
            </div>

            <div class="fvs-bar-right">
                <button type="button" class="fvs-btn" id="fvs-btn-undo" onclick="window.FalcoStudio.undo()" title="Desfazer última alteração (Ctrl+Z / Cmd+Z)" style="opacity: 0.4;">
                    <span>↩️ Desfazer</span>
                </button>
                <button type="button" class="fvs-btn fvs-btn-gold-action" onclick="window.FalcoStudio.saveEdits()" title="Salvar no Navegador">
                    <span>💾 Salvar</span>
                </button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.downloadHtml()" title="Baixar Arquivo HTML Pronto">
                    <span>📥 Baixar HTML</span>
                </button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.copyCleanHtml()" title="Copiar Código HTML">
                    <span>📋 Copiar</span>
                </button>
                <button type="button" class="fvs-btn" onclick="window.FalcoStudio.resetOriginal()" title="Restaurar Versão Original">
                    <span>🔄 Restaurar</span>
                </button>
            </div>
        `;
        document.body.appendChild(topBar);

        // ── OVERLAY DE RÉGUAS & LINHAS GUIAS DE ALINHAMENTO ──
        const overlay = document.createElement('div');
        overlay.id = 'falco-alignment-overlay';
        overlay.innerHTML = `
            <div id="fvs-guide-left" class="fvs-guide-line fvs-guide-v"></div>
            <div id="fvs-guide-right" class="fvs-guide-line fvs-guide-v"></div>
            <div id="fvs-guide-center-x" class="fvs-guide-line fvs-guide-v fvs-guide-accent"></div>
            <div id="fvs-guide-top" class="fvs-guide-line fvs-guide-h"></div>
            <div id="fvs-guide-bottom" class="fvs-guide-line fvs-guide-h"></div>
            <div id="fvs-guide-center-y" class="fvs-guide-line fvs-guide-h fvs-guide-accent"></div>
            <div id="fvs-guide-screen-center" class="fvs-guide-line fvs-guide-v fvs-guide-screen-center" style="display:none;">
                <span class="fvs-guide-badge">🎯 Centro da Tela</span>
            </div>

            <!-- Réguas Dinâmicas -->
            <canvas id="falco-ruler-top" height="24"></canvas>
            <canvas id="falco-ruler-left" width="24"></canvas>

            <!-- HUD Flutuante de Medidas -->
            <div id="falco-hud-dimensions">
                <span id="fvs-hud-coords">X: 0px  Y: 0px</span>
                <span class="fvs-hud-divider">|</span>
                <span id="fvs-hud-size">0 × 0px</span>
                <span id="fvs-hud-snap" class="fvs-hud-snap-badge" style="display:none;">🎯 Centro (50%)</span>
            </div>
        `;
        document.body.appendChild(overlay);

        // ── GIZMO DE TRANSFORMAÇÃO FLUTUANTE ──
        const gizmo = document.createElement('div');
        gizmo.id = 'falco-transform-gizmo';
        gizmo.innerHTML = `
            <div id="falco-gizmo-toolbar">
                <button type="button" class="fvs-gizmo-btn fvs-gizmo-move-handle" title="Clique e segure para arrastar e reposicionar" onmousedown="window.FalcoStudio.startMoveDrag(event)">
                    <span>✋ Arrastar</span>
                </button>
                <button type="button" class="fvs-gizmo-btn" onclick="window.FalcoStudio.quickScale(1.15)" title="Aumentar +15%">➕ +15%</button>
                <button type="button" class="fvs-gizmo-btn" onclick="window.FalcoStudio.quickScale(0.85)" title="Diminuir -15%">➖ -15%</button>
                <button type="button" class="fvs-gizmo-btn" id="fvs-gizmo-upload-btn" onclick="document.getElementById('fvs-file-input').click()" style="display:none;" title="Trocar Imagem do Mac">
                    <span>📁 Trocar Foto</span>
                </button>
            </div>

            <div class="fvs-handle fvs-handle-nw" onmousedown="window.FalcoStudio.startResize(event, 'nw')"></div>
            <div class="fvs-handle fvs-handle-ne" onmousedown="window.FalcoStudio.startResize(event, 'ne')"></div>
            <div class="fvs-handle fvs-handle-sw" onmousedown="window.FalcoStudio.startResize(event, 'sw')"></div>
            <div class="fvs-handle fvs-handle-se" onmousedown="window.FalcoStudio.startResize(event, 'se')"></div>
            <div class="fvs-handle fvs-handle-n" onmousedown="window.FalcoStudio.startResize(event, 'n')"></div>
            <div class="fvs-handle fvs-handle-s" onmousedown="window.FalcoStudio.startResize(event, 's')"></div>
            <div class="fvs-handle fvs-handle-e" onmousedown="window.FalcoStudio.startResize(event, 'e')"></div>
            <div class="fvs-handle fvs-handle-w" onmousedown="window.FalcoStudio.startResize(event, 'w')"></div>
        `;
        document.body.appendChild(gizmo);

        // Inspetor Flutuante
        const inspector = document.createElement('div');
        inspector.id = 'falco-floating-inspector';
        inspector.innerHTML = `
            <div class="fvs-inspector-header">
                <div class="fvs-inspector-title">
                    <span>🎛️ INSPETOR VISUAL</span>
                    <span id="fvs-target-type-badge" style="color: #ffffff; opacity: 0.8; font-weight: normal;">(Geral)</span>
                </div>
                <button type="button" onclick="window.FalcoStudio.toggleInspector(false)" style="background:none; border:none; color:#aaa; font-size:16px; cursor:pointer;">✕</button>
            </div>

            <div class="fvs-inspector-tabs">
                <button type="button" class="fvs-tab-btn active" onclick="window.FalcoStudio.switchTab('style', this)">🎨 Estilo</button>
                <button type="button" class="fvs-tab-btn" onclick="window.FalcoStudio.switchTab('typography', this)">🔤 Texto</button>
                <button type="button" class="fvs-tab-btn" onclick="window.FalcoStudio.switchTab('media', this)">🖼️ Imagem</button>
                <button type="button" class="fvs-tab-btn" onclick="window.FalcoStudio.switchTab('effects', this)">⚡ Efeitos</button>
                <button type="button" class="fvs-tab-btn" onclick="window.FalcoStudio.switchTab('spacing', this)">📐 Posição</button>
            </div>

            <div class="fvs-inspector-body">
                <!-- ABA 1: ESTILO -->
                <div id="fvs-tab-style" class="fvs-tab-content">
                    <div class="fvs-field">
                        <div class="fvs-field-label">Presets de Botão & Card</div>
                        <div class="fvs-btn-grid">
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyPreset('gold-solid')">🌟 Ouro Nobre</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyPreset('gold-outline')">🛡️ Outline Ouro</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyPreset('whatsapp-pulse')">🟢 Verde WhatsApp</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyPreset('glass')">⬛ Glassmorphism</button>
                        </div>
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">Cor de Fundo (Background)</div>
                        <div class="fvs-color-row">
                            <input type="color" id="fvs-input-bg-color" class="fvs-color-picker" onchange="window.FalcoStudio.setBgColor(this.value)">
                            <input type="text" id="fvs-input-bg-hex" class="fvs-input" placeholder="#060608 ou rgba(...)" oninput="window.FalcoStudio.setBgColor(this.value)">
                        </div>
                        <div class="fvs-swatches">
                            <div class="fvs-swatch-dot" style="background:#060608;" title="Ônix Puro" onclick="window.FalcoStudio.setBgColor('#060608')"></div>
                            <div class="fvs-swatch-dot" style="background:#121216;" title="Card Dark" onclick="window.FalcoStudio.setBgColor('#121216')"></div>
                            <div class="fvs-swatch-dot" style="background:#c9a961;" title="Ouro Nobre" onclick="window.FalcoStudio.setBgColor('#c9a961')"></div>
                            <div class="fvs-swatch-dot" style="background:#22c55e;" title="Verde WhatsApp" onclick="window.FalcoStudio.setBgColor('#22c55e')"></div>
                            <div class="fvs-swatch-dot" style="background:transparent; border: 1px dashed #fff;" title="Transparente" onclick="window.FalcoStudio.setBgColor('transparent')"></div>
                        </div>
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">
                            <span>Arredondamento (Radius)</span>
                            <span id="fvs-radius-val" class="fvs-field-val">8px</span>
                        </div>
                        <div class="fvs-range-row">
                            <input type="range" id="fvs-input-radius" min="0" max="100" value="8" oninput="window.FalcoStudio.setRadius(this.value)">
                        </div>
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">Borda (Border)</div>
                        <div class="fvs-color-row">
                            <input type="color" id="fvs-input-border-color" class="fvs-color-picker" onchange="window.FalcoStudio.setBorderColor(this.value)">
                            <select id="fvs-input-border-width" class="fvs-select" onchange="window.FalcoStudio.setBorderWidth(this.value)">
                                <option value="0px">Sem Borda</option>
                                <option value="1px">1px Fina</option>
                                <option value="2px" selected>2px Média</option>
                                <option value="3px">3px Destaque</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- ABA 2: TIPOGRAFIA -->
                <div id="fvs-tab-typography" class="fvs-tab-content" style="display:none;">
                    <div class="fvs-field">
                        <div class="fvs-field-label">Família da Fonte</div>
                        <select id="fvs-font-family-select" class="fvs-select" onchange="window.FalcoStudio.setFontFamily(this.value)">
                            <option value="'Outfit', sans-serif">Outfit (Moderna / Tech)</option>
                            <option value="'Cormorant Garamond', serif">Cormorant Garamond (Serifada / Clássica)</option>
                            <option value="'Inter', sans-serif">Inter (Sans Limpa)</option>
                            <option value="'Playfair Display', serif">Playfair Display (Luxo / Editorial)</option>
                            <option value="'Montserrat', sans-serif">Montserrat (Imponente)</option>
                            <option value="'Poppins', sans-serif">Poppins (Geométrica)</option>
                            <option value="'JetBrains Mono', monospace">JetBrains Mono (Código)</option>
                        </select>
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">
                            <span>Tamanho da Fonte</span>
                            <span id="fvs-fontsize-val" class="fvs-field-val">16px</span>
                        </div>
                        <div class="fvs-range-row">
                            <input type="range" id="fvs-input-fontsize" min="10" max="96" value="16" oninput="window.FalcoStudio.setFontSize(this.value)">
                        </div>
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">Cor do Texto</div>
                        <div class="fvs-color-row">
                            <input type="color" id="fvs-input-text-color" class="fvs-color-picker" onchange="window.FalcoStudio.setTextColor(this.value)">
                            <input type="text" id="fvs-input-text-hex" class="fvs-input" placeholder="#ffffff" oninput="window.FalcoStudio.setTextColor(this.value)">
                        </div>
                        <div class="fvs-swatches">
                            <div class="fvs-swatch-dot" style="background:#c9a961;" title="Ouro Nobre" onclick="window.FalcoStudio.setTextColor('#c9a961')"></div>
                            <div class="fvs-swatch-dot" style="background:#dfc079;" title="Ouro Claro" onclick="window.FalcoStudio.setTextColor('#dfc079')"></div>
                            <div class="fvs-swatch-dot" style="background:#ffffff;" title="Branco Puro" onclick="window.FalcoStudio.setTextColor('#ffffff')"></div>
                            <div class="fvs-swatch-dot" style="background:#a1a1aa;" title="Cinza Metálico" onclick="window.FalcoStudio.setTextColor('#a1a1aa')"></div>
                            <div class="fvs-swatch-dot" style="background:#22c55e;" title="Verde" onclick="window.FalcoStudio.setTextColor('#22c55e')"></div>
                        </div>
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">Alinhamento & Estilo</div>
                        <div class="fvs-btn-grid" style="grid-template-columns: repeat(4, 1fr);">
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.setTextAlign('left')">⬅</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.setTextAlign('center')">⬛</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.setTextAlign('right')">➡</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.setTextAlign('justify')">☰</button>
                        </div>
                    </div>

                    <div class="fvs-field" style="background: rgba(201, 169, 97, 0.08); padding: 10px; border-radius: 8px; border: 1px solid rgba(201, 169, 97, 0.25);">
                        <div class="fvs-field-label" style="color: var(--fvs-gold-light); font-weight: 700;">🔗 Destino do Botão / Link</div>
                        <input type="text" id="fvs-input-link" class="fvs-input" placeholder="https://wa.me/55... ou #formulario" oninput="window.FalcoStudio.setLink(this.value)">
                        
                        <div style="display: flex; gap: 6px; margin-top: 8px;">
                            <button type="button" class="fvs-preset-btn" style="flex:1; font-size:10px;" onclick="window.FalcoStudio.setQuickWhatsApp('21964074111', 'Olá, Dr. Roberto! Gostaria de uma avaliação para o meu caso de saúde.')">💬 WhatsApp Oficial</button>
                            <button type="button" class="fvs-preset-btn" style="flex:1; font-size:10px;" onclick="window.FalcoStudio.setQuickAnchor('#formulario-triagem')">📝 Âncora Formulário</button>
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                            <label style="font-size: 10.5px; color: var(--fvs-text-muted); display:flex; align-items:center; gap:5px; cursor:pointer;">
                                <input type="checkbox" id="fvs-input-target-blank" onchange="window.FalcoStudio.setLinkTarget(this.checked)">
                                <span>Abrir em nova aba (_blank)</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- ABA 3: IMAGEM -->
                <div id="fvs-tab-media" class="fvs-tab-content" style="display:none;">
                    <div class="fvs-field">
                        <div class="fvs-field-label">📁 Trocar Foto (Upload Local do Mac)</div>
                        <input type="file" id="fvs-file-input" accept="image/*" class="fvs-input" style="padding: 4px;" onchange="window.FalcoStudio.handleImageUpload(event)">
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">Ou URL Direta da Imagem</div>
                        <input type="text" id="fvs-img-url-input" class="fvs-input" placeholder="assets/foto.jpg ou https://..." oninput="window.FalcoStudio.setImageSrc(this.value)">
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">
                            <span>Largura da Imagem (Width)</span>
                            <span id="fvs-img-width-val" class="fvs-field-val">250px</span>
                        </div>
                        <div class="fvs-range-row">
                            <input type="range" id="fvs-input-img-width" min="40" max="1000" value="250" oninput="window.FalcoStudio.setImgWidth(this.value)">
                        </div>
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">Filtros da Imagem</div>
                        <div class="fvs-btn-grid">
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.setImgFilter('none')">Original</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.setImgFilter('grayscale(100%)')">P&B</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.setImgFilter('sepia(40%) contrast(110%)')">Dourado / Sépia</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.setImgFilter('brightness(1.15) contrast(1.1)')">Brilho Pro</button>
                        </div>
                    </div>
                </div>

                <!-- ABA 4: EFEITOS & ANIMAÇÕES PRO -->
                <div id="fvs-tab-effects" class="fvs-tab-content" style="display:none;">
                    
                    <!-- 1. FLUTAÇÃO & 3D -->
                    <div class="fvs-field">
                        <div class="fvs-field-label">🌟 Flutuação & Efeitos 3D</div>
                        <div class="fvs-btn-grid">
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('float-3d')">✨ Levitação 3D</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('disable-3d')" style="color:#f59e0b;">🔲 Tirar Distorção 3D</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('glow-gold')">🌟 Glow Dourado</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('remove-3d')" style="color:#ef4444; font-weight: bold;">🛑 Limpar Todos os Efeitos</button>
                        </div>
                    </div>

                    <!-- 2. LUZES DE STATUS (BEACONS PULSANTES) -->
                    <div class="fvs-field">
                        <div class="fvs-field-label">🟢 Luzes de Status (Pulsing Lights)</div>
                        <div class="fvs-btn-grid">
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.addStatusBeacon('green')">🟢 Luz Verde ON</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.addStatusBeacon('red')">🔴 Luz Vermelha</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.addStatusBeacon('gold')">🟡 Luz Dourada</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.addStatusBeacon('remove')" style="color:#aaa;">❌ Tirar Luz</button>
                        </div>
                    </div>

                    <!-- 3. EFEITOS PARA BOTÕES & CTAS -->
                    <div class="fvs-field">
                        <div class="fvs-field-label">🚀 Animações para Botões & CTAs</div>
                        <div class="fvs-btn-grid">
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('uppercase-pro')">🔠 Caixa Alta PRO</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('shimmer')">💫 Brilho Shimmer</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('pulse-heartbeat')">💓 Pulso Clique</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('whatsapp-glow')">🟢 WhatsApp Glow</button>
                        </div>
                    </div>

                    <!-- 4. GLASSMORPHISM & BORDAS PRO -->
                    <div class="fvs-field">
                        <div class="fvs-field-label">💎 Glassmorphism & Superfícies</div>
                        <div class="fvs-btn-grid">
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('glass-gold')">💎 Ultra Glass Ouro</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('glass-dark')">⬛ Dark Glass Ônix</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('neon-border')">✨ Borda Neon</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.applyEffect('gold-outline')">🛡️ Outline Dourado</button>
                        </div>
                    </div>
                </div>

                <!-- ABA 5: ESPAÇAMENTO & POSIÇÃO -->
                <div id="fvs-tab-spacing" class="fvs-tab-content" style="display:none;">
                    <div class="fvs-field">
                        <div class="fvs-field-label">Mover Posição (Pixels)</div>
                        <div class="fvs-btn-grid">
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.moveElement(0, -10)">⬆ Subir 10px</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.moveElement(0, 10)">⬇ Descer 10px</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.moveElement(-10, 0)">⬅ Esquerda 10px</button>
                            <button type="button" class="fvs-preset-btn" onclick="window.FalcoStudio.moveElement(10, 0)">➡ Direita 10px</button>
                        </div>
                    </div>

                    <div class="fvs-field">
                        <div class="fvs-field-label">
                            <span>Padding Interno</span>
                            <span id="fvs-padding-val" class="fvs-field-val">16px</span>
                        </div>
                        <div class="fvs-range-row">
                            <input type="range" id="fvs-input-padding" min="0" max="80" value="16" oninput="window.FalcoStudio.setPadding(this.value)">
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(inspector);

        // Launcher
        const launcher = document.createElement('button');
        launcher.id = 'falco-studio-launcher-btn';
        launcher.className = 'fvs-hidden';
        launcher.innerHTML = `<span>🎨 Abrir Studio Visual</span>`;
        launcher.onclick = () => window.FalcoStudio.toggleMode();
        document.body.appendChild(launcher);
    }

    // Inicialização do Motor do Studio
    window.FalcoStudio = {
        init: function () {
            injectGoogleFonts();
            injectStyles();
            injectStudioUI();

            document.body.classList.add('falco-studio-active', 'fvs-dock-top');
            this.enableInlineEditing(true);

            // Ouvinte global de cliques
            document.addEventListener('click', (e) => {
                if (!isEditMode) return;
                if (e.target.closest('#falco-top-studio-bar') || e.target.closest('#falco-floating-inspector') || e.target.closest('#falco-studio-launcher-btn') || e.target.closest('#falco-transform-gizmo')) {
                    return;
                }

                this.selectElement(e.target);
            }, true);

            // Ouvinte global de Mouse Move para Drag & Resize
            window.addEventListener('mousemove', (e) => {
                if (isResizing) {
                    this.handleResizeMove(e);
                } else if (isDragging) {
                    this.handleMoveDragMove(e);
                }
            });

            // Ouvinte global de Mouse Up
            window.addEventListener('mouseup', () => {
                if (isResizing || isDragging) {
                    isResizing = false;
                    isDragging = false;
                    currentHandle = null;
                    this.updateGizmoPosition();
                    this.hideGuides();
                }
            });

            // Recalcular posição do Gizmo ao rolar ou redimensionar
            window.addEventListener('scroll', () => {
                this.updateGizmoPosition();
                if (isDragging || isResizing) {
                    if (activeElement) this.showGuides(activeElement.getBoundingClientRect());
                }
            }, { passive: true });
            window.addEventListener('resize', () => {
                this.updateGizmoPosition();
                if (isDragging || isResizing) {
                    if (activeElement) this.showGuides(activeElement.getBoundingClientRect());
                }
            }, { passive: true });

            // Alt + Scroll do mouse para escalar qualquer elemento
            window.addEventListener('wheel', (e) => {
                if (isEditMode && e.altKey && activeElement) {
                    e.preventDefault();
                    const factor = e.deltaY < 0 ? 1.05 : 0.95;
                    this.quickScale(factor);
                }
            }, { passive: false });

            // Atalhos de Teclado (Ctrl+E para modo e Setas para mover o elemento selecionado)
            window.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
                    e.preventDefault();
                    this.toggleMode();
                    return;
                }

                // Mover elemento com as setas do teclado (quando não estiver digitando)
                if (isEditMode && activeElement && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                    if (document.activeElement.isContentEditable && document.activeElement === activeElement) {
                        return; // Deixa o cursor de texto normal
                    }

                    const step = e.shiftKey ? 10 : 2;
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.moveElement(0, -step);
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.moveElement(0, step);
                    } else if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        this.moveElement(-step, 0);
                    } else if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        this.moveElement(step, 0);
                    }
                }
            });

            // Carregar automaticamente alterações salvas no navegador
            this.loadSavedEdits();
        },

        // ── MOTOR DE RÉGUAS & LINHAS GUIAS DE ALINHAMENTO ──
        drawRulers: function (elementRect) {
            const canvasTop = document.getElementById('falco-ruler-top');
            const canvasLeft = document.getElementById('falco-ruler-left');
            if (!canvasTop || !canvasLeft) return;

            const width = window.innerWidth;
            const height = window.innerHeight;

            if (canvasTop.width !== width) canvasTop.width = width;
            if (canvasLeft.height !== height) canvasLeft.height = height;

            const ctxTop = canvasTop.getContext('2d');
            const ctxLeft = canvasLeft.getContext('2d');

            ctxTop.clearRect(0, 0, width, 24);
            ctxLeft.clearRect(0, 0, 24, height);

            // Fundo das réguas com visual escuro elegante
            ctxTop.fillStyle = 'rgba(9, 9, 12, 0.94)';
            ctxTop.fillRect(0, 0, width, 24);
            ctxLeft.fillStyle = 'rgba(9, 9, 12, 0.94)';
            ctxLeft.fillRect(0, 0, 24, height);

            // Borda dourada sutil
            ctxTop.strokeStyle = 'rgba(201, 169, 97, 0.4)';
            ctxTop.lineWidth = 1;
            ctxTop.beginPath();
            ctxTop.moveTo(0, 23.5);
            ctxTop.lineTo(width, 23.5);
            ctxTop.stroke();

            ctxLeft.strokeStyle = 'rgba(201, 169, 97, 0.4)';
            ctxLeft.lineWidth = 1;
            ctxLeft.beginPath();
            ctxLeft.moveTo(23.5, 0);
            ctxLeft.lineTo(23.5, height);
            ctxLeft.stroke();

            // Marcações em pixels (Top Ruler)
            ctxTop.font = '9px JetBrains Mono, monospace';
            ctxTop.fillStyle = '#dfc079';
            ctxTop.strokeStyle = 'rgba(255, 255, 255, 0.25)';

            for (let x = 0; x < width; x += 10) {
                const is100 = x % 100 === 0;
                const is50 = x % 50 === 0;
                const tickHeight = is100 ? 12 : is50 ? 8 : 4;

                ctxTop.beginPath();
                ctxTop.moveTo(x + 0.5, 24 - tickHeight);
                ctxTop.lineTo(x + 0.5, 24);
                ctxTop.stroke();

                if (is100 && x > 0) {
                    ctxTop.fillText(x.toString(), x + 3, 11);
                }
            }

            // Marcações em pixels (Left Ruler)
            ctxLeft.font = '9px JetBrains Mono, monospace';
            ctxLeft.fillStyle = '#dfc079';
            ctxLeft.strokeStyle = 'rgba(255, 255, 255, 0.25)';

            for (let y = 0; y < height; y += 10) {
                const is100 = y % 100 === 0;
                const is50 = y % 50 === 0;
                const tickWidth = is100 ? 12 : is50 ? 8 : 4;

                ctxLeft.beginPath();
                ctxLeft.moveTo(24 - tickWidth, y + 0.5);
                ctxLeft.lineTo(24, y + 0.5);
                ctxLeft.stroke();

                if (is100 && y > 0) {
                    ctxLeft.save();
                    ctxLeft.translate(11, y + 3);
                    ctxLeft.rotate(-Math.PI / 2);
                    ctxLeft.fillText(y.toString(), 0, 0);
                    ctxLeft.restore();
                }
            }

            // Destaque da projeção do elemento ativo nas réguas
            if (elementRect) {
                // Top Ruler Highlight
                ctxTop.fillStyle = 'rgba(201, 169, 97, 0.35)';
                ctxTop.fillRect(elementRect.left, 0, elementRect.width, 24);
                ctxTop.strokeStyle = '#c9a961';
                ctxTop.lineWidth = 2;
                ctxTop.strokeRect(elementRect.left, 0, elementRect.width, 23);

                // Left Ruler Highlight
                ctxLeft.fillStyle = 'rgba(201, 169, 97, 0.35)';
                ctxLeft.fillRect(0, elementRect.top, 24, elementRect.height);
                ctxLeft.strokeStyle = '#c9a961';
                ctxLeft.lineWidth = 2;
                ctxLeft.strokeRect(0, elementRect.top, 23, elementRect.height);
            }
        },

        showGuides: function (rect) {
            const overlay = document.getElementById('falco-alignment-overlay');
            if (!overlay || !rect) return;

            overlay.classList.add('active');

            const screenCenterX = window.innerWidth / 2;
            const elementCenterX = rect.left + rect.width / 2;
            const isNearScreenCenter = Math.abs(elementCenterX - screenCenterX) <= 8;

            const gLeft = document.getElementById('fvs-guide-left');
            const gRight = document.getElementById('fvs-guide-right');
            const gCenterX = document.getElementById('fvs-guide-center-x');
            const gTop = document.getElementById('fvs-guide-top');
            const gBottom = document.getElementById('fvs-guide-bottom');
            const gCenterY = document.getElementById('fvs-guide-center-y');
            const gScreenCenter = document.getElementById('fvs-guide-screen-center');
            const hud = document.getElementById('falco-hud-dimensions');
            const hudCoords = document.getElementById('fvs-hud-coords');
            const hudSize = document.getElementById('fvs-hud-size');
            const hudSnap = document.getElementById('fvs-hud-snap');

            if (gLeft) gLeft.style.left = `${Math.round(rect.left)}px`;
            if (gRight) gRight.style.left = `${Math.round(rect.right)}px`;
            if (gCenterX) gCenterX.style.left = `${Math.round(elementCenterX)}px`;

            if (gTop) gTop.style.top = `${Math.round(rect.top)}px`;
            if (gBottom) gBottom.style.top = `${Math.round(rect.bottom)}px`;
            if (gCenterY) gCenterY.style.top = `${Math.round(rect.top + rect.height / 2)}px`;

            if (gScreenCenter) {
                gScreenCenter.style.left = `${Math.round(screenCenterX)}px`;
                gScreenCenter.style.display = isNearScreenCenter ? 'block' : 'none';
            }

            if (hud && hudCoords && hudSize) {
                hud.style.display = 'flex';
                hudCoords.innerText = `X: ${Math.round(rect.left)}px  Y: ${Math.round(rect.top)}px`;
                hudSize.innerText = `${Math.round(rect.width)} × ${Math.round(rect.height)}px`;

                if (hudSnap) {
                    hudSnap.style.display = isNearScreenCenter ? 'inline-block' : 'none';
                }

                const hudTop = rect.top > 70 ? (rect.top - 42) : (rect.bottom + 12);
                const hudLeft = Math.max(30, Math.min(window.innerWidth - 250, rect.left));
                hud.style.top = `${hudTop}px`;
                hud.style.left = `${hudLeft}px`;
            }

            this.drawRulers(rect);
        },

        hideGuides: function () {
            const overlay = document.getElementById('falco-alignment-overlay');
            if (overlay) {
                overlay.classList.remove('active');
            }
        },

        selectElement: function (el) {
            if (!el || el === document.body || el === document.documentElement) return;

            if (activeElement) {
                activeElement.classList.remove('fvs-selected-element');
            }

            activeElement = el;
            activeElement.classList.add('fvs-selected-element');

            const tagChip = document.getElementById('fvs-selected-tag');
            const targetBadge = document.getElementById('fvs-target-type-badge');
            const uploadBtn = document.getElementById('fvs-gizmo-upload-btn');
            const tagName = el.tagName.toLowerCase();
            const textPreview = el.innerText ? `"${el.innerText.trim().substring(0, 24)}..."` : '';

            if (tagChip) tagChip.innerText = `<${tagName}> ${textPreview}`;
            if (targetBadge) targetBadge.innerText = `(${tagName.toUpperCase()})`;

            if (uploadBtn) {
                uploadBtn.style.display = (el.tagName === 'IMG' || el.style.backgroundImage) ? 'inline-flex' : 'none';
            }

            this.syncInspectorValues(el);
            this.updateGizmoPosition();
            this.toggleInspector(true);

            if (el.tagName === 'IMG') {
                this.switchTab('media', document.querySelectorAll('.fvs-tab-btn')[2]);
            } else if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                this.switchTab('style', document.querySelectorAll('.fvs-tab-btn')[0]);
            }
        },

        updateGizmoPosition: function () {
            const gizmo = document.getElementById('falco-transform-gizmo');
            if (!gizmo || !activeElement || !isEditMode) {
                if (gizmo) gizmo.classList.remove('active');
                return;
            }

            const rect = activeElement.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

            gizmo.style.top = `${rect.top + scrollTop}px`;
            gizmo.style.left = `${rect.left + scrollLeft}px`;
            gizmo.style.width = `${rect.width}px`;
            gizmo.style.height = `${rect.height}px`;
            gizmo.classList.add('active');
        },

        // ── ALTERNAR POSIÇÃO DA BARRA (TOPO / RODAPÉ) ──
        toggleDockPosition: function () {
            const topBar = document.getElementById('falco-top-studio-bar');
            const label = document.getElementById('fvs-dock-label');

            if (barPosition === 'top') {
                barPosition = 'bottom';
                document.body.classList.remove('fvs-dock-top');
                document.body.classList.add('fvs-dock-bottom');
                if (topBar) {
                    topBar.classList.remove('fvs-dock-top');
                    topBar.classList.add('fvs-dock-bottom');
                }
                if (label) label.innerText = '⬆ Barra no Topo';
            } else {
                barPosition = 'top';
                document.body.classList.remove('fvs-dock-bottom');
                document.body.classList.add('fvs-dock-top');
                if (topBar) {
                    topBar.classList.remove('fvs-dock-bottom');
                    topBar.classList.add('fvs-dock-top');
                }
                if (label) label.innerText = '⬇ Barra em Baixo';
            }
            this.updateGizmoPosition();
        },

        // ── REDIMENSIONAMENTO POR ARRASTO DO MOUSE ──
        startResize: function (e, handle) {
            e.preventDefault();
            e.stopPropagation();
            if (!activeElement) return;

            isResizing = true;
            currentHandle = handle;
            startX = e.clientX;
            startY = e.clientY;

            const rect = activeElement.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            this.showGuides(rect);
        },

        handleResizeMove: function (e) {
            if (!isResizing || !activeElement) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;

            const isImage = activeElement.tagName === 'IMG';
            const aspectRatio = startWidth / (startHeight || 1);

            if (currentHandle.includes('e')) newWidth = Math.max(30, startWidth + dx);
            if (currentHandle.includes('w')) newWidth = Math.max(30, startWidth - dx);
            if (currentHandle.includes('s')) newHeight = Math.max(20, startHeight + dy);
            if (currentHandle.includes('n')) newHeight = Math.max(20, startHeight - dy);

            if (isImage || e.shiftKey) {
                if (currentHandle.includes('e') || currentHandle.includes('w')) {
                    newHeight = newWidth / aspectRatio;
                } else {
                    newWidth = newHeight * aspectRatio;
                }
            }

            activeElement.style.width = `${Math.round(newWidth)}px`;
            activeElement.style.height = isImage ? 'auto' : `${Math.round(newHeight)}px`;
            activeElement.style.maxWidth = 'none';

            const updatedRect = activeElement.getBoundingClientRect();
            this.updateGizmoPosition();
            this.syncInspectorValues(activeElement);
            this.showGuides(updatedRect);
        },

        // ── ARRASTAR E MOVER UNIVERSAL COM SNAP MAGNÉTICO & RÉGUAS ──
        startMoveDrag: function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!activeElement) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const computed = window.getComputedStyle(activeElement);
            if (computed.position === 'static') {
                activeElement.style.position = 'relative';
            }

            startLeft = parseFloat(activeElement.style.left) || 0;
            startTop = parseFloat(activeElement.style.top) || 0;
            this.showGuides(activeElement.getBoundingClientRect());
        },

        handleMoveDragMove: function (e) {
            if (!isDragging || !activeElement) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let targetLeft = Math.round(startLeft + dx);
            let targetTop = Math.round(startTop + dy);

            activeElement.style.left = `${targetLeft}px`;
            activeElement.style.top = `${targetTop}px`;

            const rect = activeElement.getBoundingClientRect();
            const screenCenterX = window.innerWidth / 2;
            const elementCenterX = rect.left + rect.width / 2;

            // Snap magnético suave ao centro da tela (tolerância de 8px)
            if (Math.abs(elementCenterX - screenCenterX) <= 8) {
                const snapOffset = screenCenterX - elementCenterX;
                targetLeft = Math.round(targetLeft + snapOffset);
                activeElement.style.left = `${targetLeft}px`;
            }

            const updatedRect = activeElement.getBoundingClientRect();
            this.updateGizmoPosition();
            this.showGuides(updatedRect);
        },

        moveElement: function (deltaX, deltaY) {
            if (!activeElement) return;
            const computed = window.getComputedStyle(activeElement);
            if (computed.position === 'static') {
                activeElement.style.position = 'relative';
            }

            const currentLeft = parseFloat(activeElement.style.left) || 0;
            const currentTop = parseFloat(activeElement.style.top) || 0;

            activeElement.style.left = `${Math.round(currentLeft + deltaX)}px`;
            activeElement.style.top = `${Math.round(currentTop + deltaY)}px`;

            const updatedRect = activeElement.getBoundingClientRect();
            this.updateGizmoPosition();
            this.showGuides(updatedRect);

            clearTimeout(this._guideTimer);
            this._guideTimer = setTimeout(() => this.hideGuides(), 1200);
        },

        quickScale: function (factor) {
            if (!activeElement) return;

            const rect = activeElement.getBoundingClientRect();
            const currentWidth = rect.width || activeElement.offsetWidth || 200;
            const newWidth = Math.round(Math.max(30, currentWidth * factor));

            activeElement.style.width = `${newWidth}px`;
            activeElement.style.maxWidth = 'none';

            if (activeElement.tagName !== 'IMG') {
                const currentFontSize = parseInt(window.getComputedStyle(activeElement).fontSize) || 16;
                const newFontSize = Math.round(Math.max(10, currentFontSize * factor));
                activeElement.style.fontSize = `${newFontSize}px`;
            }

            this.updateGizmoPosition();
            this.syncInspectorValues(activeElement);
        },

        syncInspectorValues: function (el) {
            const style = window.getComputedStyle(el);

            const fontSize = parseInt(style.fontSize) || 16;
            const fontInput = document.getElementById('fvs-input-fontsize');
            const fontVal = document.getElementById('fvs-fontsize-val');
            if (fontInput) fontInput.value = fontSize;
            if (fontVal) fontVal.innerText = `${fontSize}px`;

            const textColor = this.rgbToHex(style.color);
            const textInput = document.getElementById('fvs-input-text-color');
            const textHex = document.getElementById('fvs-input-text-hex');
            if (textInput) textInput.value = textColor;
            if (textHex) textHex.value = textColor;

            const bgColor = this.rgbToHex(style.backgroundColor);
            const bgInput = document.getElementById('fvs-input-bg-color');
            const bgHex = document.getElementById('fvs-input-bg-hex');
            if (bgInput) bgInput.value = bgColor !== '#000000' ? bgColor : '#121216';
            if (bgHex) bgHex.value = bgColor;

            const radius = parseInt(style.borderRadius) || 0;
            const radiusInput = document.getElementById('fvs-input-radius');
            const radiusVal = document.getElementById('fvs-radius-val');
            if (radiusInput) radiusInput.value = radius;
            if (radiusVal) radiusVal.innerText = `${radius}px`;

            const padding = parseInt(style.paddingTop) || 0;
            const paddingInput = document.getElementById('fvs-input-padding');
            const paddingVal = document.getElementById('fvs-padding-val');
            if (paddingInput) paddingInput.value = padding;
            if (paddingVal) paddingVal.innerText = `${padding}px`;

            if (el.tagName === 'IMG') {
                const imgInput = document.getElementById('fvs-img-url-input');
                if (imgInput) imgInput.value = el.src || '';
                const imgWidth = parseInt(style.width) || el.offsetWidth || 250;
                const widthInput = document.getElementById('fvs-input-img-width');
                const widthVal = document.getElementById('fvs-img-width-val');
                if (widthInput) widthInput.value = imgWidth;
                if (widthVal) widthVal.innerText = `${imgWidth}px`;
            }

            const linkInput = document.getElementById('fvs-input-link');
            const targetBlankInput = document.getElementById('fvs-input-target-blank');
            const parentLink = el.tagName === 'A' ? el : el.closest('a');
            const buttonHref = el.getAttribute('data-fvs-href');
            const currentHref = parentLink ? (parentLink.getAttribute('href') || parentLink.href || '') : (buttonHref || '');

            if (linkInput) {
                linkInput.value = currentHref;
            }
            if (targetBlankInput) {
                const targetAttr = parentLink ? parentLink.getAttribute('target') : el.getAttribute('target');
                targetBlankInput.checked = targetAttr === '_blank';
            }
        },

        switchTab: function (tabName, btn) {
            document.querySelectorAll('.fvs-tab-content').forEach(c => c.style.display = 'none');
            document.querySelectorAll('.fvs-tab-btn').forEach(b => b.classList.remove('active'));

            const target = document.getElementById(`fvs-tab-${tabName}`);
            if (target) target.style.display = 'block';
            if (btn) btn.classList.add('active');
        },

        toggleMode: function () {
            isEditMode = !isEditMode;
            const topBar = document.getElementById('falco-top-studio-bar');
            const inspector = document.getElementById('falco-floating-inspector');
            const gizmo = document.getElementById('falco-transform-gizmo');
            const launcher = document.getElementById('falco-studio-launcher-btn');
            const btnMode = document.getElementById('fvs-btn-mode-toggle');

            if (isEditMode) {
                document.body.classList.add('falco-studio-active');
                if (barPosition === 'top') {
                    document.body.classList.add('fvs-dock-top');
                    document.body.classList.remove('fvs-dock-bottom');
                } else {
                    document.body.classList.add('fvs-dock-bottom');
                    document.body.classList.remove('fvs-dock-top');
                }
                if (topBar) topBar.classList.remove('fvs-hidden');
                if (inspector && !isInspectorCollapsed) inspector.classList.remove('fvs-hidden');
                if (launcher) launcher.classList.add('fvs-hidden');
                if (btnMode) btnMode.classList.add('active');
                this.enableInlineEditing(true);
                this.updateGizmoPosition();
            } else {
                document.body.classList.remove('falco-studio-active', 'fvs-dock-top', 'fvs-dock-bottom');
                if (topBar) topBar.classList.add('fvs-hidden');
                if (inspector) inspector.classList.add('fvs-hidden');
                if (gizmo) gizmo.classList.remove('active');
                if (launcher) launcher.classList.remove('fvs-hidden');
                if (btnMode) btnMode.classList.remove('active');
                this.enableInlineEditing(false);
                if (activeElement) activeElement.classList.remove('fvs-selected-element');
            }
        },

        toggleInspector: function (forceOpen) {
            const inspector = document.getElementById('falco-floating-inspector');
            const btn = document.getElementById('fvs-btn-toggle-inspector');
            if (!inspector) return;

            const isCurrentlyHidden = inspector.style.display === 'none' || 
                                      inspector.classList.contains('fvs-hidden') ||
                                      getComputedStyle(inspector).display === 'none';

            const shouldShow = forceOpen !== undefined ? forceOpen : isCurrentlyHidden;

            if (shouldShow) {
                inspector.style.display = 'flex';
                inspector.classList.remove('fvs-hidden');
                if (btn) btn.classList.add('active');
                isInspectorCollapsed = false;
            } else {
                inspector.style.display = 'none';
                inspector.classList.add('fvs-hidden');
                if (btn) btn.classList.remove('active');
                isInspectorCollapsed = true;
            }
        },

        enableInlineEditing: function (enable) {
            const editableTags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'A', 'BUTTON', 'LI', 'LABEL', 'DIV'];
            document.querySelectorAll('*').forEach(el => {
                if (el.closest('#falco-top-studio-bar') || el.closest('#falco-floating-inspector') || el.closest('#falco-studio-launcher-btn') || el.closest('#falco-transform-gizmo')) {
                    return;
                }
                if (editableTags.includes(el.tagName) && el.children.length === 0) {
                    el.contentEditable = enable ? "true" : "false";
                }
            });
        },

        setFontFamily: function (font) {
            if (!activeElement) return;
            activeElement.style.fontFamily = font;
        },

        setFontSize: function (size) {
            if (!activeElement) return;
            activeElement.style.fontSize = `${size}px`;
            const valDisplay = document.getElementById('fvs-fontsize-val');
            if (valDisplay) valDisplay.innerText = `${size}px`;
            this.updateGizmoPosition();
        },

        setTextColor: function (hex) {
            if (!activeElement) return;
            activeElement.style.color = hex;
            const input = document.getElementById('fvs-input-text-color');
            const hexInput = document.getElementById('fvs-input-text-hex');
            if (input) input.value = hex;
            if (hexInput) hexInput.value = hex;
        },

        setBgColor: function (bg) {
            if (!activeElement) return;
            activeElement.style.backgroundColor = bg;
            const input = document.getElementById('fvs-input-bg-color');
            const hexInput = document.getElementById('fvs-input-bg-hex');
            if (input && bg.startsWith('#')) input.value = bg;
            if (hexInput) hexInput.value = bg;
        },

        setRadius: function (r) {
            if (!activeElement) return;
            activeElement.style.borderRadius = `${r}px`;
            const valDisplay = document.getElementById('fvs-radius-val');
            if (valDisplay) valDisplay.innerText = `${r}px`;
        },

        setBorderColor: function (color) {
            if (!activeElement) return;
            activeElement.style.borderColor = color;
            if (!activeElement.style.borderStyle) activeElement.style.borderStyle = 'solid';
        },

        setBorderWidth: function (w) {
            if (!activeElement) return;
            activeElement.style.borderWidth = w;
            if (w !== '0px') {
                activeElement.style.borderStyle = 'solid';
                if (!activeElement.style.borderColor) activeElement.style.borderColor = '#c9a961';
            }
        },

        setPadding: function (p) {
            if (!activeElement) return;
            activeElement.style.padding = `${p}px`;
            const valDisplay = document.getElementById('fvs-padding-val');
            if (valDisplay) valDisplay.innerText = `${p}px`;
            this.updateGizmoPosition();
        },

        setTextAlign: function (align) {
            if (!activeElement) return;
            activeElement.style.textAlign = align;
        },

        setLink: function (href) {
            if (!activeElement) return;
            this.recordState('alterar link');
            const parentLink = activeElement.tagName === 'A' ? activeElement : activeElement.closest('a');
            if (parentLink) {
                parentLink.href = href;
            } else if (activeElement.tagName === 'BUTTON') {
                activeElement.setAttribute('data-fvs-href', href);
                activeElement.onclick = (e) => {
                    if (isEditMode) { e.preventDefault(); return; }
                    if (href.startsWith('#')) {
                        const targetEl = document.querySelector(href);
                        if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
                    } else {
                        window.open(href, activeElement.getAttribute('target') || '_blank');
                    }
                };
            }
            this.saveEdits();
        },

        setQuickWhatsApp: function (phone, defaultMsg) {
            const cleanPhone = phone.replace(/\D/g, '');
            const encoded = encodeURIComponent(defaultMsg || 'Olá, gostaria de um atendimento jurídico.');
            const waUrl = 'https://wa.me/55' + cleanPhone + '?text=' + encoded;
            const input = document.getElementById('fvs-input-link');
            if (input) input.value = waUrl;
            this.setLink(waUrl);
        },

        setQuickAnchor: function (anchorId) {
            const input = document.getElementById('fvs-input-link');
            if (input) input.value = anchorId;
            this.setLink(anchorId);
        },

        setLinkTarget: function (isNewTab) {
            if (!activeElement) return;
            this.recordState('alterar target do link');
            const parentLink = activeElement.tagName === 'A' ? activeElement : activeElement.closest('a');
            const targetVal = isNewTab ? '_blank' : '_self';
            if (parentLink) {
                parentLink.setAttribute('target', targetVal);
                if (isNewTab) parentLink.setAttribute('rel', 'noopener noreferrer');
                else parentLink.removeAttribute('rel');
            } else if (activeElement.tagName === 'BUTTON') {
                activeElement.setAttribute('target', targetVal);
            }
            this.saveEdits();
        },

        handleImageUpload: function (event) {
            const file = event.target.files[0];
            if (!file || !activeElement) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                if (activeElement.tagName === 'IMG') {
                    activeElement.src = dataUrl;
                } else {
                    activeElement.style.backgroundImage = `url(${dataUrl})`;
                    activeElement.style.backgroundSize = 'cover';
                    activeElement.style.backgroundPosition = 'center';
                }
                const urlInput = document.getElementById('fvs-img-url-input');
                if (urlInput) urlInput.value = dataUrl.substring(0, 50) + '... (Imagem Local)';
                this.updateGizmoPosition();
            };
            reader.readAsDataURL(file);
        },

        setImageSrc: function (url) {
            if (!activeElement) return;
            if (activeElement.tagName === 'IMG') {
                activeElement.src = url;
            } else {
                activeElement.style.backgroundImage = `url(${url})`;
            }
            this.updateGizmoPosition();
        },

        setImgWidth: function (w) {
            if (!activeElement) return;
            activeElement.style.width = `${w}px`;
            activeElement.style.maxWidth = 'none';
            const valDisplay = document.getElementById('fvs-img-width-val');
            if (valDisplay) valDisplay.innerText = `${w}px`;
            this.updateGizmoPosition();
        },

        setImgFilter: function (filter) {
            if (!activeElement) return;
            activeElement.style.filter = filter;
        },

        applyEffect: function (effectName) {
            if (!activeElement) return;
            recordState();

            switch (effectName) {
                case 'float-3d':
                    activeElement.classList.remove('fvs-no-3d');
                    activeElement.removeAttribute('data-fvs-disable-3d');
                    activeElement.classList.add('fvs-fx-float-3d');
                    activeElement.classList.remove('fvs-fx-pulse');
                    break;
                case 'disable-3d': {
                    // Desativa qualquer distorção 3D, perspectiva e animação de levitação
                    const wrapper3d = activeElement.closest('.portrait-3d-wrapper, [class*="3d"], [class*="portrait"]') || activeElement;
                    wrapper3d.classList.add('fvs-no-3d');
                    wrapper3d.setAttribute('data-fvs-disable-3d', 'true');
                    wrapper3d.style.animation = 'none';
                    wrapper3d.style.transform = 'none';
                    wrapper3d.style.perspective = 'none';

                    activeElement.classList.add('fvs-no-3d');
                    activeElement.setAttribute('data-fvs-disable-3d', 'true');
                    activeElement.classList.remove('fvs-fx-float-3d');
                    activeElement.style.animation = 'none';
                    activeElement.style.transform = 'none';
                    activeElement.style.perspective = 'none';

                    const cardChild = wrapper3d.querySelector('.portrait-frame-card') || activeElement;
                    if (cardChild) {
                        cardChild.classList.add('fvs-no-3d');
                        cardChild.setAttribute('data-fvs-disable-3d', 'true');
                        cardChild.style.transform = 'none';
                        cardChild.style.perspective = 'none';
                    }
                    showToast('Efeito 3D e distorção desativados com sucesso!', '🔲');
                    break;
                }
                case 'pulse-heartbeat':
                    activeElement.classList.add('fvs-fx-pulse');
                    activeElement.classList.remove('fvs-fx-float-3d');
                    break;
                case 'shimmer':
                    activeElement.classList.toggle('fvs-fx-shimmer');
                    break;
                case 'glow-gold':
                    activeElement.classList.toggle('fvs-fx-glow-gold');
                    break;
                case 'uppercase-pro':
                    activeElement.classList.toggle('fvs-fx-uppercase-pro');
                    break;
                case 'pill-shape':
                    activeElement.style.borderRadius = '9999px';
                    break;
                case 'glass-gold':
                    activeElement.classList.add('fvs-fx-glass-gold');
                    activeElement.classList.remove('fvs-fx-glass-dark');
                    break;
                case 'glass-dark':
                    activeElement.classList.add('fvs-fx-glass-dark');
                    activeElement.classList.remove('fvs-fx-glass-gold');
                    break;
                case 'neon-border':
                    activeElement.classList.toggle('fvs-fx-neon-border');
                    break;
                case 'gold-outline':
                    activeElement.style.background = 'transparent';
                    activeElement.style.color = '#dfc079';
                    activeElement.style.border = '2px solid #c9a961';
                    activeElement.style.boxShadow = '0 0 15px rgba(201, 169, 97, 0.25)';
                    break;
                case 'whatsapp-glow':
                    activeElement.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
                    activeElement.style.color = '#ffffff';
                    activeElement.style.boxShadow = '0 8px 25px rgba(34, 197, 94, 0.6)';
                    activeElement.style.border = 'none';
                    break;
                case 'remove-3d': {
                    // LIMPEZA TOTAL DE EFEITOS
                    activeElement.classList.remove(
                        'fvs-fx-float-3d', 'fvs-fx-pulse', 'fvs-fx-shimmer', 
                        'fvs-fx-glow-gold', 'fvs-fx-glass-gold', 'fvs-fx-glass-dark', 
                        'fvs-fx-neon-border', 'fvs-fx-uppercase-pro'
                    );
                    activeElement.classList.add('fvs-no-3d');
                    activeElement.setAttribute('data-fvs-disable-3d', 'true');

                    activeElement.style.animation = 'none';
                    activeElement.style.transform = 'none';
                    activeElement.style.boxShadow = '';
                    activeElement.style.filter = '';
                    activeElement.style.perspective = 'none';
                    activeElement.style.backdropFilter = '';

                    const wrapper3d = activeElement.closest('.portrait-3d-wrapper, [class*="3d"], [class*="portrait"]');
                    if (wrapper3d) {
                        wrapper3d.classList.add('fvs-no-3d');
                        wrapper3d.setAttribute('data-fvs-disable-3d', 'true');
                        wrapper3d.style.animation = 'none';
                        wrapper3d.style.transform = 'none';
                        wrapper3d.style.perspective = 'none';
                    }

                    showToast('Todos os efeitos e distorções foram limpos!', '🧹');
                    break;
                }
            }

            this.updateGizmoPosition();
            this.syncInspectorValues(activeElement);
        },

        addStatusBeacon: function (type) {
            if (!activeElement) return;

            const existingBeacon = activeElement.querySelector('.fvs-status-beacon');
            
            if (type === 'remove') {
                if (existingBeacon) existingBeacon.remove();
                this.updateGizmoPosition();
                return;
            }

            if (existingBeacon) {
                existingBeacon.className = `fvs-status-beacon fvs-beacon-${type}`;
            } else {
                const beacon = document.createElement('span');
                beacon.className = `fvs-status-beacon fvs-beacon-${type}`;
                beacon.title = type === 'green' ? 'Online / Aberto' : (type === 'red' ? 'Urgente / Alerta' : 'Destaque VIP');
                
                if (activeElement.childNodes.length > 0) {
                    activeElement.insertBefore(beacon, activeElement.firstChild);
                } else {
                    activeElement.appendChild(beacon);
                }
            }

            this.updateGizmoPosition();
        },

        undo: function () {
            if (undoStack.length === 0) return;
            const previousSnapshot = undoStack.pop();
            updateUndoButton();

            if (!Array.isArray(previousSnapshot)) return;

            const currentElements = Array.from(document.body.children).filter(el => {
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
                if (el.id && el.id.startsWith('falco-')) return false;
                return true;
            });

            previousSnapshot.forEach((item, idx) => {
                let target = null;
                if (item.id) target = document.getElementById(item.id);
                if (!target && currentElements[idx] && currentElements[idx].tagName === item.tagName) {
                    target = currentElements[idx];
                }
                if (target) {
                    const temp = document.createElement('div');
                    temp.innerHTML = item.outerHTML;
                    const replacement = temp.firstElementChild;
                    if (replacement) target.replaceWith(replacement);
                }
            });

            activeElement = null;
            this.updateGizmoPosition();
            showToast('Ação desfeita com sucesso!', '↩️');
        },

        saveEdits: async function () {
            const cleanHtml = this.getCleanHtml();
            let savedToDisk = false;

            // 1. Tenta salvar diretamente no arquivo no disco através do Dev Server local
            try {
                const targetFile = window.location.pathname.includes('formulario-completo') ? 'formulario-completo.html' : 'index.html';
                const response = await fetch('/api/save-html', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: window.location.pathname,
                        filename: targetFile,
                        html: cleanHtml
                    })
                });

                if (response.ok) {
                    const resJson = await response.json();
                    if (resJson && resJson.success) {
                        savedToDisk = true;
                    }
                }
            } catch (err) {
                console.log('[Falco Studio] Servidor de disco offline, persistindo no armazenamento local do navegador...');
            }

            // 2. Salva snapshot no IndexedDB e LocalStorage para persistência instantânea no navegador
            const pageElements = Array.from(document.body.children).filter(el => {
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
                if (el.id && el.id.startsWith('falco-')) return false;
                return true;
            });

            const snapshot = pageElements.map(el => {
                const clone = el.cloneNode(true);
                clone.querySelectorAll('#falco-top-studio-bar, #falco-editor-bar, #falco-floating-inspector, #falco-transform-gizmo, #falco-alignment-overlay, #falco-studio-launcher-btn, #falco-studio-styles, #falco-studio-fonts, #falco-studio-toast').forEach(c => c.remove());
                clone.querySelectorAll('.fvs-selected-element').forEach(c => c.classList.remove('fvs-selected-element'));
                clone.querySelectorAll('[contenteditable]').forEach(c => c.removeAttribute('contenteditable'));
                return {
                    id: el.id || '',
                    tagName: el.tagName,
                    outerHTML: clone.outerHTML
                };
            });

            await saveToDB(STORAGE_KEY, snapshot);

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
            } catch (e) {
                // Quota excedida se houver imagens base64 muito grandes
            }

            if (savedToDisk) {
                showToast('✅ Salvo no arquivo ' + (window.location.pathname.includes('formulario-completo') ? 'formulario-completo.html' : 'index.html') + ' no disco e no navegador!', '💾');
            } else {
                showToast('Alterações salvas no navegador! Para salvar permanentemente no arquivo, execute "npm run dev".', '💾');
            }
        },

        loadSavedEdits: async function () {
            try {
                // 1. Tenta carregar do IndexedDB
                let snapshot = await loadFromDB(STORAGE_KEY);

                // 2. Fallback para LocalStorage
                if (!snapshot) {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    if (raw) {
                        try { snapshot = JSON.parse(raw); } catch (e) { snapshot = null; }
                    }
                }

                if (!Array.isArray(snapshot) || snapshot.length === 0) return;

                const currentElements = Array.from(document.body.children).filter(el => {
                    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
                    if (el.id && el.id.startsWith('falco-')) return false;
                    return true;
                });

                snapshot.forEach((item, idx) => {
                    let target = null;
                    if (item.id) target = document.getElementById(item.id);
                    if (!target && currentElements[idx] && currentElements[idx].tagName === item.tagName) {
                        target = currentElements[idx];
                    }
                    if (target) {
                        const temp = document.createElement('div');
                        temp.innerHTML = item.outerHTML;
                        const replacement = temp.firstElementChild;
                        if (replacement) target.replaceWith(replacement);
                    }
                });

                if (isEditMode) {
                    this.enableInlineEditing(true);
                }
                this.updateGizmoPosition();

                console.log('✅ Falco Studio: Alterações anteriores restauradas com sucesso!');
            } catch (err) {
                console.warn('Erro ao restaurar edições salvas:', err);
            }
        },

        resetOriginal: async function () {
            if (!confirm('Deseja descartar as alterações e restaurar a página original?')) return;
            localStorage.removeItem(STORAGE_KEY);
            const db = await openDatabase();
            if (db) {
                try {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    tx.objectStore(STORE_NAME).delete(STORAGE_KEY);
                } catch(e) {}
            }
            window.location.reload();
        },

        getCleanHtml: function () {
            const clone = document.documentElement.cloneNode(true);
            
            // Remove Studio elements
            clone.querySelectorAll('#falco-top-studio-bar, #falco-editor-bar, #falco-floating-inspector, #falco-transform-gizmo, #falco-alignment-overlay, #falco-studio-launcher-btn, #falco-studio-styles, #falco-studio-fonts, #falco-studio-toast, script[src="falco-visual-studio.js"]').forEach(el => el.remove());

            // Remove Browser Extension elements & injections
            clone.querySelectorAll('vmaker-container, grammarly-desktop-integration, reclameaqui-extension-pin, [id^="monica-"], [id^="speechify-"], .ch-sonic-improver, .chat-sonic-chromane-notification, [id^="azddb"], script[src^="chrome-extension://"], link[href^="chrome-extension://"]').forEach(el => el.remove());

            clone.classList.remove('falco-studio-active', 'fvs-dock-top', 'fvs-dock-bottom');
            
            // Remove helper attributes and classes
            clone.querySelectorAll('*').forEach(el => {
                el.classList.remove('fvs-selected-element');
                el.removeAttribute('contenteditable');
                el.removeAttribute('bis_skin_checked');
                el.removeAttribute('data-fvs-selected');
                if (el.getAttribute('class') === '') el.removeAttribute('class');
            });

            return '<!DOCTYPE html>\n' + clone.outerHTML;
        },

        downloadHtml: function () {
            const cleanHtml = this.getCleanHtml();
            const blob = new Blob([cleanHtml], { type: 'text/html' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'index-editado.html';
            link.click();
        },

        copyCleanHtml: function () {
            const cleanHtml = this.getCleanHtml();
            navigator.clipboard.writeText(cleanHtml).then(() => {
                alert('📋 Código HTML limpo copiado para a área de transferência!');
            });
        },

        rgbToHex: function (rgb) {
            if (!rgb || rgb.startsWith('#')) return rgb || '#ffffff';
            const res = rgb.match(/\d+/g);
            if (!res || res.length < 3) return '#ffffff';
            return "#" + ((1 << 24) + (parseInt(res[0]) << 16) + (parseInt(res[1]) << 8) + parseInt(res[2])).toString(16).slice(1);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.FalcoStudio.init());
    } else {
        window.FalcoStudio.init();
    }
})();


        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                // Se não estiver dentro de um input/textarea normal
                if (!['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
                    e.preventDefault();
                    window.FalcoStudio.undo();
                }
            }
        });
