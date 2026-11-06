const router = require('express').Router();
const ExcelJS = require('exceljs');
const Member = require('../models/Member');
const Group = require('../models/Group');
const ProspettoTessere = require('../models/ProspettoTessere');
const { TIPI, VALE, leggiPrezzi, salvaPrezzi, totaleEuro, totaleEffettivo, totali } = require('../prospetto');
const { auth, soloAdmin } = require('../middleware/auth');

router.use(auth, soloAdmin); // pagina riservata agli amministratori

// ---------------------------------------------------------------- Contabilità tessere
const CAMPI = [...TIPI, 'altriSettori', 'richieste', 'mancanti', 'disdette'];
const euroXls = (n) => String(n.toFixed(2)).replace('.', ',');

const educatoriDi = (g) => {
  const n = (g.educatori || []).map((e) => e.nome);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}` : n[0] || '';
};

// Una riga per ogni gruppo, anche se non è ancora stata compilata
async function caricaProspetto() {
  const [gruppi, salvate, prezzi] = await Promise.all([
    Group.find().populate('educatori', 'nome').sort({ nome: 1 }),
    ProspettoTessere.find(),
    leggiPrezzi(),
  ]);
  const perGruppo = Object.fromEntries(salvate.map((p) => [String(p.gruppo), p]));
  const righe = gruppi.map((g) => {
    const p = perGruppo[String(g._id)];
    const r = { gruppo: String(g._id), nome: g.nome, educatori: educatoriDi(g), altriSettoriNomi: p?.altriSettoriNomi || '' };
    CAMPI.forEach((c) => { r[c] = p?.[c] || 0; });
    return { ...r, totaleEuro: totaleEuro(r, prezzi), totaleEffettivo: totaleEffettivo(r) };
  });
  return { prezzi, vale: VALE, righe, totali: totali(righe) };
}

router.get('/prospetto', async (req, res) => res.json(await caricaProspetto()));

// Cambia i prezzi delle tessere
router.put('/prospetto/prezzi', async (req, res) => {
  const prezzi = await leggiPrezzi();
  for (const t of TIPI) {
    if (req.body[t] === undefined) continue;
    const v = Number(String(req.body[t]).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || v > 1000) return res.status(400).json({ message: 'Il prezzo deve essere un numero maggiore di zero' });
    prezzi[t] = Math.round(v * 100) / 100;
  }
  await salvaPrezzi(prezzi);
  res.json(await caricaProspetto());
});

// Salva i numeri di un gruppo
router.put('/prospetto/:gruppo', async (req, res) => {
  if (!(await Group.exists({ _id: req.params.gruppo }))) return res.status(404).json({ message: 'Gruppo non trovato' });
  const dati = { altriSettoriNomi: String(req.body.altriSettoriNomi ?? '').slice(0, 500) };
  for (const c of CAMPI) {
    const v = Number(req.body[c] ?? 0);
    if (!Number.isInteger(v) || v < 0 || v > 9999) return res.status(400).json({ message: 'Inserisci solo numeri interi, zero o maggiori' });
    dati[c] = v;
  }
  await ProspettoTessere.findOneAndUpdate({ gruppo: req.params.gruppo }, dati, { upsert: true, runValidators: true });
  res.json(await caricaProspetto());
});

// Azzera tutti i numeri (per ricominciare l'anno); i prezzi restano
router.delete('/prospetto', async (req, res) => {
  await ProspettoTessere.deleteMany({});
  res.json(await caricaProspetto());
});

// Foglio Excel con la stessa struttura e le stesse formule del prospetto originale
router.get('/prospetto/xlsx', async (req, res) => {
  const { prezzi, righe, totali: t } = await caricaProspetto();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Prospetto tessere', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [16, 28, 12, 8, 8, 8, 14, 8, 26, 16, 14, 16, 11].map((width) => ({ width }));

  ws.mergeCells('A1:M1');
  ws.getCell('A1').value = 'PROSPETTO RACCOLTA TESSERE ACR';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.getRow(2).values = ['GRUPPO', 'EDUCATORI', 'TOT IN €', `X${euroXls(prezzi.quotaA)}`, `X${euroXls(prezzi.quotaB)}`, `X${euroXls(prezzi.quotaC)}`,
    'TOT. TESSERE PAGATE AI MAGGIORI (in ACR)', 'TESSERE ACR PAGATE AD ALTRI SETTORI (1numero e 2cognome)', '',
    'TOT. EFFETTIVO TESSERE CON MAGGIORI - CAMPO AUTOMATICO', 'TOT. TESSERE RICHIESTE (dal gruppo)',
    'MANCANTI (nel gruppo e non pagate ai maggiori)', 'DISDETTE'];
  ws.mergeCells('H2:I2');
  ws.getRow(2).height = 60;
  ws.getRow(2).eachCell((c) => {
    c.font = { bold: true, size: 9 };
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBE4EE' } };
  });

  const primo = 3, ultimo = primo + Math.max(righe.length, 1) - 1;
  righe.forEach((r, i) => {
    const n = primo + i;
    ws.getRow(n).values = [r.nome, r.educatori || '//', null, r.quotaA, r.quotaB, r.quotaC, null, r.altriSettori, r.altriSettoriNomi, null, r.richieste, r.mancanti, r.disdette];
    ws.getCell(`C${n}`).value = { formula: `D${n}*${prezzi.quotaA}+E${n}*${prezzi.quotaB}+F${n}*${prezzi.quotaC}`, result: r.totaleEuro };
    ws.getCell(`J${n}`).value = { formula: `SUM(D${n},E${n},2*F${n},H${n})`, result: r.totaleEffettivo };
  });
  const rt = ultimo + 1;
  const scrivi = (a, value) => { ws.getCell(a).value = value; ws.getCell(a).font = { bold: true }; };
  scrivi(`J${rt}`, 'TOT.:');
  scrivi(`K${rt}`, { formula: `SUM(K${primo}:K${ultimo})`, result: t.richieste });
  scrivi(`L${rt}`, { formula: `SUM(L${primo}:L${ultimo})`, result: t.mancanti });
  scrivi(`M${rt}`, { formula: `SUM(M${primo}:M${ultimo})`, result: t.disdette });
  scrivi(`B${rt + 1}`, 'TOT. in €');
  scrivi(`C${rt + 1}`, { formula: `SUM(C${primo}:C${ultimo})`, result: t.euro });
  scrivi(`B${rt + 2}`, 'TOT. Tessere Pagate');
  scrivi(`C${rt + 2}`, { formula: `SUM(J${primo}:J${ultimo})`, result: t.pagate });
  scrivi(`B${rt + 3}`, 'TOT. Tessere da chiedere');
  scrivi(`C${rt + 3}`, { formula: `SUM(C${rt + 2},L${rt})`, result: t.daChiedere });
  for (let n = primo; n <= rt + 1; n++) ws.getCell(`C${n}`).numFmt = '#,##0.00 "€"';
  const linea = { style: 'thin' };
  for (let n = 2; n <= ultimo; n++)
    for (let c = 1; c <= 13; c++) ws.getRow(n).getCell(c).border = { top: linea, left: linea, bottom: linea, right: linea };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="contabilita-tessere-acr.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// ---------------------------------------------------------------- Tessere per gruppo
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