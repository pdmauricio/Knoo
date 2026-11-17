-- extension/test_rangos.sql
-- Compara, para cientos de predicados aleatorios, el conteo obtenido USANDO el
-- índice skiplist contra el conteo de referencia SIN índice (recorrido secuencial).
-- Cualquier diferencia significa que el índice devuelve resultados incorrectos.
--
-- Uso:
--   docker exec -i knoo_pg psql -U knoo_user -d knoo < extension/test_rangos.sql

\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS skiplist;

DROP TABLE IF EXISTS t_rng;
CREATE TABLE t_rng (v int);
SELECT setseed(0.42);
INSERT INTO t_rng SELECT (random() * 1000)::int FROM generate_series(1, 5000);  -- con duplicados
INSERT INTO t_rng VALUES (2147483647), (-2147483648), (0), (1000);              -- extremos
CREATE INDEX t_rng_sl ON t_rng USING skiplist (v);
ANALYZE t_rng;

\echo '--- Plan con el índice (debe decir Index Scan using t_rng_sl) ---'
SET enable_seqscan = off;
EXPLAIN SELECT count(*) FROM t_rng WHERE v > 500;
RESET enable_seqscan;

DO $$
DECLARE
    ops   text[] := ARRAY['<', '<=', '=', '>=', '>'];
    fijos int[]  := ARRAY[-2147483648, 0, 500, 1000, 2147483647];
    op text; x int; y int;
    c_idx bigint; c_ref bigint;
    i int; fallos int := 0; total int := 0;
    q text;
BEGIN
    -- 1) Un solo operador, 300 casos
    FOR i IN 1..300 LOOP
        op := ops[1 + floor(random() * 5)::int];
        IF random() < 0.2 THEN
            x := fijos[1 + floor(random() * 5)::int];
        ELSE
            x := floor(random() * 1100)::int - 50;
        END IF;
        q := format('SELECT count(*) FROM t_rng WHERE v %s %s', op, x);

        PERFORM set_config('enable_seqscan',    'off', true);
        PERFORM set_config('enable_bitmapscan', 'off', true);
        PERFORM set_config('enable_indexscan',  'on',  true);
        EXECUTE q INTO c_idx;

        PERFORM set_config('enable_seqscan',    'on',  true);
        PERFORM set_config('enable_indexscan',  'off', true);
        EXECUTE q INTO c_ref;

        total := total + 1;
        IF c_idx <> c_ref THEN
            fallos := fallos + 1;
            RAISE NOTICE 'DIFERENCIA: % -> con indice %, referencia %', q, c_idx, c_ref;
        END IF;
    END LOOP;

    -- 2) Dos cotas (BETWEEN), 100 casos
    FOR i IN 1..100 LOOP
        x := floor(random() * 1000)::int;
        y := x + floor(random() * 200)::int;
        q := format('SELECT count(*) FROM t_rng WHERE v BETWEEN %s AND %s', x, y);

        PERFORM set_config('enable_seqscan',    'off', true);
        PERFORM set_config('enable_bitmapscan', 'off', true);
        PERFORM set_config('enable_indexscan',  'on',  true);
        EXECUTE q INTO c_idx;

        PERFORM set_config('enable_seqscan',    'on',  true);
        PERFORM set_config('enable_indexscan',  'off', true);
        EXECUTE q INTO c_ref;

        total := total + 1;
        IF c_idx <> c_ref THEN
            fallos := fallos + 1;
            RAISE NOTICE 'DIFERENCIA: % -> con indice %, referencia %', q, c_idx, c_ref;
        END IF;
    END LOOP;

    RAISE NOTICE 'Casos: %, fallos: %', total, fallos;
    IF fallos > 0 THEN
        RAISE EXCEPTION 'El indice skiplist devolvio resultados distintos al recorrido secuencial en % casos', fallos;
    END IF;
END $$;

\echo 'OK: el indice skiplist coincide con el recorrido secuencial en todos los casos'
