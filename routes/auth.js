const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

// POST /api/registro
router.post('/registro', async (req, res) => {
  const { nombre, apellido, email, cedula, telefono, direccion, tipo_institucion, contrasena } = req.body;

  if (!nombre || !apellido || !email || !cedula || !telefono || !direccion || !tipo_institucion || !contrasena) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  try {
    const contrasena_hash = await bcrypt.hash(contrasena, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, apellido, email, cedula, telefono, direccion, tipo_institucion, contrasena_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nombre, apellido, email, cedula, tipo_institucion`,
      [nombre, apellido, email, cedula, telefono, direccion, tipo_institucion, contrasena_hash]
    );
    const usuario = result.rows[0];
    const token = jwt.sign({ id: usuario.id, email: usuario.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, usuario });
  } catch (err) {
    if (err.code === '23505') {
      const campo = err.constraint?.includes('email') ? 'correo' : 'cédula';
      return res.status(409).json({ error: `Ya existe una cuenta con ese ${campo}` });
    }
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  const { cedula, contrasena } = req.body;

  if (!cedula || !contrasena) {
    return res.status(400).json({ error: 'Cédula y contraseña son requeridos' });
  }

  try {
    const result = await pool.query(
      `SELECT id, nombre, apellido, email, cedula, tipo_institucion, contrasena_hash
       FROM usuarios WHERE cedula = $1`,
      [cedula]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Cédula o contraseña incorrectos' });
    }
    const usuario = result.rows[0];
    const coincide = await bcrypt.compare(contrasena, usuario.contrasena_hash);
    if (!coincide) {
      return res.status(401).json({ error: 'Cédula o contraseña incorrectos' });
    }
    const { contrasena_hash, ...datos } = usuario;
    const token = jwt.sign({ id: datos.id, email: datos.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, usuario: datos });
  } catch {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

module.exports = router;
