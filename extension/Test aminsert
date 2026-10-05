-- Prueba Tarea 10: aminsert
DROP EXTENSION IF EXISTS skiplist CASCADE;
CREATE EXTENSION skiplist;

DROP TABLE IF EXISTS t;
CREATE TABLE t (id int);
INSERT INTO t VALUES (10), (20), (30);          -- filas previas al indice

CREATE INDEX t_sl ON t USING skiplist (id);     -- ambuild
SELECT skiplist_dump('t_sl');                   -- estado inicial

INSERT INTO t VALUES (15), (5), (25);           -- aminsert (no debe tronar)
SELECT skiplist_dump('t_sl');                   -- deben aparecer 5, 15, 25

-- 1 pagina header + 6 nodos = 7
SELECT pg_relation_size('t_sl') / 8192 AS paginas_indice;
SELECT count(*) AS filas_tabla FROM t;

-- prueba con mas datos (incluye valores extremos)
INSERT INTO t SELECT generate_series(100, 130);
INSERT INTO t VALUES (2147483647), (-2147483648);
SELECT skiplist_dump('t_sl');
SELECT pg_relation_size('t_sl') / 8192 AS paginas_indice, count(*) AS filas_tabla FROM t;
