-- ─────────────────────────────────────────────────────────────────────────────
-- benchmark.sql  –  Comparativa de tiempos: sin índice / B-tree / Skip List
-- Ejecutar dentro del contenedor:
--   docker exec -it knoo_pg psql -U knoo_user -d knoo -f /benchmark.sql
-- ─────────────────────────────────────────────────────────────────────────────

\echo '============================================================'
\echo ' BENCHMARK  –  skip list vs B-tree vs seq scan'
\echo ' Dataset: bench_items (10 000 filas)'
\echo '============================================================'

ANALYZE bench_items;

-- CASO 1: Seq Scan (sin ningún índice activo)
\echo ''
\echo '--- CASO 1: Sequential Scan (sin índice) ---'
SET enable_indexscan  = off;
SET enable_bitmapscan = off;
SET enable_seqscan    = on;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, valor FROM bench_items WHERE valor =  106820;

-- CASO 2: B-tree estándar (eliminamos el skiplist para que no compita)
\echo ''
\echo '--- CASO 2: B-tree Index Scan ---'
DROP INDEX IF EXISTS idx_bench_skiplist;

SET enable_indexscan  = on;
SET enable_bitmapscan = on;
SET enable_seqscan    = off;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, valor FROM bench_items WHERE valor = 106820;

-- CASO 3: Skip List (eliminamos el B-tree, mismo motivo)
\echo ''
\echo '--- CASO 3: Skip List Index ---'
DROP INDEX IF EXISTS idx_bench_btree;
CREATE INDEX idx_bench_skiplist ON bench_items USING skiplist (valor);
ANALYZE bench_items;

SET enable_indexscan  = on;
SET enable_bitmapscan = off;
SET enable_seqscan    = off;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, valor FROM bench_items WHERE valor =  106820;

-- Restaurar: dejar ambos índices disponibles de nuevo
CREATE INDEX IF NOT EXISTS idx_bench_btree ON bench_items USING btree (valor);

RESET enable_indexscan;
RESET enable_bitmapscan;
RESET enable_seqscan;

\echo ''
\echo '============================================================'
\echo ' Copia los "Execution Time: X ms" de arriba en la tabla'
\echo ' comparativa del README/informe.'
\echo '============================================================'