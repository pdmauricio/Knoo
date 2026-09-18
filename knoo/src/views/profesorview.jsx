import React from 'react'

function profesorview({profesor}) {
    return (
        <div>
            <h1>{profesor.name}</h1>
            <h2>{profesor.descripcion}</h2>
            <img src="{profesor.image}" alt= {profesor.name +" image"} />
        </div>
    )
}

export default profesorview