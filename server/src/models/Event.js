const { Schema, model } = require('mongoose');

// Ogni movimento (entrata o uscita) vive dentro l'evento a cui appartiene
const voceSchema = new Schema(
  {
    tipo: { type: String, enum: { values: ['entrata', 'uscita'], message: 'Il tipo deve essere entrata o uscita' }, required: [true, "Indica se è un'entrata o un'uscita"] },
    importo: { type: Number, required: [true, "L'importo è obbligatorio"], min: [0.01, "L'importo deve essere maggiore di zero"] },
    // Obbligatoria solo per le uscite
    descrizione: { type: String, trim: true, default: '', required: [function () { return this.tipo === 'uscita'; }, "Per un'uscita la descrizione è obbligatoria"] },
    data: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const eventSchema = new Schema(
  {
    nome: { type: String, required: [true, "Il nome dell'evento è obbligatorio"], trim: true },
    data: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: '' },
    voci: [voceSchema],
    creatoDa: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, id: false }
);

const somma = (voci, tipo) => Math.round(voci.filter((v) => v.tipo === tipo).reduce((a, v) => a + v.importo, 0) * 100) / 100;
eventSchema.virtual('totaleEntrate').get(function () { return somma(this.voci, 'entrata'); });
eventSchema.virtual('totaleUscite').get(function () { return somma(this.voci, 'uscita'); });
eventSchema.virtual('saldo').get(function () { return Math.round((this.totaleEntrate - this.totaleUscite) * 100) / 100; });

module.exports = model('Event', eventSchema);