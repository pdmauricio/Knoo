-- Esquema de Knoo migrado de MySQL a PostgreSQL.
-- Reconstruido a partir de las queries reales de knooback/index.js.
-- Revisen esto como equipo antes de darlo por bueno: los tipos de dato
-- y algunas restricciones (UNIQUE, NOT NULL) son mi mejor inferencia,
-- no estaban declarados explícitamente en el backend original.

CREATE TYPE user_role AS ENUM ('docente', 'estudiante');

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password      VARCHAR(255) NOT NULL,        -- hash de bcrypt
    username      VARCHAR(100) NOT NULL,
    name          VARCHAR(150) NOT NULL,
    role          user_role NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    description   TEXT
);

CREATE TABLE teacher_schedules (
    id            SERIAL PRIMARY KEY,
    teacher_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    day_of_week   VARCHAR(20) NOT NULL,   -- ej. 'Lunes'
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL
);

CREATE TABLE enrollments (
    id            SERIAL PRIMARY KEY,
    student_id    INTEGER NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
    course_id     INTEGER NOT NULL REFERENCES courses(id)            ON DELETE CASCADE,
    teacher_id    INTEGER NOT NULL REFERENCES users(id)               ON DELETE CASCADE,
    schedule_id   INTEGER NOT NULL REFERENCES teacher_schedules(id)  ON DELETE CASCADE,
    enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, course_id)   -- refleja la validación "ya estás matriculado" del backend
);

-- Índices de apoyo para las FK más consultadas (B-tree por defecto de Postgres).
-- Esto NO es el índice del proyecto de BD2; es solo higiene normal de esquema.
CREATE INDEX idx_teacher_schedules_teacher ON teacher_schedules(teacher_id);
CREATE INDEX idx_teacher_schedules_course  ON teacher_schedules(course_id);
CREATE INDEX idx_enrollments_student       ON enrollments(student_id);
CREATE INDEX idx_enrollments_teacher       ON enrollments(teacher_id);
CREATE INDEX idx_enrollments_schedule      ON enrollments(schedule_id);
