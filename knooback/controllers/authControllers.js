const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { JWT_SECRET } = require("../middleware/authMiddleware");

exports.register = async (req, res) => {
  try {
    const { email, password, username, name, role } = req.body;

    const { rows: existingUsers } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: "El usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (email, password, username, name, role) VALUES ($1, $2, $3, $4, $5)',
      [email, hashedPassword, username, name, role]
    );

    res.status(201).json({ message: "Usuario registrado exitosamente" });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows: users } = await pool.query(
      'SELECT id, email, password, role FROM users WHERE email = $1',
      [email]
    );

    if (users.length === 0 || !(await bcrypt.compare(password, users[0].password))) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = users[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      role: user.role,
      message: "Login exitoso",
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

exports.logout = async (req, res) => {
  try {
    res.json({ message: "Sesión cerrada exitosamente" });
  } catch (error) {
    res.status(500).json({ message: "Error al cerrar sesión" });
  }
};
