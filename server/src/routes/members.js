const router = require('express').Router();
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const { disegnaMarchio, scriviAnnoEData } = require('../logo');
const { leggiImpostazioni } = require('../impostazioni');
const ExcelJS = require('exceljs');
const Member = require('../models/Member');
const { statoIscrizione } = Member;
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

function pulisci(body, admin = false) {
  const d = {};
  for (const k of CAMPI) if (k in body) d[k] = body[k];
  for (const k of ['gruppo', 'dataVersamento', 'dataNascita']) if (d[k] === '') d[k] = null;
  if ('quotaVersata' in d && (d.quotaVersata === '' || d.quotaVersata == null)) d.quotaVersata = 0;
  if (admin && 'tesserato' in body) d.tesserato = body.tesserato === true; // il tesseramento lo gestisce solo l'admin
  return d;
}

// Filtro condiviso da elenco e PDF. Restituisce null se non c'è nulla da mostrare.
// Ogni filtro accetta più valori separati da virgola (es. iscrizione=dacompletare,noniscritti):
// dentro lo stesso filtro vale "uno qualsiasi", tra filtri diversi valgono tutti insieme.
//   gruppo = id dei gruppi, nessuno, trasferiti (solo admin)
//   iscrizione = si | dacompletare | noniscritti   tesserato = si | no (solo admin)   fratelli = si | no
const lista = (v, ammessi) => [...new Set(String(v || '').split(',').map((x) => x.trim()).filter((x) => ammessi(x)))];
const filtriScelti = (query, admin) => ({
  gruppi: lista(query.gruppo, (x) => x === 'nessuno' || (x === 'trasferiti' && admin) || mongoose.isValidObjectId(x)),
  iscrizione: lista(query.iscrizione, (x) => ['si', 'dacompletare', 'noniscritti'].includes(x)),
  tesserato: admin ? lista(query.tesserato, (x) => ['si', 'no'].includes(x)) : [],
  fratelli: lista(query.fratelli, (x) => ['si', 'no'].includes(x)),
});

function filtroDa(req) {
  const admin = req.user.ruolo === 'admin';
  const s = filtriScelti(req.query, admin);
  const e = []; // condizioni che devono valere tutte
  if (!admin) e.push({ trasferito: { $ne: true } });
  if (s.gruppi.length) {
    const ids = s.gruppi.filter((x) => x !== 'nessuno' && x !== 'trasferiti');
    const o = [];
    if (ids.length) o.push({ gruppo: { $in: ids }, trasferito: { $ne: true } });
    if (s.gruppi.includes('nessuno')) o.push({ gruppo: null, trasferito: { $ne: true } });
    if (s.gruppi.includes('trasferiti')) o.push({ trasferito: true });
    e.push({ $or: o });
  }
  const nonPagato = { quotaVersata: { $not: { $gt: 0 } } };
  const STATO = { si: { quotaVersata: { $gt: 0 } }, dacompletare: { ...nonPagato, nonIscritto: { $ne: true } }, noniscritti: { ...nonPagato, nonIscritto: true } };
  if (s.iscrizione.length && s.iscrizione.length < 3) e.push({ $or: s.iscrizione.map((v) => STATO[v]) });
  if (s.tesserato.length === 1) e.push({ tesserato: s.tesserato[0] === 'si' ? true : { $ne: true } });
  if (s.fratelli.length === 1) e.push({ familyId: s.fratelli[0] === 'si' ? { $ne: null } : null });
  // Come nella pagina: con un filtro su iscrizione o tessera i trasferiti non compaiono
  if ((s.iscrizione.length || s.tesserato.length) && !s.gruppi.includes('trasferiti')) e.push({ trasferito: { $ne: true } });
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    e.push({ $or: [{ nome: rx }, { cognome: rx }] });
  }
  return e.length ? { $and: e } : {};
}

// Descrizione dei filtri per PDF ed Excel, es. "da completare o non iscritti, solo tesserati"
function descrizioneFiltri(req) {
  const admin = req.user.ruolo === 'admin';
  const s = filtriScelti(req.query, admin);
  const nomi = { si: 'iscritti', dacompletare: 'da completare', noniscritti: 'non iscritti' };
  return [
    s.iscrizione.length && s.iscrizione.length < 3 ? 'solo ' + s.iscrizione.map((v) => nomi[v]).join(' o ') : '',
    s.tesserato.length === 1 ? (s.tesserato[0] === 'si' ? 'solo tesserati' : 'solo non tesserati') : '',
    s.fratelli.length === 1 ? (s.fratelli[0] === 'si' ? 'con fratelli' : 'senza fratelli') : '',
    req.query.q ? `ricerca "${req.query.q}"` : '',
  ].filter(Boolean).join(', ');
}

router.get('/', async (req, res) => {
  const f = filtroDa(req);
  if (!f) return res.json([]);
  res.json(await Member.find(f).populate('gruppo', 'nome').sort({ cognome: 1, nome: 1 }));
});

// ---------- PDF degli elenchi (un gruppo per pagina) ----------
// Per ogni ragazzo elenca i fratelli con il loro gruppo: serve al PDF "con fratelli" e all'Excel dell'admin.
// Restituisce una funzione: ragazzo -> lista di testi come "Anna Rossi (III elementare)".
async function aggiungiFratelli(members) {
  const famiglie = [...new Set(members.map((m) => m.familyId).filter(Boolean).map(String))];
  const parenti = famiglie.length
    ? await Member.find({ familyId: { $in: famiglie } }).populate('gruppo', 'nome').select('nome cognome familyId gruppo trasferito')
    : [];
  const perFamiglia = {};
  for (const p of parenti) (perFamiglia[String(p.familyId)] ||= []).push(p);
  return (m) => (m.familyId ? perFamiglia[String(m.familyId)] || [] : [])
    .filter((p) => String(p._id) !== String(m._id))
    .map((p) => `${p.nome} ${p.cognome} (${p.trasferito ? 'Trasferito' : p.gruppo?.nome || 'Senza gruppo'})`);
}

router.get('/pdf', async (req, res) => {
  const { annoAssociativo } = await leggiImpostazioni();
  const admin = req.user.ruolo === 'admin';
  const conFratelli = admin && req.query.conFratelli === '1'; // solo admin: PDF con la colonna dei fratelli
  const f = filtroDa(req);
  const [members, groups] = await Promise.all([
    f ? Member.find(f).sort({ cognome: 1, nome: 1 }) : [],
    Group.find().populate('educatori', 'nome cognome').sort({ nome: 1 }),
  ]);
  const fratelliDi = conFratelli ? await aggiungiFratelli(members) : null;

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
  const filtroTesto = descrizioneFiltri(req);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true, info: { Title: "Elenco ragazzi - ACR Parrocchia Sant'Achille, Molfetta" } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="elenco-ragazzi-acr-sant-achille${conFratelli ? '-con-fratelli' : ''}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width, H = doc.page.height, L = 40, TW = W - 80, MIN = 24, FS = conFratelli ? 9 : 10;
  const INK = '#17324d', MUTED = '#5d6c7b';
  const ROSSO = '#fde4e1'; // rosso leggero per i ragazzi con iscrizione da completare
  const GRIGIO = '#e3e6ea'; // grigio per chi ha deciso di non iscriversi
  const oggi = new Date().toLocaleDateString('it-IT');
  // Larghezze pensate per A4 orizzontale (762 pt utili): nessun testo viene troncato, va a capo
  let COL_N = [{ t: 'N.', w: 24 }, { t: 'Cognome', w: 115 }, { t: 'Nome', w: 105 }, { t: 'Data di nascita', w: 78 },
    { t: 'Luogo di nascita', w: 124 }, { t: 'Via', w: 200 }, { t: 'Telefono genitore', w: 116 }];
  let COL_T = [{ t: 'N.', w: 24 }, { t: 'Cognome', w: 105 }, { t: 'Nome', w: 95 }, { t: 'Data di nascita', w: 78 },
    { t: 'Luogo di nascita', w: 110 }, { t: 'Via', w: 120 }, { t: 'Telefono genitore', w: 100 }, { t: 'Trasferito a', w: 130 }];
  if (conFratelli) { // con la colonna dei fratelli le altre si restringono (la somma resta 762)
    COL_N = [{ t: 'N.', w: 22 }, { t: 'Cognome', w: 80 }, { t: 'Nome', w: 70 }, { t: 'Data di nascita', w: 62 },
      { t: 'Luogo di nascita', w: 82 }, { t: 'Via', w: 120 }, { t: 'Telefono genitore', w: 82 }, { t: 'Fratelli', w: 188 }, { t: 'Tesserato', w: 56 }];
    COL_T = [{ t: 'N.', w: 22 }, { t: 'Cognome', w: 72 }, { t: 'Nome', w: 62 }, { t: 'Data di nascita', w: 60 },
      { t: 'Luogo di nascita', w: 74 }, { t: 'Via', w: 100 }, { t: 'Telefono genitore', w: 76 }, { t: 'Trasferito a', w: 96 }, { t: 'Fratelli', w: 144 }, { t: 'Tesserato', w: 56 }];
  }
  let prima = true;

  const intestazione = () => {
    doc.rect(0, 0, W, 58).fill(INK);
    const tx = disegnaMarchio(doc, L); // logo (o pallino giallo) e posizione del titolo
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text("ACR · Parrocchia Sant'Achille", tx, 17, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).text('Molfetta · Elenco ragazzi', tx, 36, { lineBreak: false });
    scriviAnnoEData(doc, L, TW, annoAssociativo, oggi); // "Anno associativo ..." e data a destra
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

  // Piccola legenda: rosso chiaro = da completare, grigio = non iscritto
  const legenda = () => {
    const ly = doc.y + 6;
    doc.rect(L, ly, 10, 10).lineWidth(0.5).fillAndStroke(ROSSO, '#d9a79f');
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Da completare', L + 16, ly + 1, { lineBreak: false });
    doc.rect(L + 110, ly, 10, 10).lineWidth(0.5).fillAndStroke(GRIGIO, '#b8bec6');
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Non iscritto', L + 126, ly + 1, { lineBreak: false });
  };

  const iniziaPagina = (s, seguito) => {
    if (!prima) doc.addPage();
    prima = false;
    intestazione();
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(s.titolo + (seguito ? ' (segue)' : ''), L, 76, { width: TW });
    doc.font('Helvetica').fontSize(11).fillColor(MUTED);
    if (!s.senzaEducatori) doc.text('Educatori: ' + (s.educatori.length ? s.educatori.join(', ') : 'nessuno assegnato'), L, doc.y + 2, { width: TW });
    const n = s.lista.length;
    const conta = (st) => s.lista.filter((m) => statoIscrizione(m) === st).length;
    const iscritti = conta('Iscritto'), daCompl = conta('Da completare'), nonIscr = conta('Non iscritto');
    const stati = s.trasferiti ? '' : [`${iscritti} iscritt${iscritti === 1 ? 'o' : 'i'}`, daCompl ? `${daCompl} da completare` : '',
      nonIscr ? `${nonIscr} non iscritt${nonIscr === 1 ? 'o' : 'i'}` : ''].filter(Boolean).join(' · ');
    doc.text([`${n} ragazz${n === 1 ? 'o' : 'i'}`, stati, filtroTesto].filter(Boolean).join(' · '), L, doc.y + 1, { width: TW });
    if (!s.trasferiti) legenda();
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
      if (conFratelli) { celle.push(fratelliDi(m).join('\n') || '—'); celle.push(m.tesserato ? 'Sì' : 'No'); } // ultima colonna: tesserato
      const rh = altezza(celle, cols, false);
      if (y + rh > H - 50) y = iniziaPagina(s, true);
      const stato = s.trasferiti ? '' : statoIscrizione(m);
      const sfondo = stato === 'Da completare' ? ROSSO : stato === 'Non iscritto' ? GRIGIO : i % 2 === 0 ? '#f1f5f9' : null;
      riga(celle, cols, y, rh, false, sfondo, '#1b2733');
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

// ---------- Foglio di calcolo Excel (un foglio per gruppo) ----------
router.get('/xlsx', async (req, res) => {
  const admin = req.user.ruolo === 'admin';
  const f = filtroDa(req);
  const [members, groups] = await Promise.all([
    f ? Member.find(f).sort({ cognome: 1, nome: 1 }) : [],
    Group.find().populate('educatori', 'nome cognome').sort({ nome: 1 }),
  ]);
  const fratelliDi = admin ? await aggiungiFratelli(members) : null; // l'Excel dell'admin ha sempre i fratelli

  const sezioni = [];
  for (const g of groups) {
    const lista = members.filter((m) => !m.trasferito && String(m.gruppo) === String(g._id));
    if (lista.length) sezioni.push({ titolo: g.nome, educatori: g.educatori.map((e) => `${e.nome} ${e.cognome}`.trim()), lista, conta: g.contaNelTotale !== false });
  }
  const senza = members.filter((m) => !m.trasferito && !m.gruppo);
  if (senza.length) sezioni.push({ titolo: 'Senza gruppo', senzaEducatori: true, educatori: [], lista: senza, conta: true });
  const trasf = members.filter((m) => m.trasferito);
  if (admin && trasf.length) sezioni.push({ titolo: 'Trasferiti', senzaEducatori: true, trasferiti: true, educatori: [], lista: trasf });

  const wb = new ExcelJS.Workbook();
  wb.creator = "ACR Parrocchia Sant'Achille - Molfetta";
  const usati = new Set(['riepilogo']);
  const nomeFoglio = (n) => { // Excel: max 31 caratteri, niente \ / ? * [ ] : e nomi univoci
    const base = (n.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Foglio').slice(0, 26);
    let nome = base, i = 2;
    while (usati.has(nome.toLowerCase())) nome = `${base} ${i++}`;
    usati.add(nome.toLowerCase());
    return nome;
  };
  const INK = 'FF17324D';

  // Foglio iniziale con il riepilogo dei gruppi
  const riep = wb.addWorksheet('Riepilogo');
  riep.columns = [{ header: 'Gruppo', key: 'g', width: 32 }, { header: 'Educatori', key: 'e', width: 40 },
    { header: 'Ragazzi', key: 'n', width: 10 }, { header: 'Iscritti', key: 'i', width: 10 },
    { header: 'Da completare', key: 'd', width: 14 }, { header: 'Non iscritti', key: 'x', width: 12 }, { header: 'Incassato', key: 't', width: 14 }];
  riep.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  riep.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  riep.getColumn('t').numFmt = '"€" #,##0.00';
  const totale = { n: 0, i: 0, d: 0, x: 0, t: 0 };

  for (const s of sezioni) {
    const cols = [
      { k: 'n', t: 'N.', w: 5 }, { k: 'cognome', t: 'Cognome', w: 20 }, { k: 'nome', t: 'Nome', w: 18 },
      { k: 'nascita', t: 'Data di nascita', w: 14 }, { k: 'luogo', t: 'Luogo di nascita', w: 22 },
      { k: 'via', t: 'Via', w: 30 }, { k: 'citta', t: 'Città', w: 16 },
      { k: 'genitore', t: 'Genitore', w: 22 }, { k: 'tel', t: 'Telefono genitore', w: 18 },
      { k: 'stato', t: 'Iscrizione', w: 15 }, { k: 'quota', t: 'Quota versata', w: 14 }, { k: 'dataV', t: 'Data versamento', w: 16 },
    ];
    if (s.trasferiti) cols.push({ k: 'trasf', t: 'Trasferito a', w: 28 });
    if (admin) cols.push({ k: 'fratelli', t: 'Fratelli (nome, cognome e gruppo)', w: 52 });
    if (admin) cols.push({ k: 'tess', t: 'Tesserato', w: 12 }); // ultima colonna

    const ws = wb.addWorksheet(nomeFoglio(s.titolo));
    ws.columns = cols.map((c) => ({ key: c.k, width: c.w }));
    ws.getCell('A1').value = s.titolo;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: INK } };
    if (!s.senzaEducatori) ws.getCell('A2').value = 'Educatori: ' + (s.educatori.join(', ') || 'nessuno assegnato');
    const filtri = descrizioneFiltri(req);
    if (filtri) ws.getCell('A3').value = 'Filtri: ' + filtri;
    const head = ws.getRow(4);
    head.values = cols.map((c) => c.t);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    head.alignment = { vertical: 'middle', wrapText: true };

    s.lista.forEach((m, i) => {
      const pagato = m.quotaVersata > 0;
      const fila = ws.addRow({
        n: i + 1, cognome: m.cognome, nome: m.nome, nascita: m.dataNascita, luogo: m.luogoNascita,
        via: m.indirizzo, citta: m.citta, genitore: m.nomeGenitore, tel: m.telefonoGenitore,
        stato: statoIscrizione(m), quota: pagato ? m.quotaVersata : null, dataV: pagato ? m.dataVersamento : null,
        trasf: s.trasferiti ? `${m.parrocchiaTrasferimento}${m.dataTrasferimento ? ' (' + new Date(m.dataTrasferimento).toLocaleDateString('it-IT') + ')' : ''}` : undefined,
        fratelli: admin ? fratelliDi(m).join('; ') : undefined,
        tess: admin ? (m.tesserato ? 'Sì' : 'No') : undefined,
      });
      if (admin) fila.getCell(cols.length - 1).alignment = { wrapText: true, vertical: 'top' }; // la colonna dei fratelli è la penultima
    });
    ws.getColumn('nascita').numFmt = 'dd/mm/yyyy';
    ws.getColumn('dataV').numFmt = 'dd/mm/yyyy';
    ws.getColumn('quota').numFmt = '"€" #,##0.00';
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    if (!s.trasferiti) {
      const pagati = s.lista.filter((m) => m.quotaVersata > 0);
      const nonIscr = s.lista.filter((m) => statoIscrizione(m) === 'Non iscritto').length;
      const r = { g: s.titolo + (s.conta ? '' : ' (escluso dal totale)'), e: s.educatori.join(', '), n: s.lista.length, i: pagati.length,
        d: s.lista.length - pagati.length - nonIscr, x: nonIscr, t: pagati.reduce((a, m) => a + m.quotaVersata, 0) };
      riep.addRow(r);
      if (s.conta) for (const k of ['n', 'i', 'd', 'x', 't']) totale[k] += r[k];
    }
  }
  // Riga finale: somma dei soli gruppi che contano nel totale
  const fine = riep.addRow({ g: 'Totale', ...totale });
  fine.font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="elenco-ragazzi-acr-sant-achille.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

router.get('/:id', async (req, res) => {
  const m = req.member;
  const fratelli = m.familyId
    ? await Member.find({ familyId: m.familyId, _id: { $ne: m._id }, ...(req.user.ruolo === 'admin' ? {} : { trasferito: { $ne: true } }) })
        .select('nome cognome dataNascita tesserato').sort({ dataNascita: 1 })
    : [];
  res.json({ ...m.toJSON(), fratelli });
});

router.post('/', async (req, res) => {
  // Se l'admin ha chiuso le iscrizioni, gli educatori non possono registrare nuovi ragazzi
  if (req.user.ruolo !== 'admin' && !(await leggiImpostazioni()).iscrizioniAperte)
    return res.status(403).json({ message: "Le iscrizioni sono chiuse: al momento solo l'amministratore può registrare nuovi ragazzi." });
  res.status(201).json(await Member.create({ ...pulisci(req.body, req.user.ruolo === 'admin'), creatoDa: req.user._id }));
});

// Tutti gli educatori possono modificare qualsiasi scheda
router.put('/:id', async (req, res) => {
  const m = req.member;
  m.set(pulisci(req.body, req.user.ruolo === 'admin'));
  await m.save();
  // L'admin ha risposto "sì" alla domanda: tessera anche i fratelli collegati
  if (req.user.ruolo === 'admin' && req.body.tesseraFratelli === true && m.tesserato && m.familyId)
    await Member.updateMany({ familyId: m.familyId, _id: { $ne: m._id }, trasferito: { $ne: true } }, { tesserato: true });
  res.json(m);
});

router.delete('/:id', soloAdmin, async (req, res) => {
  const m = await Member.findByIdAndDelete(req.member._id);
  if (m.familyId && (await Member.countDocuments({ familyId: m.familyId })) < 2)
    await Member.updateMany({ familyId: m.familyId }, { familyId: null });
  res.status(204).end();
});

// "Non si iscrive" (educatori e admin): il ragazzo resta negli elenchi come Non iscritto, anche dopo la chiusura dell'anno.
// Con { nonIscritto: false } torna "da completare".
router.post('/:id/non-iscritto', async (req, res) => {
  const m = req.member;
  const valore = req.body.nonIscritto !== false;
  if (valore && m.quotaVersata > 0)
    return res.status(400).json({ message: 'Questo ragazzo ha già versato la quota: per segnarlo come non iscritto azzera prima la quota.' });
  m.nonIscritto = valore;
  await m.save();
  res.json(m);
});

// Toglie il ragazzo dalla sua famiglia; se nella famiglia resta una sola persona, il collegamento sparisce
async function scollegaDaFamiglia(m) {
  const fid = m.familyId;
  m.familyId = null;
  await m.save();
  if (fid && (await Member.countDocuments({ familyId: fid })) < 2) await Member.updateMany({ familyId: fid }, { familyId: null });
}

// Trasferimento in un'altra parrocchia (educatori e admin): esce dagli elenchi, resta visibile solo agli admin.
// Con { scollegaFratelli: true } viene anche tolto dalla famiglia.
router.post('/:id/trasferisci', async (req, res) => {
  const parrocchia = (req.body.parrocchia || '').trim();
  if (!parrocchia) return res.status(400).json({ message: 'Scrivi il nome della parrocchia di destinazione' });
  const m = req.member;
  m.set({ trasferito: true, parrocchiaTrasferimento: parrocchia, dataTrasferimento: new Date(), gruppoPrecedente: m.gruppo, gruppo: null });
  await m.save();
  if (req.body.scollegaFratelli === true && m.familyId) await scollegaDaFamiglia(m);
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
  await scollegaDaFamiglia(req.member);
  res.status(204).end();
});

module.exports = router;
