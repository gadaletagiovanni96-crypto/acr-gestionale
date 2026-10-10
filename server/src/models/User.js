const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new Schema(
  {
    nome: { type: String, required: [true, 'Il nome è obbligatorio'], trim: true },
    cognome: { type: String, trim: true, default: '' },
    email: { type: String, required: [true, "L'email è obbligatoria"], unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false, minlength: [8, 'La password deve avere almeno 8 caratteri'] },
    ruolo: { type: String, enum: ['admin', 'educatore'], default: 'educatore' },
    attivo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
  next();
});
userSchema.methods.verificaPassword = function (pw) { return bcrypt.compare(pw, this.password); };
userSchema.set('toJSON', { transform: (_d, r) => { delete r.password; delete r.__v; return r; } });

module.exports = model('User', userSchema);
