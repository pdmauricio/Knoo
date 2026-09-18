const pool = require("../config/db");
const { convertTo24Hour, convertTo12Hour } = require("../utils/timeUtils");
const { generateRDFFromDB } = require("../utils/rdfGenerator");
const { generateGraphDataFromDB } = require("../utils/graphGenerator");

exports.getCursos = async (req, res) => {
  try {
    const { rows: courses } = await pool.query('SELECT * FROM courses');
    res.json(courses);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

exports.postHorario = async (req, res) => {
  const client = await pool.connect();
  try {
    const { curso, horarios } = req.body;

    const { rows: users } = await client.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (users.length === 0 || users[0].role !== 'docente') {
      return res.status(403).json({ message: "Acceso no autorizado" });
    }

    await client.query('BEGIN');

    await client.query(
      'DELETE FROM teacher_schedules WHERE teacher_id = $1 AND course_id = $2',
      [req.user.id, curso]
    );

    for (const horario of horarios) {
      const [startTime, endTime] = horario.horario.split(' - ');
      const start24 = convertTo24Hour(startTime);
      const end24 = convertTo24Hour(endTime);

      await client.query(
        'INSERT INTO teacher_schedules (teacher_id, course_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4, $5)',
        [req.user.id, curso, horario.dia, start24, end24]
      );
    }

    await client.query('COMMIT');
    res.json({
      message: "Horarios registrados exitosamente",
      horariosCount: horarios.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error al registrar horarios:", error);
    res.status(500).json({ message: "Error en el servidor" });
  } finally {
    client.release();
  }
};

exports.getAlumnos = async (req, res) => {
  try {
    const { rows: enrollments } = await pool.query(`
      SELECT 
        e.id,
        u.id as student_id,
        u.name as student_name,
        u.email as student_email,
        c.name as course_name,
        ts.day_of_week,
        ts.start_time,
        ts.end_time,
        e.enrolled_at
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      JOIN teacher_schedules ts ON e.schedule_id = ts.id
      WHERE e.teacher_id = $1
      ORDER BY c.name, ts.day_of_week, ts.start_time
    `, [req.user.id]);

    const alumnosMatriculados = enrollments.map(e => ({
      id: e.student_id,
      nombre: e.student_name,
      email: e.student_email,
      curso: e.course_name,
      horario: {
        dia: e.day_of_week,
        horario: `${convertTo12Hour(e.start_time)} - ${convertTo12Hour(e.end_time)}`
      },
      fecha: e.enrolled_at
    }));

    res.json(alumnosMatriculados);
  } catch (error) {
    console.error("Error al obtener alumnos:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

exports.getMisCursos = async (req, res) => {
  try {
    const { rows: results } = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        ts.day_of_week,
        ts.start_time,
        ts.end_time
      FROM courses c
      JOIN teacher_schedules ts ON c.id = ts.course_id
      WHERE ts.teacher_id = $1
      ORDER BY c.name, ts.day_of_week, ts.start_time
    `, [req.user.id]);

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
        dia: row.day_of_week,
        horario: `${convertTo12Hour(row.start_time)} - ${convertTo12Hour(row.end_time)}`
      });
    });

    res.json(Array.from(cursosMap.values()));
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

exports.deleteCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;

    await pool.query(
      'DELETE FROM teacher_schedules WHERE teacher_id = $1 AND course_id = $2',
      [req.user.id, cursoId]
    );

    res.json({ message: "Curso removido exitosamente" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Error en el servidor" });
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

    const docente = userData[0];

    const { rows: coursesCount } = await pool.query(
      'SELECT COUNT(DISTINCT course_id) as count FROM teacher_schedules WHERE teacher_id = $1',
      [req.user.id]
    );

    const { rows: schedulesCount } = await pool.query(
      'SELECT COUNT(*) as count FROM teacher_schedules WHERE teacher_id = $1',
      [req.user.id]
    );

    const { rows: studentsCount } = await pool.query(
      'SELECT COUNT(DISTINCT student_id) as count FROM enrollments WHERE teacher_id = $1',
      [req.user.id]
    );

    res.json({
      id: docente.id,
      name: docente.name,
      email: docente.email,
      username: docente.username,
      role: docente.role,
      stats: {
        cursosCount: coursesCount[0].count,
        horariosCount: schedulesCount[0].count,
        alumnosCount: studentsCount[0].count
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

exports.getRdf = async (req, res) => {
  try {
    const { rows: docenteData } = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'docente'",
      [req.user.id]
    );

    if (docenteData.length === 0) {
      return res.status(403).json({ message: "Acceso no autorizado" });
    }

    const docente = docenteData[0];

    const { rows: cursosData } = await pool.query(`
      SELECT 
        c.*,
        ts.day_of_week,
        ts.start_time,
        ts.end_time
      FROM courses c
      JOIN teacher_schedules ts ON c.id = ts.course_id
      WHERE ts.teacher_id = $1
    `, [req.user.id]);

    const { rows: estudiantesData } = await pool.query(`
      SELECT 
        u.*,
        c.id as course_id,
        c.name as course_name,
        ts.day_of_week,
        ts.start_time,
        ts.end_time,
        e.enrolled_at,
        e.id as enrollment_id
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      JOIN teacher_schedules ts ON e.schedule_id = ts.id
      WHERE e.teacher_id = $1
    `, [req.user.id]);

    const rdfContent = generateRDFFromDB(docente, cursosData, estudiantesData);

    res.set({
      'Content-Type': 'application/rdf+xml',
      'Content-Disposition': 'attachment; filename="datos-academicos.rdf"'
    });

    res.send(rdfContent);
  } catch (error) {
    console.error("Error al generar RDF:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message
    });
  }
};

exports.getRdfGraph = async (req, res) => {
  try {
    const { rows: docenteData } = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'docente'",
      [req.user.id]
    );

    if (docenteData.length === 0) {
      return res.status(403).json({ message: "Acceso no autorizado" });
    }

    const docente = docenteData[0];

    const { rows: cursosData } = await pool.query(`
      SELECT 
        c.*,
        ts.id as schedule_id,
        ts.day_of_week,
        ts.start_time,
        ts.end_time
      FROM courses c
      JOIN teacher_schedules ts ON c.id = ts.course_id
      WHERE ts.teacher_id = $1
    `, [req.user.id]);

    const { rows: estudiantesData } = await pool.query(`
      SELECT DISTINCT
        u.id,
        u.name,
        e.course_id
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      WHERE e.teacher_id = $1
    `, [req.user.id]);

    const graphData = generateGraphDataFromDB(docente, cursosData, estudiantesData);

    res.json(graphData);
  } catch (error) {
    console.error("Error al generar grafo RDF:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message
    });
  }
};
