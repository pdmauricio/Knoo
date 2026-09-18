
import "./Preguntas.css"
import React, { useState } from 'react'

function Preguntas(props){
    const [show, setShow] = useState(false);

    const handleClick = (event) => {
        setShow(!show);
    }

    return(
        <div className="pregunta">
            <button onClick={handleClick}>{show ? "Esconder" : "Pregunta"}</button>
            {show && <h2>{props.respuesta}</h2>}
        </div>
    )
}

export default Preguntas