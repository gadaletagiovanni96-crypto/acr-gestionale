const router = require('express').Router();
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Member = require('../models/Member');
const Group = require('../models/Group');
const { auth, soloAdmin } = require('../middleware/auth');

router.use(auth);

// Carica il ragazzo; i trasferiti in altra parrocchia esistono solo per gli admin
router.param('id', async (req, res, next, id) => {
  try {
    const m = await Member.findById(id);
    if (!m || (m.trasferito && req.user.ruolo !== 'admin')) return res.status(404).json({ message: 'Ragazzo non trovato' });
    req.member = m;
    next();
  } catch (e) { next(e); }
});

const CAMPI = ['nome', 'cognome', 'sesso', 'dataNascita', 'luogoNascita', 'codiceFiscale', 'indirizzo', 'citta', 'cap',
  'telefono', 'email', 'nomeGenitore', 'telefonoGenitore', 'emailGenitore', 'allergie', 'note', 'consensoPrivacy',
  'gruppo', 'quotaVersata', 'dataVersamento'];

function pulisci(body) {
  const d = {};
  for (const k of CAMPI) if (k in body) d[k] = body[k];
  for (const k of ['gruppo', 'dataVersamento', 'dataNascita']) if (d[k] === '') d[k] = null;
  if ('quotaVersata' in d && (d.quotaVersata === '' || d.quotaVersata == null)) d.quotaVersata = 0;
  return d;
}

// Filtro condiviso da elenco e PDF. Restituisce null se non c'è nulla da mostrare.
function filtroDa(req) {
  const { gruppo, iscrizione, q } = req.query;
  const admin = req.user.ruolo === 'admin';
  const f = {};
  if (!admin) f.trasferito = { $ne: true };
  if (gruppo === 'trasferiti') {
    if (!admin) return null;
    f.trasferito = true;
  } else if (gruppo === 'nessuno') { f.gruppo = null; f.trasferito = { $ne: true }; }
  else if (gruppo) f.gruppo = gruppo;
  if (iscrizione === 'si') f.quotaVersata = { $gt: 0 };
  if (iscrizione === 'no') f.quotaVersata = { $not: { $gt: 0 } };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ nome: rx }, { cognome: rx }];
  }
  return f;
}

router.get('/', async (req, res) => {
  const f = filtroDa(req);
  if (!f) return res.json([]);
  res.json(await Member.find(f).populate('gruppo', 'nome').sort({ cognome: 1, nome: 1 }));
});

// ---------- PDF degli elenchi (un gruppo per pagina) ----------
router.get('/pdf', async (req, res) => {
  const admin = req.user.ruolo === 'admin';
  const f = filtroDa(req);
  const [members, groups] = await Promise.all([
    f ? Member.find(f).sort({ cognome: 1, nome: 1 }) : [],
    Group.find().populate('educatori', 'nome cognome').sort({ nome: 1 }),
  ]);

  const sezioni = [];
  for (const g of groups) {
    const lista = members.filter((m) => !m.trasferito && String(m.gruppo) === String(g._id));
    if (lista.length) sezioni.push({ titolo: g.nome, educatori: g.educatori.map((e) => `${e.nome} ${e.cognome}`.trim()), lista });
  }
  const senza = members.filter((m) => !m.trasferito && !m.gruppo);
  if (senza.length) sezioni.push({ titolo: 'Senza gruppo', senzaEducatori: true, educatori: [], lista: senza });
  const trasf = members.filter((m) => m.trasferito);
  if (admin && trasf.length) sezioni.push({ titolo: 'Trasferiti in altre parrocchie', senzaEducatori: true, trasferiti: true, educatori: [], lista: trasf });

  const dataIt = (d) => (d ? new Date(d).toLocaleDateString('it-IT') : '');
  const euro = (n) => '€ ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const filtroTesto = [
    req.query.iscrizione === 'si' ? 'solo iscritti' : req.query.iscrizione === 'no' ? 'solo non ancora iscritti' : '',
    req.query.q ? `ricerca "${req.query.q}"` : '',
  ].filter(Boolean).join(', ');

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true, info: { Title: "Elenco ragazzi - ACR Parrocchia Sant'Achille, Molfetta" } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="elenco-ragazzi-acr-sant-achille.pdf"');
  doc.pipe(res);

  const W = doc.page.width, H = doc.page.height, L = 40, TW = W - 80, MIN = 24, FS = 10;
  const INK = '#17324d', MUTED = '#5d6c7b';
  const oggi = new Date().toLocaleDateString('it-IT');
  // Larghezze pensate per A4 orizzontale (762 pt utili): nessun testo viene troncato, va a capo
  const COL_N = [{ t: 'N.', w: 24 }, { t: 'Cognome', w: 115 }, { t: 'Nome', w: 105 }, { t: 'Data di nascita', w: 78 },
    { t: 'Luogo di nascita', w: 124 }, { t: 'Via', w: 200 }, { t: 'Telefono genitore', w: 116 }];
  const COL_T = [{ t: 'N.', w: 24 }, { t: 'Cognome', w: 105 }, { t: 'Nome', w: 95 }, { t: 'Data di nascita', w: 78 },
    { t: 'Luogo di nascita', w: 110 }, { t: 'Via', w: 120 }, { t: 'Telefono genitore', w: 100 }, { t: 'Trasferito a', w: 130 }];
  let prima = true;

  const intestazione = () => {
    doc.rect(0, 0, W, 58).fill(INK);
    doc.circle(L + 6, 29, 6).fill('#f2b705');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text("ACR · Parrocchia Sant'Achille", L + 20, 17, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).text('Molfetta · Elenco ragazzi', L + 20, 36, { lineBreak: false });
    doc.text(oggi, L, 26, { width: TW, align: 'right', lineBreak: false });
  };

  // Altezza della riga = quella della cella più alta (il testo lungo va a capo)
  const altezza = (celle, cols, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FS);
    return Math.max(MIN, Math.max(...celle.map((c, k) => doc.heightOfString(String(c ?? ''), { width: cols[k].w - 10 }))) + 12);
  };

  const riga = (celle, cols, y, rh, bold, sfondo, colore) => {
    if (sfondo) doc.rect(L, y, TW, rh).fill(sfondo);
    doc.fillColor(colore).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FS);
    let x = L;
    celle.forEach((c, k) => { doc.text(String(c ?? ''), x + 5, y + 6, { width: cols[k].w - 10 }); x += cols[k].w; });
    doc.moveTo(L, y + rh).lineTo(L + TW, y + rh).lineWidth(0.5).strokeColor('#dbe1e8').stroke();
  };

  const iniziaPagina = (s, seguito) => {
    if (!prima) doc.addPage();
    prima = false;
    intestazione();
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(s.titolo + (seguito ? ' (segue)' : ''), L, 76, { width: TW });
    doc.font('Helvetica').fontSize(11).fillColor(MUTED);
    if (!s.senzaEducatori) doc.text('Educatori: ' + (s.educatori.length ? s.educatori.join(', ') : 'nessuno assegnato'), L, doc.y + 2, { width: TW });
    const n = s.lista.length;
    const iscritti = s.lista.filter((m) => m.quotaVersata > 0).length;
    doc.text([`${n} ragazz${n === 1 ? 'o' : 'i'}`, s.trasferiti ? '' : `${iscritti} iscritt${iscritti === 1 ? 'o' : 'i'}`, filtroTesto].filter(Boolean).join(' · '), L, doc.y + 1, { width: TW });
    const y = doc.y + 10;
    const cols = s.trasferiti ? COL_T : COL_N;
    const testa = cols.map((c) => c.t);
    const rh = altezza(testa, cols, true);
    riga(testa, cols, y, rh, true, '#dbe4ee', INK);
    return y + rh;
  };

  for (const s of sezioni) {
    const cols = s.trasferiti ? COL_T : COL_N;
    let y = iniziaPagina(s, false);
    s.lista.forEach((m, i) => {
      const celle = [i + 1, m.cognome, m.nome, dataIt(m.dataNascita), m.luogoNascita || '—',
        [m.indirizzo, m.citta].filter(Boolean).join(', ') || '—', m.telefonoGenitore || '—'];
      if (s.trasferiti) celle.push(`${m.parrocchiaTrasferimento}${m.dataTrasferimento ? ' (' + dataIt(m.dataTrasferimento) + ')' : ''}`);
      const rh = altezza(celle, cols, false);
      if (y + rh > H - 50) y = iniziaPagina(s, true);
      riga(celle, cols, y, rh, false, i % 2 === 0 ? '#f1f5f9' : null, '#1b2733');
      y += rh;
    });
  }

  if (!sezioni.length) {
    intestazione();
    doc.fillColor(MUTED).font('Helvetica').fontSize(12).text('Nessun ragazzo corrisponde ai filtri selezionati.', L, 90);
  }

  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // altrimenti scrivere nel margine inferiore crea una pagina nuova
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`ACR Parrocchia Sant'Achille – Molfetta · Pagina ${i + 1} di ${count}`, L, doc.page.height - 28, { width: TW, align: 'center', lineBreak: false });
  }
  doc.end();
});

router.get('/:id', async (req, res) => {
  const m = req.member;
  const fratelli = m.familyId
    ? await Member.find({ familyId: m.familyId, _id: { $ne: m._id }, ...(req.user.ruolo === 'admin' ? {} : { trasferito: { $ne: true } }) })
        .select('nome cognome dataNascita').sort({ dataNascita: 1 })
    : [];
  res.json({ ...m.toJSON(), fratelli });
});

router.post('/', async (req, res) => {
  res.status(201).json(await Member.create({ ...pulisci(req.body), creatoDa: req.user._id }));
});

// Tutti gli educatori possono modificare qualsiasi scheda
router.put('/:id', async (req, res) => {
  const m = req.member;
  m.set(pulisci(req.body));
  await m.save();
  res.json(m);
});

router.delete('/:id', soloAdmin, async (req, res) => {
  const m = await Member.findByIdAndDelete(req.member._id);
  if (m.familyId && (await Member.countDocuments({ familyId: m.familyId })) < 2)
    await Member.updateMany({ familyId: m.familyId }, { familyId: null });
  res.status(204).end();
});

// Trasferimento in un'altra parrocchia (educatori e admin): esce dagli elenchi, resta visibile solo agli admin
router.post('/:id/trasferisci', async (req, res) => {
  const parrocchia = (req.body.parrocchia || '').trim();
  if (!parrocchia) return res.status(400).json({ message: 'Scrivi il nome della parrocchia di destinazione' });
  const m = req.member;
  m.set({ trasferito: true, parrocchiaTrasferimento: parrocchia, dataTrasferimento: new Date(), gruppoPrecedente: m.gruppo, gruppo: null });
  await m.save();
  res.json(m);
});

// Solo admin: annulla il trasferimento e rimette il ragazzo nel gruppo di prima (se esiste ancora)
router.post('/:id/rientro', soloAdmin, async (req, res) => {
  const m = req.member;
  const gruppo = m.gruppoPrecedente && (await Group.exists({ _id: m.gruppoPrecedente })) ? m.gruppoPrecedente : null;
  m.set({ trasferito: false, parrocchiaTrasferimento: '', dataTrasferimento: null, gruppo, gruppoPrecedente: null });
  await m.save();
  res.json(m);
});

// Collega uno o più ragazzi come fratelli (unisce anche famiglie già esistenti)
router.post('/:id/fratelli', async (req, res) => {
  const m = req.member;
  const ids = [m._id, ...(req.body.ids || [])].map((i) => new mongoose.Types.ObjectId(i));
  const coinvolti = await Member.find({ _id: { $in: ids } }).select('familyId');
  const famiglie = coinvolti.map((c) => c.familyId).filter(Boolean);
  const familyId = m.familyId || new mongoose.Types.ObjectId();
  await Member.updateMany({ $or: [{ _id: { $in: ids } }, { familyId: { $in: famiglie } }] }, { familyId });
  res.json({ familyId });
});

router.delete('/:id/fratelli', async (req, res) => {
  const m = req.member;
  const fid = m.familyId;
  m.familyId = null;
  await m.save();
  if (fid && (await Member.countDocuments({ familyId: fid })) < 2) await Member.updateMany({ familyId: fid }, { familyId: null });
  res.status(204).end();
});

module.exports = router;
