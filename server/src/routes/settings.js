const router = require('express').Router();
const { auth, soloAdmin } = require('../middleware/auth');
const { leggiImpostazioni, salvaImpostazione, normalizzaAnno } = require('../impostazioni');

router.use(auth);

// Le leggono tutti (gli educatori devono sapere se le iscrizioni sono aperte)
router.get('/', async (req, res) => res.json(await leggiImpostazioni()));

// Le cambia solo l'admin. Si può mandare una sola impostazione alla volta.
router.put('/', soloAdmin, async (req, res) => {
  const { iscrizioniAperte, annoAssociativo } = req.body;
  let anno;
  if (annoAssociativo !== undefined) {
    const testo = String(annoAssociativo).trim();
    anno = testo === '' ? '' : normalizzaAnno(testo);
    if (anno === null) return res.status(400).json({ message: "Scrivi l'anno associativo come due anni consecutivi, per esempio 2026/2027" });
  }
  if (iscrizioniAperte !== undefined && typeof iscrizioniAperte !== 'boolean')
    return res.status(400).json({ message: 'Valore non valido' });

  if (typeof iscrizioniAperte === 'boolean') await salvaImpostazione('iscrizioniAperte', iscrizioniAperte);
  if (anno !== undefined) await salvaImpostazione('annoAssociativo', anno);
  res.json(await leggiImpostazioni());
});

module.exports = router;