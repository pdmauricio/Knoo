const pool = require("../config/db");
const { convertTo12Hour } = require("../utils/timeUtils");

exports.getCursos = async (req, res) => {
  try {
    const { rows: results } = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        ts.id as schedule_id,
        ts.day_of_week,
        ts.start_time,
        ts.end_time,
        u.id as teacher_id,
        u.name as teacher_name
      FROM courses c
      JOIN teacher_schedules ts ON c.id = ts.course_id
      JOIN users u ON ts.teacher_id = u.id
      WHERE u.role = 'docente'
      ORDER BY c.name, ts.day_of_week, ts.start_time
    `);

    const cursosMap = new Map();

    results.forEach(row => {
      if (!cursosMap.has(row.id)) {
        cursosMap.set(row.id, {
          id: row.id,
          name: row.name,
          description: row.description,
          horarios: []
        });
      }

      cursosMap.get(row.id).horarios.push({
        id: row.schedule_id,
        dia: row.day_of_week,
        hora: `${convertTo12Hour(row.start_time)} - ${convertTo12Hour(row.end_time)}`,
        profesor: row.teacher_name,
        profesorId: row.teacher_id
      });
    });

    res.json(Array.from(cursosMap.values()));
  } catch (error) {
    console.error("Error al obtener cursos:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

exports.postMatricula = async (req, res) => {
  const client = await pool.connect();
  try {
    const { cursoId, profesorId } = req.body;

    const { rows: existingEnrollments } = await client.query(
      'SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2',
      [req.user.id, cursoId]
    );

    if (existingEnrollments.length > 0) {
      return res.status(400).json({ message: "Ya estás matriculado en este curso" });
    }

    const { rows: schedules } = await client.query(
      'SELECT id, day_of_week, start_time, end_time FROM teacher_schedules WHERE teacher_id = $1 AND course_id = $2',
      [profesorId, cursoId]
    );

    if (schedules.length === 0) {
      return res.status(400).json({ message: "No hay horarios disponibles" });
    }

    for (const schedule of schedules) {
      const { rows: conflicts } = await client.query(`
        SELECT e.id FROM enrollments e
        JOIN teacher_schedules ts ON e.schedule_id = ts.id
        WHERE e.student_id = $1 
        AND ts.day_of_week = $2 
        AND (
          (ts.start_time <= $3 AND ts.end_time > $4) OR
          (ts.start_time < $5 AND ts.end_time >= $6) OR
          (ts.start_time >= $7 AND ts.end_time <= $8)
        )
      `, [
        req.user.id,
        schedule.day_of_week,
        schedule.start_time, schedule.start_time,
        schedule.end_time, schedule.end_time,
        schedule.start_time, schedule.end_time
      ]);

      if (conflicts.length > 0) {
        return res.status(400).json({
          message: `Conflicto de horario en ${schedule.day_of_week}`
        });
      }
    }

    await client.query('BEGIN');

    const matriculas = [];
    for (const schedule of schedules) {
      const result = await client.query(
        'INSERT INTO enrollments (student_id, course_id, teacher_id, schedule_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [req.user.id, cursoId, profesorId, schedule.id]
      );

      matriculas.push({
        id: result.rows[0].id,
        dia: schedule.day_of_week,
        horario: `${convertTo12Hour(schedule.start_time)} - ${convertTo12Hour(schedule.end_time)}`
      });
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: "Matrícula exitosa",
      matriculas
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en matrícula:", error);
    res.status(500).json({ message: "Error en el servidor" });
  } finally {
    client.release();
  }
};

exports.getMisCursos = async (req, res) => {
  try {
    const { rows: results } = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        u.name as teacher_name,
        ts.day_of_week,
        ts.start_time,
        ts.end_time
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN users u ON e.teacher_id = u.id
      JOIN teacher_schedules ts ON e.schedule_id = ts.id
      WHERE e.student_id = $1
      ORDER BY c.name, ts.day_of_week, ts.start_time
    `, [req.user.id]);

    const misCursos = results.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      profesor: row.teacher_name,
      horarioActual: {
        dia: row.day_of_week,
        hora: `${convertTo12Hour(row.start_time)} - ${convertTo12Hour(row.end_time)}`
      }
    }));

    res.json(misCursos);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { rows: userData } = await pool.query(
      'SELECT id, name, email, username, role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const estudiante = userData[0];

    const { rows: coursesCount } = await pool.query(
      'SELECT COUNT(DISTINCT course_id) as count FROM enrollments WHERE student_id = $1',
      [req.user.id]
    );

    const { rows: horasCount } = await pool.query(
      'SELECT COUNT(*) * 2 as hours FROM enrollments WHERE student_id = $1',
      [req.user.id]
    );

    const { rows: cursosMatriculados } = await pool.query(`
      SELECT DISTINCT c.id, c.name 
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.student_id = $1
    `, [req.user.id]);

    res.json({
      id: estudiante.id,
      name: estudiante.name,
      email: estudiante.email,
      username: estudiante.username,
      role: estudiante.role,
      stats: {
        cursosCount: coursesCount[0].count,
        horasPorSemana: horasCount[0].hours,
        cursosMatriculados: cursosMatriculados.map(curso => ({
          id: curso.id,
          name: curso.name
        }))
      }
    });
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message
    });
  }
};
