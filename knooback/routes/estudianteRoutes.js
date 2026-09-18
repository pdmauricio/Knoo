const express = require("express");
const router = express.Router();
const estudianteController = require("../controllers/estudianteController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.get("/cursos", authenticateToken, estudianteController.getCursos);
router.post("/matricula", authenticateToken, estudianteController.postMatricula);
router.get("/mis-cursos", authenticateToken, estudianteController.getMisCursos);
router.get("/profile", authenticateToken, estudianteController.getProfile);

module.exports = router;
