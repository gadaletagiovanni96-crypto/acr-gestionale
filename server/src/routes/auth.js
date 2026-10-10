const router = require('express').Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { message: 'Troppi tentativi, riprova tra qualche minuto' } });

router.post('/login', limiter, async (req, res) => {
  const { email = '', password = '', ruolo } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || !user.attivo || !(await user.verificaPassword(password)))
    return res.status(401).json({ message: 'Email o password non corrette' });
  if (ruolo && user.ruolo !== ruolo)
    return res.status(403).json({ message: `Questo account non è di tipo ${ruolo}. Scegli il tipo di accesso corretto.` });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user });
});

router.get('/me', auth, (req, res) => res.json(req.user));

module.exports = router;
