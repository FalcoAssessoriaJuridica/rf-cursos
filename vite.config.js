import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { pbkdf2Sync } from 'node:crypto'
import { rmSync } from 'node:fs'
import path from 'node:path'

// Parâmetros do hash da senha de admin (derivado no build; o texto puro nunca vai para o bundle)
const ADMIN_SALT = 'rf-cursos/admin/v1'
const ADMIN_ITERATIONS = 120000

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // Conteúdo de demonstração (cursos/alunos fake): ligado em desenvolvimento;
  // em produção só com VITE_ENABLE_DEMO=true.
  let outDir = ''
  const demoEnabled = mode === 'development' || env.VITE_ENABLE_DEMO === 'true'

  // Sem senha configurada = login de admin desativado (não há mais senha padrão).
  const password = env.VITE_ADMIN_MASTER_PASSWORD || ''
  const adminHash = password
    ? pbkdf2Sync(password, ADMIN_SALT, ADMIN_ITERATIONS, 32, 'sha256').toString('hex')
    : ''

  return {
    plugins: [
      react(),
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
      __ADMIN_HASH__: JSON.stringify(adminHash),
      __ADMIN_SALT__: JSON.stringify(ADMIN_SALT),
      __ADMIN_ITERATIONS__: JSON.stringify(ADMIN_ITERATIONS),
    },
    server: {
      proxy: {
        '/supabase-api': {
          target: 'https://bghvzdfikfhceekoxtxg.supabase.co',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/supabase-api/, ''),
        },
      },
    },
  }
})
