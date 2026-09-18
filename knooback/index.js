const express = require("express");
const cors = require("cors");
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 5000;
const JWT_SECRET = "tu_secreto_seguro";

app.use(cors());
app.use(express.json());

// Configuración del pool de conexiones PostgreSQL
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

// Función auxiliar para convertir hora a formato 24h
function convertTo24Hour(time12h) {
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');
  
  if (hours === '12') {
    hours = '00';
  }
  
  if (modifier === 'PM') {
    hours = parseInt(hours, 10) + 12;
  }
  
  return `${hours}:${minutes}:00`;
}

function convertTo12Hour(time24h) {
  const [hours, minutes] = time24h.split(':');
  const hour12 = hours % 12 || 12;
  const ampm = hours < 12 ? 'AM' : 'PM';
  return `${hour12}:${minutes} ${ampm}`;
}

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token inválido" });
    }
    req.user = user;
    next();
  });
};

// Rutas de autenticación
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, username, name, role } = req.body;

    // Verificar si el usuario ya existe
    const { rows: existingUsers } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: "El usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    await pool.query(
      'INSERT INTO users (email, password, username, name, role) VALUES ($1, $2, $3, $4, $5)',
      [email, hashedPassword, username, name, role]
    );

    res.status(201).json({ message: "Usuario registrado exitosamente" });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows: users } = await pool.query(
      'SELECT id, email, password, role FROM users WHERE email = $1',
      [email]
    );

    if (users.length === 0 || !(await bcrypt.compare(password, users[0].password))) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = users[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      role: user.role,
      message: "Login exitoso",
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Rutas para docentes
app.get("/api/docente/cursos", authenticateToken, async (req, res) => {
  try {
    const { rows: courses } = await pool.query('SELECT * FROM courses');
    res.json(courses);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.post("/api/docente/horario", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { curso, horarios } = req.body;

    // Verificar que el usuario sea docente
    const { rows: users } = await client.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (users.length === 0 || users[0].role !== 'docente') {
      return res.status(403).json({ message: "Acceso no autorizado" });
    }

    await client.query('BEGIN');

    // Eliminar horarios existentes para este curso y profesor
    await client.query(
      'DELETE FROM teacher_schedules WHERE teacher_id = $1 AND course_id = $2',
      [req.user.id, curso]
    );

    // Insertar nuevos horarios
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
});

app.get("/api/docente/alumnos", authenticateToken, async (req, res) => {
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

    console.log("Alumnos matriculados:", alumnosMatriculados);
    res.json(alumnosMatriculados);
  } catch (error) {
    console.error("Error al obtener alumnos:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message,
    });
  }
});

app.post("/api/logout", authenticateToken, async (req, res) => {
  try {
    res.json({ message: "Sesión cerrada exitosamente" });
  } catch (error) {
    res.status(500).json({ message: "Error al cerrar sesión" });
  }
});

app.get("/api/estudiante/cursos", authenticateToken, async (req, res) => {
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

    // Agrupar por curso
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

    const cursosDisponibles = Array.from(cursosMap.values());
    console.log("Cursos disponibles:", cursosDisponibles);
    res.json(cursosDisponibles);
  } catch (error) {
    console.error("Error al obtener cursos:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message,
    });
  }
});

app.post("/api/estudiante/matricula", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { cursoId, profesorId } = req.body;

    // Verificar si ya está matriculado en este curso
    const { rows: existingEnrollments } = await client.query(
      'SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2',
      [req.user.id, cursoId]
    );

    if (existingEnrollments.length > 0) {
      return res.status(400).json({ message: "Ya estás matriculado en este curso" });
    }

    // Obtener horarios del profesor para este curso
    const { rows: schedules } = await client.query(
      'SELECT id, day_of_week, start_time, end_time FROM teacher_schedules WHERE teacher_id = $1 AND course_id = $2',
      [profesorId, cursoId]
    );

    if (schedules.length === 0) {
      return res.status(400).json({ message: "No hay horarios disponibles" });
    }

    // Verificar conflictos de horario
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

    // Matricular en todos los horarios del curso
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
});

app.get("/api/docente/mis-cursos", authenticateToken, async (req, res) => {
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

    // Agrupar por curso
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

    const misCursos = Array.from(cursosMap.values());
    res.json(misCursos);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.delete("/api/docente/curso/:cursoId", authenticateToken, async (req, res) => {
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
});

app.get("/api/estudiante/mis-cursos", authenticateToken, async (req, res) => {
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

    console.log("Cursos matriculados enviados:", misCursos);
    res.json(misCursos);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      message: "Error en el servidor",
      error: error.message 
    });
  }
});

app.get("/api/docente/profile", authenticateToken, async (req, res) => {
  try {
    // Obtener datos del docente
    const { rows: userData } = await pool.query(
      'SELECT id, name, email, username, role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const docente = userData[0];

    // Contar cursos únicos
    const { rows: coursesCount } = await pool.query(
      'SELECT COUNT(DISTINCT course_id) as count FROM teacher_schedules WHERE teacher_id = $1',
      [req.user.id]
    );

    // Contar horarios totales
    const { rows: schedulesCount } = await pool.query(
      'SELECT COUNT(*) as count FROM teacher_schedules WHERE teacher_id = $1',
      [req.user.id]
    );

    // Contar alumnos únicos
    const { rows: studentsCount } = await pool.query(
      'SELECT COUNT(DISTINCT student_id) as count FROM enrollments WHERE teacher_id = $1',
      [req.user.id]
    );

    const profileData = {
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
    };

    res.json(profileData);
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    res.status(500).json({ 
      message: "Error en el servidor",
      error: error.message 
    });
  }
});

app.get("/api/estudiante/profile", authenticateToken, async (req, res) => {
  try {
    // Obtener datos del estudiante
    const { rows: userData } = await pool.query(
      'SELECT id, name, email, username, role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const estudiante = userData[0];

    // Contar cursos únicos matriculados
    const { rows: coursesCount } = await pool.query(
      'SELECT COUNT(DISTINCT course_id) as count FROM enrollments WHERE student_id = $1',
      [req.user.id]
    );

    // Contar horas totales (cada horario son 2 horas)
    const { rows: horasCount } = await pool.query(
      'SELECT COUNT(*) * 2 as hours FROM enrollments WHERE student_id = $1',
      [req.user.id]
    );

    // Obtener cursos matriculados
    const { rows: cursosMatriculados } = await pool.query(`
      SELECT DISTINCT c.id, c.name 
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.student_id = $1
    `, [req.user.id]);

    const profileData = {
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
    };

    res.json(profileData);
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    res.status(500).json({ 
      message: "Error en el servidor",
      error: error.message 
    });
  }
});

app.get("/api/docente/rdf", authenticateToken, async (req, res) => {
  try {
    // Obtener datos del docente
    const { rows: docenteData } = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'docente'",
      [req.user.id]
    );

    if (docenteData.length === 0) {
      return res.status(403).json({ message: "Acceso no autorizado" });
    }

    const docente = docenteData[0];

    // Obtener cursos del docente con horarios
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

    // Obtener estudiantes matriculados
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

    // Generate RDF content
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
});

// Function to generate RDF from database data
function generateRDFFromDB(docente, cursosData, estudiantesData) {
  // Agrupar cursos por ID
  const cursosMap = new Map();
  cursosData.forEach(row => {
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

  const cursos = Array.from(cursosMap.values());

  const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:foaf="http://xmlns.com/foaf/0.1/"
         xmlns:dc="http://purl.org/dc/elements/1.1/"
         xmlns:tutorMe="http://tutorme.com/ontology#">

  <!-- Profesor -->
  <foaf:Person rdf:about="http://tutorme.com/profesor/${docente.id}">
    <foaf:name>${docente.name}</foaf:name>
    <foaf:mbox>${docente.email}</foaf:mbox>
    <foaf:nick>${docente.username}</foaf:nick>
    <tutorMe:rol>Docente</tutorMe:rol>
    <tutorMe:id>${docente.id}</tutorMe:id>
  </foaf:Person>

  <!-- Cursos del Profesor -->
  ${cursos.map(curso => `
  <tutorMe:Curso rdf:about="http://tutorme.com/curso/${curso.id}">
    <dc:title>${curso.name}</dc:title>
    <dc:description>${curso.description}</dc:description>
    <tutorMe:ensenadoPor rdf:resource="http://tutorme.com/profesor/${docente.id}"/>
    ${curso.horarios.map(horario => `
    <tutorMe:horario>
      <tutorMe:Horario>
        <tutorMe:dia>${horario.dia}</tutorMe:dia>
        <tutorMe:hora>${horario.horario}</tutorMe:hora>
      </tutorMe:Horario>
    </tutorMe:horario>`).join('')}
  </tutorMe:Curso>`).join('')}

  <!-- Estudiantes Matriculados -->
  ${estudiantesData.map(estudiante => `
  <foaf:Person rdf:about="http://tutorme.com/estudiante/${estudiante.id}">
    <foaf:name>${estudiante.name}</foaf:name>
    <foaf:mbox>${estudiante.email}</foaf:mbox>
    <foaf:nick>${estudiante.username}</foaf:nick>
    <tutorMe:rol>Estudiante</tutorMe:rol>
    <tutorMe:matriculadoEn rdf:resource="http://tutorme.com/curso/${estudiante.course_id}"/>
    <tutorMe:fechaMatricula>${new Date(estudiante.enrolled_at).toISOString()}</tutorMe:fechaMatricula>
  </foaf:Person>

  <tutorMe:Matricula rdf:about="http://tutorme.com/matricula/${estudiante.enrollment_id}">
    <tutorMe:estudiante rdf:resource="http://tutorme.com/estudiante/${estudiante.id}"/>
    <tutorMe:curso rdf:resource="http://tutorme.com/curso/${estudiante.course_id}"/>
    <tutorMe:profesor rdf:resource="http://tutorme.com/profesor/${docente.id}"/>
    <tutorMe:dia>${estudiante.day_of_week}</tutorMe:dia>
    <tutorMe:horario>${convertTo12Hour(estudiante.start_time)} - ${convertTo12Hour(estudiante.end_time)}</tutorMe:horario>
    <dc:date>${new Date(estudiante.enrolled_at).toISOString()}</dc:date>
  </tutorMe:Matricula>`).join('')}

</rdf:RDF>`;

  return rdf;
}

app.get("/api/docente/rdf-graph", authenticateToken, async (req, res) => {
  try {
    // Obtener datos del docente
    const { rows: docenteData } = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'docente'",
      [req.user.id]
    );

    if (docenteData.length === 0) {
      return res.status(403).json({ message: "Acceso no autorizado" });
    }

    const docente = docenteData[0];

    // Obtener cursos del docente con horarios
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

    // Obtener estudiantes matriculados
    const { rows: estudiantesData } = await pool.query(`
      SELECT DISTINCT
        u.id,
        u.name,
        e.course_id
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      WHERE e.teacher_id = $1
    `, [req.user.id]);

    // Generate graph data
    const graphData = generateGraphDataFromDB(docente, cursosData, estudiantesData);
    
    res.json(graphData);
  } catch (error) {
    console.error("Error al generar grafo RDF:", error);
    res.status(500).json({ 
      message: "Error en el servidor",
      error: error.message 
    });
  }
});

// Function to generate graph data from database
function generateGraphDataFromDB(docente, cursosData, estudiantesData) {
  const nodes = [];
  const links = [];

  // Add teacher node
  nodes.push({
    id: `profesor_${docente.id}`,
    name: docente.name,
    type: "profesor",
    size: 400,
    color: "#1e3a8a"
  });

  // Agrupar cursos por ID
  const cursosMap = new Map();
  cursosData.forEach(row => {
    if (!cursosMap.has(row.id)) {
      cursosMap.set(row.id, {
        id: row.id,
        name: row.name,
        horarios: []
      });
    }
    cursosMap.get(row.id).horarios.push({
      schedule_id: row.schedule_id,
      dia: row.day_of_week,
      horario: `${convertTo12Hour(row.start_time)} - ${convertTo12Hour(row.end_time)}`
    });
  });

  // Add course nodes and links
  Array.from(cursosMap.values()).forEach(curso => {
    nodes.push({
      id: `curso_${curso.id}`,
      name: curso.name,
      type: "curso",
      size: 300,
      color: "#3b82f6"
    });

    // Link teacher to course
    links.push({
      source: `profesor_${docente.id}`,
      target: `curso_${curso.id}`,
      label: "enseña",
      color: "#60a5fa"
    });

    // Add schedule nodes
    curso.horarios.forEach((horario, index) => {
      const horarioId = `horario_${curso.id}_${index}`;
      nodes.push({
        id: horarioId,
        name: `${horario.dia}\n${horario.horario}`,
        type: "horario",
        size: 200,
        color: "#93c5fd"
      });

      // Link course to schedule
      links.push({
        source: `curso_${curso.id}`,
        target: horarioId,
        label: "tiene_horario",
        color: "#93c5fd"
      });
    });
  });

  // Add student nodes and enrollment links
  estudiantesData.forEach(estudiante => {
    nodes.push({
      id: `estudiante_${estudiante.id}`,
      name: estudiante.name,
      type: "estudiante",
      size: 250,
      color: "#10b981"
    });

    // Link student to course
    links.push({
      source: `estudiante_${estudiante.id}`,
      target: `curso_${estudiante.course_id}`,
      label: "matriculado_en",
      color: "#34d399"
    });
  });

  return { nodes, links };
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});