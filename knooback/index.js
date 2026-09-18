const express = require("express");
const cors = require("cors");
require('dotenv').config();

const authRoutes = require("./routes/authRoutes");
const docenteRoutes = require("./routes/docenteRoutes");
const estudianteRoutes = require("./routes/estudianteRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Mismas rutas que antes: /api/register, /api/login, /api/logout
app.use("/api", authRoutes);
// Mismas rutas que antes: /api/docente/...
app.use("/api/docente", docenteRoutes);
// Mismas rutas que antes: /api/estudiante/...
app.use("/api/estudiante", estudianteRoutes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
