import "./Card.css"

function Card({titulo="Titulo por defecto", 
    descripcion= "Descripción por defecto"}){
    return (
    <div className="Card">
        <h2>{titulo}</h2>
        <p>{descripcion}</p>
    </div>

)
}

export default Card;