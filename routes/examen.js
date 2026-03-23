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

// GET /api/bloques-info  — bloques con materias y conteo real de preguntas
router.get('/bloques-info', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id_bloque, b.nombre,
              m.id_materia, m.nombre AS nombre_materia,
              COUNT(p.id)::int AS total_preguntas
       FROM bloques b
       LEFT JOIN materias_por_bloque mpb ON b.id_bloque = mpb.id_bloque
       LEFT JOIN materias m ON mpb.id_materia = m.id_materia
       LEFT JOIN preguntas p ON p.id_bloque = b.id_bloque AND p.id_materia = m.id_materia
       GROUP BY b.id_bloque, b.nombre, m.id_materia, m.nombre
       ORDER BY b.id_bloque, m.id_materia`
    );

    // Agrupar por bloque y mezclar con config del examen
    const bloquesMap = {};
    for (const row of rows) {
      if (!bloquesMap[row.id_bloque]) {
        bloquesMap[row.id_bloque] = { id: row.id_bloque, nombre: row.nombre, materias: [] };
      }
      if (row.id_materia !== null) {
        const examConfig = (EXAMEN_BLOQUES[row.id_bloque] || []).find(c => c.idMateria === row.id_materia);
        bloquesMap[row.id_bloque].materias.push({
          id: row.id_materia,
          nombre: row.nombre_materia,
          cantidad: examConfig ? examConfig.cantidad : 0,
          total_preguntas: row.total_preguntas,
        });
      }
    }

    const bloques = Object.values(bloquesMap).map(b => {
      const totalExamen = b.materias.reduce((s, m) => s + m.cantidad, 0);
      return {
        ...b,
        materias: b.materias.map(m => ({
          ...m,
          porcentaje: totalExamen > 0 ? Math.round((m.cantidad / totalExamen) * 100) : 0,
        })),
      };
    });

    res.json(bloques);
  } catch (err) {
    console.error('[bloques-info]', err.message);
    res.status(500).json({ error: 'Error al obtener bloques' });
  }
});

// GET /api/examen/unidades?idBloque=N&idMateria=M
router.get('/examen/unidades', async (req, res) => {
  const { idBloque, idMateria } = req.query;
  if (!idBloque || !idMateria) return res.status(400).json({ error: 'Se requiere idBloque e idMateria' });
  try {
    const result = await pool.query(
      `SELECT id_unidad, nombre_unidad,
              COUNT(p.id)::int AS total_preguntas
       FROM unidades u
       LEFT JOIN preguntas p USING (id_bloque, id_materia, id_unidad)
       WHERE u.id_bloque = $1 AND u.id_materia = $2
       GROUP BY id_unidad, nombre_unidad
       ORDER BY id_unidad`,
      [idBloque, idMateria]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Error al obtener unidades' });
  }
});

// GET /api/examen/iniciar
router.get('/examen/iniciar', async (req, res) => {
  const { idBloque, todo, idMateria, cantidad: cantidadParam, idUnidades: idUnidadesParam } = req.query;
  const config = EXAMEN_BLOQUES[idBloque];
  if (!config) return res.status(400).json({ error: 'Bloque inválido' });

  const isDebug = process.env.DEBUG === 'true';
  const idUnidades = idUnidadesParam
    ? idUnidadesParam.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n))
    : null;

  try {
    if (idMateria) {
      const materiaConfig = config.find(m => m.idMateria == idMateria);
      if (!materiaConfig) return res.status(400).json({ error: 'Materia no válida para este bloque' });

      if (isDebug) {
        const q = idUnidades && idUnidades.length
          ? `SELECT id, id_materia, id_pregunta_local FROM preguntas WHERE id_bloque = $1 AND id_materia = $2 AND id_unidad = ANY($3) ORDER BY id_pregunta_local`
          : `SELECT id, id_materia, id_pregunta_local FROM preguntas WHERE id_bloque = $1 AND id_materia = $2 ORDER BY id_pregunta_local`;
        const params = idUnidades && idUnidades.length ? [idBloque, idMateria, idUnidades] : [idBloque, idMateria];
        const result = await pool.query(q, params);
        const ids = result.rows.map(r => r.id);
        const meta = {};
        result.rows.forEach(r => { meta[r.id] = { idMateria: r.id_materia, local: r.id_pregunta_local }; });
        return res.json({ ids, total: ids.length, debug: true, meta });
      }

      const cantidad = cantidadParam ? parseInt(cantidadParam, 10) : materiaConfig.cantidad;
      if (idUnidades && idUnidades.length) {
        const result = await pool.query(
          `SELECT id FROM preguntas WHERE id_bloque = $1 AND id_materia = $2 AND id_unidad = ANY($3) ORDER BY RANDOM() LIMIT $4`,
          [idBloque, idMateria, idUnidades, cantidad]
        );
        return res.json({ ids: result.rows.map(r => r.id), total: result.rows.length });
      }

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
      `SELECT p.id, p.respuesta_correcta, p.descripcion, p.url_imagen,
              p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d,
              p.justificacion, p.url_justificacion,
              m.nombre AS nombre_materia,
              sp.id_unidad AS num_unidad,
              u.nombre_unidad,
              sp.id_tema AS num_tema,
              t.nombre_tema
       FROM preguntas p
       LEFT JOIN materias m ON m.id_materia = p.id_materia
       LEFT JOIN simulador.preguntas sp ON sp.id = p.id
       LEFT JOIN simulador.unidades u ON u.id_bloque = p.id_bloque AND u.id_materia = p.id_materia AND u.id_unidad = sp.id_unidad
       LEFT JOIN simulador.temas t ON t.id_bloque = p.id_bloque AND t.id_materia = p.id_materia AND t.id_unidad = sp.id_unidad AND t.id_tema = sp.id_tema
       WHERE p.id = ANY($1)`,
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
        nombre_materia: p?.nombre_materia,
        num_unidad: p?.num_unidad,
        nombre_unidad: p?.nombre_unidad,
        num_tema: p?.num_tema,
        nombre_tema: p?.nombre_tema,
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
      await Promise.all(detalle.map(d =>
        pool.query(
          'INSERT INTO respuestas_examen (id_examen, id_pregunta, respuesta_usuario, correcta) VALUES ($1, $2, $3, $4)',
          [idExamen, d.id, d.respuesta_usuario || null, d.correcta]
        )
      ));
    }

    res.json({ total: respuestas.length, correctas, puntaje, detalle });
  } catch (err) {
    console.error('[verificar] Error:', err.message);
    res.status(500).json({ error: 'Error al verificar respuestas' });
  }
});

module.exports = router;
