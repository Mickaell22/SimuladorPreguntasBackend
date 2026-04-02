const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

app.use(helmet());

app.use(cors());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '20mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/login', loginLimiter);
app.use('/api/registro', loginLimiter);
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/examen'));
app.use('/api', require('./routes/historial'));
app.use('/api', require('./routes/perfil'));
app.use('/api', require('./routes/debug'));
app.use('/api/admin', require('./routes/admin'));

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  if (process.env.DEBUG === 'true') {
    console.log('[DEBUG] ============================================');
    console.log('[DEBUG] Modo DEBUG activo');
    console.log('[DEBUG]   - Examen: todas las preguntas en orden');
    console.log('[DEBUG]   - Sidebar navegable + boton Anterior');
    console.log('[DEBUG]   - AntiCheat desactivado en frontend');
    console.log('[DEBUG]   - GET /api/debug/imagenes disponible');
    console.log('[DEBUG] ============================================');
  }
});
