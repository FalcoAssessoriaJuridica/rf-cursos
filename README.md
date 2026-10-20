## Usage

```bash
$ npm install # or pnpm install or yarn install
```

### Learn more on the [Solid Website](https://solidjs.com) and come chat with us on our [Discord](https://discord.com/invite/solidjs)

## Available Scripts

In the project directory, you can run:

### `npm run dev`

Runs the app in the development mode.<br>
Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

### `npm run build`

Builds the app for production to the `dist` folder.<br>
It correctly bundles Solid in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br>
Your app is ready to be deployed!

## Deployment

Learn more about deploying your application with the [documentations](https://vite.dev/guide/static-deploy.html)

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Conexão com o Supabase |
| `VITE_ADMIN_MASTER_PASSWORD` | Senha do administrador. No build ela vira um hash (PBKDF2); o texto puro não vai para o bundle. **Sem ela, o login de admin fica desativado** (não há senha padrão). |
| `VITE_ENABLE_DEMO` | `true` inclui cursos/alunos de demonstração e `public/demo` no build. Em desenvolvimento o modo demo é sempre ligado; em produção fica desligado por padrão. |

Reinicie o servidor de desenvolvimento ao alterar `vite.config.js` ou `tailwind.config.js`.
