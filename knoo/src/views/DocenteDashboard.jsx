import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./DocenteDashboard.css";
import RDFGraph from '../componentes/RDFGraph';

const HORARIOS = [
  "8:00 AM - 10:00 AM",
  "10:00 AM - 12:00 PM",
  "2:00 PM - 4:00 PM",
  "4:00 PM - 6:00 PM"
];

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

// Agregar un componente para el estado de carga
const LoadingSpinner = () => (
  <div className="loading-spinner">Cargando...</div>
);

export default function DocenteDashboard() {
  const [cursos, setCursos] = useState([]);
  const [cursoSeleccionado, setCursoSeleccionado] = useState("");
  const [horarioSeleccionado, setHorarioSeleccionado] = useState(null);
  const [alumnosMatriculados, setAlumnosMatriculados] = useState([]);
  const [vista, setVista] = useState("cursos");
  const [isLoading, setIsLoading] = useState(false);
  const [misCursos, setMisCursos] = useState([]);
  const [horariosOcupados, setHorariosOcupados] = useState([]);
  const [horariosSeleccionados, setHorariosSeleccionados] = useState([]);
  const [userData, setUserData] = useState(null);
  const [rdfData, setRdfData] = useState(null);
  const [rdfLoading, setRdfLoading] = useState(false);
  const [graphData, setGraphData] = useState(null);
  const navigate = useNavigate();

  // Obtener cursos al cargar el componente
  useEffect(() => {
    const fetchCursos = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("http://localhost:5000/api/docente/cursos", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setCursos(data);
        } else if (response.status === 401) {
          // Token expirado o inválido
          handleLogout();
        }
      } catch (error) {
        console.error("Error al cargar cursos:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCursos();
  }, []);

  // Obtener alumnos matriculados
  useEffect(() => {
    const fetchAlumnos = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/docente/alumnos", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Alumnos matriculados:", data); // Para debugging
          setAlumnosMatriculados(data);
        }
      } catch (error) {
        console.error("Error al cargar alumnos:", error);
      }
    };

    if (vista === "alumnos") {
      fetchAlumnos();
    }
  }, [vista]);

  // Obtener cursos asignados al profesor
  useEffect(() => {
    const fetchMisCursos = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/docente/mis-cursos", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setMisCursos(data);
          
          // Extraer horarios ocupados
          const horarios = data.flatMap(curso => 
            curso.horarios.map(h => ({
              dia: h.dia,
              horario: h.horario,
              curso: curso.name
            }))
          );
          setHorariosOcupados(horarios);
        }
      } catch (error) {
        console.error("Error al cargar mis cursos:", error);
      }
    };

    fetchMisCursos();
  }, []);

  // Obtener datos del perfil del usuario
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/docente/profile", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUserData(data);
        }
      } catch (error) {
        console.error("Error al cargar datos del perfil:", error);
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/Ingresarview");
  };

  // Modify handleSeleccionCurso to check if course is already assigned
  const handleSeleccionCurso = (curso) => {
    // Check if course is already assigned to the professor
    const cursoYaAsignado = misCursos.some(c => c.id === curso);
    
    if (cursoYaAsignado) {
      alert('Ya tienes este curso asignado. Si deseas modificarlo, primero elimínalo de tus cursos.');
      return;
    }

    setCursoSeleccionado(curso);
    setHorariosSeleccionados([]); // Reset selected schedules
    setVista("horarios");
  };

  // Modificar handleSeleccionHorario para verificar duplicados
  const handleSeleccionHorario = async (dia, horario) => {
    // Verificar si el horario está ocupado
    const horarioOcupado = horariosOcupados.find(
      h => h.dia === dia && h.horario === horario
    );

    if (horarioOcupado) {
      alert(`Este horario ya está asignado para el curso: ${horarioOcupado.curso}`);
      return;
    }

    // Alternar selección de horario
    setHorariosSeleccionados(prev => {
      const horarioKey = `${dia}-${horario}`;
      const exists = prev.find(h => h.dia === dia && h.horario === horario);
      
      if (exists) {
        return prev.filter(h => !(h.dia === dia && h.horario === horario));
      } else {
        return [...prev, { dia, horario }];
      }
    });
  };

  // Agregar función para guardar todos los horarios seleccionados
  const handleGuardarHorarios = async () => {
    if (horariosSeleccionados.length === 0) {
      alert('Seleccione al menos un horario');
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/docente/horario", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          curso: cursoSeleccionado,
          horarios: horariosSeleccionados // Send array of selected horarios
        }),
      });

      if (!response.ok) {
        throw new Error('Error al guardar horarios');
      }

      const data = await response.json();
      alert(`${data.horariosCount} horarios registrados exitosamente`);
      setHorariosSeleccionados([]);
      
      // Refresh mis cursos
      const misCursosResponse = await fetch("http://localhost:5000/api/docente/mis-cursos", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      
      if (misCursosResponse.ok) {
        const cursosData = await misCursosResponse.json();
        setMisCursos(cursosData);
        setHorariosOcupados(
          cursosData.flatMap(curso => 
            curso.horarios.map(h => ({
              dia: h.dia,
              horario: h.horario,
              curso: curso.name
            }))
          )
        );
      }
      
      setVista("cursos");
    } catch (error) {
      console.error("Error al registrar horarios:", error);
      alert("Error al registrar los horarios");
    }
  };

  // Agregar función para eliminar curso
  const handleRemoveCurso = async (cursoId) => {
    if (!confirm('¿Está seguro de eliminar este curso?')) return;

    try {
      const response = await fetch(`http://localhost:5000/api/docente/curso/${cursoId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        setMisCursos(prev => prev.filter(c => c.id !== cursoId));
        alert('Curso eliminado exitosamente');
      }
    } catch (error) {
      console.error("Error al eliminar curso:", error);
      alert('Error al eliminar el curso');
    }
  };

  // Agregar componente para mostrar mis cursos
  const renderMisCursos = () => (
    <div className="mis-cursos-grid">
      {misCursos.map((curso) => (
        <div key={curso.id} className="curso-card asignado">
          <div className="curso-header">
            <h3>{curso.name}</h3>
            <button 
              className="remove-curso-btn"
              onClick={() => handleRemoveCurso(curso.id)}
              title="Eliminar curso"
            >
              ✕
            </button>
          </div>
          <div className="horarios-list">
            <h4>Horarios asignados:</h4>
            <ul>
              {curso.horarios.map((h, index) => (
                <li key={index}>
                  {h.dia} - {h.horario}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );

  // Modificar la sección de la tabla de alumnos
  const renderTablaAlumnos = () => {
    if (alumnosMatriculados.length === 0) {
      return <p className="no-alumnos">No hay alumnos matriculados aún.</p>;
    }

    return (
      <table className="alumnos-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Curso</th>
            <th>Horario</th>
            <th>Fecha Matrícula</th>
          </tr>
        </thead>
        <tbody>
          {alumnosMatriculados.map((alumno) => {
            // Encontrar el curso correspondiente
            const cursoInfo = cursos.find(c => c.id === alumno.curso);
            
            return (
              <tr key={`${alumno.id}-${alumno.curso}`}>
                <td>{alumno.nombre}</td>
                <td>{alumno.email}</td>
                <td>{cursoInfo?.name || alumno.curso}</td>
                <td>{`${alumno.horario?.dia || ''} ${alumno.horario?.horario || ''}`}</td>
                <td>{new Date(alumno.fecha).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  // Modificar la tabla de horarios para mostrar conflictos
  const renderCeldaHorario = (dia, horario) => {
    const horarioOcupado = horariosOcupados.find(
      h => h.dia === dia && h.horario === horario
    );

    const isSelected = horariosSeleccionados.some(
      h => h.dia === dia && h.horario === horario
    );

    return (
      <td
        key={`${dia}-${horario}`}
        className={`
          ${isSelected ? "selected" : ""}
          ${horarioOcupado ? "ocupado" : ""}
        `}
        onClick={() => handleSeleccionHorario(dia, horario)}
        title={horarioOcupado ? `Ocupado: ${horarioOcupado.curso}` : "Disponible"}
      >
        {isSelected ? "✓" : horarioOcupado ? "❌" : ""}
      </td>
    );
  };

  // Update the curso card render to show if course is already assigned
  const renderCursoCard = (curso) => {
    const isAssigned = misCursos.some(c => c.id === curso.id);
    
    return (
      <div
        key={curso.id}
        className={`curso-card ${
          cursoSeleccionado === curso.id ? "selected" : ""
        } ${isAssigned ? "assigned" : ""}`}
        onClick={() => !isAssigned && handleSeleccionCurso(curso.id)}
        title={isAssigned ? "Curso ya asignado" : "Click para seleccionar"}
      >
        <h3>{curso.name}</h3>
        <p>{curso.description}</p>
        {isAssigned ? (
          <span className="assigned-badge">Ya asignado</span>
        ) : cursoSeleccionado === curso.id && (
          <span className="selected-badge">✓ Seleccionado</span>
        )}
      </div>
    );
  };

  // Agregar función para renderizar perfil
  const renderPerfil = () => {
    if (!userData) return <LoadingSpinner />;

    return (
      <div className="perfil-container">
        <div className="perfil-header">
          <div className="perfil-avatar">
            {userData.name.charAt(0).toUpperCase()}
          </div>
          <h2>{userData.name}</h2>
          <span className="perfil-role">Docente</span>
        </div>
        
        <div className="perfil-content">
          <div className="perfil-section">
            <h3>Información Personal</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Username</label>
                <p>{userData.username}</p>
              </div>
              <div className="info-item">
                <label>Email</label>
                <p>{userData.email}</p>
              </div>
              <div className="info-item">
                <label>ID</label>
                <p>{userData.id}</p>
              </div>
            </div>
          </div>

          <div className="perfil-section">
            <h3>Resumen de Cursos</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-number">{misCursos.length}</span>
                <span className="stat-label">Cursos Asignados</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">
                  {misCursos.reduce((total, curso) => total + curso.horarios.length, 0)}
                </span>
                <span className="stat-label">Total Horarios</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{alumnosMatriculados.length}</span>
                <span className="stat-label">Alumnos</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Add RDF fetch function
  const fetchRDF = async () => {
    setRdfLoading(true);
    try {
      const response = await fetch("http://localhost:5000/api/docente/rdf", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const rdfText = await response.text();
        setRdfData(rdfText);
      }
    } catch (error) {
      console.error("Error al cargar RDF:", error);
      alert("Error al generar RDF");
    } finally {
      setRdfLoading(false);
    }
  };

  // Add download RDF function
  const downloadRDF = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/docente/rdf", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'datos-academicos.rdf';
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error al descargar RDF:", error);
      alert("Error al descargar RDF");
    }
  };

  // Add function to fetch graph data
  const fetchGraphData = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/docente/rdf-graph", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGraphData(data);
      }
    } catch (error) {
      console.error("Error al cargar datos del grafo:", error);
      alert("Error al generar grafo");
    }
  };

  // Add RDF render function
  const renderRDF = () => {
    return (
      <div className="rdf-container">
        <div className="rdf-header">
          <h2>📊 Datos en Formato RDF</h2>
          <p>Visualización de datos académicos en formato RDF/XML</p>
          <div className="rdf-actions">
            <button onClick={fetchRDF} disabled={rdfLoading}>
              {rdfLoading ? "Generando..." : "🔄 Generar RDF"}
            </button>
            <button onClick={fetchGraphData}>
              🎯 Generar Grafo
            </button>
            <button onClick={downloadRDF}>
              📥 Descargar RDF
            </button>
          </div>
        </div>

        {/* Add Graph Visualization */}
        {graphData && (
          <div className="rdf-graph-section">
            <h3>🎯 Visualización del Grafo RDF</h3>
            <div className="graph-legend">
              <div className="legend-item">
                <span className="legend-color profesor"></span>
                <span>Profesor</span>
              </div>
              <div className="legend-item">
                <span className="legend-color curso"></span>
                <span>Curso</span>
              </div>
              <div className="legend-item">
                <span className="legend-color estudiante"></span>
                <span>Estudiante</span>
              </div>
              <div className="legend-item">
                <span className="legend-color horario"></span>
                <span>Horario</span>
              </div>
            </div>
            <RDFGraph graphData={graphData} />
          </div>
        )}

        {rdfData && (
          <div className="rdf-content">
            <div className="rdf-info">
              <h3>Información incluida en el RDF:</h3>
              <ul>
                <li>✅ Datos del profesor</li>
                <li>✅ Cursos asignados con horarios</li>
                <li>✅ Estudiantes matriculados</li>
                <li>✅ Relaciones entre entidades</li>
                <li>✅ Fechas de matrícula</li>
              </ul>
            </div>
            
            <div className="rdf-viewer">
              <h4>Vista previa del RDF:</h4>
              <pre className="rdf-code">
                <code>{rdfData}</code>
              </pre>
            </div>
          </div>
        )}

        {!rdfData && !graphData && !rdfLoading && (
          <div className="rdf-placeholder">
            <p>Haga clic en "Generar RDF" para ver el código XML o "Generar Grafo" para ver la visualización</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <h1>Panel de Control - Tutor</h1>
        <div className="nav-buttons">
          <button onClick={() => setVista("perfil")}>
            👤 Mi Perfil
          </button>
          <button onClick={() => setVista("rdf")}>
            📊 Datos RDF
          </button>
          <button onClick={() => setVista("cursos")}>
            📚 Mis Cursos
          </button>
          <button onClick={() => setVista("alumnos")}>
            👥 Alumnos Matriculados
          </button>
          <button onClick={handleLogout} className="logout-btn">
            🚪 Cerrar Sesión
          </button>
        </div>
      </nav>

      <main className="dashboard-content">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {vista === "perfil" && renderPerfil()}

            {vista === "cursos" && (
              <>
                <div className="mis-cursos-section">
                  <h2>📚 Mis Cursos Asignados</h2>
                  {renderMisCursos()}
                </div>
                <div className="cursos-grid">
                  <h2>✨ Seleccione un nuevo curso para enseñar</h2>
                  <div className="cursos-container">
                    {cursos.map(renderCursoCard)}
                  </div>
                </div>
              </>
            )}

            {vista === "horarios" && (
              <div className="horarios-container">
                <h2>Horarios Disponibles - {cursoSeleccionado}</h2>
                <table className="horarios-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      {DIAS.map((dia) => (
                        <th key={dia}>{dia}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HORARIOS.map((horario) => (
                      <tr key={horario}>
                        <td>{horario}</td>
                        {DIAS.map((dia) => renderCeldaHorario(dia, horario))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {horariosSeleccionados.length > 0 && (
                  <button className="save-horarios-btn" onClick={handleGuardarHorarios}>
                    Guardar Horarios ({horariosSeleccionados.length})
                  </button>
                )}
              </div>
            )}

            {vista === "alumnos" && (
              <div className="alumnos-container">
                <h2>👥 Alumnos Matriculados</h2>
                <div className="alumnos-content">
                  {renderTablaAlumnos()}
                </div>
              </div>
            )}

            {vista === "rdf" && renderRDF()}
          </>
        )}
      </main>
    </div>
  );
}