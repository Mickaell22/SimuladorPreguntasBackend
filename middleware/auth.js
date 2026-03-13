const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_cambiar_en_produccion';

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

module.exports = { auth, authOpcional, JWT_SECRET };
