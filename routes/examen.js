const router = require('express').Router();
const pool = require('../db');
const { authOpcional } = require('../middleware/auth');

const EXAMEN_BLOQUES = {
  1: [{ idMateria: 2, cantidad: 16 }, { idMateria: 1, cantidad: 8 },  { idMateria: 3, cantidad: 16 }],
  2: [{ idMateria: 2, cantidad: 12 }, { idMateria: 1, cantidad: 8 },  { idMateria: 4, cantidad: 20 }],
  3: [{ idMateria: 2, cantidad: 8 },  { idMateria: 1, cantidad: 16 }, { idMateria: 5, cantidad: 16 }],
  4: [{ idMateria: 7, cantidad: 8 },  { idMateria: 1, cantidad: 16 }, { idMateria: 6, cantidad: 16 }],
  5: [{ idMateria: 2, cantidad: 20 }, { idMateria: 1, cantidad: 8 },  { idMateria: 8, cantidad: 12 }],
  6: [{ idMateria: 2, cantidad: 8 },  { idMateria: 4, cantidad: 16 }, { idMateria: 9, cantidad: 16 }],
};

// GET /api/bloques
router.get('/bloques', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bloques ORDER BY id_bloque');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Error al obtener bloques' });
  }
});

// GET /api/examen/iniciar
router.get('/examen/iniciar', async (req, res) => {
  const { idBloque, todo, idMateria, cantidad: cantidadParam } = req.query;
  const config = EXAMEN_BLOQUES[idBloque];
  if (!config) return res.status(400).json({ error: 'Bloque inválido' });

  const isDebug = process.env.DEBUG === 'true';

  try {
    if (idMateria) {
      const materiaConfig = config.find(m => m.idMateria == idMateria);
      if (!materiaConfig) return res.status(400).json({ error: 'Materia no válida para este bloque' });

      if (isDebug) {
        const result = await pool.query(
          `SELECT id, id_materia, id_pregunta_local FROM preguntas WHERE id_bloque = $1 AND id_materia = $2 ORDER BY id_pregunta_local`,
          [idBloque, idMateria]
        );
        const ids = result.rows.map(r => r.id);
        const meta = {};
        result.rows.forEach(r => { meta[r.id] = { idMateria: r.id_materia, local: r.id_pregunta_local }; });
        return res.json({ ids, total: ids.length, debug: true, meta });
      }

      const cantidad = cantidadParam ? parseInt(cantidadParam, 10) : materiaConfig.cantidad;
      const result = await pool.query(
        `SELECT id FROM preguntas WHERE id_bloque = $1 AND id_materia = $2 ORDER BY RANDOM() LIMIT $3`,
        [idBloque, idMateria, cantidad]
      );
      return res.json({ ids: result.rows.map(r => r.id), total: result.rows.length });
    }

    if (isDebug && todo === 'true') {
      const result = await pool.query(
        `SELECT id, id_materia, id_pregunta_local FROM preguntas WHERE id_bloque = $1 ORDER BY id_materia, id_pregunta_local`,
        [idBloque]
      );
      const ids = result.rows.map(r => r.id);
      const meta = {};
      result.rows.forEach(r => { meta[r.id] = { idMateria: r.id_materia, local: r.id_pregunta_local }; });
      return res.json({ ids, total: ids.length, debug: true, meta });
    }

    const grupos = await Promise.all(
      config.map(({ idMateria, cantidad }) =>
        pool.query(
          `SELECT id, id_materia, id_pregunta_local FROM preguntas WHERE id_bloque = $1 AND id_materia = $2 ORDER BY RANDOM() LIMIT $3`,
          [idBloque, idMateria, cantidad]
        )
      )
    );
    const ids = grupos.flatMap(g => g.rows.map(r => r.id));

    if (isDebug) {
      const meta = {};
      grupos.forEach(g => g.rows.forEach(r => { meta[r.id] = { idMateria: r.id_materia, local: r.id_pregunta_local }; }));
      return res.json({ ids, total: ids.length, debug: true, meta });
    }

    res.json({ ids, total: ids.length });
  } catch {
    res.status(500).json({ error: 'Error al iniciar examen' });
  }
});

// GET /api/examen/pregunta/:id
router.get('/examen/pregunta/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d
       FROM preguntas WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Error al obtener pregunta' });
  }
});

// POST /api/verificar
router.post('/verificar', authOpcional, async (req, res) => {
  const { respuestas, idBloque } = req.body;
  if (!respuestas || !Array.isArray(respuestas)) {
    return res.status(400).json({ error: 'Se esperaba un array de respuestas' });
  }

  try {
    const ids = respuestas.map(r => r.id);
    const result = await pool.query(
      `SELECT id, respuesta_correcta, descripcion, url_imagen,
              opcion_a, opcion_b, opcion_c, opcion_d,
              justificacion, url_justificacion
       FROM preguntas WHERE id = ANY($1)`,
      [ids]
    );

    const map = {};
    for (const row of result.rows) map[row.id] = row;

    let correctas = 0;
    const detalle = respuestas.map(r => {
      const p = map[r.id];
      const esCorrecta = p && r.respuesta === p.respuesta_correcta;
      if (esCorrecta) correctas++;
      return {
        id: r.id,
        descripcion: p?.descripcion,
        url_imagen: p?.url_imagen,
        opcion_a: p?.opcion_a,
        opcion_b: p?.opcion_b,
        opcion_c: p?.opcion_c,
        opcion_d: p?.opcion_d,
        respuesta_usuario: r.respuesta,
        respuesta_correcta: p?.respuesta_correcta,
        correcta: esCorrecta,
        justificacion: p?.justificacion,
        url_justificacion: p?.url_justificacion,
      };
    });

    const puntaje = correctas * 25;

    if (req.usuario && idBloque) {
      const examen = await pool.query(
        `INSERT INTO examenes (id_usuario, id_bloque, total, correctas, puntaje)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.usuario.id, idBloque, respuestas.length, correctas, puntaje]
      );
      const idExamen = examen.rows[0].id;
      const valores = detalle.map(d =>
        `(${idExamen}, ${d.id}, ${d.respuesta_usuario ? `'${d.respuesta_usuario}'` : 'NULL'}, ${d.correcta})`
      ).join(',');
      await pool.query(`INSERT INTO respuestas_examen (id_examen, id_pregunta, respuesta_usuario, correcta) VALUES ${valores}`);
    }

    res.json({ total: respuestas.length, correctas, puntaje, detalle });
  } catch (err) {
    console.error('[verificar] Error:', err.message);
    res.status(500).json({ error: 'Error al verificar respuestas' });
  }
});

module.exports = router;
