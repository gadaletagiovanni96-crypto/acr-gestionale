import { useEffect, useState } from 'react';
import { api, euro, dataIt, labelGruppo } from '../api';

function Passaggio() {
  const [groups, setGroups] = useState([]);
  const [map, setMap] = useState({});
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const carica = () => api.get('/groups').then(setGroups).catch((e) => setErr(e.message));
  useEffect(() => { carica(); }, []);

  const spostamenti = Object.entries(map).filter(([, a]) => a).map(([da, a]) => ({ da, a }));
  const nome = (id) => (id === 'nessuno' ? 'Nessun gruppo' : groups.find((g) => g._id === id)?.nome);

  const applica = async () => {
    setErr(''); setOk('');
    const riepilogo = spostamenti.map((s) => `• ${nome(s.da)} → ${nome(s.a)}`).join('\n');
    if (!confirm(`Spostare tutti i ragazzi dei gruppi indicati?\n\n${riepilogo}`)) return;
    try {
      const r = await api.post('/groups/sposta', { spostamenti });
      setOk(`Fatto: ${r.spostati} ragazzi spostati.`);
      setMap({}); carica();
    } catch (x) { setErr(x.message); }
  };

  return (
    <section className="card stack" style={{ marginTop: '2rem' }}>
      <h2>Passaggio di gruppo</h2>
      <p>Per ogni gruppo scegli dove vanno tutti i suoi ragazzi. Puoi impostare più passaggi insieme (per esempio II → III e III → IV): vengono calcolati sulla situazione attuale, quindi non si sovrappongono. I ragazzi trasferiti in altre parrocchie non vengono toccati.</p>
      <p>Se trovi difficile fare il passaggio tra i gruppi perchè temi di perdere dati, segui questi passaggi in sequenza:</p>
      <ol>
        <li>Scarica l'excel e il pdf di tutti gli elenchi e tienili in un posto sicuro</li>
        <li>Sposta solo i gruppi di III media nel gruppo "Passaggio giovanissimi"</li>
        <li>Clicca su "Applica passaggi"</li>
        <li>A questo punto vai nella sezione gruppi ed elimina i gruppi di terza media</li>
        <li>Cambia il nome degli altri gruppi, cliccando sul pulsante modifica, all'anno corrente a partire dalla seconda media (es.: II media 1 → III media 1, I media 1 → II media 1, etc...)</li>
        <li>Solo al termine abbina gli educatori ai gruppi</li>
      </ol>
      {!groups.length && <p className="muted">Non ci sono ancora gruppi.</p>}
      <div>
        {groups.map((g) => (
          <div className="shift-row" key={g._id}>
            <span>{labelGruppo(g)} <small className="muted">· {g.numeroRagazzi} ragazzi</small></span>
            <select value={map[g._id] || ''} onChange={(e) => setMap({ ...map, [g._id]: e.target.value })} aria-label={`Destinazione dei ragazzi di ${g.nome}`}>
              <option value="">Non spostare</option>
              {groups.filter((x) => x._id !== g._id).map((x) => <option key={x._id} value={x._id}>Sposta in: {labelGruppo(x)}</option>)}
              <option value="nessuno">Sposta in: nessun gruppo</option>
            </select>
          </div>
        ))}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {ok && <p className="success" role="status">{ok}</p>}
      <div className="actions"><button className="primary" disabled={!spostamenti.length} onClick={applica}>Applica passaggi{spostamenti.length ? ` (${spostamenti.length})` : ''}</button></div>
    </section>
  );
}

function Impostazioni() {
  const [imp, setImp] = useState(null);
  const [anno, setAnno] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    api.get('/settings').then((r) => { setImp(r); setAnno(r.annoAssociativo); }).catch((e) => setErr(e.message));
  }, []);

  const cambiaIscrizioni = async () => {
    setErr(''); setOk('');
    try { setImp(await api.put('/settings', { iscrizioniAperte: !imp.iscrizioniAperte })); } catch (x) { setErr(x.message); }
  };
  const salvaAnno = async (e) => {
    e.preventDefault(); setErr(''); setOk('');
    try {
      const r = await api.put('/settings', { annoAssociativo: anno });
      setImp(r); setAnno(r.annoAssociativo);
      setOk(r.annoAssociativo ? `Anno associativo impostato: ${r.annoAssociativo}.` : "Anno associativo tolto dall'intestazione dei PDF.");
    } catch (x) { setErr(x.message); }
  };

  if (!imp) return err ? <p className="error">{err}</p> : null;
  
  return (
    <>
      <section className="card stack" style={{ marginBottom: '1.25rem' }}>
        <h2>Pagina di iscrizione per gli educatori</h2>
        <p>Stato attuale: <span className={`chip ${imp.iscrizioniAperte ? 'ok' : 'warn'}`}>{imp.iscrizioniAperte ? 'Visibile agli educatori' : 'Nascosta agli educatori'}</span></p>
        <p className="muted">
          {imp.iscrizioniAperte
            ? 'Gli educatori possono registrare nuovi ragazzi. Nascondi la pagina quando le iscrizioni sono chiuse.'
            : 'Gli educatori non vedono più «Nuova iscrizione» e non possono registrare ragazzi. Tu e il parroco potete sempre farlo. Mostrala di nuovo quando riaprono le iscrizioni.'}
        </p>
        <div className="actions">
          <button className={imp.iscrizioniAperte ? 'danger' : 'primary'} onClick={cambiaIscrizioni}>
            {imp.iscrizioniAperte ? 'Nascondi la pagina di iscrizione' : 'Mostra la pagina di iscrizione'}
          </button>
        </div>
      </section>

      <form className="card stack" onSubmit={salvaAnno} style={{ marginBottom: '1.25rem' }}>
        <h2>Anno associativo</h2>
        <p className="muted">Compare nell'intestazione di tutti i PDF come «Anno associativo 2026/2027». Lascia vuoto per non mostrarlo.</p>
        <label>Anno associativo
          <input value={anno} onChange={(e) => setAnno(e.target.value)} placeholder="es. 2026/2027" inputMode="numeric" maxLength={9} />
        </label>
        <div className="actions"><button className="primary">Salva anno associativo</button></div>
      </form>

      {err && <p className="error" role="alert">{err}</p>}
      {ok && <p className="success" role="status">{ok}</p>}
    </>
  );
}

function AzzeraTesseramenti({ tesserati, onFatto }) {
  const [conferma, setConferma] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const azzera = async (e) => {
    e.preventDefault(); setErr(''); setOk('');
    if (!confirm(`ATTENZIONE: stai per togliere il tesseramento a ${tesserati} ragazzi di tutti i gruppi.\n\nL'operazione NON si può annullare.\n\nVuoi davvero continuare?`)) return;
    try {
      const r = await api.post('/seasons/azzera-tesseramenti');
      setOk(`Fatto: il tesseramento è stato tolto a ${r.azzerati} ragazzi.`);
      setConferma('');
      onFatto();
    } catch (x) { setErr(x.message); }
  };

  const pronto = conferma.trim().toUpperCase() === 'AZZERA' && tesserati > 0;

  return (
    <form className="card stack pericolo" onSubmit={azzera} style={{ marginTop: '2rem', marginBottom: '1.25rem' }}>
      <h2>Azzera tutti i tesseramenti</h2>
      <p className="avviso-pericolo">
        <strong>Attenzione, operazione pericolosa.</strong> Il tesseramento viene tolto a <strong>tutti</strong> i ragazzi, in tutti i gruppi
        (anche ai trasferiti). Non si può annullare e non ne resta uno storico. Le iscrizioni e le quote non vengono toccate.
      </p>
      <p>{tesserati > 0 ? <>Al momento i ragazzi tesserati sono <strong>{tesserati}</strong>.</> : 'Al momento nessun ragazzo è tesserato.'}</p>
      <label>Per confermare scrivi AZZERA
        <input value={conferma} onChange={(e) => setConferma(e.target.value)} placeholder="AZZERA" autoComplete="off" disabled={!tesserati} />
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      {ok && <p className="success" role="status">{ok}</p>}
      <div className="actions"><button type="submit" className="danger" disabled={!pronto}>Togli il tesseramento a tutti</button></div>
    </form>
  );
}

export default function Anno() {
  const [dati, setDati] = useState(null);
  const [nome, setNome] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const carica = () => api.get('/seasons').then(setDati).catch((e) => setErr(e.message));
  useEffect(() => { carica(); }, []);

  const chiudi = async (e) => {
    e.preventDefault(); setErr(''); setOk('');
    const { iscritti, totale } = dati.corrente;
    if (!confirm(`Archiviare l'anno ${nome} e azzerare ${iscritti} iscrizioni (${euro(totale)} incassati)?\n\nL'operazione non si può annullare.`)) return;
    try {
      await api.post('/seasons/chiudi', { nome });
      setOk(`Anno ${nome} archiviato. Le iscrizioni sono state azzerate.`);
      setNome(''); carica();
    } catch (x) { setErr(x.message); }
  };

  if (!dati) return <p className="muted">{err || 'Caricamento…'}</p>;
  return (
    <>
      <div className="page-head">
        <div><h1>Gestione Anno</h1><p className="muted">Archivia le quote dell'anno concluso, fai passare i ragazzi al gruppo successivo e gestisci le impostazioni generali.</p></div>
      </div>
      
      <form className="card stack" onSubmit={chiudi} style={{ marginBottom: '1.25rem' }}>
        <h2>Archivia l'anno e azzera le iscrizioni</h2>
        <div className="stats">
          <div><strong>{dati.corrente.iscritti}</strong> iscrizioni completate</div>
          <div><strong>{euro(dati.corrente.totale)}</strong> quote incassate</div>
        </div>
        <p>Per ogni ragazzo con la quota versata, quota e data del versamento vengono conservate nella sua scheda (sezione «Anni precedenti»). Poi la quota torna a zero e tutti risultano «Da completare». Anagrafica, gruppi e fratelli restano invariati.</p>
        <label>Anno da archiviare
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. 2025/2026" required />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        {ok && <p className="success" role="status">{ok}</p>}
        <div className="actions"><button className="danger" disabled={!dati.corrente.iscritti}>Archivia l'anno e azzera le iscrizioni</button></div>
      </form>

      <AzzeraTesseramenti tesserati={dati.corrente.tesserati || 0} onFatto={carica} />
      
      <Impostazioni />

      <Passaggio />

      <h2 style={{ marginTop: '2rem' }}>Anni archiviati</h2>
      {!dati.stagioni.length ? <p className="empty">Nessun anno archiviato finora.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Anno</th><th>Archiviato il</th><th>Iscritti</th><th>Incassato</th><th>Da</th></tr></thead>
            <tbody>
              {dati.stagioni.map((s) => (
                <tr key={s._id}>
                  <td>{s.nome}</td><td>{dataIt(s.chiusaIl)}</td><td>{s.iscrittiArchiviati}</td><td>{euro(s.totaleIncassato)}</td>
                  <td>{s.chiusaDa ? `${s.chiusaDa.nome} ${s.chiusaDa.cognome}`.trim() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}