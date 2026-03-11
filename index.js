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

// Middleware: verifica JWT obligatorio
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Middleware: adjunta usuario si hay token, pero no falla si no hay
function authOpcional(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.usuario = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

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

// GET /api/examen/iniciar?idBloque=1[&todo=true]
app.get('/api/examen/iniciar', async (req, res) => {
  const { idBloque, todo } = req.query;
  const config = EXAMEN_BLOQUES[idBloque];
  if (!config) return res.status(400).json({ error: 'Bloque inválido' });

  const isDebug = process.env.DEBUG === 'true';

  try {
    // todo=true: solo en debug, carga todas las preguntas en orden
    if (isDebug && todo === 'true') {
      const result = await pool.query(
        `SELECT id, id_materia, id_pregunta_local FROM preguntas WHERE id_bloque = $1 ORDER BY id_materia, id_pregunta_local`,
        [idBloque]
      );
      const ids = result.rows.map((r) => r.id);
      const meta = {};
      result.rows.forEach((r) => { meta[r.id] = { idMateria: r.id_materia, local: r.id_pregunta_local }; });
      return res.json({ ids, total: ids.length, debug: true, meta });
    }

    // Selección aleatoria normal (con o sin debug)
    const grupos = await Promise.all(
      config.map(({ idMateria, cantidad }) =>
        pool.query(
          `SELECT id, id_materia, id_pregunta_local FROM preguntas WHERE id_bloque = $1 AND id_materia = $2 ORDER BY RANDOM() LIMIT $3`,
          [idBloque, idMateria, cantidad]
        )
      )
    );
    const ids = grupos.flatMap((g) => g.rows.map((r) => r.id));

    if (isDebug) {
      const meta = {};
      grupos.forEach((g) => g.rows.forEach((r) => { meta[r.id] = { idMateria: r.id_materia, local: r.id_pregunta_local }; }));
      return res.json({ ids, total: ids.length, debug: true, meta });
    }

    res.json({ ids, total: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar examen' });
  }
});

// GET /api/examen/pregunta/:id
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
// Si hay token válido, guarda el resultado automáticamente
app.post('/api/verificar', authOpcional, async (req, res) => {
  const { respuestas, idBloque } = req.body;
  if (!respuestas || !Array.isArray(respuestas)) {
    return res.status(400).json({ error: 'Se esperaba un array de respuestas' });
  }

  try {
    const ids = respuestas.map((r) => r.id);
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
        justificacion: p?.justificacion,
        url_justificacion: p?.url_justificacion,
      };
    });

    const puntaje = correctas * 25;

    // Guardar en historial si el usuario está autenticado
    if (req.usuario && idBloque) {
      const examen = await pool.query(
        `INSERT INTO examenes (id_usuario, id_bloque, total, correctas, puntaje)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.usuario.id, idBloque, respuestas.length, correctas, puntaje]
      );
      const idExamen = examen.rows[0].id;
      const valores = detalle.map((d) => `(${idExamen}, ${d.id}, ${d.respuesta_usuario ? `'${d.respuesta_usuario}'` : 'NULL'}, ${d.correcta})`).join(',');
      await pool.query(`INSERT INTO respuestas_examen (id_examen, id_pregunta, respuesta_usuario, correcta) VALUES ${valores}`);
    }

    res.json({ total: respuestas.length, correctas, puntaje, detalle });
  } catch (err) {
    console.error('[verificar] Error:', err.message);
    res.status(500).json({ error: 'Error al verificar respuestas' });
  }
});

// GET /api/historial — lista de exámenes del usuario (paginada)
app.get('/api/historial', auth, async (req, res) => {
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
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// GET /api/historial/:id — detalle de un examen con todas las respuestas
app.get('/api/historial/:id', auth, async (req, res) => {
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
              re.respuesta_usuario, re.correcta
       FROM respuestas_examen re
       JOIN preguntas p ON p.id = re.id_pregunta
       WHERE re.id_examen = $1`,
      [id]
    );

    res.json({ ...examen.rows[0], detalle: respuestas.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el examen' });
  }
});

// GET /api/debug/imagenes — solo disponible en modo DEBUG
app.get('/api/debug/imagenes', async (req, res) => {
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
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener preguntas con imagen' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  if (process.env.DEBUG === 'true') {
    console.log('[DEBUG] Modo debug activo: examen carga todas las preguntas en orden');
  }
});
