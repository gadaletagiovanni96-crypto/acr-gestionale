const fs = require('fs');
const path = require('path');

// Il logo si cerca nella cartella "public" del client: qualsiasi file PNG o JPG il cui nome
// inizia per "logo" (logo.png, logo-acr.jpg...). Se è un altro nome, cambia l'espressione NOME.
// pdfkit non legge SVG né WebP: in quel caso (o se il logo manca) nei PDF resta il pallino giallo.
const CARTELLE = [path.join(__dirname, '../../client/public'), path.join(__dirname, '../../client/dist')];
const NOME = /^logo.*\.(png|jpe?g)$/i;

function trovaLogo() {
  for (const cartella of CARTELLE) {
    try {
      const file = fs.readdirSync(cartella).find((n) => NOME.test(n));
      if (file) return path.join(cartella, file);
    } catch { /* cartella non presente */ }
  }
  return null;
}

// Disegna il logo nell'intestazione del PDF (su un riquadro bianco, così si vede su qualsiasi colore)
// oppure il pallino giallo. Restituisce la posizione x da cui far partire il titolo.
function disegnaMarchio(doc, x) {
  const file = trovaLogo();
  if (file) {
    try {
      const img = doc.openImage(file);
      const scala = Math.min(150 / img.width, 42 / img.height); // al massimo 150 x 42 punti
      const iw = img.width * scala, ih = img.height * scala;
      const alto = ih + 8, y = (58 - alto) / 2;
      doc.roundedRect(x, y, iw + 8, alto, 5).fill('#ffffff');
      doc.image(img, x + 4, y + 4, { width: iw, height: ih });
      return x + iw + 8 + 12;
    } catch (e) {
      console.warn('Logo non utilizzabile nel PDF, uso il pallino:', e.message);
    }
  }
  doc.circle(x + 6, 29, 6).fill('#f2b705');
  return x + 20;
}

module.exports = { disegnaMarchio };