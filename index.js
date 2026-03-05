const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// GET /api/bloques
app.get('/api/bloques', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bloques ORDER BY id_bloque');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener bloques' });
  }
});

// GET /api/bloques/:id/materias
app.get('/api/bloques/:id/materias', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT m.id_materia, m.nombre, COUNT(p.id) AS total_preguntas
       FROM materias m
       JOIN materias_por_bloque mb ON m.id_materia = mb.id_materia
       LEFT JOIN preguntas p ON p.id_materia = m.id_materia AND p.id_bloque = mb.id_bloque
       WHERE mb.id_bloque = $1
       GROUP BY m.id_materia, m.nombre
       ORDER BY m.id_materia`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener materias' });
  }
});

// GET /api/preguntas?idBloque=&idMateria=&cantidad=
app.get('/api/preguntas', async (req, res) => {
  const { idBloque, idMateria, cantidad } = req.query;

  if (!idBloque || !idMateria || !cantidad) {
    return res.status(400).json({ error: 'Faltan parámetros: idBloque, idMateria, cantidad' });
  }

  const limit = parseInt(cantidad);
  if (isNaN(limit) || limit <= 0) {
    return res.status(400).json({ error: 'cantidad debe ser un número positivo' });
  }

  try {
    const result = await pool.query(
      `SELECT id, descripcion, url_imagen,
              opcion_a, opcion_b, opcion_c, opcion_d
       FROM preguntas
       WHERE id_bloque = $1 AND id_materia = $2
       ORDER BY RANDOM()
       LIMIT $3`,
      [idBloque, idMateria, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener preguntas' });
  }
});

// POST /api/verificar
app.post('/api/verificar', async (req, res) => {
  const { respuestas } = req.body;

  if (!respuestas || !Array.isArray(respuestas)) {
    return res.status(400).json({ error: 'Se esperaba un array de respuestas' });
  }

  try {
    const ids = respuestas.map((r) => r.id);
    const result = await pool.query(
      `SELECT id, respuesta_correcta, descripcion, url_imagen,
              opcion_a, opcion_b, opcion_c, opcion_d
       FROM preguntas WHERE id = ANY($1)`,
      [ids]
    );

    const correctasMap = {};
    for (const row of result.rows) {
      correctasMap[row.id] = row;
    }

    let correctas = 0;
    const detalle = respuestas.map((r) => {
      const pregunta = correctasMap[r.id];
      const esCorrecta = pregunta && r.respuesta === pregunta.respuesta_correcta;
      if (esCorrecta) correctas++;
      return {
        id: r.id,
        descripcion: pregunta?.descripcion,
        url_imagen: pregunta?.url_imagen,
        opcion_a: pregunta?.opcion_a,
        opcion_b: pregunta?.opcion_b,
        opcion_c: pregunta?.opcion_c,
        opcion_d: pregunta?.opcion_d,
        respuesta_usuario: r.respuesta,
        respuesta_correcta: pregunta?.respuesta_correcta,
        correcta: esCorrecta,
      };
    });

    res.json({
      total: respuestas.length,
      correctas,
      puntaje: Math.round((correctas / respuestas.length) * 100),
      detalle,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar respuestas' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
