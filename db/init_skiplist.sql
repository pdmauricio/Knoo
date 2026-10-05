-- ─────────────────────────────────────────────────────────────────────────────
-- 03_skiplist.sql  –  Inicialización de la extensión + dataset de benchmark
-- Se ejecuta UNA SOLA VEZ al crear el volumen (docker-entrypoint-initdb.d)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Registrar la extensión (el .so ya fue instalado en el Dockerfile)
CREATE EXTENSION IF NOT EXISTS skiplist;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabla de benchmark (dataset pequeño para las pruebas de tiempos)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bench_items (
    id      INTEGER PRIMARY KEY,
    valor   INTEGER NOT NULL,
    texto   TEXT
);

-- Insertar 10 000 filas de prueba
INSERT INTO bench_items (id, valor, texto)
SELECT
    gs,
    (random() * 1000000)::INTEGER,
    'item_' || gs
FROM generate_series(1, 10000) AS gs
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Índice B-tree estándar (referencia)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bench_btree
    ON bench_items USING btree (valor);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Índice Skip List (la extensión de este proyecto)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bench_skiplist
    ON bench_items USING skiplist (valor);

-- Actualizar estadísticas para que el planificador tenga datos reales
ANALYZE bench_items;
