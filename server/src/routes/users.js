const router = require('express').Router();
const User = require('../models/User');
const Group = require('../models/Group');
const { auth, ruoli } = require('../middleware/auth');

router.use(auth, ruoli('admin', 'parroco'));

const RUOLI = ['admin', 'parroco', 'educatore'];
// L'admin gestisce tutti gli account; il parroco solo quelli degli educatori (e il proprio, senza cambiare ruolo)
const puoGestire = (me, u) => me.ruolo === 'admin' || u.ruolo === 'educatore' || u._id.equals(me._id);

router.get('/', async (req, res) => {
  const f = req.query.ruolo ? { ruolo: req.query.ruolo } : {};
  res.json(await User.find(f).sort({ cognome: 1, nome: 1 }));
});

router.post('/', async (req, res) => {
  const { nome, cognome, email, password, attivo } = req.body;
  let { ruolo } = req.body;
  if (req.user.ruolo !== 'admin') ruolo = 'educatore'; // il parroco crea solo educatori
  else if (ruolo && !RUOLI.includes(ruolo)) return res.status(400).json({ message: 'Tipo di account non valido' });
  res.status(201).json(await User.create({ nome, cognome, email, password, ruolo, attivo }));
});

router.put('/:id', async (req, res) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ message: 'Utente non trovato' });
  if (!puoGestire(req.user, user)) return res.status(403).json({ message: 'Puoi modificare solo gli account degli educatori' });
  const { nome, cognome, email, password, ruolo, attivo } = req.body;
  const self = user._id.equals(req.user._id);
  if (self && ((ruolo && ruolo !== user.ruolo) || attivo === false))
    return res.status(400).json({ message: 'Non puoi cambiare ruolo o disattivare il tuo stesso account' });
  if (ruolo && ruolo !== user.ruolo && req.user.ruolo !== 'admin')
    return res.status(403).json({ message: "Solo l'amministratore può cambiare il tipo di account" });
  if (ruolo && !RUOLI.includes(ruolo)) return res.status(400).json({ message: 'Tipo di account non valido' });
  user.set({ nome, cognome, email, ruolo: ruolo ?? user.ruolo, attivo: attivo ?? user.attivo });
  if (password) user.password = password;
  await user.save();
  res.json(user);
});

router.delete('/:id', async (req, res) => {
  if (req.user._id.equals(req.params.id)) return res.status(400).json({ message: 'Non puoi eliminare il tuo account' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'Utente non trovato' });
  if (!puoGestire(req.user, user)) return res.status(403).json({ message: 'Puoi eliminare solo gli account degli educatori' });
  await user.deleteOne();
  await Group.updateMany({}, { $pull: { educatori: user._id } });
  res.status(204).end();
});

module.exports = router;
