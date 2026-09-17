/*import { useState } from 'react'*/
import reactLogo from './assets/react.svg'
/*import viteLogo from '/vite.svg'*/
import './App.css'
import Card from './componentes/Card'
import Ventajas from './data/ventajas'
import ShowHide from './componentes/ShowHide'
import Header from './componentes/Header'
import Fondo_principal from './componentes/Fondo_principal'
import Mensajes from './componentes/Mensajes'
import Preguntas from './componentes/Preguntas'
import Cuadro_de_pase from './componentes/Cuadro_de_pase'

function App() {
  const ventajasList = Ventajas.map(v => {
    return <Card titulo={v.name}
    descripcion={v.descripcion}/>
  })


  return (
    <div className='App'>
      <Header/>
      <Fondo_principal/>
    </div>
  )
}

export default App
