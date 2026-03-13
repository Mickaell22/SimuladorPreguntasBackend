const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/examen'));
app.use('/api', require('./routes/historial'));
app.use('/api', require('./routes/perfil'));
app.use('/api', require('./routes/debug'));

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
  if (process.env.DEBUG === 'true') {
    console.log('[DEBUG] Modo debug activo: examen carga todas las preguntas en orden');
  }
});
