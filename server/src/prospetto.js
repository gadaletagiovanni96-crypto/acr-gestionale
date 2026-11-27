// Contabilità delle tessere: sono le stesse formule del prospetto Excel
const Setting = require('./models/Setting');

const TIPI = ['quotaA', 'quotaB', 'quotaC'];
const VALE = { quotaA: 1, quotaB: 1, quotaC: 2 }; // quante tessere conta ogni tipo
const PREZZI_BASE = { quotaA: 16, quotaB: 9.6, quotaC: 25.6 };
const tondo = (n) => Math.round(n * 100) / 100;

async function leggiPrezzi() {
  const s = await Setting.findOne({ chiave: 'prezziTessere' });
  return { ...PREZZI_BASE, ...(s?.valore || {}) };
}
const salvaPrezzi = (prezzi) => Setting.findOneAndUpdate({ chiave: 'prezziTessere' }, { valore: prezzi }, { upsert: true });

// TOT IN € = D × prezzo1 + E × prezzo2 + F × prezzo3
const totaleEuro = (r, prezzi) => tondo(TIPI.reduce((s, t) => s + r[t] * prezzi[t], 0));
// TOT. EFFETTIVO = SUM(D, E, 2*F, H)
const totaleEffettivo = (r) => TIPI.reduce((s, t) => s + r[t] * VALE[t], 0) + r.altriSettori;

function totali(righe) {
  const somma = (f) => righe.reduce((s, r) => s + f(r), 0);
  const pagate = somma((r) => r.totaleEffettivo);
  const mancanti = somma((r) => r.mancanti);
  const t = {
    euro: tondo(somma((r) => r.totaleEuro)),
    pagate,                                  // =SUM(J3:J12)
    richieste: somma((r) => r.richieste),    // =SUM(K3:K12)
    mancanti,                                // =SUM(L3:L12)
    daChiedere: pagate + mancanti,           // =SUM(C15, L13)
    // Situazione parenti, contata in RAGAZZI (non in coppie: una famiglia può avere 3 fratelli)
    altriSettori: somma((r) => r.altriSettori),        // ragazzi la cui tessera è pagata da adulti/giovanissimi
    ragazziDoppie: somma((r) => r.quotaC * 2),          // ogni tessera doppia copre 2 fratelli
    ragazziFratello: somma((r) => r.quotaB),            // ogni tessera da 9,60 copre 1 fratello
  };
  t.ragazziDaParenti = t.altriSettori + t.ragazziDoppie + t.ragazziFratello;
  return t;
}

module.exports = { TIPI, VALE, leggiPrezzi, salvaPrezzi, totaleEuro, totaleEffettivo, totali };
