const router = require('express').Router();
const pool = require('../db');
const { authOpcional } = require('../middleware/auth');

// Config del examen cargada desde la DB (lazy, se cachea en memoria).
// Fuente: informacion_bloque.config_materias + materias (para resolver nombre → id_materia).
let _examenBloques = null;

async function getExamenBloques() {
  if (_examenBloques) return _examenBloques;
  const [{ rows: infoRows }, { rows: materiasRows }] = await Promise.all([
    pool.query('SELECT id_bloque, config_materias FROM informacion_bloque ORDER BY id_bloque'),
    pool.query('SELECT id_materia, nombre FROM simulador.materias'),
  ]);
  const materiasMap = Object.fromEntries(
    materiasRows.map(m => [m.nombre.toLowerCase(), m.id_materia])
  );
  _examenBloques = {};
  for (const row of infoRows) {
    _examenBloques[row.id_bloque] = row.config_materias
      .map(m => ({ idMateria: materiasMap[m.nombre.toLowerCase()], cantidad: m.cantidad }))
      .filter(m => m.idMateria != null);
  }
  return _examenBloques;
}

// GET /api/bloques
router.get('/bloques', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bloques ORDER BY id_bloque');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Error al obtener bloques' });
  }
});

// GET /api/bloques-info  — bloques con materias, conteo real de preguntas y carreras (desde informacion_bloque)
router.get('/bloques-info', async (req, res) => {
  try {
    const [{ rows: infoRows }, { rows: materiasRows }] = await Promise.all([
      pool.query(
        `SELECT b.id_bloque, b.nombre, ib.carreras, ib.config_materias
         FROM informacion_bloque ib
         JOIN bloques b USING (id_bloque)
         ORDER BY b.id_bloque`
      ),
      pool.query('SELECT id_materia, nombre FROM simulador.materias'),
    ]);

    // mapa nombre (lowercase) → id_materia para detectar materias reales
    const materiasMap = Object.fromEntries(
      materiasRows.map(m => [m.nombre.toLowerCase(), m.id_materia])
    );

    const bloques = infoRows.map(row => ({
      id: row.id_bloque,
      nombre: row.nombre,
      carreras: row.carreras,
      materias: row.config_materias.map(m => ({
        id: materiasMap[m.nombre.toLowerCase()] ?? null,
        nombre: m.nombre,
        cantidad: m.cantidad,
        porcentaje: m.porcentaje,
      })),
    }));

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

  const isDebug = process.env.DEBUG === 'true';
  if (isDebug) {
    console.log(`[DEBUG] /examen/iniciar — bloque=${idBloque} materia=${idMateria || '-'} unidades=${idUnidadesParam || '-'} todo=${todo || '-'}`);
  }
  const idUnidades = idUnidadesParam
    ? idUnidadesParam.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n))
    : null;

  try {
    const examenBloques = await getExamenBloques();
    const config = examenBloques[idBloque];
    if (!config) return res.status(400).json({ error: 'Bloque inválido' });

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
        console.log(`[DEBUG] Materia ${idMateria}: ${ids.length} preguntas${idUnidades?.length ? ` (${idUnidades.length} unidades)` : ''}`);
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
      console.log(`[DEBUG] Bloque ${idBloque} completo (todo=true): ${ids.length} preguntas en orden`);
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
      console.log(`[DEBUG] Bloque ${idBloque} aleatorio: ${ids.length} preguntas (${grupos.length} materias)`);
      grupos.forEach((g, i) => {
        const idMat = config[i]?.idMateria;
        console.log(`[DEBUG]   materia ${idMat}: ${g.rows.length} preguntas`);
      });
      return res.json({ ids, total: ids.length, debug: true, meta });
    }

    res.json({ ids, total: ids.length });
  } catch (err) {
    console.error('[examen/iniciar]', err.message);
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

    if (process.env.DEBUG === 'true') {
      const uid = req.usuario ? `usuario ${req.usuario.id}` : 'anonimo';
      console.log(`[DEBUG] /verificar — ${uid} bloque=${idBloque || '-'} total=${respuestas.length} correctas=${correctas} puntaje=${puntaje}`);
    }
    res.json({ total: respuestas.length, correctas, puntaje, detalle });
  } catch (err) {
    console.error('[verificar] Error:', err.message);
    res.status(500).json({ error: 'Error al verificar respuestas' });
  }
});

function invalidarCacheExamen() { _examenBloques = null; }

module.exports = router;
module.exports.invalidarCacheExamen = invalidarCacheExamen;
