# Knoo + Skip List en PostgreSQL (Proyecto CS272 · Bases de Datos II)

Este repositorio tiene dos partes que comparten la misma base de datos:

1. **Knoo**: plataforma de tutorías (frontend React + backend Node.js/Express), migrada de MySQL a **PostgreSQL 18**.
2. **Skip List como método de acceso (índice) de PostgreSQL**: extensión escrita en C que se registra en el motor y se usa con `CREATE INDEX ... USING skiplist`. Es el trabajo central de la Etapa I del curso.

Todo se levanta con Docker: la extensión se compila dentro de la imagen de PostgreSQL, sin instalar nada a mano.

## Estructura del repositorio

```
.
├── docker-compose.yml        # Base de datos (construida con Dockerfile.pg) + Adminer
├── Dockerfile.pg             # postgres:18 + compilación e instalación de la extensión
├── db/
│   ├── schema.sql            # Tablas de Knoo: users, courses, teacher_schedules, enrollments
│   ├── seed.sql              # Datos mínimos de prueba
│   ├── init_skiplist.sql     # Carga la extensión y crea bench_items (10 000 filas) con índices B-tree y Skip List
│   └── benchmark.sql         # Comparación: sin índice / B-tree / Skip List
├── extension/                # El método de acceso (código en C)
│   ├── skiplist.c            # build, insert, scan, costo, skiplist_dump
│   ├── skiplist.h            # Formato de nodo en página (SkipListOpaqueData)
│   ├── skiplist--1.0.sql     # CREATE ACCESS METHOD + clase de operadores
│   ├── skiplist.control, makefile
│   ├── test_aminsert.sql     # Prueba de construcción e inserción
│   └── disenho.md, disenho2.md   # Explicación del diseño
├── skiplistPrueba/           # Skip List en memoria (versión independiente de PostgreSQL)
├── scripts/
│   ├── generate_datasets.py  # Generador reproducible de D1, D2, D3
│   └── datasets/             # CSV generados (100k, 500k, 1M filas)
├── resultados/               # Salidas crudas del benchmark (5 corridas)
├── docs/resultados-benchmark.md   # Tabla comparativa y limitaciones
├── knooback/                 # Backend (Express + pg)
└── knoo/                     # Frontend (React + Vite)
```

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (en Windows, con WSL2)
- [Node.js LTS](https://nodejs.org/) (solo para la aplicación web)
- Git
- Python 3 y NumPy (solo para regenerar los datasets)

## Puesta en marcha desde cero

### 1. Clonar y levantar la base de datos

```bash
git clone https://github.com/pdmauricio/Knoo.git
cd Knoo
docker compose up -d --build
```

La primera vez tarda varios minutos porque compila la extensión dentro de la imagen. Al crearse el volumen, PostgreSQL ejecuta en orden `schema.sql`, `seed.sql` e `init_skiplist.sql`.

Verificar:

```bash
docker ps
docker exec -it knoo_pg psql -U knoo_user -d knoo -c "\dt"
```

Debe haber dos contenedores (`knoo_pg`, `knoo_adminer`) en estado `Up` y las tablas `users`, `courses`, `teacher_schedules`, `enrollments` y `bench_items`.

Adminer (interfaz web de la base): http://localhost:8081 · Sistema `PostgreSQL` · Servidor `db` · Usuario `knoo_user` · Contraseña `change_me_local_only` · Base `knoo`.

### 2. Backend

```bash
cd knooback
cp .env.example .env        # en PowerShell: copy .env.example .env
```

Editar `.env` para que coincida con `docker-compose.yml`:

```
PGHOST=localhost
PGPORT=5432
PGDATABASE=knoo
PGUSER=knoo_user
PGPASSWORD=change_me_local_only
JWT_SECRET=una_frase_larga_y_aleatoria
PORT=5000
```

```bash
npm install
node index.js
```

Debe mostrar `Servidor corriendo en http://localhost:5000`.

### 3. Frontend (en otra terminal)

```bash
cd knoo
npm install
npm run dev
```

Abrir la URL que muestre Vite (normalmente http://localhost:5173).

## Probar el índice Skip List

Entrar a la base:

```bash
docker exec -it knoo_pg psql -U knoo_user -d knoo
```

**1. Comprobar que PostgreSQL lo reconoce como método de acceso:**

```sql
SELECT oid, amname, amtype FROM pg_am;     -- aparece skiplist junto a btree, hash, etc.
\dAc skiplist                              -- clase de operadores registrada
```

**2. Construcción, inserción y búsqueda:**

```sql
DROP TABLE IF EXISTS demo;
CREATE TABLE demo (id serial, valor int);
INSERT INTO demo (valor) VALUES (50), (20), (80), (10), (65), (30);

CREATE INDEX idx_demo ON demo USING skiplist (valor);   -- construcción
SELECT skiplist_dump('idx_demo');                       -- estructura interna, nivel por nivel

INSERT INTO demo (valor) VALUES (45);                   -- inserción
SELECT skiplist_dump('idx_demo');
SELECT pg_relation_size('idx_demo') / 8192 AS paginas; -- 1 cabecera + 1 página por clave

SET enable_seqscan = off;   -- con 7 filas el planificador prefiere recorrer la tabla; se fuerza para ver el índice
EXPLAIN SELECT * FROM demo WHERE valor = 65;            -- debe mostrar Index Scan using idx_demo
SELECT * FROM demo WHERE valor = 65;                    -- 1 fila
SELECT * FROM demo WHERE valor = 999;                   -- 0 filas, sin error
RESET enable_seqscan;
```

## Benchmark: sin índice vs B-tree vs Skip List

`db/benchmark.sql` mide la misma consulta (`WHERE valor = 106820`) en tres casos. En cada caso hay **un solo índice disponible** para que el planificador no tenga ambigüedad.

```bash
docker cp db/benchmark.sql knoo_pg:/benchmark.sql
docker exec -i knoo_pg psql -U knoo_user -d knoo -f /benchmark.sql
```

Para repetir 5 veces y guardar todo:

```bash
mkdir -p resultados
: > resultados/completo.txt
for i in 1 2 3 4 5; do
  echo "===== corrida $i =====" >> resultados/completo.txt
  docker exec -i knoo_pg psql -U knoo_user -d knoo -f /benchmark.sql >> resultados/completo.txt 2>&1
done
grep "^ Execution Time:" resultados/completo.txt > resultados/tiempos.txt
```

**Resultados (mediana de 5 corridas, 10 000 filas):**

| Caso | Mediana de *Execution Time* |
|---|---|
| Sin índice (seq scan) | 0.243 ms |
| B-tree | 0.038 ms |
| Skip List | 0.102 ms |

Detalle, condiciones y limitaciones en [`docs/resultados-benchmark.md`](docs/resultados-benchmark.md).

> **Importante:** los datos de `bench_items` se generan con `random()` sin semilla. Si en tu copia los planes muestran `rows=0.00`, la clave 106820 no existe en tus datos. Elige una existente con `SELECT valor FROM bench_items LIMIT 1;` y reemplaza `106820` en `db/benchmark.sql`.

## Datasets reproducibles

```bash
pip3 install numpy
python3 scripts/generate_datasets.py
```

Genera con semilla fija (42) D1 (enteros secuenciales), D2 (enteros aleatorios únicos) y D3 (acceso sesgado tipo Zipf, parámetro 1.5) en tamaños de 100 000, 500 000 y 1 000 000 de filas, dentro de `scripts/datasets/`.

## Cómo funciona (resumen)

- **Cada página de 8 KB de PostgreSQL es un nodo** de la Skip List. Los punteros de memoria se reemplazan por números de bloque (`BlockNumber`); `InvalidBlockNumber` hace de `NULL`.
- Los metadatos del nodo (`max_level` y `forward[]`) viven en el *special space* de la página; la clave y el identificador de la fila (TID) viven en el cuerpo, como tupla de índice.
- `CREATE INDEX` llama a `skiplistbuild`, que recorre la tabla e inserta cada fila con la misma función que usa `INSERT` (`skiplist_insert_tuple`).
- `SELECT ... WHERE col = v` usa `skiplistbeginscan`, `skiplistrescan`, `skiplistgettuple` y `skiplistendscan`; el planificador decide con `skiplistcostestimate`.
- Explicación completa en [`extension/disenho.md`](extension/disenho.md).

## Limitaciones conocidas

- Solo claves `int4`, un campo, búsqueda por igualdad (sin rangos ni orden).
- `amgettuple` devuelve a lo sumo una fila por clave: con claves duplicadas no se devuelven todas las coincidencias.
- Una página de 8 KB por clave: el índice ocupa mucho más espacio que un B-tree.
- Máximo de 4 niveles (`SKIPLIST_MAXLEVEL`); con muchos datos la búsqueda deja de ser logarítmica.
- Sin WAL propio, concurrencia completa ni VACUUM especializado (fuera del alcance obligatorio de la Etapa I).

## Reiniciar desde cero / problemas frecuentes

| Problema | Solución |
|---|---|
| Cambié `db/*.sql` o el código de `extension/` y no veo cambios | Los scripts de inicio solo corren al crear el volumen: `docker compose down -v && docker compose up -d --build` |
| `knoo_pg` aparece como `Restarting` | `docker logs knoo_pg`; si es un volumen viejo, `docker compose down -v` y volver a levantar |
| El backend no conecta | Revisar que `knooback/.env` coincida con `docker-compose.yml` y que `knoo_pg` esté `Up` |
| `relation "bench_items" does not exist` | El volumen se creó antes de existir `init_skiplist.sql`; recrearlo con `down -v` |

## Estado del proyecto

- [x] Migración del backend de MySQL a PostgreSQL y reorganización por capas
- [x] Skip List independiente en C
- [x] Skip List integrado como método de acceso: construcción, inserción, búsqueda y estimación de costo
- [x] Extensión compilada y cargada automáticamente en Docker
- [x] Generadores de datos D1, D2, D3
- [x] Primera comparación con B-tree y acceso sin índice (5 corridas)
- [ ] Workloads W1–W5 y experimentos con los tres tamaños de datos
- [ ] Medición de tamaño del índice, tiempo de construcción y comportamiento de inserción
- [ ] Escenario distribuido (3 nodos, fragmentación, asignación, replicación)

## Créditos y herramientas externas

- **Aplicación Knoo** (frontend y backend originales): desarrollada por el equipo en un curso anterior.
- **Referencias de código:** código fuente de PostgreSQL 18, en particular `contrib/bloom`, usado como guía de la estructura de un método de acceso; documentación oficial de PostgreSQL.
- **Bibliotecas:** NumPy, Docker, imágenes oficiales `postgres:18` y `adminer`.
- **Desarrollo del equipo según el historial de Git:** Skip List independiente, formato de páginas y registro del método de acceso (Leonardo); `skiplist_dump` y pruebas de inserción (Anibal); `amcostestimate`, Docker y benchmark inicial (Ariana); generadores de datos (Esteban); migración, integración de ramas y búsqueda (Mauricio).


## Integrantes

- Mauricio
- Leonardo
- Anibal
- Ariana
- Esteban
