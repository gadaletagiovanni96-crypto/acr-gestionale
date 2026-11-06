import { useEffect, useRef, useState } from 'react';
import { api, euro, scarica } from '../api';
import SottomenuTesseramento from '../components/SottomenuTesseramento.jsx';

const TIPI = ['quotaA', 'quotaB', 'quotaC'];
const tondo = (n) => Math.round(n * 100) / 100;

// Stesse formule del prospetto Excel
const totaleEuro = (r, prezzi) => tondo(TIPI.reduce((s, t) => s + r[t] * prezzi[t], 0));
const totaleEffettivo = (r, vale) => TIPI.reduce((s, t) => s + r[t] * vale[t], 0) + r.altriSettori;

// Numero con − e +; si può anche scrivere direttamente
function Contatore({ valore, onChange, etichetta }) {
  const imposta = (v) => onChange(Math.max(0, Math.min(9999, Math.floor(Number(v) || 0))));
  return (
    <div className="contatore">
      <button type="button" aria-label={`Togli uno: ${etichetta}`} onClick={() => imposta(valore - 1)} disabled={valore <= 0}>−</button>
      <input type="number" inputMode="numeric" min="0" value={valore} aria-label={etichetta}
        onFocus={(e) => e.target.select()} onChange={(e) => imposta(e.target.value)} />
      <button type="button" aria-label={`Aggiungi uno: ${etichetta}`} onClick={() => imposta(valore + 1)}>+</button>
    </div>
  );
}

// Prezzo della tessera: si clicca e si modifica
function Prezzo({ valore, vale, onSalva }) {
  const [testo, setTesto] = useState(null);
  const conferma = async () => {
    if (testo === null) return;
    const v = Number(testo.replace(',', '.'));
    setTesto(null);
    if (v !== valore) await onSalva(testo);
  };
  if (testo !== null)
    return (
      <span className="prezzo modifica">
        <input autoFocus inputMode="decimal" value={testo} aria-label="Nuovo prezzo della tessera" onChange={(e) => setTesto(e.target.value)}
          onBlur={conferma} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setTesto(null); }} />
        <span>€</span>
      </span>
    );
  return (
    <button type="button" className="prezzo" title="Clicca per cambiare il prezzo"
      onClick={() => setTesto(String(valore).replace('.', ','))}>
      {euro(valore)}{vale > 1 && <small>vale {vale}</small>}
    </button>
  );
}

export default function ContabilitaTessere() {
  const [dati, setDati] = useState(null); // { prezzi, vale, righe }
  const [stato, setStato] = useState({}); // gruppo -> 'salvo' | 'ok' | 'errore'
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const timer = useRef({});

  useEffect(() => { api.get('/tesseramento/prospetto').then(setDati).catch((e) => setErr(e.message)); }, []);
  useEffect(() => () => Object.values(timer.current).forEach(clearTimeout), []);

  // Aggiorna subito la scheda e salva dopo una breve pausa
  const cambia = (gruppo, campo, valore) => {
    let riga;
    setDati((d) => ({ ...d, righe: d.righe.map((r) => (r.gruppo === gruppo ? (riga = { ...r, [campo]: valore }) : r)) }));
    setStato((s) => ({ ...s, [gruppo]: 'salvo' }));
    clearTimeout(timer.current[gruppo]);
    timer.current[gruppo] = setTimeout(async () => {
      try {
        await api.put(`/tesseramento/prospetto/${gruppo}`, riga);
        setStato((s) => ({ ...s, [gruppo]: 'ok' }));
      } catch (x) { setErr(x.message); setStato((s) => ({ ...s, [gruppo]: 'errore' })); }
    }, 600);
  };

  const salvaPrezzo = async (tipo, testo) => {
    setErr('');
    try {
      const nuovi = await api.put('/tesseramento/prospetto/prezzi', { [tipo]: testo });
      setDati((d) => ({ ...d, prezzi: nuovi.prezzi }));
    } catch (x) { setErr(x.message); }
  };

  const azzera = async () => {
    if (!confirm('Vuoi azzerare tutti i numeri della contabilità tessere?\n\nI prezzi restano. L\'operazione non è annullabile.')) return;
    setErr('');
    try { setDati(await api.del('/tesseramento/prospetto')); setStato({}); } catch (x) { setErr(x.message); }
  };

  const esporta = async () => {
    setErr(''); setBusy('xlsx');
    try { await scarica('/tesseramento/prospetto/xlsx', 'contabilita-tessere-acr.xlsx'); } catch (x) { setErr(x.message); }
    setBusy('');
  };

  if (!dati) return (
    <>
      <div className="page-head"><div><h1>Contabilità tessere</h1></div></div>
      <SottomenuTesseramento />
      {err ? <p className="error" role="alert">{err}</p> : <p className="muted">Caricamento…</p>}
    </>
  );

  const { prezzi, vale } = dati;
  const righe = dati.righe.map((r) => ({ ...r, totaleEuro: totaleEuro(r, prezzi), totaleEffettivo: totaleEffettivo(r, vale) }));
  const somma = (f) => righe.reduce((s, r) => s + f(r), 0);
  const tot = {
    euro: tondo(somma((r) => r.totaleEuro)),
    pagate: somma((r) => r.totaleEffettivo),
    richieste: somma((r) => r.richieste),
    mancanti: somma((r) => r.mancanti),
    disdette: somma((r) => r.disdette),
  };
  tot.daChiedere = tot.pagate + tot.mancanti;
  const quota = (a, b) => (b ? `${Math.min(100, (a / b) * 100)}%` : 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contabilità tessere</h1>
          <p className="muted">Per ogni gruppo segna quante tessere sono state pagate. Totali e conteggi si aggiornano da soli e ogni modifica si salva subito.</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="ghost" onClick={esporta} disabled={!!busy || !righe.length}>{busy ? 'Creo il foglio…' : 'Scarica Excel'}</button>
          <button className="danger" onClick={azzera} disabled={!righe.length}>Azzera</button>
        </div>
      </div>
      <SottomenuTesseramento />

      {err && <p className="error" role="alert">{err}</p>}

      <section className="card prezzi-tessere">
        <div>
          <h2>Prezzi delle tessere</h2>
          <p className="muted">Clicca su un prezzo per cambiarlo. Il terzo tipo conta come 2 tessere.</p>
        </div>
        <div className="prezzi-lista">
          {TIPI.map((t) => <Prezzo key={t} valore={prezzi[t]} vale={vale[t]} onSalva={(v) => salvaPrezzo(t, v)} />)}
        </div>
      </section>

      <div className="totals tess-totali">
        <div className="tile in"><span>Totale raccolto</span><strong>{euro(tot.euro)}</strong></div>
        <div className="tile"><span>Tessere pagate</span><strong>{tot.pagate}</strong></div>
        <div className="tile da-chiedere"><span>Tessere da chiedere</span><strong>{tot.daChiedere}</strong><small>pagate + mancanti</small></div>
        <div className="tile neutro"><span>Richieste dai gruppi</span><strong>{tot.richieste}</strong></div>
        <div className="tile out"><span>Mancanti</span><strong>{tot.mancanti}</strong></div>
        <div className="tile neutro"><span>Disdette</span><strong>{tot.disdette}</strong></div>
      </div>

      {!righe.length && <p className="empty">Non ci sono ancora gruppi. Creali dalla pagina Gruppi.</p>}

      <div className="tess-gruppi">
        {righe.map((r) => (
          <article className="card tess-gruppo" key={r.gruppo}>
            <header>
              <div>
                <h2>{r.nome}</h2>
                <p className="muted">{r.educatori || 'Nessun educatore'}</p>
              </div>
              <div className="tess-euro">
                <strong>{euro(r.totaleEuro)}</strong>
                <small className={`salvataggio ${stato[r.gruppo] || ''}`}>
                  {stato[r.gruppo] === 'salvo' ? 'Salvataggio…' : stato[r.gruppo] === 'ok' ? 'Salvato ✓' : stato[r.gruppo] === 'errore' ? 'Non salvato' : ''}
                </small>
              </div>
            </header>

            <h3>Pagate ai maggiori</h3>
            {TIPI.map((t) => (
              <div className="tess-voce" key={t}>
                <span className="chip sib">{euro(prezzi[t])}{vale[t] > 1 ? ` · vale ${vale[t]}` : ''}</span>
                <Contatore valore={r[t]} etichetta={`Tessere da ${euro(prezzi[t])}, ${r.nome}`} onChange={(v) => cambia(r.gruppo, t, v)} />
                <span className="num">{euro(r[t] * prezzi[t])}</span>
              </div>
            ))}

            <h3>Pagate ad altri settori</h3>
            <div className="tess-voce">
              <span className="chip no">Altri settori</span>
              <Contatore valore={r.altriSettori} etichetta={`Tessere pagate ad altri settori, ${r.nome}`} onChange={(v) => cambia(r.gruppo, 'altriSettori', v)} />
              <span />
            </div>
            <input type="text" className="tess-nomi" placeholder="Cognomi (es. Rossi, Bianchi)" value={r.altriSettoriNomi}
              aria-label={`Cognomi delle tessere pagate ad altri settori, ${r.nome}`} onChange={(e) => cambia(r.gruppo, 'altriSettoriNomi', e.target.value)} />

            <div className="tess-effettivo">
              <span>Tessere effettive</span>
              <strong>{r.totaleEffettivo}{r.richieste ? ` / ${r.richieste}` : ''}</strong>
            </div>
            <div className="bar"><i style={{ width: quota(r.totaleEffettivo, r.richieste) }} /></div>

            <div className="tess-conteggi">
              <label>Richieste<Contatore valore={r.richieste} etichetta={`Tessere richieste, ${r.nome}`} onChange={(v) => cambia(r.gruppo, 'richieste', v)} /></label>
              <label>Mancanti<Contatore valore={r.mancanti} etichetta={`Tessere mancanti, ${r.nome}`} onChange={(v) => cambia(r.gruppo, 'mancanti', v)} /></label>
              <label>Disdette<Contatore valore={r.disdette} etichetta={`Disdette, ${r.nome}`} onChange={(v) => cambia(r.gruppo, 'disdette', v)} /></label>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
