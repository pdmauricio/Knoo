import Ingresar from "./Ingresar.jsx";
import "./Fondo_principal.css";

function Fondo_principal(){
  return (
    <div className="fondo">
        <h1>KNOO</h1>
        <Ingresar ruta="/Ingresarview" />
    </div>
  )
}

export default  Fondo_principal;