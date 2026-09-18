const { convertTo12Hour } = require("./timeUtils");

// Genera la estructura de nodos/enlaces (grafo) para visualizar profesor -> cursos -> horarios -> estudiantes
function generateGraphDataFromDB(docente, cursosData, estudiantesData) {
  const nodes = [];
  const links = [];

  nodes.push({
    id: `profesor_${docente.id}`,
    name: docente.name,
    type: "profesor",
    size: 400,
    color: "#1e3a8a"
  });

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

  Array.from(cursosMap.values()).forEach(curso => {
    nodes.push({
      id: `curso_${curso.id}`,
      name: curso.name,
      type: "curso",
      size: 300,
      color: "#3b82f6"
    });

    links.push({
      source: `profesor_${docente.id}`,
      target: `curso_${curso.id}`,
      label: "enseña",
      color: "#60a5fa"
    });

    curso.horarios.forEach((horario, index) => {
      const horarioId = `horario_${curso.id}_${index}`;
      nodes.push({
        id: horarioId,
        name: `${horario.dia}\n${horario.horario}`,
        type: "horario",
        size: 200,
        color: "#93c5fd"
      });

      links.push({
        source: `curso_${curso.id}`,
        target: horarioId,
        label: "tiene_horario",
        color: "#93c5fd"
      });
    });
  });

  estudiantesData.forEach(estudiante => {
    nodes.push({
      id: `estudiante_${estudiante.id}`,
      name: estudiante.name,
      type: "estudiante",
      size: 250,
      color: "#10b981"
    });

    links.push({
      source: `estudiante_${estudiante.id}`,
      target: `curso_${estudiante.course_id}`,
      label: "matriculado_en",
      color: "#34d399"
    });
  });

  return { nodes, links };
}

module.exports = { generateGraphDataFromDB };
