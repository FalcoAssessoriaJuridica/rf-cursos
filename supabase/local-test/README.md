# Ensaio local da migração de login

Supabase local (portas 58321 API, 58322 banco; escolhidas para não colidir com outros projetos) usado para ensaiar o `0001`, `0008`, a
importação, a função `admin-students`, o front e o cutover **sem tocar em produção**.

```bash
supabase start -x studio,imgproxy,logflare,vector,mailpit         # sobe o stack local (config em supabase/config.toml)
./supabase/local-test/run.sh base          # esquema base + migrações + dados de teste (apaga e recria o schema public local)
./supabase/local-test/matriz.sh            # matriz de RLS de aluno/admin (49 verificações)
SUPABASE_URL=http://127.0.0.1:58321 SUPABASE_SERVICE_ROLE_KEY=<chave local> ADMIN_EMAIL=admin@teste.local ADMIN_INITIAL_PASSWORD='SenhaAdminLocal!2026' \
  node scripts/import-auth-users.mjs      # importa os perfis do seed para o Auth local
supabase functions serve admin-students --env-file <arquivo com ALLOWED_ORIGIN=http://localhost:5200>
```
Para abrir o app apontando para o Supabase local, crie `.env.local` (ignorado pelo Git) com `VITE_SUPABASE_URL=http://127.0.0.1:58321` e a
`VITE_SUPABASE_ANON_KEY` local (`supabase status`). Depois do cutover local (`0002`): `./supabase/local-test/matriz.sh rls_matrix_anon.sql`.

Os arquivos `00_base_schema.sql` e `01_seed.sql` existem só aqui: em produção essas tabelas foram criadas à mão, antes das migrações.
Observação: o contêiner de Auth local às vezes perde a conexão com o banco depois de um tempo; `docker restart supabase_auth_rf-cursos` resolve.
