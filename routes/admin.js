const router = require('express').Router();
const pool = require('../db');
const { authAdmin } = require('../middleware/auth');

// Aplicar authAdmin a todas las rutas de este router
router.use(authAdmin);

// ─── BLOQUES ───────────────────────────────────────────────────────────────────

router.get('/bloques', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bloques ORDER BY id_bloque');
    res.json(rows);
  } catch { res.status(500).json({ error: 'Error al obtener bloques' }); }
});

router.post('/bloques', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO bloques (nombre) VALUES ($1) RETURNING *',
      [nombre]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al crear bloque' }); }
});

router.put('/bloques/:id', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  try {
    const { rows } = await pool.query(
      'UPDATE bloques SET nombre = $1 WHERE id_bloque = $2 RETURNING *',
      [nombre, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Bloque no encontrado' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al actualizar bloque' }); }
});

router.delete('/bloques/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM bloques WHERE id_bloque = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Bloque no encontrado' });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Error al eliminar bloque' }); }
});

// ─── MATERIAS ──────────────────────────────────────────────────────────────────

router.get('/materias', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM materias ORDER BY id_materia');
    res.json(rows);
  } catch { res.status(500).json({ error: 'Error al obtener materias' }); }
});

router.post('/materias', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO materias (nombre) VALUES ($1) RETURNING *',
      [nombre]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al crear materia' }); }
});

router.put('/materias/:id', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  try {
    const { rows } = await pool.query(
      'UPDATE materias SET nombre = $1 WHERE id_materia = $2 RETURNING *',
      [nombre, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Materia no encontrada' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al actualizar materia' }); }
});

router.delete('/materias/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM materias WHERE id_materia = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Materia no encontrada' });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Error al eliminar materia' }); }
});

// ─── UNIDADES ──────────────────────────────────────────────────────────────────

router.get('/unidades', async (req, res) => {
  const { id_materia, id_bloque, search, page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;
  const conds = []; const params = [];
  if (id_bloque)  { conds.push(`u.id_bloque = $${params.length + 1}`); params.push(id_bloque); }
  if (id_materia) { conds.push(`u.id_materia = $${params.length + 1}`); params.push(id_materia); }
  if (search)     { conds.push(`u.nombre_unidad ILIKE $${params.length + 1}`); params.push(`%${search}%`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM unidades u ${where}`, params);
    const { rows } = await pool.query(
      `SELECT u.id_bloque, u.id_materia, u.id_unidad, u.nombre_unidad AS nombre,
              b.nombre as bloque_nombre, m.nombre as materia_nombre
       FROM unidades u
       LEFT JOIN bloques b ON u.id_bloque = b.id_bloque
       LEFT JOIN materias m ON u.id_materia = m.id_materia
       ${where}
       ORDER BY u.id_bloque, u.id_materia, u.id_unidad
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json({ total: parseInt(countRes.rows[0].count), page: parseInt(page), rows });
  } catch { res.status(500).json({ error: 'Error al obtener unidades' }); }
});

router.post('/unidades', async (req, res) => {
  const { nombre, id_bloque, id_materia } = req.body;
  if (!nombre || !id_bloque || !id_materia) return res.status(400).json({ error: 'nombre, id_bloque e id_materia son requeridos' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO unidades (nombre_unidad, id_bloque, id_materia) VALUES ($1, $2, $3) RETURNING id_bloque, id_materia, id_unidad, nombre_unidad AS nombre',
      [nombre, id_bloque, id_materia]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al crear unidad' }); }
});

// Clave compuesta: :ib (id_bloque) :im (id_materia) :iu (id_unidad)
router.put('/unidades/:ib/:im/:iu', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  const { ib, im, iu } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE unidades SET nombre_unidad = $1
       WHERE id_bloque = $2 AND id_materia = $3 AND id_unidad = $4
       RETURNING id_bloque, id_materia, id_unidad, nombre_unidad AS nombre`,
      [nombre, ib, im, iu]
    );
    if (!rows.length) return res.status(404).json({ error: 'Unidad no encontrada' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al actualizar unidad' }); }
});

router.delete('/unidades/:ib/:im/:iu', async (req, res) => {
  const { ib, im, iu } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM unidades WHERE id_bloque = $1 AND id_materia = $2 AND id_unidad = $3',
      [ib, im, iu]
    );
    if (!rowCount) return res.status(404).json({ error: 'Unidad no encontrada' });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Error al eliminar unidad' }); }
});

// ─── TEMAS ─────────────────────────────────────────────────────────────────────

router.get('/temas', async (req, res) => {
  const { id_bloque, id_materia, id_unidad, search, page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;
  const conds = []; const params = [];
  if (id_bloque)  { conds.push(`t.id_bloque = $${params.length + 1}`); params.push(id_bloque); }
  if (id_materia) { conds.push(`t.id_materia = $${params.length + 1}`); params.push(id_materia); }
  if (id_unidad)  { conds.push(`t.id_unidad = $${params.length + 1}`); params.push(id_unidad); }
  if (search)     { conds.push(`t.nombre_tema ILIKE $${params.length + 1}`); params.push(`%${search}%`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM temas t ${where}`, params);
    const { rows } = await pool.query(
      `SELECT t.id_tema, t.id_bloque, t.id_materia, t.id_unidad, t.nombre_tema AS nombre,
              u.nombre_unidad as unidad_nombre, m.nombre as materia_nombre
       FROM temas t
       LEFT JOIN unidades u ON t.id_bloque = u.id_bloque AND t.id_materia = u.id_materia AND t.id_unidad = u.id_unidad
       LEFT JOIN materias m ON t.id_materia = m.id_materia
       ${where}
       ORDER BY t.id_materia, t.id_unidad, t.id_tema
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json({ total: parseInt(countRes.rows[0].count), page: parseInt(page), rows });
  } catch { res.status(500).json({ error: 'Error al obtener temas' }); }
});

router.post('/temas', async (req, res) => {
  const { nombre, id_bloque, id_materia, id_unidad } = req.body;
  if (!nombre || !id_bloque || !id_materia || !id_unidad) return res.status(400).json({ error: 'nombre, id_bloque, id_materia e id_unidad son requeridos' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO temas (nombre_tema, id_bloque, id_materia, id_unidad) VALUES ($1, $2, $3, $4) RETURNING id_tema, id_bloque, id_materia, id_unidad, nombre_tema AS nombre',
      [nombre, id_bloque, id_materia, id_unidad]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al crear tema' }); }
});

// Clave compuesta: :ib :im :iu :it
router.put('/temas/:ib/:im/:iu/:it', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  const { ib, im, iu, it } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE temas SET nombre_tema = $1
       WHERE id_bloque = $2 AND id_materia = $3 AND id_unidad = $4 AND id_tema = $5
       RETURNING id_tema, id_bloque, id_materia, id_unidad, nombre_tema AS nombre`,
      [nombre, ib, im, iu, it]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tema no encontrado' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al actualizar tema' }); }
});

router.delete('/temas/:ib/:im/:iu/:it', async (req, res) => {
  const { ib, im, iu, it } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM temas WHERE id_bloque = $1 AND id_materia = $2 AND id_unidad = $3 AND id_tema = $4',
      [ib, im, iu, it]
    );
    if (!rowCount) return res.status(404).json({ error: 'Tema no encontrado' });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Error al eliminar tema' }); }
});

// ─── PREGUNTAS ─────────────────────────────────────────────────────────────────

router.get('/preguntas', async (req, res) => {
  const { id_bloque, id_materia, id_unidad, search, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (id_bloque)  { conditions.push(`p.id_bloque = $${params.length + 1}`); params.push(id_bloque); }
  if (id_materia) { conditions.push(`p.id_materia = $${params.length + 1}`); params.push(id_materia); }
  if (id_unidad)  { conditions.push(`p.id_unidad = $${params.length + 1}`); params.push(id_unidad); }
  if (search)     { conditions.push(`p.descripcion ILIKE $${params.length + 1}`); params.push(`%${search}%`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM preguntas p ${where}`,
      params
    );
    const { rows } = await pool.query(
      `SELECT p.id, p.id_bloque, p.id_materia, p.id_unidad, p.id_tema,
              p.id_pregunta_local, p.descripcion, p.url_imagen,
              p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta,
              b.nombre as bloque_nombre, m.nombre as materia_nombre
       FROM preguntas p
       LEFT JOIN bloques b ON p.id_bloque = b.id_bloque
       LEFT JOIN materias m ON p.id_materia = m.id_materia
       ${where}
       ORDER BY p.id_bloque, p.id_materia, p.id_pregunta_local
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json({ total: parseInt(countRes.rows[0].count), page: parseInt(page), rows });
  } catch (err) { res.status(500).json({ error: 'Error al obtener preguntas' }); }
});

router.get('/preguntas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM preguntas WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al obtener pregunta' }); }
});

router.post('/preguntas', async (req, res) => {
  const {
    id_bloque, id_materia, id_unidad, id_tema, id_pregunta_local,
    descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta
  } = req.body;
  if (!id_bloque || !id_materia || !descripcion || !opcion_a || !opcion_b || !opcion_c || !opcion_d || !respuesta_correcta) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO preguntas
         (id_bloque, id_materia, id_unidad, id_tema, id_pregunta_local,
          descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [id_bloque, id_materia, id_unidad || null, id_tema || null, id_pregunta_local || null,
       descripcion, url_imagen || null, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al crear pregunta' }); }
});

router.put('/preguntas/:id', async (req, res) => {
  const {
    id_bloque, id_materia, id_unidad, id_tema, id_pregunta_local,
    descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta
  } = req.body;
  if (!id_bloque || !id_materia || !descripcion || !opcion_a || !opcion_b || !opcion_c || !opcion_d || !respuesta_correcta) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE preguntas SET
         id_bloque=$1, id_materia=$2, id_unidad=$3, id_tema=$4, id_pregunta_local=$5,
         descripcion=$6, url_imagen=$7, opcion_a=$8, opcion_b=$9, opcion_c=$10, opcion_d=$11,
         respuesta_correcta=$12
       WHERE id=$13 RETURNING *`,
      [id_bloque, id_materia, id_unidad || null, id_tema || null, id_pregunta_local || null,
       descripcion, url_imagen || null, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta,
       req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al actualizar pregunta' }); }
});

router.delete('/preguntas/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM preguntas WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Error al eliminar pregunta' }); }
});

module.exports = router;
