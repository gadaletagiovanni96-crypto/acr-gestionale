const router = require('express').Router();
const PDFDocument = require('pdfkit');
const { disegnaMarchio } = require('../logo');
const ExcelJS = require('exceljs');
const Group = require('../models/Group');
const Member = require('../models/Member');
const { auth } = require('../middleware/auth');

// Sezione riservata agli educatori (l'admin non la usa)
router.use(auth, (req, res, next) =>
  req.user.ruolo === 'educatore' ? next() : res.status(403).json({ message: 'Sezione riservata agli educatori' }));

const dataIt = (d) => (d ? new Date(d).toLocaleDateString('it-IT') : '');
const via = (r) => [r.indirizzo, r.citta].filter(Boolean).join(', ');
const testoFratelli = (r, sep) => r.fratelli.map((f) => `${f.nome} ${f.cognome} (${f.gruppo})`).join(sep);
const statoIscrizione = (r) => (r.iscritto ? 'Iscritto' : 'Da completare');

// I gruppi di cui l'educatore è responsabile, con i loro ragazzi e gli eventuali fratelli
async function caricaGruppi(user) {
  const gruppi = await Group.find({ educatori: user._id }).populate('educatori', 'nome cognome').sort({ nome: 1 });
  if (!gruppi.length) return [];
  const ragazzi = await Member.find({ gruppo: { $in: gruppi.map((g) => g._id) }, trasferito: { $ne: true } }).sort({ cognome: 1, nome: 1 });
  const famiglie = ragazzi.map((r) => r.familyId).filter(Boolean);
  const parenti = famiglie.length
    ? await Member.find({ familyId: { $in: famiglie }, trasferito: { $ne: true } }).populate('gruppo', 'nome').select('nome cognome familyId gruppo')
    : [];
  return gruppi.map((g) => ({
    _id: g._id,
    nome: g.nome,
    educatori: g.educatori.map((e) => `${e.nome} ${e.cognome}`.trim()),
    ragazzi: ragazzi
      .filter((r) => String(r.gruppo) === String(g._id))
      .map((r) => ({
        _id: r._id, nome: r.nome, cognome: r.cognome, dataNascita: r.dataNascita, luogoNascita: r.luogoNascita,
        indirizzo: r.indirizzo, citta: r.citta, telefonoGenitore: r.telefonoGenitore,
        iscritto: r.quotaVersata > 0,
        fratelli: r.familyId
          ? parenti
              .filter((p) => String(p.familyId) === String(r.familyId) && String(p._id) !== String(r._id))
              .map((p) => ({ _id: p._id, nome: p.nome, cognome: p.cognome, gruppo: p.gruppo?.nome || 'Senza gruppo' }))
          : [],
      })),
  }));
}

// ---------- Filtri: ?iscrizione=si|no  &fratelli=si|no  &q=testo ----------
const minuscolo = (s) => String(s || '').toLowerCase();
const siNo = (v) => (v === 'si' || v === 'no' ? v : '');
const filtriDa = (query) => ({ iscrizione: siNo(query.iscrizione), fratelli: siNo(query.fratelli), q: String(query.q || '').trim().slice(0, 100) });
const filtriAttivi = (f) => !!(f.iscrizione || f.fratelli || f.q);

// Testo in cui cerca la casella "Cerca": nome, cognome, luogo, via, telefono e nomi dei fratelli
const testoRicerca = (r) => minuscolo([r.cognome, r.nome, `${r.nome} ${r.cognome}`, r.luogoNascita, r.indirizzo, r.citta, r.telefonoGenitore,
  ...r.fratelli.map((f) => `${f.nome} ${f.cognome}`)].join(' '));

function filtra(gruppi, f) {
  const parole = minuscolo(f.q).split(/\s+/).filter(Boolean); // devono comparire tutte
  const ok = (r) => {
    if (f.iscrizione === 'si' && !r.iscritto) return false;
    if (f.iscrizione === 'no' && r.iscritto) return false;
    if (f.fratelli === 'si' && !r.fratelli.length) return false;
    if (f.fratelli === 'no' && r.fratelli.length) return false;
    if (parole.length) { const t = testoRicerca(r); if (!parole.every((p) => t.includes(p))) return false; }
    return true;
  };
  return gruppi.map((g) => ({ ...g, ragazzi: g.ragazzi.filter(ok) }));
}

const descrizioneFiltri = (f) => [
  f.iscrizione === 'si' ? 'solo iscritti' : f.iscrizione === 'no' ? 'solo non ancora iscritti' : '',
  f.fratelli === 'si' ? 'con fratelli' : f.fratelli === 'no' ? 'senza fratelli' : '',
  f.q ? `ricerca "${f.q}"` : '',
].filter(Boolean).join(', ');

// Dati per PDF ed Excel: i gruppi dell'educatore con i filtri attivi applicati
async function preparaDati(req, res) {
  const tutti = await caricaGruppi(req.user);
  if (!tutti.length) { res.status(404).json({ message: 'Non hai gruppi assegnati' }); return null; }
  const f = filtriDa(req.query);
  let gruppi = filtra(tutti, f);
  if (filtriAttivi(f)) gruppi = gruppi.filter((g) => g.ragazzi.length);
  if (!gruppi.length) { res.status(404).json({ message: 'Nessun ragazzo corrisponde ai filtri scelti' }); return null; }
  return { gruppi, descr: descrizioneFiltri(f) };
}

// Elenco completo: i filtri della pagina li applica il browser
router.get('/', async (req, res) => res.json(await caricaGruppi(req.user)));

// ---------------------------------------------------------------- PDF
router.get('/pdf', async (req, res) => {
  const dati = await preparaDati(req, res);
  if (!dati) return;
  const { gruppi, descr } = dati;

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true, info: { Title: "I miei gruppi - ACR Parrocchia Sant'Achille, Molfetta" } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="i-miei-gruppi-acr-sant-achille.pdf"');
  doc.pipe(res);

  const W = doc.page.width, H = doc.page.height, L = 40, TW = W - 80, MIN = 24, FS = 9;
  const INK = '#17324d', MUTED = '#5d6c7b';
  const ROSSO = '#fde4e1';
  const oggi = new Date().toLocaleDateString('it-IT');
  // Larghezze per A4 orizzontale: la somma deve restare 762
  const COLS = [{ t: 'N.', w: 22 }, { t: 'Cognome', w: 75 }, { t: 'Nome', w: 66 }, { t: 'Data di nascita', w: 60 },
    { t: 'Luogo di nascita', w: 78 }, { t: 'Via', w: 118 }, { t: 'Telefono genitore', w: 80 }, { t: 'Iscrizione', w: 70 }, { t: 'Fratelli', w: 193 }];
  let prima = true;

  const nuovaPagina = () => {
    if (!prima) doc.addPage();
    prima = false;
    doc.rect(0, 0, W, 58).fill(INK);
    const tx = disegnaMarchio(doc, L);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text("ACR · Parrocchia Sant'Achille", tx, 17, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).text('Molfetta · Elenco ragazzi', tx, 36, { lineBreak: false });
    doc.text(oggi, L, 26, { width: TW, align: 'right', lineBreak: false });
  };
  const altezza = (celle, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FS);
    return Math.max(MIN, Math.max(...celle.map((c, k) => doc.heightOfString(String(c ?? ''), { width: COLS[k].w - 10 }))) + 12);
  };
  const riga = (celle, y, rh, bold, sfondo, colore) => {
    if (sfondo) doc.rect(L, y, TW, rh).fill(sfondo);
    doc.fillColor(colore).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FS);
    let x = L;
    celle.forEach((c, k) => { doc.text(String(c ?? ''), x + 5, y + 6, { width: COLS[k].w - 10 }); x += COLS[k].w; });
    doc.moveTo(L, y + rh).lineTo(L + TW, y + rh).lineWidth(0.5).strokeColor('#dbe1e8').stroke();
  };

  for (const g of gruppi) {
    const legenda = () => {
      const ly = doc.y + 6;
      doc.rect(L, ly, 10, 10).lineWidth(0.5).fillAndStroke(ROSSO, '#d9a79f');
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Non ancora iscritto', L + 16, ly + 1, { lineBreak: false });
    };
    const inizia = (seguito) => {
      nuovaPagina();
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(g.nome + (seguito ? ' (segue)' : ''), L, 76, { width: TW });
      doc.font('Helvetica').fontSize(11).fillColor(MUTED);
      doc.text('Educatori: ' + (g.educatori.join(', ') || 'nessuno'), L, doc.y + 2, { width: TW });
      doc.text(`${g.ragazzi.length} ragazz${g.ragazzi.length === 1 ? 'o' : 'i'}${descr ? ' · Filtri: ' + descr : ''}`, L, doc.y + 1, { width: TW });
      legenda();
      const y = doc.y + 10;
      const testa = COLS.map((c) => c.t);
      const rh = altezza(testa, true);
      riga(testa, y, rh, true, '#dbe4ee', INK);
      return y + rh;
    };
    let y = inizia(false);
    g.ragazzi.forEach((r, i) => {
      const celle = [i + 1, r.cognome, r.nome, dataIt(r.dataNascita), r.luogoNascita || '—', via(r) || '—', r.telefonoGenitore || '—',
        statoIscrizione(r), r.fratelli.length ? testoFratelli(r, '\n') : '—'];
      const rh = altezza(celle, false);
      if (y + rh > H - 50) y = inizia(true);
      riga(celle, y, rh, false, !r.iscritto ? ROSSO : i % 2 === 0 ? '#f1f5f9' : null, '#1b2733');
      y += rh;
    });
    if (!g.ragazzi.length) doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('Nessun ragazzo in questo gruppo.', L, y + 10);
  }

  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`ACR Parrocchia Sant'Achille – Molfetta · Pagina ${i + 1} di ${count}`, L, H - 28, { width: TW, align: 'center', lineBreak: false });
  }
  doc.end();
});

// ---------------------------------------------------------------- EXCEL
router.get('/xlsx', async (req, res) => {
  const dati = await preparaDati(req, res);
  if (!dati) return;
  const { gruppi, descr } = dati;

  const wb = new ExcelJS.Workbook();
  wb.creator = "ACR Parrocchia Sant'Achille - Molfetta";
  const INK = 'FF17324D';
  const usati = new Set();
  const nomeFoglio = (n) => {
    const base = (n.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Gruppo').slice(0, 26);
    let nome = base, i = 2;
    while (usati.has(nome.toLowerCase())) nome = `${base} ${i++}`;
    usati.add(nome.toLowerCase());
    return nome;
  };
  const COLS = [{ t: 'N.', w: 5 }, { t: 'Cognome', w: 20 }, { t: 'Nome', w: 18 }, { t: 'Data di nascita', w: 14 },
    { t: 'Luogo di nascita', w: 22 }, { t: 'Via', w: 32 }, { t: 'Telefono genitore', w: 18 }, { t: 'Iscrizione', w: 15 },
    { t: 'Fratelli (nome, cognome e gruppo)', w: 52 }];

  for (const g of gruppi) {
    const ws = wb.addWorksheet(nomeFoglio(g.nome));
    ws.columns = COLS.map((c) => ({ width: c.w }));
    ws.getCell('A1').value = g.nome;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: INK } };
    ws.getCell('A2').value = 'Educatori: ' + (g.educatori.join(', ') || 'nessuno');
    if (descr) ws.getCell('A3').value = 'Filtri: ' + descr;
    const head = ws.getRow(4);
    COLS.forEach((c, k) => { head.getCell(k + 1).value = c.t; });
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    head.alignment = { vertical: 'middle', wrapText: true };

    g.ragazzi.forEach((r, i) => {
      const row = ws.getRow(5 + i);
      [i + 1, r.cognome, r.nome, r.dataNascita, r.luogoNascita, via(r), r.telefonoGenitore, statoIscrizione(r), testoFratelli(r, '; ')]
        .forEach((val, k) => { row.getCell(k + 1).value = val; });
      row.getCell(9).alignment = { wrapText: true, vertical: 'top' };
    });
    ws.getColumn(4).numFmt = 'dd/mm/yyyy';
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS.length } };
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="i-miei-gruppi-acr-sant-achille.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;