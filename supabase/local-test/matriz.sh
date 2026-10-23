#!/usr/bin/env bash
# Roda uma matriz de testes de RLS e resume: ./matriz.sh rls_matrix.sql
cd "$(dirname "$0")"
out=$(docker exec -i supabase_db_rf-cursos psql -U postgres -d postgres -q -t -A < "${1:-rls_matrix.sql}" 2>&1)
echo "$out" | grep -E "RESULTADO FALHOU|ERROR" || true
ok=$(echo "$out" | grep -c "RESULTADO ok"); falhas=$(echo "$out" | grep -c "RESULTADO FALHOU")
echo "→ $ok ok, $falhas falhas"
[ "$falhas" = 0 ] && ! echo "$out" | grep -q "^ERROR"
