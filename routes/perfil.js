const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { auth } = require('../middleware/auth');

// GET /api/perfil
router.get('/perfil', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, apellido, email, cedula, telefono, direccion, tipo_institucion, created_at
       FROM usuarios WHERE id = $1`,
      [req.usuario.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// PUT /api/perfil
router.put('/perfil', auth, async (req, res) => {
  const { nombre, apellido, email, telefono, direccion, tipo_institucion } = req.body;
  if (!nombre || !apellido || !email || !telefono || !direccion || !tipo_institucion) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  try {
    const result = await pool.query(
      `UPDATE usuarios
       SET nombre = $1, apellido = $2, email = $3, telefono = $4, direccion = $5, tipo_institucion = $6
       WHERE id = $7
       RETURNING id, nombre, apellido, email, cedula, tipo_institucion`,
      [nombre, apellido, email, telefono, direccion, tipo_institucion, req.usuario.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese correo ya está registrado' });
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// PUT /api/perfil/contrasena
router.put('/perfil/contrasena', auth, async (req, res) => {
  const { contrasena_actual, contrasena_nueva } = req.body;
  if (!contrasena_actual || !contrasena_nueva) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  try {
    const result = await pool.query(
      'SELECT contrasena_hash FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const coincide = await bcrypt.compare(contrasena_actual, result.rows[0].contrasena_hash);
    if (!coincide) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    const hash = await bcrypt.hash(contrasena_nueva, 10);
    await pool.query('UPDATE usuarios SET contrasena_hash = $1 WHERE id = $2', [hash, req.usuario.id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

module.exports = router;
