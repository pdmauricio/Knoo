import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function Registroview({titulo="profe o estudiante"}) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    nombre: "",
    dni: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
    email: "",
    contraseña: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Datos registrados:", formData);
    navigate("/bienvenida"); // redirige a la página que quieras
  };

  return (
    <div className="registro-container">
      <h2>REGISTRATE COMO {titulo}</h2>
      <form onSubmit={handleSubmit} className="registro-form">
        <input
          type="text"
          name="nombre"
          placeholder="Nombre"
          value={formData.nombre}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="apellidoPaterno"
          placeholder="Apellido paterno"
          value={formData.apellidoPaterno}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="apellidoMaterno"
          placeholder="Apellido materno"
          value={formData.apellidoMaterno}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="dni"
          placeholder="DNI"
          value={formData.dni}
          onChange={handleChange}
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Correo electrónico"
          value={formData.email}
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="contraseña"
          placeholder="Crear contraseña"
          value={formData.contraseña}
          onChange={handleChange}
          required
        />
        <button type="submit">Registrarse</button>
      </form>
    </div>
  );
}

export default Registroview;
