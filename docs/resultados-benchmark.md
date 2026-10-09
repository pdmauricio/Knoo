# Primera comparación: sin índice vs B-tree vs Skip List

- Tabla: `bench_items`, 10 000 filas (`db/init_skiplist.sql`)
- Consulta: `SELECT id, valor FROM bench_items WHERE valor = ;` (clave existente)
- PostgreSQL 18 en Docker (contenedor `knoo_pg`)
- 5 corridas por caso; se reporta la **mediana**, porque no la distorsionan las corridas atípicas (por ejemplo, la primera con caché fría)

| Caso | Mediana de Execution Time |
|---|---|
| Sin índice (seq scan) | 0.243 ms |
| B-tree | 0.038 ms |
| Skip List | 0.102 ms |

Datos crudos: `resultados/tiempos.txt`. Planes completos: `resultados/completo.txt`.

## Limitaciones

- Un solo tamaño de dataset (10 000 filas) y una sola clave; es una primera comparación, no la evaluación de la Etapa II.
- Solo búsqueda por igualdad.
