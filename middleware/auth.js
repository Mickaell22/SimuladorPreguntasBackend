const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[auth] CRITICO: JWT_SECRET no configurado. Defina la variable de entorno.');
  process.exit(1);
}

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

function authOpcional(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.usuario = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

function authAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { auth, authOpcional, authAdmin, JWT_SECRET };
