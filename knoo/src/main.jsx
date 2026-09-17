import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Ingresarview from "./views/Ingresarview.jsx";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Registroview from "./views/Registroview.jsx";
import DocenteDashboard from "./views/DocenteDashboard.jsx";
import EstudianteDashboard from "./views/EstudianteDashboard.jsx"; // Añadir esta importación

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "Profesor",
    element: <div>Profesor página</div>,
  },
  {
    path: "/Ingresarview",
    element: <Ingresarview />,
  },
  {
    path: "/Registra-estudiante",
    element: <Registroview titulo="ESTUDIANTE" />,
  },
  // Nuevas rutas para el dashboard
  {
    path: "/docente/dashboard",
    element: <DocenteDashboard />,
  },
  {
    path: "/estudiante/dashboard",
    element: <EstudianteDashboard />,
  },
]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
