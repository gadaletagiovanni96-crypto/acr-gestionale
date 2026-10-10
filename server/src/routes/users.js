const router = require('express').Router();
const User = require('../models/User');
const Group = require('../models/Group');
const { auth, soloAdmin } = require('../middleware/auth');

router.use(auth, soloAdmin);

router.get('/', async (req, res) => {
  const f = req.query.ruolo ? { ruolo: req.query.ruolo } : {};
  res.json(await User.find(f).sort({ cognome: 1, nome: 1 }));
});

router.post('/', async (req, res) => {
  const { nome, cognome, email, password, ruolo, attivo } = req.body;
  res.status(201).json(await User.create({ nome, cognome, email, password, ruolo, attivo }));
});

router.put('/:id', async (req, res) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ message: 'Utente non trovato' });
  const { nome, cognome, email, password, ruolo, attivo } = req.body;
  const self = user._id.equals(req.user._id);
  if (self && ((ruolo && ruolo !== user.ruolo) || attivo === false))
    return res.status(400).json({ message: 'Non puoi cambiare ruolo o disattivare il tuo stesso account' });
  user.set({ nome, cognome, email, ruolo: ruolo ?? user.ruolo, attivo: attivo ?? user.attivo });
  if (password) user.password = password;
  await user.save();
  res.json(user);
});

router.delete('/:id', async (req, res) => {
  if (req.user._id.equals(req.params.id)) return res.status(400).json({ message: 'Non puoi eliminare il tuo account' });
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'Utente non trovato' });
  await Group.updateMany({}, { $pull: { educatori: user._id } });
  res.status(204).end();
});

module.exports = router;
