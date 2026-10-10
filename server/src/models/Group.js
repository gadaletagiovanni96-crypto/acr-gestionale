const { Schema, model } = require('mongoose');

const groupSchema = new Schema(
  {
    nome: { type: String, required: [true, 'Il nome del gruppo è obbligatorio'], unique: true, trim: true },
    descrizione: { type: String, trim: true, default: '' },
    educatori: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = model('Group', groupSchema);
