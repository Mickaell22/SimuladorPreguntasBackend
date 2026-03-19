const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// GET /api/historial
router.get('/historial', auth, async (req, res) => {
  const POR_PAGINA = 10;
  const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
  const offset = (pagina - 1) * POR_PAGINA;
  try {
    const [result, total] = await Promise.all([
      pool.query(
        `SELECT e.id, e.id_bloque, b.nombre AS bloque_nombre,
                e.total, e.correctas, e.puntaje, e.fecha
         FROM examenes e
         JOIN bloques b ON b.id_bloque = e.id_bloque
         WHERE e.id_usuario = $1
         ORDER BY e.fecha DESC
         LIMIT $2 OFFSET $3`,
        [req.usuario.id, POR_PAGINA, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM examenes WHERE id_usuario = $1`, [req.usuario.id]),
    ]);
    const totalExamenes = parseInt(total.rows[0].count);
    res.json({
      examenes: result.rows,
      pagina,
      totalPaginas: Math.ceil(totalExamenes / POR_PAGINA),
      total: totalExamenes,
    });
  } catch {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// GET /api/historial/:id
router.get('/historial/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const examen = await pool.query(
      `SELECT e.id, e.id_bloque, b.nombre AS bloque_nombre,
              e.total, e.correctas, e.puntaje, e.fecha
       FROM examenes e
       JOIN bloques b ON b.id_bloque = e.id_bloque
       WHERE e.id = $1 AND e.id_usuario = $2`,
      [id, req.usuario.id]
    );
    if (!examen.rows.length) return res.status(404).json({ error: 'Examen no encontrado' });

    const respuestas = await pool.query(
      `SELECT p.id, p.descripcion, p.url_imagen,
              p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d,
              p.respuesta_correcta, p.justificacion, p.url_justificacion,
              re.respuesta_usuario, re.correcta,
              m.nombre AS nombre_materia,
              u.nombre_unidad,
              t.nombre_tema
       FROM respuestas_examen re
       JOIN preguntas p ON p.id = re.id_pregunta
       LEFT JOIN materias m ON m.id_materia = p.id_materia
       LEFT JOIN simulador.preguntas sp ON sp.id = p.id
       LEFT JOIN simulador.unidades u ON u.id_bloque = p.id_bloque AND u.id_materia = p.id_materia AND u.id_unidad = sp.id_unidad
       LEFT JOIN simulador.temas t ON t.id_bloque = p.id_bloque AND t.id_materia = p.id_materia AND t.id_unidad = sp.id_unidad AND t.id_tema = sp.id_tema
       WHERE re.id_examen = $1`,
      [id]
    );

    res.json({ ...examen.rows[0], detalle: respuestas.rows });
  } catch {
    res.status(500).json({ error: 'Error al obtener el examen' });
  }
});

module.exports = router;
