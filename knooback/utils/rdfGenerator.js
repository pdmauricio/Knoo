const { convertTo12Hour } = require("./timeUtils");

// Genera el documento RDF/XML a partir de los datos del docente, sus cursos y estudiantes
function generateRDFFromDB(docente, cursosData, estudiantesData) {
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

module.exports = { generateRDFFromDB };
