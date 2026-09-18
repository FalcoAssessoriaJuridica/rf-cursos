/**
 * ============================================================================
 * 🚀 FALCO DEV SERVER & DIRECT DISK PERSISTENCE ENGINE
 * ============================================================================
 * Servidor de desenvolvimento local em Node.js puro (zero dependências externas).
 * - Serve arquivos estáticos com suporte a MIME types e SPA.
 * - Endpoint POST /api/save-html para gravar alterações visuais do Studio diretamente no arquivo no disco!
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    // CORS headers para flexibilidade em ambiente local
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // ── ENDPOINT DE GRAVAÇÃO DIRETA NO DISCO ──
    if (req.method === 'POST' && req.url === '/api/save-html') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 50 * 1024 * 1024) { // Limite de 50MB (para páginas com imagens base64)
                req.destroy();
            }
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                let targetFilename = 'index.html';

                if (data.filename) {
                    targetFilename = path.basename(data.filename);
                } else if (data.path) {
                    const cleanPath = data.path.split('?')[0];
                    if (cleanPath.endsWith('.html')) {
                        targetFilename = path.basename(cleanPath);
                    }
                }

                const filePath = path.join(ROOT_DIR, targetFilename);

                if (!filePath.startsWith(ROOT_DIR)) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Acesso não autorizado.' }));
                    return;
                }

                // Cria backup de segurança antes de sobrescrever
                if (fs.existsSync(filePath)) {
                    const backupPath = filePath + '.bak';
                    fs.copyFileSync(filePath, backupPath);
                }

                let cleanContent = data.html;
                const htmlCloseIdx = cleanContent.lastIndexOf('</html>');
                if (htmlCloseIdx !== -1) {
                    cleanContent = cleanContent.substring(0, htmlCloseIdx + 7) + '\n';
                }

                // Grava o arquivo com o HTML atualizado
                fs.writeFileSync(filePath, cleanContent, 'utf-8');

                console.log(`[Falco Studio] 💾 Arquivo gravado com sucesso no disco: ${targetFilename}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    message: `Arquivo ${targetFilename} salvo com sucesso no disco!` 
                }));
            } catch (err) {
                console.error('[Falco Studio] Erro ao salvar arquivo:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // ── SERVIDOR DE ARQUIVOS ESTÁTICOS ──
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
    }

    let filePath = path.join(ROOT_DIR, reqPath);

    // Evita Directory Traversal
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Proibido');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Fallback para index.html (SPA)
            filePath = path.join(ROOT_DIR, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, content) => {
            if (readErr) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Arquivo não encontrado');
                return;
            }

            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            res.end(content);
        });
    });
});

function startServer(portToTry) {
    server.removeAllListeners('error');
    
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ Porta ${portToTry} ocupada. Tentando porta ${portToTry + 1}...`);
            startServer(portToTry + 1);
        } else {
            console.error('Erro no servidor:', err);
        }
    });

    server.listen(portToTry, () => {
        console.log(`\n==================================================`);
        console.log(`🚀 FALCO DEV SERVER RODANDO`);
        console.log(`📍 URL: http://localhost:${portToTry}`);
        console.log(`💾 Direct Disk Persistence: ATIVO (/api/save-html)`);
        console.log(`==================================================\n`);
    });
}

startServer(Number(PORT));
