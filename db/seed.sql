-- Datos mínimos para probar login/registro/matrícula manualmente.
-- La contraseña real debe crearse vía POST /api/register (bcrypt la hashea);
-- estos INSERTs son solo para tener cursos/horarios de referencia.

INSERT INTO courses (name, description) VALUES
    ('Bases de Datos II', 'Indexación y sistemas distribuidos'),
    ('Cálculo III', 'Ecuaciones diferenciales');

-- Nota: para crear el primer docente/estudiante, usen el endpoint
-- /api/register (así la contraseña queda hasheada correctamente).
-- Una vez creado un docente con id conocido, pueden insertar su horario:
--
-- INSERT INTO teacher_schedules (teacher_id, course_id, day_of_week, start_time, end_time)
-- VALUES (1, 1, 'Lunes', '10:00:00', '12:00:00');
