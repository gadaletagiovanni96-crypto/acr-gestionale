const router = require('express').Router();
const Event = require('../models/Event');
const { auth, soloAdmin } = require('../middleware/auth');

router.use(auth, soloAdmin); // la contabilità è riservata agli admin

const prendi = (body, campi) => {
  const d = {};
  for (const k of campi) if (k in body) d[k] = body[k];
  if (d.data === '') delete d.data; // data vuota: si tiene quella già presente (o oggi)
  return d;
};
const CAMPI_EVENTO = ['nome', 'data', 'note'];
const CAMPI_VOCE = ['tipo', 'importo', 'descrizione', 'data'];

async function trova(req, res) {
  const e = await Event.findById(req.params.id);
  if (!e) res.status(404).json({ message: 'Evento non trovato' });
  return e;
}

// Elenco eventi con i totali (senza i singoli movimenti)
router.get('/', async (req, res) => {
  const eventi = await Event.find().sort({ data: -1 });
  res.json(eventi.map((e) => ({ ...e.toJSON(), numeroVoci: e.voci.length, voci: undefined })));
});

router.post('/', async (req, res) => {
  res.status(201).json(await Event.create({ ...prendi(req.body, CAMPI_EVENTO), creatoDa: req.user._id }));
});

router.get('/:id', async (req, res) => {
  const e = await trova(req, res);
  if (e) res.json(e);
});

router.put('/:id', async (req, res) => {
  const e = await trova(req, res);
  if (!e) return;
  e.set(prendi(req.body, CAMPI_EVENTO));
  await e.save();
  res.json(e);
});

router.delete('/:id', async (req, res) => {
  if (!(await Event.findByIdAndDelete(req.params.id))) return res.status(404).json({ message: 'Evento non trovato' });
  res.status(204).end();
});

// Movimenti: ogni risposta restituisce l'evento aggiornato, con i totali ricalcolati
router.post('/:id/voci', async (req, res) => {
  const e = await trova(req, res);
  if (!e) return;
  e.voci.push(prendi(req.body, CAMPI_VOCE));
  await e.save();
  res.status(201).json(e);
});

router.put('/:id/voci/:voceId', async (req, res) => {
  const e = await trova(req, res);
  if (!e) return;
  const v = e.voci.id(req.params.voceId);
  if (!v) return res.status(404).json({ message: 'Movimento non trovato' });
  v.set(prendi(req.body, CAMPI_VOCE));
  await e.save();
  res.json(e);
});

router.delete('/:id/voci/:voceId', async (req, res) => {
  const e = await trova(req, res);
  if (!e) return;
  e.voci.pull(req.params.voceId);
  await e.save();
  res.json(e);
});

module.exports = router;