# Knoo — Plataforma de tutorías (Proyecto CS272 · Bases de Datos II)

Aplicación de gestión de tutorías (docentes, cursos, horarios, matrícula de
estudiantes), usada como base para el proyecto del curso de Bases de Datos II:
indexación alternativa (Skip List) y distribución de datos sobre PostgreSQL.

## Stack

- **Frontend**: React + Vite (`/knoo`)
- **Backend**: Node.js + Express + PostgreSQL, driver `pg` (`/knooback`)
- **Base de datos**: PostgreSQL 18 (contenedor Docker)

## Estructura

```
.
├── docker-compose.yml     # Levanta Postgres + Adminer
├── db/
│   ├── schema.sql         # DDL: users, courses, teacher_schedules, enrollments
│   └── seed.sql           # Datos mínimos de prueba
├── knoo/                  # Frontend (React + Vite)
├── knooback/              # Backend (Express + pg)
├── skiplist/              # (en construcción) Skip List standalone en C
└── extension/             # (en construcción) Access Method de PostgreSQL
```

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js LTS](https://nodejs.org/)
- Git

## Cómo levantar el proyecto desde cero

1. Clonar el repo y entrar a la carpeta:
   ```bash
   git clone https://github.com/pdmauricio/Knoo.git
   cd Knoo
   ```

2. Levantar PostgreSQL (crea las tablas automáticamente desde `db/schema.sql`):
   ```bash
   docker compose up -d
   ```
   Verificar: `docker ps` debe mostrar `knoo_pg` y `knoo_adminer` como `Up`.
   Adminer (GUI de la BD) queda en http://localhost:8081
   (sistema: PostgreSQL, servidor: `db`, usuario/clave: ver `docker-compose.yml`).

3. Configurar el backend:
   ```bash
   cd knooback
   cp .env.example .env
   # editar .env si cambiaron algún valor en docker-compose.yml
   npm install
   node index.js
   ```
   Debe mostrar `Servidor corriendo en http://localhost:5000`.

4. Levantar el frontend (en otra terminal):
   ```bash
   cd knoo
   npm install
   npm run dev
   ```
   Abrir la URL que muestre (usualmente http://localhost:5173).

## Variables de entorno (`knooback/.env`)

| Variable | Descripción |
|---|---|
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Conexión a PostgreSQL (deben coincidir con `docker-compose.yml`) |
| `JWT_SECRET` | Secreto para firmar tokens de sesión — usar un valor propio, largo y aleatorio |
| `PORT` | Puerto del backend (por defecto 5000) |

## Estado del proyecto

- [x] Migración del backend de MySQL a PostgreSQL
- [ ] Skip List implementado en C (standalone)
- [ ] Integración del Skip List como Access Method de PostgreSQL
- [ ] Comparación experimental vs. acceso sin índice y B-tree
- [ ] Escenario distribuido (3 nodos, fragmentación, replicación)

## Créditos y herramientas externas

- Aplicación base (frontend y backend) desarrollada originalmente por el equipo
  en un curso previo.
- La migración de MySQL a PostgreSQL (esquema, ajuste de queries, configuración
  de Docker) se hizo con apoyo de Claude (Anthropic) para el diagnóstico del
  código existente y la traducción de sintaxis; el código final fue revisado
  y ejecutado por el equipo.
- El Skip List y la extensión de PostgreSQL (Access Method) son desarrollo
  propio del equipo para este curso.

## Integrantes

- (completar con los 5 integrantes del grupo)
