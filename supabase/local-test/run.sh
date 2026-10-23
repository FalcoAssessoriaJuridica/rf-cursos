#!/usr/bin/env bash
# Ensaio local da migração de login (Supabase local em 58321/58322). Uso: supabase/local-test/run.sh <fase>
#   base   : esquema base + migrações 0000, 0004..0007 + 0001 (RLS com políticas legacy) + dados de teste
set -euo pipefail
cd "$(dirname "$0")/.."
PG=(docker exec -i supabase_db_rf-cursos psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q)   # sem psql instalado: usa o do container
sql() { "${PG[@]}" < "$1"; }
case "${1:-base}" in
  base)
    "${PG[@]}" -c "do \$\$ declare r record; begin for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop execute format('drop policy %I on storage.objects', r.policyname); end loop; end \$\$;" -c "drop schema if exists public cascade; create schema public; grant usage on schema public to postgres, anon, authenticated, service_role; alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role; alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role; alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;"
    sql local-test/00_base_schema.sql
    for f in 0000_storage_course_materials 0004_perfis_dados_extras 0005_partituras 0006_acervo_partituras 0007_partitura_sincronia_video 0001_auth_rls_prepare 0008_partituras_rls; do echo "→ $f"; sql migrations/$f.sql; done
    sql local-test/01_seed.sql
    echo "base pronta" ;;
  *) echo "fase desconhecida"; exit 1 ;;
esac
