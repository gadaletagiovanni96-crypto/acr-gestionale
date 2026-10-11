require('dotenv').config();
require('express-async-errors');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/members', require('./routes/members'));
app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/events', require('./routes/events'));
app.use('/api/miei-gruppi', require('./routes/mieiGruppi'));

app.get('/api/ping', async (req, res) => {
  try {
    // Esegue una lettura leggerissima per mantenere sveglio MongoDB
    await User.findOne().select('_id'); 
    res.status(200).send('Pong - Database attivo');
  } catch (error) {
    res.status(500).send('Errore di connessione al DB');
  }
});

app.use('/api', (req, res) => res.status(404).json({ message: 'Risorsa non trovata' }));

// In produzione Express serve anche il frontend compilato (client/dist)
const dist = path.join(__dirname, '../../client/dist');
app.use(express.static(dist));
app.get('*', (req, res, next) => res.sendFile(path.join(dist, 'index.html'), (err) => err && next()));

app.use((err, req, res, next) => {
  if (err.name === 'ValidationError')
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(' ') });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Identificativo non valido' });
  if (err.code === 11000)
    return res.status(409).json({ message: 'Esiste già un elemento con questo valore (email o nome già in uso)' });
  console.error(err);
  res.status(500).json({ message: 'Errore interno del server' });
});

async function creaAdminIniziale() {
  if (await User.exists({ ruolo: 'admin' })) return;
  const { ADMIN_NOME, ADMIN_COGNOME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return console.warn('Nessun admin presente e ADMIN_EMAIL/ADMIN_PASSWORD non impostati.');
  await User.create({ nome: ADMIN_NOME || 'Admin', cognome: ADMIN_COGNOME || '', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, ruolo: 'admin' });
  console.log(`Account admin creato: ${ADMIN_EMAIL}`);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(creaAdminIniziale)
  .then(() => app.listen(process.env.PORT || 4000, () => console.log('Server avviato sulla porta', process.env.PORT || 4000)))
  .catch((e) => { console.error('Avvio fallito:', e.message); process.exit(1); });
