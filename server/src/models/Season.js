const { Schema, model } = require('mongoose');

// Registro delle chiusure annuali: ogni volta che l'admin "azzera" le iscrizioni ne resta traccia qui
const seasonSchema = new Schema({
  nome: { type: String, required: [true, "Il nome dell'anno è obbligatorio"], unique: true, trim: true },
  chiusaIl: { type: Date, default: Date.now },
  chiusaDa: { type: Schema.Types.ObjectId, ref: 'User' },
  iscrittiArchiviati: { type: Number, default: 0 },
  totaleIncassato: { type: Number, default: 0 },
});

module.exports = model('Season', seasonSchema);
