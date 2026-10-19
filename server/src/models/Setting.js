const { Schema, model } = require('mongoose');

// Impostazioni dell'app scelte dall'admin (una riga per ogni impostazione)
const settingSchema = new Schema(
  { chiave: { type: String, required: true, unique: true }, valore: Schema.Types.Mixed },
  { timestamps: true }
);

module.exports = model('Setting', settingSchema);