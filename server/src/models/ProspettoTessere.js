const { Schema, model } = require('mongoose');

const conteggio = { type: Number, min: [0, 'I numeri non possono essere negativi'], default: 0,
  validate: { validator: Number.isInteger, message: 'Usa solo numeri interi' } };

// Una riga del prospetto raccolta tessere per ogni gruppo (come nel foglio Excel)
const prospettoSchema = new Schema(
  {
    gruppo: { type: Schema.Types.ObjectId, ref: 'Group', required: true, unique: true },
    quotaA: conteggio,       // tessere del primo prezzo (16 € di base)
    quotaB: conteggio,       // tessere del secondo prezzo (9,60 € di base)
    quotaC: conteggio,       // tessere del terzo prezzo (25,60 € di base): ognuna vale 2 tessere
    altriSettori: conteggio, // tessere ACR pagate ad altri settori
    altriSettoriNomi: { type: String, trim: true, default: '' },
    richieste: conteggio,    // tessere richieste dal gruppo
    mancanti: conteggio,     // nel gruppo e non pagate ai maggiori
    disdette: conteggio,
  },
  { timestamps: true }
);

module.exports = model('ProspettoTessere', prospettoSchema);
