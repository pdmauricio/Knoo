import "./Mensajes.css"

function Mensajes({mensaje}) {
  return (
    <div className="mensajes">
      <div className="mensaje-container">
        <h2>{mensaje}</h2>
      </div>
    </div>
  )
}

export default Mensajes;