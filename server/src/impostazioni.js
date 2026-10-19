const Setting = require('./models/Setting');

// Valori usati finché l'admin non cambia nulla
const PREDEFINITE = { iscrizioniAperte: true, annoAssociativo: '' };

async function leggiImpostazioni() {
  const righe = await Setting.find({ chiave: { $in: Object.keys(PREDEFINITE) } });
  const imp = { ...PREDEFINITE };
  for (const r of righe) imp[r.chiave] = r.valore;
  return imp;
}

async function salvaImpostazione(chiave, valore) {
  await Setting.findOneAndUpdate({ chiave }, { valore }, { upsert: true });
}

// "2026/2027", "2026-2027" o "2026 / 2027" diventano "2026/2027".
// Restituisce null se il formato non è valido o gli anni non sono consecutivi.
function normalizzaAnno(testo) {
  const m = /^(\d{4})\s*[\/-]\s*(\d{4})$/.exec(String(testo).trim());
  return m && Number(m[2]) === Number(m[1]) + 1 ? `${m[1]}/${m[2]}` : null;
}

module.exports = { leggiImpostazioni, salvaImpostazione, normalizzaAnno };