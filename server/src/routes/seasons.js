const router = require('express').Router();
const Member = require('../models/Member');
const Season = require('../models/Season');
const { auth, soloAdmin } = require('../middleware/auth');

router.use(auth, soloAdmin);

async function riepilogoCorrente() {
  const [r] = await Member.aggregate([
    { $match: { quotaVersata: { $gt: 0 } } },
    { $group: { _id: null, iscritti: { $sum: 1 }, totale: { $sum: '$quotaVersata' } } },
  ]);
  return { iscritti: r?.iscritti || 0, totale: r?.totale || 0 };
}

router.get('/', async (req, res) => {
  res.json({
    corrente: await riepilogoCorrente(),
    stagioni: await Season.find().sort({ chiusaIl: -1 }).populate('chiusaDa', 'nome cognome'),
  });
});

// Archivia quota e data di versamento di ogni ragazzo nel suo storico e azzera le iscrizioni
router.post('/chiudi', async (req, res) => {
  const nome = (req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ message: "Indica il nome dell'anno da archiviare (es. 2025/2026)" });
  if (await Season.exists({ nome })) return res.status(409).json({ message: `L'anno ${nome} è già stato archiviato` });
  const corrente = await riepilogoCorrente();
  if (!corrente.iscritti) return res.status(400).json({ message: 'Non ci sono iscrizioni da archiviare' });

  const stagione = await Season.create({ nome, chiusaDa: req.user._id, iscrittiArchiviati: corrente.iscritti, totaleIncassato: corrente.totale });
  try {
    await Member.collection.updateMany({ quotaVersata: { $gt: 0 } }, [
      {
        $set: {
          storico: {
            $concatArrays: [
              { $ifNull: ['$storico', []] },
              [{ stagione: nome, quotaVersata: '$quotaVersata', dataVersamento: '$dataVersamento', gruppo: '$gruppo' }],
            ],
          },
          quotaVersata: 0,
          dataVersamento: null,
          updatedAt: '$$NOW',
        },
      },
    ]);
  } catch (e) {
    await Season.deleteOne({ _id: stagione._id }); // niente registro se l'archiviazione è fallita
    throw e;
  }
  res.status(201).json(stagione);
});

module.exports = router;
