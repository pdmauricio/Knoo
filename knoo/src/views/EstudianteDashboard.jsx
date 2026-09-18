import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./EstudianteDashboard.css";

const HORARIOS = [
  "8:00 AM - 10:00 AM",
  "10:00 AM - 12:00 PM",
  "2:00 PM - 4:00 PM",
  "4:00 PM - 6:00 PM"
];

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export default function EstudianteDashboard() {
  const [cursos, setCursos] = useState([]);
  const [cursosMatriculados, setCursosMatriculados] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [vista, setVista] = useState("cursos");
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  // Cargar cursos disponibles
  useEffect(() => {
    const fetchCursos = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("http://localhost:5000/api/estudiante/cursos", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Cursos recibidos:", data); // Para debugging
          setCursos(data);
        } else {
          const errorData = await response.json();
          console.error("Error response:", errorData);
        }
      } catch (error) {
        console.error("Error al cargar cursos:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCursos();
  }, []);

  // Cargar cursos matriculados
  useEffect(() => {
    const fetchCursosMatriculados = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/estudiante/mis-cursos", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Cursos matriculados recibidos:", data); // Debug
          setCursosMatriculados(data);
        } else {
          const error = await response.json();
          console.error("Error al cargar cursos matriculados:", error);
        }
      } catch (error) {
        console.error("Error al cargar cursos matriculados:", error);
      }
    };

    fetchCursosMatriculados();
  }, []);

  // Cargar perfil de usuario
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/estudiante/profile", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUserData(data);
        }
      } catch (error) {
        console.error("Error al cargar perfil:", error);
      }
    };

    fetchProfile();
  }, []);

  const handleMatricula = async (cursoId, horarios, profesorId) => {
    try {
      const response = await fetch("http://localhost:5000/api/estudiante/matricula", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          cursoId,
          horarioId: horarios[0].id, // We'll send the first horario ID but backend will handle all
          profesorId
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert("Matrícula exitosa en todos los horarios del curso");
        // Refresh enrolled courses
        const matriculadosResponse = await fetch("http://localhost:5000/api/estudiante/mis-cursos", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        
        if (matriculadosResponse.ok) {
          const matriculadosData = await matriculadosResponse.json();
          setCursosMatriculados(matriculadosData);
        }
      } else {
        alert(data.message || "Error al matricularse");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error al procesar la matrícula");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/Ingresarview");
  };

  // Filtrar cursos según término de búsqueda
  const cursosFiltrados = cursos.filter(curso => 
    curso.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    curso.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Add function to check schedule conflicts
  const checkHorarioConflict = (horario) => {
    return cursosMatriculados.some(curso => 
      curso.horario.dia === horario.dia && 
      curso.horario.hora === horario.hora
    );
  };

  // Modify curso card render
  const renderCursoCard = (curso) => {
    const yaMatriculado = cursosMatriculados.some(c => c.id === curso.id);
    
    // Group horarios by professor
    const horariosPorProfesor = curso.horarios.reduce((acc, horario) => {
      if (!acc[horario.profesorId]) {
        acc[horario.profesorId] = {
          profesor: horario.profesor,
          horarios: []
        };
      }
      acc[horario.profesorId].horarios.push(horario);
      return acc;
    }, {});

    return (
      <div key={curso.id} className="curso-card">
        <h3>{curso.name}</h3>
        <p>{curso.description}</p>
        <div className="horarios-disponibles">
          <h4>Horarios por Profesor:</h4>
          {!yaMatriculado ? (
            Object.entries(horariosPorProfesor).map(([profesorId, { profesor, horarios }]) => (
              <div key={profesorId} className="profesor-section">
                <h5 className="profesor-name">{profesor}</h5>
                <div className="horarios-list">
                  {horarios.map(horario => (
                    <div key={horario.id} className="horario-item">
                      <span>{`${horario.dia} - ${horario.hora}`}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleMatricula(curso.id, horarios, profesorId)}
                  className="matricula-btn"
                  disabled={horarios.some(h => 
                    cursosMatriculados.some(c => 
                      c.horarioActual.dia === h.dia && 
                      c.horarioActual.hora === h.hora
                    )
                  )}
                >
                  Matricular con este profesor
                </button>
              </div>
            ))
          ) : (
            <p className="ya-matriculado">Ya estás matriculado en este curso</p>
          )}
        </div>
      </div>
    );
  };

  // Add calendar view for enrolled courses
  const renderHorarioPersonalizado = () => {
    return (
      <div className="horario-personalizado">
        <h3>Mi Horario</h3>
        <table className="horario-table">
          <thead>
            <tr>
              <th>Hora</th>
              {DIAS.map(dia => <th key={dia}>{dia}</th>)}
            </tr>
          </thead>
          <tbody>
            {HORARIOS.map(hora => (
              <tr key={hora}>
                <td className="hora-cell">{hora}</td>
                {DIAS.map(dia => {
                  const cursosEnHorario = cursosMatriculados.filter(curso => 
                    curso.horarioActual.dia === dia && 
                    curso.horarioActual.hora === hora
                  );
                  
                  return (
                    <td 
                      key={`${dia}-${hora}`} 
                      className={cursosEnHorario.length > 0 ? 'curso-cell' : ''}
                    >
                      {cursosEnHorario.map(curso => (
                        <div key={curso.id} className="curso-info">
                          <div className="curso-nombre">{curso.name}</div>
                          <div className="curso-profesor">Prof. {curso.profesor}</div>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Add useEffect with console.log to debug
  useEffect(() => {
    console.log("Current cursosMatriculados:", cursosMatriculados);
  }, [cursosMatriculados]);

  // Update the matriculados view
  const renderMisCursos = () => (
    <div className="mis-cursos-section">
      <h2>📚 Mis Cursos Matriculados</h2>
      {renderHorarioPersonalizado()}
      <div className="cursos-lista">
        {cursosMatriculados.map(curso => (
          <div key={curso.id} className="curso-matriculado-card">
            <h3>{curso.name}</h3>
            <p><strong>Profesor:</strong> {curso.profesor}</p>
            <p><strong>Horario:</strong> {`${curso.horarioActual.dia} - ${curso.horarioActual.hora}`}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // Render perfil de usuario
  const renderPerfil = () => {
    if (!userData) return <div className="loading">Cargando perfil...</div>;

    return (
      <div className="perfil-container">
        <div className="perfil-header">
          <div className="perfil-avatar">
            {userData.name.charAt(0).toUpperCase()}
          </div>
          <h2>{userData.name}</h2>
          <span className="perfil-role">Estudiante</span>
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
            <h3>Resumen Académico</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-number">{userData.stats.cursosCount}</span>
                <span className="stat-label">Cursos Matriculados</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{userData.stats.horasPorSemana}</span>
                <span className="stat-label">Horas por Semana</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Update the return statement
  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <h1>Panel de Control - Estudiante</h1>
        <div className="nav-buttons">
          <button onClick={() => setVista("cursos")}>
            📚 Cursos Disponibles
          </button>
          <button onClick={() => setVista("matriculados")}>
            📋 Mis Cursos
          </button>
          <button onClick={() => setVista("perfil")}>
            👤 Mi Perfil
          </button>
          <button onClick={handleLogout} className="logout-btn">
            🚪 Cerrar Sesión
          </button>
        </div>
      </nav>

      <main className="dashboard-content">
        {vista === "cursos" && (
          <div className="cursos-section">
            <h2>✨ Cursos Disponibles</h2>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Buscar cursos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {isLoading ? (
              <div className="loading">Cargando cursos...</div>
            ) : (
              <div className="cursos-grid">
                {cursosFiltrados.map(renderCursoCard)}
              </div>
            )}
          </div>
        )}
        {vista === "matriculados" && renderMisCursos()}
        {vista === "perfil" && renderPerfil()}
      </main>
    </div>
  );
}