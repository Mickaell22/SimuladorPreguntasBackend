const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

app.use(helmet());

app.use(cors());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    console.log('[DEBUG] Modo debug activo: examen carga todas las preguntas en orden');
  }
});
