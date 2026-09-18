const express = require("express");
const router = express.Router();
const docenteController = require("../controllers/docenteControllers");
const { authenticateToken } = require("../middleware/authMiddleware");

router.get("/cursos", authenticateToken, docenteController.getCursos);
router.post("/horario", authenticateToken, docenteController.postHorario);
router.get("/alumnos", authenticateToken, docenteController.getAlumnos);
router.get("/mis-cursos", authenticateToken, docenteController.getMisCursos);
router.delete("/curso/:cursoId", authenticateToken, docenteController.deleteCurso);
router.get("/profile", authenticateToken, docenteController.getProfile);
router.get("/rdf", authenticateToken, docenteController.getRdf);
router.get("/rdf-graph", authenticateToken, docenteController.getRdfGraph);

module.exports = router;
