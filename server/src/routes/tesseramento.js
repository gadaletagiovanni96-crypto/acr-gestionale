const router = require('express').Router();
const Member = require('../models/Member');
const { auth, soloAdmin } = require('../middleware/auth');

router.use(auth, soloAdmin); // pagina riservata agli amministratori

// Ragazzi di un gruppo (oppure "nessuno" = senza gruppo) con lo stato del tesseramento e i fratelli collegati
router.get('/', async (req, res) => {
  const { gruppo } = req.query;
  if (!gruppo) return res.status(400).json({ message: 'Scegli un gruppo' });
  const ragazzi = await Member.find({ trasferito: { $ne: true }, gruppo: gruppo === 'nessuno' ? null : gruppo }).sort({ cognome: 1, nome: 1 });
  const famiglie = [...new Set(ragazzi.map((r) => r.familyId).filter(Boolean).map(String))];
  const parenti = famiglie.length
    ? await Member.find({ familyId: { $in: famiglie }, trasferito: { $ne: true } }).populate('gruppo', 'nome').select('nome cognome familyId gruppo tesserato')
    : [];
  res.json(ragazzi.map((r) => ({
    _id: r._id, nome: r.nome, cognome: r.cognome, dataNascita: r.dataNascita, tesserato: !!r.tesserato,
    fratelli: r.familyId
      ? parenti
          .filter((p) => String(p.familyId) === String(r.familyId) && String(p._id) !== String(r._id))
          .map((p) => ({ _id: p._id, nome: p.nome, cognome: p.cognome, tesserato: !!p.tesserato, gruppo: p.gruppo?.nome || 'Senza gruppo' }))
      : [],
  })));
});

// Accende o spegne il tesseramento di un ragazzo. Con ancheFratelli (solo quando si accende)
// tessera anche i fratelli collegati, in qualunque gruppo siano. Risponde con gli id che sono cambiati.
router.post('/:id', async (req, res) => {
  const { tesserato, ancheFratelli } = req.body;
  if (typeof tesserato !== 'boolean') return res.status(400).json({ message: 'Valore non valido' });
  const m = await Member.findByIdAndUpdate(req.params.id, { tesserato }, { new: true });
  if (!m) return res.status(404).json({ message: 'Ragazzo non trovato' });

  const aggiornati = [String(m._id)];
  if (tesserato && ancheFratelli === true && m.familyId) {
    const fratelli = await Member.find({ familyId: m.familyId, _id: { $ne: m._id }, trasferito: { $ne: true }, tesserato: { $ne: true } }).select('_id');
    if (fratelli.length) {
      await Member.updateMany({ _id: { $in: fratelli.map((f) => f._id) } }, { tesserato: true });
      aggiornati.push(...fratelli.map((f) => String(f._id)));
    }
  }
  res.json({ tesserato, aggiornati });
});

module.exports = router;