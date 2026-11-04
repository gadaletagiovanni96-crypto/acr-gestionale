import { useEffect, useState } from 'react';
import { api, eta, labelGruppo } from '../api';

export default function Tesseramento() {
  const [gruppi, setGruppi] = useState([]);
  const [gruppo, setGruppo] = useState('');
  const [ragazzi, setRagazzi] = useState(null);
  const [occupati, setOccupati] = useState([]); // id con un salvataggio in corso
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => { api.get('/groups').then(setGruppi).catch((e) => setErr(e.message)); }, []);

  useEffect(() => {
    setRagazzi(null); setErr(''); setOk('');
    if (!gruppo) return;
    api.get(`/tesseramento?gruppo=${gruppo}`).then(setRagazzi).catch((e) => setErr(e.message));
  }, [gruppo]);

  const cambia = async (r) => {
    setErr(''); setOk('');
    const nuovo = !r.tesserato;
    let ancheFratelli = false;
    if (nuovo) {
      const daTesserare = r.fratelli.filter((f) => !f.tesserato);
      if (daTesserare.length) {
        const elenco = daTesserare.map((f) => `${f.nome} ${f.cognome} (${f.gruppo})`).join(', ');
        const domanda = daTesserare.length === 1
          ? `Attenzione: c'è un fratello collegato non ancora tesserato: ${elenco}.\n\nVuoi tesserare anche lui?`
          : `Attenzione: ci sono ${daTesserare.length} fratelli collegati non ancora tesserati: ${elenco}.\n\nVuoi tesserare anche loro?`;
        ancheFratelli = confirm(`${domanda}\n\nOK = tessera anche ${daTesserare.length === 1 ? 'lui' : 'loro'}.  Annulla = tessera solo ${r.nome}.`);
      }
    }
    setOccupati((o) => [...o, r._id]);
    try {
      const risposta = await api.post(`/tesseramento/${r._id}`, { tesserato: nuovo, ancheFratelli });
      const cambiati = new Set(risposta.aggiornati);
      // Aggiorna la lista: il ragazzo, gli eventuali fratelli e il loro stato dentro l'elenco dei fratelli degli altri
      setRagazzi((lista) => lista.map((x) => ({
        ...x,
        tesserato: cambiati.has(x._id) ? risposta.tesserato : x.tesserato,
        fratelli: x.fratelli.map((f) => (cambiati.has(f._id) ? { ...f, tesserato: risposta.tesserato } : f)),
      })));
      const altri = risposta.aggiornati.length - 1;
      setOk(`${r.cognome} ${r.nome}: ${nuovo ? 'tesserato' : 'tesseramento tolto'}${altri ? `. Tesserati anche ${altri} fratell${altri === 1 ? 'o' : 'i'}.` : '.'}`);
    } catch (x) { setErr(x.message); }
    setOccupati((o) => o.filter((id) => id !== r._id));
  };

  const tesserati = (ragazzi || []).filter((r) => r.tesserato).length;

  return (
    <>
      <div className="page-head">
        <div><h1>Tesseramento</h1><p className="muted">Scegli un gruppo e accendi l'interruttore accanto a chi è tesserato. Ogni modifica si salva subito.</p><p>Accendere l'interruttore solo se la quota viene effettivamente consegnata (se sono presenti fratelli flaggare direttamente al fratello più grande)</p></div>
      </div>

      <label className="tess-scelta">Gruppo
        <select value={gruppo} onChange={(e) => setGruppo(e.target.value)}>
          <option value="">Scegli un gruppo…</option>
          {gruppi.map((g) => <option key={g._id} value={g._id}>{labelGruppo(g)} ({g.numeroRagazzi})</option>)}
          <option value="nessuno">Senza gruppo</option>
        </select>
      </label>

      {err && <p className="error" role="alert">{err}</p>}
      {ok && <p className="success" role="status">{ok}</p>}
      {gruppo && !ragazzi && !err && <p className="muted">Caricamento…</p>}
      {ragazzi && !ragazzi.length && <p className="empty">Nessun ragazzo in questo gruppo.</p>}

      {ragazzi?.length > 0 && (
        <>
          <div className="tess-riepilogo">
            <span><strong>{tesserati}</strong> tesserati su {ragazzi.length}</span>
            <div className="bar"><i style={{ width: `${(tesserati / ragazzi.length) * 100}%` }} /></div>
          </div>
          <ul className="tess-lista">
            {ragazzi.map((r) => (
              <li key={r._id}>
                <div>
                  <div className="nome">{r.cognome} {r.nome} <span className="muted">· {eta(r.dataNascita)} anni</span></div>
                  {r.fratelli.length > 0 && (
                    <div className="fr">Fratelli: {r.fratelli.map((f) => `${f.nome} ${f.cognome} (${f.gruppo})${f.tesserato ? ' ✓' : ''}`).join(', ')}</div>
                  )}
                </div>
                <div className="switch-riga">
                  <button type="button" role="switch" aria-checked={r.tesserato} aria-label={`Tesserato: ${r.cognome} ${r.nome}`}
                    className={`switch${r.tesserato ? ' on' : ''}`} disabled={occupati.includes(r._id)} onClick={() => cambia(r)}><span /></button>
                  <span className="tess-stato">{r.tesserato ? 'Tesserato' : 'Non tesserato'}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}