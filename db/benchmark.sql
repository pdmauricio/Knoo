-- ─────────────────────────────────────────────────────────────────────────────
-- benchmark.sql  –  Comparativa de tiempos: sin índice / B-tree / Skip List
-- Ejecutar dentro del contenedor:
--   docker exec -it knoo_pg psql -U knoo_user -d knoo -f /benchmark.sql
-- ─────────────────────────────────────────────────────────────────────────────

\echo '============================================================'
\echo ' BENCHMARK  –  skip list vs B-tree vs seq scan'
\echo ' Dataset: bench_items (10 000 filas)'
\echo '============================================================'

-- ─── Configuración ───────────────────────────────────────────────────────────
-- Aseguramos estadísticas frescas antes de medir
ANALYZE bench_items;

-- ─────────────────────────────────────────────────────────────────────────────
-- CASO 1: Seq Scan (sin ningún índice activo)
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '--- CASO 1: Sequential Scan (sin índice) ---'
SET enable_indexscan  = off;
SET enable_bitmapscan = off;
SET enable_seqscan    = on;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, valor FROM bench_items WHERE valor = 42000;

-- ─────────────────────────────────────────────────────────────────────────────
-- CASO 2: B-tree estándar
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '--- CASO 2: B-tree Index Scan ---'
SET enable_indexscan  = on;
SET enable_bitmapscan = on;
SET enable_seqscan    = off;

-- Forzamos el índice B-tree explícitamente
/*+ IndexScan(bench_items idx_bench_btree) */
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT /*+ IndexScan(bench_items idx_bench_btree) */
       id, valor
FROM   bench_items
WHERE  valor = 42000;

-- ─────────────────────────────────────────────────────────────────────────────
-- CASO 3: Skip List (extensión custom)
-- ─────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '--- CASO 3: Skip List Index ---'
-- Con amcostestimate mejorado, Postgres debería elegirlo solo.
-- Lo habilitamos explícitamente por si acaso:
SET enable_indexscan  = on;
SET enable_bitmapscan = off;
SET enable_seqscan    = off;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, valor FROM bench_items WHERE valor = 42000;

-- ─────────────────────────────────────────────────────────────────────────────
-- Restaurar defaults
-- ─────────────────────────────────────────────────────────────────────────────
RESET enable_indexscan;
RESET enable_bitmapscan;
RESET enable_seqscan;

\echo ''
\echo '============================================================'
\echo ' Copia los "Execution Time: X ms" de arriba en la tabla'
\echo ' comparativa del README/informe.'
\echo '============================================================'
