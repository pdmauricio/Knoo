-- scripts/escalabilidad.sql
-- Mide construcción, tamaño y búsqueda del índice skiplist (y tamaño del B-tree
-- como referencia) para N claves enteras ÚNICAS en orden aleatorio (como D2).
--
-- Uso (una corrida por tamaño; ver Time: en cada sentencia):
--   docker exec -i knoo_pg psql -U knoo_user -d knoo -v N=100000 < scripts/escalabilidad.sql
--
-- Los datos son reproducibles (setseed). No uses skiplist_dump con N grande.

\set ON_ERROR_STOP on
\timing on

SELECT setseed(0.42);
DROP TABLE IF EXISTS esc;
CREATE TABLE esc (id serial, valor int);
INSERT INTO esc (valor) SELECT x FROM generate_series(1, :N) x ORDER BY random();
ANALYZE esc;

\echo '=== CONSTRUCCION del indice skiplist (ver Time:) ==='
CREATE INDEX esc_sl ON esc USING skiplist (valor);
SELECT pg_size_pretty(pg_relation_size('esc_sl')) AS tamano_skiplist,
       pg_relation_size('esc_sl') / 8192          AS paginas;

SET enable_seqscan = off;
\echo '=== BUSQUEDA por igualdad (fijarse en Execution Time y Buffers) ==='
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM esc WHERE valor = :N / 2;
\echo '=== RANGO de 100 claves ==='
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM esc WHERE valor BETWEEN :N / 2 AND :N / 2 + 99;
RESET enable_seqscan;
DROP INDEX esc_sl;

\echo '=== B-tree de referencia ==='
CREATE INDEX esc_bt ON esc USING btree (valor);
SELECT pg_size_pretty(pg_relation_size('esc_bt')) AS tamano_btree;
DROP INDEX esc_bt;
