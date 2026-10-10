const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.auth = async (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Accesso richiesto' });
  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(id);
    if (!user || !user.attivo) return res.status(401).json({ message: 'Sessione non valida' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Sessione scaduta, accedi di nuovo' });
  }
};

exports.soloAdmin = (req, res, next) =>
  req.user.ruolo === 'admin' ? next() : res.status(403).json({ message: 'Operazione riservata agli amministratori' });
