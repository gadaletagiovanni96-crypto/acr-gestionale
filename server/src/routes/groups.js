const router = require('express').Router();
const Group = require('../models/Group');
const Member = require('../models/Member');
const { auth, soloAdmin } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  const [gruppi, conteggi] = await Promise.all([
    Group.find().populate('educatori', 'nome cognome').sort({ nome: 1 }),
    Member.aggregate([
      { $match: { gruppo: { $ne: null }, trasferito: { $ne: true } } },
      { $group: { _id: '$gruppo', n: { $sum: 1 } } },
    ]),
  ]);
  const n = Object.fromEntries(conteggi.map((c) => [String(c._id), c.n]));
  res.json(gruppi.map((g) => ({ ...g.toJSON(), numeroRagazzi: n[String(g._id)] || 0 })));
});

router.post('/', soloAdmin, async (req, res) => {
  const { nome, descrizione, educatori } = req.body;
  const g = await Group.create({ nome, descrizione, educatori: educatori || [] });
  res.status(201).json(await g.populate('educatori', 'nome cognome'));
});

// Passaggio annuale: sposta tutti i ragazzi di un gruppo in un altro. Tutti i passaggi sono
// calcolati sulla situazione di partenza, così "II → III" e "III → IV" insieme non si sovrappongono.
router.post('/sposta', soloAdmin, async (req, res) => {
  const sp = (req.body.spostamenti || []).filter((s) => s.da && s.a && s.da !== s.a);
  if (!sp.length) return res.status(400).json({ message: 'Scegli almeno un gruppo da spostare' });
  const da = sp.map((s) => s.da);
  if (new Set(da).size !== da.length) return res.status(400).json({ message: 'Ogni gruppo può essere spostato una sola volta' });
  const coinvolti = new Set([...da, ...sp.map((s) => s.a).filter((a) => a !== 'nessuno')]);
  if ((await Group.countDocuments({ _id: { $in: [...coinvolti] } })) !== coinvolti.size)
    return res.status(400).json({ message: 'Uno dei gruppi scelti non esiste più' });

  const ops = [];
  let spostati = 0;
  for (const s of sp) {
    const ids = (await Member.find({ gruppo: s.da, trasferito: { $ne: true } }).select('_id')).map((m) => m._id);
    spostati += ids.length;
    if (ids.length) ops.push({ updateMany: { filter: { _id: { $in: ids } }, update: { $set: { gruppo: s.a === 'nessuno' ? null : s.a } } } });
  }
  if (ops.length) await Member.bulkWrite(ops);
  res.json({ spostati });
});

router.put('/:id', soloAdmin, async (req, res) => {
  const g = await Group.findById(req.params.id);
  if (!g) return res.status(404).json({ message: 'Gruppo non trovato' });
  const { nome, descrizione, educatori } = req.body;
  g.set({ nome, descrizione, educatori: educatori || [] });
  await g.save();
  res.json(await g.populate('educatori', 'nome cognome'));
});

router.delete('/:id', soloAdmin, async (req, res) => {
  const g = await Group.findByIdAndDelete(req.params.id);
  if (!g) return res.status(404).json({ message: 'Gruppo non trovato' });
  await Member.updateMany({ gruppo: g._id }, { gruppo: null }); // i ragazzi restano, senza gruppo
  res.status(204).end();
});

module.exports = router;
