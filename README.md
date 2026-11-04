# Gestionale ACR · Parrocchia Sant'Achille, Molfetta

Web app per la gestione degli iscritti. Stack: **Express + MongoDB (Mongoose)** per il server, **React (Vite)** per il client.

## Requisiti
- Node.js 18 o superiore
- MongoDB in esecuzione (locale oppure Atlas)

## Avvio in sviluppo
```bash
# 1. server
cd server
cp .env.example .env      # modifica JWT_SECRET, MONGODB_URI e le credenziali admin
npm install
npm run dev               # http://localhost:4000

# 2. client (altro terminale)
cd client
npm install
npm run dev               # http://localhost:5173
```
Al primo avvio il server crea l'account **admin** con le credenziali presenti in `.env`
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Accedi come Admin, crea gli educatori dalla pagina *Account*
e i gruppi dalla pagina *Gruppi*.

## Produzione (un solo servizio)
```bash
cd client && npm install && npm run build
cd ../server && npm install && npm start   # serve API e frontend dalla porta 4000
```

## Come funziona
- **Login**: scelta del tipo di account (Educatore / Admin); il server verifica che coincida con quello dell'utente.
- **Educatori**: registrano nuove iscrizioni, consultano l'elenco, collegano i fratelli e possono modificare tutti i dati e le iscrizioni di qualsiasi ragazzo.
- **Admin**: può eliminare iscrizioni, creare gruppi (nome + educatori) e gestire gli account.
- **Nuovo anno** (solo admin): archivia quota e data di versamento nello storico di ogni ragazzo («Anni precedenti»), registra la chiusura (anno, iscritti, totale incassato) e azzera le iscrizioni. Anagrafica, gruppi e fratelli non cambiano. L'operazione non è annullabile.
- **Passaggio di gruppo** (solo admin, pagina *Nuovo anno*): per ogni gruppo scegli il gruppo di destinazione di tutti i suoi ragazzi. Più passaggi insieme (II → III, III → IV) non si sovrappongono.
- **Trasferimenti**: dalla scheda, un educatore o l'admin scrive il nome della parrocchia e preme *Trasferisci*. Il ragazzo esce dagli elenchi e compare solo agli admin nella sezione *Trasferiti in altre parrocchie*, dove l'admin può anche riportarlo in parrocchia.
- **PDF**: il pulsante *Scarica PDF* nella pagina Ragazzi crea l'elenco, A4 orizzontale, un gruppo per pagina con nome del gruppo ed educatori, cognome, nome, data e luogo di nascita, via e telefono del genitore, rispettando i filtri attivi.
- Nei menu dei gruppi compaiono i nomi degli educatori, ad es. «III elementare - Giovanni e Giorgia».
- **Stato dell'iscrizione** (tre valori, anche nell'Excel):
  - *Iscritto*: quota versata maggiore di zero (con data del versamento).
  - *Da completare*: non ha ancora versato la quota, ma la verserà.
  - *Non iscritto*: non vuole iscriversi (pulsante *Non si iscrive* nella scheda, annullabile). Alla chiusura dell'anno resta *Non iscritto*; se versa la quota torna *Iscritto*.
- **Filtri** della pagina Ragazzi: Tutti / Iscritti / Da completare / Non iscritti · Tutti / Tesserati / Non tesserati (solo admin) · Tutti / Con fratelli / Senza fratelli · gruppi. In ogni riga si possono accendere più scelte insieme (es. *Da completare* + *Non iscritti*, oppure due gruppi). PDF ed Excel rispettano i filtri.
- **Gruppi fuori dal totale**: nella modifica del gruppo, la casella *Conta i ragazzi di questo gruppo nel totale* (attiva di base). Se è spenta, i suoi ragazzi non entrano nei totali in cima alla pagina Ragazzi né nella riga *Totale* del riepilogo Excel.
- **Trasferimento o «Non si iscrive» con fratelli**: se il ragazzo ha fratelli collegati, dopo la conferma viene chiesto se scollegarlo dalla famiglia.
- **Fratelli**: i ragazzi collegati condividono un `familyId`; collegare due famiglie diverse le unisce.
