import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Ingresarview.css"; // Importamos el archivo CSS

export default function IngresarView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("estudiante"); // Por defecto, estudiante
  const [isRegistering, setIsRegistering] = useState(false); // Alternar entre login y registro
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isRegistering) {
      try {
        console.log("Intentando login con:", { email, password }); // Debug

        const response = await fetch("http://localhost:5000/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        
        if (response.ok) {
          console.log("Respuesta del servidor:", data); // Debug

          if (!data.token || !data.role) {
            throw new Error("Respuesta del servidor incompleta");
          }

          localStorage.setItem("token", data.token);
          
          // Validación explícita del rol
          switch(data.role) {
            case "docente":
              navigate("/docente/dashboard");
              break;
            case "estudiante":
              navigate("/estudiante/dashboard");
              break;
            default:
              alert("Rol no reconocido");
              localStorage.removeItem("token");
          }
        } else {
          alert(`Error: ${data.message || 'Error de autenticación'}`);
        }
      } catch (error) {
        console.error("Error detallado:", error);
        alert("Error al iniciar sesión. Verifica tus credenciales.");
      }
    } else {
      // Lógica de registro
      try {
        const response = await fetch("http://localhost:5000/api/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password, username, name, role }),
        });

        if (response.ok) {
          alert("Registro exitoso");
          setIsRegistering(false); // Cambia a la vista de login
        } else {
          const errorData = await response.json();
          alert(`Error: ${errorData.message}`);
        }
      } catch (error) {
        console.error("Error al registrar:", error);
        alert("Hubo un problema al registrar. Inténtalo de nuevo.");
      }
    }
  };

  return (
    <div className="container">
      <div className="form-container">
        <h2>{isRegistering ? "Registrarse" : "Iniciar Sesión"}</h2>

        <form onSubmit={handleSubmit}>
          {isRegistering && (
            <>
              <div className="form-group">
                <label>Nombre completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre completo"
                  required
                />
              </div>

              <div className="form-group">
                <label>Nombre de usuario</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nombre de usuario"
                  required
                />
              </div>

              <div className="form-group">
                <label>Rol</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                >
                  <option value="estudiante">Estudiante</option>
                  <option value="docente">Docente</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@ejemplo.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn">
            {isRegistering ? "Registrarse" : "Ingresar"}
          </button>
        </form>

        <p className="toggle-text">
          {isRegistering ? (
            <>
              ¿Ya tienes una cuenta?{" "}
              <button
                onClick={() => setIsRegistering(false)}
                className="toggle-btn"
              >
                Inicia sesión aquí
              </button>
            </>
          ) : (
            <>
              ¿No tienes una cuenta?{" "}
              <button
                onClick={() => setIsRegistering(true)}
                className="toggle-btn"
              >
                Regístrate aquí
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
