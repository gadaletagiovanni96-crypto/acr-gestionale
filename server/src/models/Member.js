const { Schema, model } = require('mongoose');

const memberSchema = new Schema(
  {
    // Anagrafica
    nome: { type: String, required: [true, 'Il nome è obbligatorio'], trim: true },
    cognome: { type: String, required: [true, 'Il cognome è obbligatorio'], trim: true },
    sesso: { type: String, enum: ['M', 'F', ''], default: '' },
    dataNascita: { type: Date, required: [true, 'La data di nascita è obbligatoria'] },
    luogoNascita: { type: String, trim: true, default: '' },
    codiceFiscale: { type: String, trim: true, uppercase: true, default: '' },
    indirizzo: { type: String, trim: true, default: '' },
    citta: { type: String, trim: true, default: '' },
    cap: { type: String, trim: true, default: '' },
    telefono: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    // Genitore / tutore
    nomeGenitore: { type: String, trim: true, default: '' },
    telefonoGenitore: { type: String, trim: true, default: '' },
    emailGenitore: { type: String, trim: true, lowercase: true, default: '' },
    // Salute e privacy
    allergie: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    consensoPrivacy: { type: Boolean, default: false },
    // Gruppo e quota
    gruppo: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    quotaVersata: { type: Number, min: [0, 'La quota non può essere negativa'], default: 0 },
    dataVersamento: {
      type: Date,
      default: null,
      required: [function () { return this.quotaVersata > 0; }, 'Indica la data del versamento della quota'],
    },
    // Quote degli anni precedenti, riempito dalla chiusura annuale
    storico: {
      type: [{ _id: false, stagione: String, quotaVersata: Number, dataVersamento: Date, gruppo: { type: Schema.Types.ObjectId, ref: 'Group' } }],
      default: [],
    },
    // Trasferimento ad altra parrocchia: la scheda resta visibile solo agli admin
    trasferito: { type: Boolean, default: false, index: true },
    parrocchiaTrasferimento: { type: String, trim: true, default: '' },
    dataTrasferimento: { type: Date, default: null },
    gruppoPrecedente: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    // Tutti i fratelli condividono lo stesso familyId
    familyId: { type: Schema.Types.ObjectId, default: null, index: true },
    creatoDa: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, id: false }
);

// Un ragazzo risulta iscritto quando ha versato la quota
memberSchema.virtual('iscritto').get(function () { return this.quotaVersata > 0; });

module.exports = model('Member', memberSchema);
