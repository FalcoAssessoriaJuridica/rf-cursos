import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // chave do serviço OMR: lida só no servidor de desenvolvimento, nunca entra no bundle
  const omrKey = loadEnv(mode, process.cwd(), '').OMR_API_KEY || ''

  // Conteúdo de demonstração (cursos/alunos fake): ligado em desenvolvimento;
  // em produção só com VITE_ENABLE_DEMO=true.
  let outDir = ''
  const demoEnabled = mode === 'development' || env.VITE_ENABLE_DEMO === 'true'

  return {
    // uma única cópia do React (o Remotion Player da landing usa hooks do React da aplicação)
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['remotion', '@remotion/player'] },
    plugins: [
      react(),
      // PWA: guarda o aplicativo (telas e sons da bateria) no aparelho para abrir sem internet. Nada vindo do Supabase/Stripe é guardado
      // pelo service worker (dados e login passam sempre pela rede); as partituras salvas ficam no IndexedDB (src/lib/offlineScores.js).
      // O manifesto é o arquivo public/manifest.webmanifest. Atualização com aviso ao aluno (registerType: 'prompt'), sem recarregar sozinho.
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,webmanifest}', 'drums/**/*.{mp3,json}', 'logo-rf.png', 'icons/*.png'],
          // landing (marketing) e conteúdo de exemplo não entram no cache inicial
          globIgnores: ['**/Landing-*', 'demo/**', 'partituras-exemplo/**'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/supabase-api/, /^\/__/, /^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            // imagens do app e capas públicas dos cursos: guardadas conforme o uso
            { urlPattern: ({ request }) => request.destination === 'image', handler: 'StaleWhileRevalidate', options: { cacheName: 'imagens', expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 3600 } } },
            { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'fontes', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 } } },
          ],
        },
      }),
      {
        // Só em desenvolvimento: guarda a configuração dos cursos demo (capas/matrículas) em demo-state.json
        name: 'demo-state',
        apply: 'serve',
        configureServer(server) {
          const file = path.resolve(server.config.root, 'demo-state.json')
          server.middlewares.use('/__demo-state', (req, res) => {
            const read = () => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} } }
            res.setHeader('Content-Type', 'application/json')
            if (req.method === 'GET') return res.end(JSON.stringify(read()))
            if (req.method !== 'POST') { res.statusCode = 405; return res.end('{}') }
            let raw = ''
            req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy() })
            req.on('end', () => {
              try {
                const incoming = JSON.parse(raw)
                const next = read()
                for (const [k, v] of Object.entries(incoming)) {
                  if (/^rf_demo_(covers|enrollments)$/.test(k) && typeof v === 'string') next[k] = v
                }
                writeFileSync(file, JSON.stringify(next, null, 2))
                res.end('{"ok":true}')
              } catch {
                res.statusCode = 400
                res.end('{"ok":false}')
              }
            })
          })
        },
      },
      {
        // Remove os arquivos de demonstração (public/demo) do build quando o modo demo está desligado
        name: 'strip-demo-assets',
        apply: 'build',
        configResolved(config) {
          outDir = path.resolve(config.root, config.build.outDir)
        },
        closeBundle() {
          if (demoEnabled || !outDir) return
          rmSync(path.join(outDir, 'demo'), { recursive: true, force: true })
        },
      },
    ],
    define: {
      __DEMO_ENABLED__: JSON.stringify(demoEnabled),
    },
    server: {
      proxy: {
        '/__omr': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          timeout: 420000,
          proxyTimeout: 420000,
          rewrite: (p) => p.replace(/^\/__omr/, ''),
          headers: { 'X-API-Key': omrKey },
        },
        '/supabase-api': {
          // padrão: produção; para ensaiar em um Supabase local, rode com VITE_SUPABASE_URL=http://127.0.0.1:58321
          target: env.VITE_SUPABASE_URL || 'https://bghvzdfikfhceekoxtxg.supabase.co',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/supabase-api/, ''),
        },
      },
    },
  }
})
