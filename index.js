const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Configuración fija de examen por bloque (autoridad en backend)
const EXAMEN_BLOQUES = {
  1: [{ idMateria: 2, cantidad: 16 }, { idMateria: 1, cantidad: 8 },  { idMateria: 3, cantidad: 16 }],
  2: [{ idMateria: 2, cantidad: 12 }, { idMateria: 1, cantidad: 8 },  { idMateria: 4, cantidad: 20 }],
  3: [{ idMateria: 2, cantidad: 8 },  { idMateria: 1, cantidad: 16 }, { idMateria: 5, cantidad: 16 }],
  4: [{ idMateria: 7, cantidad: 8 },  { idMateria: 1, cantidad: 16 }, { idMateria: 6, cantidad: 16 }],
  5: [{ idMateria: 2, cantidad: 20 }, { idMateria: 1, cantidad: 8 },  { idMateria: 8, cantidad: 12 }],
  6: [{ idMateria: 2, cantidad: 8 },  { idMateria: 4, cantidad: 16 }, { idMateria: 9, cantidad: 16 }],
};

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_cambiar_en_produccion';

// POST /api/registro
app.post('/api/registro', async (req, res) => {
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
app.post('/api/login', async (req, res) => {
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
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// GET /api/bloques
app.get('/api/bloques', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bloques ORDER BY id_bloque');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener bloques' });
  }
});

// GET /api/examen/iniciar?idBloque=1
// Devuelve solo los IDs de las preguntas seleccionadas (sin contenido)
// En modo DEBUG devuelve TODAS las preguntas del bloque en orden
app.get('/api/examen/iniciar', async (req, res) => {
  const { idBloque } = req.query;
  const config = EXAMEN_BLOQUES[idBloque];
  if (!config) return res.status(400).json({ error: 'Bloque inválido' });

  try {
    if (process.env.DEBUG === 'true') {
      const result = await pool.query(
        `SELECT id FROM preguntas WHERE id_bloque = $1 ORDER BY id_materia, id_pregunta_local`,
        [idBloque]
      );
      const ids = result.rows.map((r) => r.id);
      return res.json({ ids, total: ids.length, debug: true });
    }

    const grupos = await Promise.all(
      config.map(({ idMateria, cantidad }) =>
        pool.query(
          `SELECT id FROM preguntas WHERE id_bloque = $1 AND id_materia = $2 ORDER BY RANDOM() LIMIT $3`,
          [idBloque, idMateria, cantidad]
        )
      )
    );
    const ids = shuffleArray(grupos.flatMap((g) => g.rows.map((r) => r.id)));
    res.json({ ids, total: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar examen' });
  }
});

// GET /api/examen/pregunta/:id
// Devuelve el contenido de UNA pregunta (sin respuesta correcta)
app.get('/api/examen/pregunta/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, descripcion, url_imagen, opcion_a, opcion_b, opcion_c, opcion_d
       FROM preguntas WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener pregunta' });
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

    const map = {};
    for (const row of result.rows) map[row.id] = row;

    let correctas = 0;
    const detalle = respuestas.map((r) => {
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
      };
    });

    res.json({ total: respuestas.length, correctas, detalle });
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar respuestas' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  if (process.env.DEBUG === 'true') {
    console.log('[DEBUG] Modo debug activo: examen carga todas las preguntas en orden');
  }
});
