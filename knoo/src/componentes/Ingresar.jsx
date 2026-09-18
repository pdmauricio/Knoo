import React from "react";
import { useNavigate } from "react-router-dom";
import "./Ingresar.css";

function Ingresar(props) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(props.ruta); //ruta
  };

  return (
    <div className="ingresar-container">
      <button className="ingresar-boton" onClick={handleClick}>
        Iniciar sesión
      </button>
    </div>
  );
}

export default Ingresar;
