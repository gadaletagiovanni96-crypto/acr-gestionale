const { Schema, model } = require('mongoose');

const groupSchema = new Schema(
  {
    nome: { type: String, required: [true, 'Il nome del gruppo è obbligatorio'], unique: true, trim: true },
    descrizione: { type: String, trim: true, default: '' },
    educatori: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Se false, i ragazzi del gruppo non entrano nei totali della pagina Ragazzi
    contaNelTotale: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = model('Group', groupSchema);
