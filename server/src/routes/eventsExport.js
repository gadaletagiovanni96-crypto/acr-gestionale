const PDFDocument = require('pdfkit');
const { disegnaMarchio } = require('../logo');
const ExcelJS = require('exceljs');
const Event = require('../models/Event');

const tondo = (n) => Math.round(n * 100) / 100;
const dataIt = (d) => (d ? new Date(d).toLocaleDateString('it-IT') : '');
const euro = (n) => '€ ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'evento';
const nomeFile = (eventi) => (eventi.length === 1 ? `contabilita-${slug(eventi[0].nome)}` : 'contabilita-acr-sant-achille');

// ?evento=ID  -> solo quell'evento;  senza parametro -> tutti gli eventi
async function caricaEventi(req, res) {
  const singolo = req.query.evento;
  const eventi = await Event.find(singolo ? { _id: singolo } : {}).sort({ data: singolo ? 1 : -1 });
  if (singolo && !eventi.length) { res.status(404).json({ message: 'Evento non trovato' }); return null; }
  return eventi;
}

// Movimenti in ordine di data, con il saldo progressivo
function movimenti(ev) {
  let saldo = 0;
  return [...ev.voci]
    .sort((a, b) => new Date(a.data) - new Date(b.data) || String(a._id).localeCompare(String(b._id)))
    .map((v) => { saldo += v.tipo === 'entrata' ? v.importo : -v.importo; return { v, progressivo: tondo(saldo) }; });
}

// ---------------------------------------------------------------- PDF
exports.pdf = async (req, res) => {
  const eventi = await caricaEventi(req, res);
  if (!eventi) return;

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true, info: { Title: "Contabilità - ACR Parrocchia Sant'Achille, Molfetta" } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeFile(eventi)}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width, H = doc.page.height, L = 40, TW = W - 80, MIN = 24, FS = 10;
  const INK = '#17324d', MUTED = '#5d6c7b', OK = '#1f7a55', KO = '#a2481a';
  const oggi = new Date().toLocaleDateString('it-IT');
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

  const altezza = (celle, cols, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FS);
    return Math.max(MIN, Math.max(...celle.map((c, k) => doc.heightOfString(String(c ?? ''), { width: cols[k].w - 10 }))) + 12);
  };

  const riga = (celle, cols, y, rh, { bold = false, sfondo = null, colore = '#1b2733', colori = [] } = {}) => {
    if (sfondo) doc.rect(L, y, TW, rh).fill(sfondo);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FS);
    let x = L;
    celle.forEach((c, k) => {
      doc.fillColor(colori[k] || colore).text(String(c ?? ''), x + 5, y + 6, { width: cols[k].w - 10, align: cols[k].a || 'left' });
      x += cols[k].w;
    });
    doc.moveTo(L, y + rh).lineTo(L + TW, y + rh).lineWidth(0.5).strokeColor('#dbe1e8').stroke();
  };

  // Tabella con titolo e righe di testo sotto il titolo; se non entra continua sulla pagina dopo
  const tabella = (titolo, sotto, cols, righe, totale) => {
    const inizia = (seguito) => {
      nuovaPagina();
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(titolo + (seguito ? ' (segue)' : ''), L, 76, { width: TW });
      doc.font('Helvetica').fontSize(11).fillColor(MUTED);
      sotto.forEach((t) => doc.text(t, L, doc.y + 2, { width: TW }));
      const y = doc.y + 10;
      const testa = cols.map((c) => c.t);
      const rh = altezza(testa, cols, true);
      riga(testa, cols, y, rh, { bold: true, sfondo: '#dbe4ee', colore: INK });
      return y + rh;
    };
    let y = inizia(false);
    righe.forEach((r, i) => {
      const rh = altezza(r.celle, cols, false);
      if (y + rh > H - 50) y = inizia(true);
      riga(r.celle, cols, y, rh, { sfondo: i % 2 === 0 ? '#f1f5f9' : null, colori: r.colori });
      y += rh;
    });
    if (totale) {
      const rh = altezza(totale.celle, cols, true);
      if (y + rh > H - 50) y = inizia(true);
      riga(totale.celle, cols, y, rh, { bold: true, sfondo: '#dbe4ee', colore: INK, colori: totale.colori });
    }
    if (!righe.length) doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('Nessun movimento registrato.', L, y + 10);
  };

  // Riepilogo (solo se si stampano più eventi)
  if (eventi.length > 1) {
    const cols = [{ t: 'Evento', w: 252 }, { t: 'Data', w: 80 }, { t: 'Movimenti', w: 70, a: 'right' }, { t: 'Entrate', w: 110, a: 'right' }, { t: 'Uscite', w: 110, a: 'right' }, { t: 'Saldo', w: 140, a: 'right' }];
    const tot = eventi.reduce((a, e) => ({ n: a.n + e.voci.length, e: a.e + e.totaleEntrate, u: a.u + e.totaleUscite }), { n: 0, e: 0, u: 0 });
    const colSaldo = (s) => (s >= 0 ? OK : KO);
    tabella('Riepilogo eventi', [`${eventi.length} eventi`], cols,
      eventi.map((e) => ({ celle: [e.nome, dataIt(e.data), e.voci.length, euro(e.totaleEntrate), euro(e.totaleUscite), euro(e.saldo)], colori: [null, null, null, OK, KO, colSaldo(e.saldo)] })),
      { celle: ['Totale', '', tot.n, euro(tot.e), euro(tot.u), euro(tondo(tot.e - tot.u))], colori: [null, null, null, OK, KO, colSaldo(tot.e - tot.u)] });
  }

  // Un evento per volta, con tutti i suoi movimenti
  const colsM = [{ t: 'Data', w: 80 }, { t: 'Tipo', w: 70 }, { t: 'Descrizione', w: 342 }, { t: 'Importo', w: 120, a: 'right' }, { t: 'Saldo progressivo', w: 150, a: 'right' }];
  for (const ev of eventi) {
    tabella(ev.nome,
      [`${dataIt(ev.data)}${ev.note ? ' · ' + ev.note : ''}`, `Entrate ${euro(ev.totaleEntrate)} · Uscite ${euro(ev.totaleUscite)} · Saldo ${euro(ev.saldo)}`],
      colsM,
      movimenti(ev).map(({ v, progressivo }) => ({
        celle: [dataIt(v.data), v.tipo === 'entrata' ? 'Entrata' : 'Uscita', v.descrizione || '—', `${v.tipo === 'entrata' ? '+' : '−'} ${euro(v.importo)}`, euro(progressivo)],
        colori: [null, null, null, v.tipo === 'entrata' ? OK : KO, null],
      })));
  }
  if (!eventi.length) { nuovaPagina(); doc.fillColor(MUTED).font('Helvetica').fontSize(12).text('Non ci sono eventi da mostrare.', L, 90); }

  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`ACR Parrocchia Sant'Achille – Molfetta · Pagina ${i + 1} di ${count}`, L, H - 28, { width: TW, align: 'center', lineBreak: false });
  }
  doc.end();
};

// ---------------------------------------------------------------- EXCEL
exports.xlsx = async (req, res) => {
  const eventi = await caricaEventi(req, res);
  if (!eventi) return;

  const wb = new ExcelJS.Workbook();
  wb.creator = "ACR Parrocchia Sant'Achille - Molfetta";
  const INK = 'FF17324D', EURO = '"€" #,##0.00', DATA = 'dd/mm/yyyy';
  const usati = new Set(['riepilogo']);
  const nomeFoglio = (n) => {
    const base = (n.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Evento').slice(0, 26);
    let nome = base, i = 2;
    while (usati.has(nome.toLowerCase())) nome = `${base} ${i++}`;
    usati.add(nome.toLowerCase());
    return nome;
  };
  const scrivi = (row, valori) => valori.forEach((val, k) => { if (val !== undefined) row.getCell(k + 1).value = val; });
  const intesta = (row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    row.alignment = { vertical: 'middle', wrapText: true };
  };
  const totale = (row) => {
    row.font = { bold: true };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBE4EE' } };
    row.border = { top: { style: 'thin' } };
  };

  // Foglio riepilogo (solo se ci sono più eventi)
  if (eventi.length > 1) {
    const ws = wb.addWorksheet('Riepilogo');
    ws.columns = [{ width: 36 }, { width: 13 }, { width: 11 }, { width: 14 }, { width: 14 }, { width: 14 }];
    intesta(ws.getRow(1));
    scrivi(ws.getRow(1), ['Evento', 'Data', 'Movimenti', 'Entrate', 'Uscite', 'Saldo']);
    eventi.forEach((e, i) => {
      const r = i + 2;
      scrivi(ws.getRow(r), [e.nome, e.data, e.voci.length, e.totaleEntrate, e.totaleUscite, { formula: `D${r}-E${r}`, result: e.saldo }]);
    });
    const r = eventi.length + 2;
    const te = tondo(eventi.reduce((a, e) => a + e.totaleEntrate, 0)), tu = tondo(eventi.reduce((a, e) => a + e.totaleUscite, 0));
    scrivi(ws.getRow(r), ['Totale', '', { formula: `SUM(C2:C${r - 1})`, result: eventi.reduce((a, e) => a + e.voci.length, 0) },
      { formula: `SUM(D2:D${r - 1})`, result: te }, { formula: `SUM(E2:E${r - 1})`, result: tu }, { formula: `D${r}-E${r}`, result: tondo(te - tu) }]);
    totale(ws.getRow(r));
    ws.getColumn(2).numFmt = DATA;
    [4, 5, 6].forEach((c) => { ws.getColumn(c).numFmt = EURO; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // Un foglio per evento: registro con entrate, uscite e saldo progressivo (formule vive: se modifichi un importo si aggiorna)
  for (const ev of eventi) {
    const ws = wb.addWorksheet(nomeFoglio(ev.nome));
    ws.columns = [{ width: 12 }, { width: 11 }, { width: 46 }, { width: 14 }, { width: 14 }, { width: 18 }];
    ws.getCell('A1').value = ev.nome;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: INK } };
    ws.getCell('A2').value = `${dataIt(ev.data)}${ev.note ? ' · ' + ev.note : ''}`;
    intesta(ws.getRow(4));
    scrivi(ws.getRow(4), ['Data', 'Tipo', 'Descrizione', 'Entrata', 'Uscita', 'Saldo progressivo']);

    const mov = movimenti(ev);
    mov.forEach(({ v, progressivo }, i) => {
      const r = 5 + i;
      scrivi(ws.getRow(r), [v.data, v.tipo === 'entrata' ? 'Entrata' : 'Uscita', v.descrizione || '',
        v.tipo === 'entrata' ? v.importo : null, v.tipo === 'uscita' ? v.importo : null,
        { formula: i === 0 ? `D${r}-E${r}` : `F${r - 1}+D${r}-E${r}`, result: progressivo }]);
    });
    const r = 5 + mov.length;
    scrivi(ws.getRow(r), ['', '', 'Totale',
      mov.length ? { formula: `SUM(D5:D${r - 1})`, result: ev.totaleEntrate } : 0,
      mov.length ? { formula: `SUM(E5:E${r - 1})`, result: ev.totaleUscite } : 0,
      { formula: `D${r}-E${r}`, result: ev.saldo }]);
    totale(ws.getRow(r));

    ws.getColumn(1).numFmt = DATA;
    [4, 5, 6].forEach((c) => { ws.getColumn(c).numFmt = EURO; });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  if (!eventi.length) wb.addWorksheet('Contabilità');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeFile(eventi)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
};