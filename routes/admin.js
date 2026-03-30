const router = require('express').Router();
const pool = require('../db');
const { authAdmin } = require('../middleware/auth');
const { invalidarCacheExamen } = require('./examen');
const multer = require('multer');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO bloques (id_bloque, nombre) VALUES ((SELECT COALESCE(MAX(id_bloque),0)+1 FROM bloques), $1) RETURNING *',
      [nombre]
    );
    await client.query(
      'INSERT INTO informacion_bloque (id_bloque, carreras, config_materias) VALUES ($1, $2, $3)',
      [rows[0].id_bloque, '[]', '[]']
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al crear bloque' });
  } finally {
    client.release();
  }
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar que el bloque existe
    const { rowCount: existe } = await client.query('SELECT 1 FROM bloques WHERE id_bloque = $1', [req.params.id]);
    if (!existe) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bloque no encontrado' });
    }

    // Bloquear si tiene preguntas o exámenes (datos reales)
    const { rows: [counts] } = await client.query(
      `SELECT
        (SELECT COUNT(*) FROM preguntas WHERE id_bloque = $1)::int AS preguntas,
        (SELECT COUNT(*) FROM examenes WHERE id_bloque = $1)::int AS examenes`,
      [req.params.id]
    );
    if (counts.preguntas > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `No se puede eliminar: el bloque tiene ${counts.preguntas} pregunta(s) asociada(s)` });
    }
    if (counts.examenes > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `No se puede eliminar: el bloque tiene ${counts.examenes} examen(es) registrado(s)` });
    }

    // Eliminar dependencias en orden
    await client.query('DELETE FROM informacion_bloque   WHERE id_bloque = $1', [req.params.id]);
    await client.query('DELETE FROM materias_por_bloque  WHERE id_bloque = $1', [req.params.id]);
    await client.query('DELETE FROM unidades             WHERE id_bloque = $1', [req.params.id]);
    await client.query('DELETE FROM bloques              WHERE id_bloque = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[delete bloque]', err.message);
    res.status(500).json({ error: 'Error al eliminar bloque' });
  } finally {
    client.release();
  }
});

// ─── INFO BLOQUE (carreras + config_materias) ──────────────────────────────────

router.get('/info-bloque/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id_bloque, carreras, config_materias FROM informacion_bloque WHERE id_bloque = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Info no encontrada' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al obtener info del bloque' }); }
});

router.put('/info-bloque/:id', async (req, res) => {
  const { carreras, config_materias } = req.body;
  if (!Array.isArray(carreras) || !Array.isArray(config_materias))
    return res.status(400).json({ error: 'carreras y config_materias deben ser arrays' });
  try {
    const { rows } = await pool.query(
      `UPDATE informacion_bloque SET carreras = $1, config_materias = $2 WHERE id_bloque = $3 RETURNING *`,
      [JSON.stringify(carreras), JSON.stringify(config_materias), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Info no encontrada' });
    invalidarCacheExamen();
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Error al actualizar info del bloque' }); }
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
      'INSERT INTO materias (id_materia, nombre) VALUES ((SELECT COALESCE(MAX(id_materia),0)+1 FROM materias), $1) RETURNING *',
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

// GET /api/admin/materias-por-bloque/:idMateria
router.get('/materias-por-bloque/:idMateria', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id_bloque FROM materias_por_bloque WHERE id_materia = $1',
      [req.params.idMateria]
    );
    res.json(rows.map(r => r.id_bloque));
  } catch { res.status(500).json({ error: 'Error al obtener relaciones' }); }
});

// PUT /api/admin/materias-por-bloque/:idMateria
router.put('/materias-por-bloque/:idMateria', async (req, res) => {
  const { bloques } = req.body;
  if (!Array.isArray(bloques)) return res.status(400).json({ error: 'bloques debe ser un array' });
  const idMateria = parseInt(req.params.idMateria, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Obtener asignaciones previas y nombre de la materia
    const [{ rows: prevRows }, { rows: matRows }] = await Promise.all([
      client.query('SELECT id_bloque FROM materias_por_bloque WHERE id_materia = $1', [idMateria]),
      client.query('SELECT nombre FROM materias WHERE id_materia = $1', [idMateria]),
    ]);
    const prevBloques = new Set(prevRows.map(r => r.id_bloque));
    const newBloques  = new Set(bloques.map(Number));
    const nombreMateria = matRows[0]?.nombre;

    // Actualizar materias_por_bloque
    await client.query('DELETE FROM materias_por_bloque WHERE id_materia = $1', [idMateria]);
    for (const idBloque of bloques) {
      await client.query(
        'INSERT INTO materias_por_bloque (id_bloque, id_materia) VALUES ($1, $2)',
        [idBloque, idMateria]
      );
    }

    // Sincronizar config_materias en informacion_bloque para bloques afectados
    if (nombreMateria) {
      const nombreLower = nombreMateria.toLowerCase();
      const afectados = new Set([...prevBloques, ...newBloques]);
      for (const idBloque of afectados) {
        const { rows: infoRows } = await client.query(
          'SELECT config_materias FROM informacion_bloque WHERE id_bloque = $1', [idBloque]
        );
        if (!infoRows.length) continue;
        let config = infoRows[0].config_materias || [];

        if (newBloques.has(idBloque)) {
          // Agregar si no está ya configurada
          const existe = config.some(m => m.nombre.toLowerCase() === nombreLower);
          if (!existe) config = [...config, { nombre: nombreMateria, cantidad: 10, porcentaje: 0 }];
        } else {
          // Remover del config si se desasignó del bloque
          config = config.filter(m => m.nombre.toLowerCase() !== nombreLower);
        }

        await client.query(
          'UPDATE informacion_bloque SET config_materias = $1 WHERE id_bloque = $2',
          [JSON.stringify(config), idBloque]
        );
      }
    }

    await client.query('COMMIT');
    invalidarCacheExamen();
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[materias-por-bloque]', err.message);
    res.status(500).json({ error: 'Error al actualizar relaciones' });
  } finally {
    client.release();
  }
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
      `INSERT INTO unidades (id_bloque, id_materia, id_unidad, nombre_unidad)
       VALUES ($1, $2,
         (SELECT COALESCE(MAX(id_unidad), 0) + 1 FROM unidades WHERE id_bloque = $1 AND id_materia = $2),
         $3)
       RETURNING id_bloque, id_materia, id_unidad, nombre_unidad AS nombre`,
      [id_bloque, id_materia, nombre]
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
      `INSERT INTO temas (id_bloque, id_materia, id_unidad, id_tema, nombre_tema)
       VALUES ($1, $2, $3,
         (SELECT COALESCE(MAX(id_tema), 0) + 1 FROM temas WHERE id_bloque = $1 AND id_materia = $2 AND id_unidad = $3),
         $4)
       RETURNING id_tema, id_bloque, id_materia, id_unidad, nombre_tema AS nombre`,
      [id_bloque, id_materia, id_unidad, nombre]
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
  const { id_bloque, id_materia, id_unidad, search, con_imagen, respuesta_correcta, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (id_bloque)  { conditions.push(`p.id_bloque = $${params.length + 1}`); params.push(id_bloque); }
  if (id_materia) { conditions.push(`p.id_materia = $${params.length + 1}`); params.push(id_materia); }
  if (id_unidad)  { conditions.push(`p.id_unidad = $${params.length + 1}`); params.push(id_unidad); }
  if (search)     { conditions.push(`p.descripcion ILIKE $${params.length + 1}`); params.push(`%${search}%`); }
  if (con_imagen === 'si')  { conditions.push(`p.url_imagen IS NOT NULL AND p.url_imagen <> ''`); }
  if (con_imagen === 'no')  { conditions.push(`(p.url_imagen IS NULL OR p.url_imagen = '')`); }
  if (respuesta_correcta)   { conditions.push(`p.respuesta_correcta = $${params.length + 1}`); params.push(respuesta_correcta); }

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

router.get('/preguntas/exportar-xml', async (req, res) => {
  const { id_bloque, id_materia, id_unidad, id_tema } = req.query;
  const conditions = [];
  const params = [];
  if (id_bloque)  { conditions.push(`p.id_bloque  = $${params.length + 1}`); params.push(id_bloque); }
  if (id_materia) { conditions.push(`p.id_materia = $${params.length + 1}`); params.push(id_materia); }
  if (id_unidad)  { conditions.push(`p.id_unidad  = $${params.length + 1}`); params.push(id_unidad); }
  if (id_tema)    { conditions.push(`p.id_tema    = $${params.length + 1}`); params.push(id_tema); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(
      `SELECT p.id_pregunta_local, p.descripcion, p.url_imagen,
              p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta
       FROM preguntas p
       ${where}
       ORDER BY p.id_bloque, p.id_materia, p.id_pregunta_local`,
      params
    );
    const esc = s => (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const questions = rows.map(p => {
      const enunciado = p.url_imagen
        ? `${esc(p.descripcion)}&lt;img src="${p.url_imagen}" /&gt;`
        : esc(p.descripcion);
      const answers = ['a', 'b', 'c', 'd'].map(l => {
        const texto = p[`opcion_${l}`] || '';
        const fraction = p.respuesta_correcta === l ? '100' : '0';
        const content = texto.startsWith('data:image')
          ? `&lt;img src="${texto}" /&gt;`
          : esc(texto);
        return `    <answer fraction="${fraction}" format="html"><text>${content}</text></answer>`;
      });
      return `  <question type="multichoice">
    <name><text>${esc((p.descripcion || '').slice(0, 80))}</text></name>
    <questiontext format="html"><text>${enunciado}</text></questiontext>
    <defaultgrade>1.0000000</defaultgrade>
    <generalfeedback format="html"><text></text></generalfeedback>
    <single>true</single>
    <shuffleanswers>1</shuffleanswers>
    <answernumbering>abc</answernumbering>
${answers.join('\n')}
  </question>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n${questions.join('\n')}\n</quiz>`;
    const filename = `preguntas_bloque${id_bloque || 'todos'}_materia${id_materia || 'todas'}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (err) {
    console.error('[exportar-xml]', err.message);
    res.status(500).json({ error: 'Error al exportar preguntas' });
  }
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
    descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta,
    justificacion, url_justificacion
  } = req.body;
  if (!descripcion || !opcion_a || !opcion_b || !opcion_c || !opcion_d || !respuesta_correcta) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    let localId = id_pregunta_local || null;
    if (!localId && id_bloque && id_materia) {
      const { rows: maxRows } = await pool.query(
        'SELECT COALESCE(MAX(id_pregunta_local), 0) + 1 AS next FROM preguntas WHERE id_bloque=$1 AND id_materia=$2',
        [id_bloque, id_materia]
      );
      localId = maxRows[0].next;
    }
    const { rows } = await pool.query(
      `INSERT INTO preguntas
         (id_bloque, id_materia, id_unidad, id_tema, id_pregunta_local,
          descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta,
          justificacion, url_justificacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [id_bloque || null, id_materia || null, id_unidad || null, id_tema || null, localId,
       descripcion, url_imagen || null, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta,
       justificacion || null, url_justificacion || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error('Error crear pregunta:', e.message); res.status(500).json({ error: 'Error al crear pregunta' }); }
});

router.put('/preguntas/:id', async (req, res) => {
  const {
    id_bloque, id_materia, id_unidad, id_tema, id_pregunta_local,
    descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta,
    justificacion, url_justificacion
  } = req.body;
  if (!id_bloque || !id_materia || !descripcion || !opcion_a || !opcion_b || !opcion_c || !opcion_d || !respuesta_correcta) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE preguntas SET
         id_bloque=$1, id_materia=$2, id_unidad=$3, id_tema=$4, id_pregunta_local=$5,
         descripcion=$6, url_imagen=$7, opcion_a=$8, opcion_b=$9, opcion_c=$10, opcion_d=$11,
         respuesta_correcta=$12, justificacion=$13, url_justificacion=$14
       WHERE id=$15 RETURNING *`,
      [id_bloque, id_materia, id_unidad || null, id_tema || null, id_pregunta_local || null,
       descripcion, url_imagen || null, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta,
       justificacion || null, url_justificacion || null,
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

// ─── IMPORTAR LOTE ─────────────────────────────────────────────────────────────

router.post('/preguntas/importar-lote', async (req, res) => {
  const { id_bloque, id_materia, id_unidad, id_tema, preguntas } = req.body;

  if (!id_bloque)                              return res.status(400).json({ error: 'id_bloque es requerido' });
  if (!id_materia)                             return res.status(400).json({ error: 'id_materia es requerido' });
  if (!Array.isArray(preguntas) || !preguntas.length) return res.status(400).json({ error: 'preguntas es requerido' });

  const client = await pool.connect();
  const importadas = [];
  const errores = [];

  try {
    await client.query('BEGIN');

    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i];
      try {
        if (!p.descripcion?.trim()) { errores.push({ indice: i + 1, motivo: 'descripcion vacia' }); continue; }
        if (!p.opcion_a || !p.opcion_b)       { errores.push({ indice: i + 1, motivo: 'minimo 2 opciones requeridas' }); continue; }

        const { rows: maxRows } = await client.query(
          'SELECT COALESCE(MAX(id_pregunta_local), 0) + 1 AS next FROM preguntas WHERE id_bloque=$1 AND id_materia=$2',
          [id_bloque, id_materia]
        );

        const { rows } = await client.query(
          `INSERT INTO preguntas
             (id_bloque, id_materia, id_unidad, id_tema, id_pregunta_local,
              descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`,
          [id_bloque, id_materia, id_unidad || null, id_tema || null, maxRows[0].next,
           p.descripcion.trim(), p.url_imagen || null,
           p.opcion_a, p.opcion_b, p.opcion_c || null, p.opcion_d || null,
           p.respuesta_correcta || null]
        );
        importadas.push(rows[0].id);
      } catch (e) {
        errores.push({ indice: i + 1, motivo: e.message });
      }
    }

    await client.query('COMMIT');
    res.json({ importadas: importadas.length, errores: errores.length, detalle_errores: errores });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al importar: ' + e.message });
  } finally {
    client.release();
  }
});

// ─── IMPORTAR EXCEL ────────────────────────────────────────────────────────────

router.get('/excel/plantilla', (req, res) => {
  const wb = XLSX.utils.book_new();

  const headers = [
    'descripcion', 'url_imagen',
    'opcion_a', 'opcion_b', 'opcion_c', 'opcion_d',
    'respuesta_correcta', 'justificacion',
  ];

  const ejemplos = [
    ['Ejemplo de pregunta sin imagen', '', 'Opcion correcta', 'Opcion incorrecta 1', 'Opcion incorrecta 2', 'Opcion incorrecta 3', 'A', 'Explicacion opcional'],
    ['Pregunta cuyo enunciado tiene imagen', 'imagen1.jpg', 'Respuesta A', 'Respuesta B', 'Respuesta C', 'Respuesta D', 'B', ''],
    ['Pregunta con imagen en opciones', '', 'opcion_a.jpg', 'opcion_b.jpg', 'opcion_c.jpg', 'opcion_d.jpg', 'C', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplos]);
  ws['!cols'] = [
    { wch: 55 }, { wch: 22 },
    { wch: 32 }, { wch: 32 }, { wch: 32 }, { wch: 32 },
    { wch: 18 }, { wch: 45 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Preguntas');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_preguntas.xlsx"');
  res.send(buf);
});

router.post('/excel/importar',
  upload.fields([
    { name: 'archivo_excel', maxCount: 1 },
    { name: 'archivo_zip',   maxCount: 1 },
  ]),
  async (req, res) => {
    if (!req.files?.archivo_excel?.[0]) {
      return res.status(400).json({ error: 'Se requiere un archivo Excel' });
    }

    // Parsear Excel
    let rows;
    try {
      const wb = XLSX.read(req.files.archivo_excel[0].buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } catch {
      return res.status(400).json({ error: 'No se pudo leer el archivo Excel' });
    }

    if (!rows.length) return res.status(400).json({ error: 'El archivo Excel no contiene filas de datos' });

    // IDs desde el formulario
    const id_bloque_global  = parseInt(req.body.id_bloque)  || null;
    const id_materia_global = parseInt(req.body.id_materia) || null;
    const id_unidad_global  = parseInt(req.body.id_unidad)  || null;
    const id_tema_global    = parseInt(req.body.id_tema)    || null;

    if (!id_bloque_global)  return res.status(400).json({ error: 'id_bloque es requerido' });
    if (!id_materia_global) return res.status(400).json({ error: 'id_materia es requerida' });

    // Extraer imagenes del zip (nombre_archivo_lowercase -> dataURL)
    const imagenes = {};
    if (req.files?.archivo_zip?.[0]) {
      try {
        const zip = new AdmZip(req.files.archivo_zip[0].buffer);
        const mimes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        zip.getEntries().forEach(entry => {
          if (entry.isDirectory) return;
          const ext = entry.name.split('.').pop().toLowerCase();
          const mime = mimes[ext];
          if (!mime) return;
          const b64 = `data:${mime};base64,${entry.getData().toString('base64')}`;
          imagenes[entry.name.toLowerCase()] = b64;
          imagenes[entry.name] = b64;
        });
      } catch {
        return res.status(400).json({ error: 'No se pudo leer el archivo ZIP' });
      }
    }

    function resolverImagen(val) {
      if (!val) return null;
      const v = String(val).trim();
      if (!v) return null;
      if (v.startsWith('data:')) return v;
      return imagenes[v.toLowerCase()] || imagenes[v] || null;
    }

    function resolverOpcion(val) {
      const img = resolverImagen(val);
      if (img) return img;
      const txt = String(val || '').trim();
      return txt || null;
    }

    const client = await pool.connect();
    const insertadas = [];
    const errores = [];

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const fila = i + 2;

        try {
          const descripcion = String(row.descripcion || '').trim();
          if (!descripcion) { errores.push({ fila, error: 'descripcion vacia' }); continue; }

          const respuesta_correcta = String(row.respuesta_correcta || '').trim().toUpperCase();
          if (!['A', 'B', 'C', 'D'].includes(respuesta_correcta)) {
            errores.push({ fila, error: `respuesta_correcta invalida: "${respuesta_correcta}" (debe ser A, B, C o D)` });
            continue;
          }

          const opcion_a = resolverOpcion(row.opcion_a);
          const opcion_b = resolverOpcion(row.opcion_b);
          if (!opcion_a || !opcion_b) { errores.push({ fila, error: 'opcion_a y opcion_b son obligatorias' }); continue; }

          const id_bloque  = id_bloque_global;
          const id_materia = id_materia_global;
          const id_unidad  = id_unidad_global;
          const id_tema    = id_tema_global;
          const url_imagen = resolverImagen(row.url_imagen);
          const opcion_c      = resolverOpcion(row.opcion_c);
          const opcion_d      = resolverOpcion(row.opcion_d);
          const justificacion = String(row.justificacion || '').trim() || null;

          const { rows: maxRows } = await client.query(
            'SELECT COALESCE(MAX(id_pregunta_local), 0) + 1 AS next FROM preguntas WHERE id_bloque=$1 AND id_materia=$2',
            [id_bloque, id_materia]
          );

          const { rows: inserted } = await client.query(
            `INSERT INTO preguntas
               (id_bloque, id_materia, id_unidad, id_tema, id_pregunta_local,
                descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d,
                respuesta_correcta, justificacion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING id`,
            [id_bloque, id_materia, id_unidad, id_tema, maxRows[0].next,
             descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d,
             respuesta_correcta, justificacion]
          );
          insertadas.push(inserted[0].id);
        } catch (e) {
          errores.push({ fila, error: e.message });
        }
      }

      await client.query('COMMIT');
      res.json({ insertadas: insertadas.length, errores: errores.length, detalle_errores: errores });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: 'Error al importar: ' + e.message });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
