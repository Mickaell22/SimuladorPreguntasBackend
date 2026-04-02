const router = require('express').Router();
const pool = require('../db');

// GET /api/debug/imagenes — solo disponible en modo DEBUG
router.get('/debug/imagenes', async (req, res) => {
  if (process.env.DEBUG !== 'true') return res.status(403).json({ error: 'Solo disponible en modo debug' });
  try {
    const result = await pool.query(
      `SELECT p.id, p.id_bloque, p.id_materia, p.id_pregunta_local,
              p.descripcion, p.url_imagen,
              p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta,
              b.nombre AS bloque_nombre, m.nombre AS materia_nombre
       FROM preguntas p
       JOIN bloques b ON b.id_bloque = p.id_bloque
       JOIN materias m ON m.id_materia = p.id_materia
       WHERE p.url_imagen IS NOT NULL
          OR p.opcion_a LIKE 'data:image%'
          OR p.opcion_b LIKE 'data:image%'
          OR p.opcion_c LIKE 'data:image%'
          OR p.opcion_d LIKE 'data:image%'
       ORDER BY p.id_bloque, p.id_materia, p.id_pregunta_local`
    );
    console.log(`[DEBUG] /debug/imagenes — ${result.rows.length} preguntas con imagen encontradas`);
    res.json(result.rows);
  } catch (err) {
    console.error('[DEBUG] /debug/imagenes error:', err.message);
    res.status(500).json({ error: 'Error al obtener preguntas con imagen' });
  }
});

module.exports = router;
