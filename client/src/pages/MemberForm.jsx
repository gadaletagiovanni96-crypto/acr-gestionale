import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, eta, dataIt, euro, labelGruppo } from '../api';
import { useAuth } from '../auth.jsx';

const VUOTO = {
  nome: '', cognome: '', sesso: '', dataNascita: '', luogoNascita: '', codiceFiscale: '', indirizzo: '', citta: '', cap: '',
  telefono: '', email: '', nomeGenitore: '', telefonoGenitore: '', emailGenitore: '', allergie: '', note: '',
  consensoPrivacy: false, gruppo: '', quotaVersata: '', dataVersamento: '',
};
const giorno = (d) => (d ? String(d).slice(0, 10) : '');

function Campo({ label, children, wide }) {
  return <label className={wide ? 'wide' : ''}>{label}{children}</label>;
}

function Fratelli({ id, fratelli, onChange }) {
  const [tutti, setTutti] = useState([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => { api.get('/members').then(setTutti).catch(() => {}); }, [fratelli.length]);

  const esclusi = new Set([id, ...fratelli.map((f) => f._id)]);
  const candidati = tutti
    .filter((m) => !esclusi.has(m._id) && `${m.nome} ${m.cognome}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);

  const collega = async () => {
    setErr('');
    try { await api.post(`/members/${id}/fratelli`, { ids: sel }); setSel([]); setQ(''); onChange(); } catch (e) { setErr(e.message); }
  };
  const scollega = async () => {
    if (!confirm('Scollegare questo ragazzo dai fratelli?')) return;
    try { await api.del(`/members/${id}/fratelli`); onChange(); } catch (e) { setErr(e.message); }
  };

  return (
    <section className="card">
      <h2>Fratelli</h2>
      {fratelli.length ? (
        <ul className="plain">
          {fratelli.map((f) => (
            <li key={f._id}><Link to={`/iscritti/${f._id}`}>{f.cognome} {f.nome}</Link> <span className="muted">{eta(f.dataNascita)} anni</span></li>
          ))}
        </ul>
      ) : <p className="muted">Nessun fratello collegato.</p>}
      {fratelli.length > 0 && <button className="ghost" onClick={scollega}>Scollega da questa famiglia</button>}

      <div className="siblings-add">
          <h3>Collega altri fratelli</h3>
          <input type="search" placeholder="Cerca un ragazzo già iscritto" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="plain pick">
            {candidati.map((m) => (
              <li key={m._id}>
                <label className="check">
                  <input type="checkbox" checked={sel.includes(m._id)} onChange={() => setSel((s) => (s.includes(m._id) ? s.filter((x) => x !== m._id) : [...s, m._id]))} />
                  {m.cognome} {m.nome} <span className="muted">{eta(m.dataNascita)} anni{m.gruppo ? ` · ${m.gruppo.nome}` : ''}</span>
                </label>
              </li>
            ))}
            {!candidati.length && <li className="muted">Nessun risultato.</li>}
          </ul>
          {err && <p className="error">{err}</p>}
          <button className="primary" disabled={!sel.length} onClick={collega}>Collega {sel.length > 1 ? `${sel.length} ragazzi` : 'selezionato'}</button>
      </div>
    </section>
  );
}

export default function MemberForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state } = useLocation();
  const { user } = useAuth();
  const [f, setF] = useState(VUOTO);
  const [groups, setGroups] = useState([]);
  const [fratelli, setFratelli] = useState([]);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(state?.ok || '');
  const [busy, setBusy] = useState(false);
  const [trasf, setTrasf] = useState('');

  const carica = () =>
    api.get(`/members/${id}`).then((m) => {
      setF({ ...VUOTO, ...m, dataNascita: giorno(m.dataNascita), dataVersamento: giorno(m.dataVersamento), gruppo: m.gruppo || '', quotaVersata: m.quotaVersata || '' });
      setFratelli(m.fratelli);
    }).catch((e) => setErr(e.message));

  useEffect(() => { api.get('/groups').then(setGroups).catch(() => {}); }, []);
  useEffect(() => { setOk(state?.ok || ''); if (id) carica(); else { setF(VUOTO); setFratelli([]); } }, [id]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const salva = async (e) => {
    e.preventDefault();
    setErr(''); setOk(''); setBusy(true);
    const payload = { ...f, quotaVersata: f.quotaVersata === '' ? 0 : Number(f.quotaVersata) };
    try {
      if (id) { await api.put(`/members/${id}`, payload); setOk('Modifiche salvate.'); await carica(); }
      else { const m = await api.post('/members', payload); nav(`/iscritti/${m._id}`, { state: { ok: 'Iscrizione registrata. Se ha dei fratelli puoi collegarli qui sotto.' } }); }
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  const trasferisci = async () => {
    if (!confirm(`Trasferire ${f.nome} ${f.cognome} alla parrocchia "${trasf.trim()}"?\n\nUscirà dagli elenchi e la sua scheda resterà visibile solo agli amministratori.`)) return;
    try { await api.post(`/members/${id}/trasferisci`, { parrocchia: trasf }); nav('/'); } catch (x) { setErr(x.message); }
  };
  const rientro = async () => {
    if (!confirm('Riportare questo ragazzo in parrocchia?')) return;
    try { await api.post(`/members/${id}/rientro`); setOk('Ragazzo riportato in parrocchia.'); carica(); } catch (x) { setErr(x.message); }
  };

  const elimina = async () => {
    if (!confirm(`Eliminare definitivamente l'iscrizione di ${f.nome} ${f.cognome}?`)) return;
    try { await api.del(`/members/${id}`); nav('/'); } catch (x) { setErr(x.message); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{id ? `${f.cognome} ${f.nome}` : 'Nuova iscrizione'}</h1>
          {id && f.dataNascita && <p className="muted">{eta(f.dataNascita)} anni · nato il {dataIt(f.dataNascita)}</p>}
        </div>
        <Link className="button ghost" to="/">Torna all'elenco</Link>
      </div>

      {id && f.trasferito && (
        <p className="notice">Trasferito a <strong>{f.parrocchiaTrasferimento}</strong> il {dataIt(f.dataTrasferimento)}. Questa scheda è visibile solo agli amministratori.
          {user.ruolo === 'admin' && <button type="button" className="ghost" onClick={rientro}>Riporta in parrocchia</button>}
        </p>
      )}

      <form onSubmit={salva} className="stack">
        <fieldset className="card">
          <legend>Dati anagrafici</legend>
          <div className="grid">
            <Campo label="Nome"><input value={f.nome} onChange={set('nome')} required /></Campo>
            <Campo label="Cognome"><input value={f.cognome} onChange={set('cognome')} required /></Campo>
            <Campo label="Sesso">
              <select value={f.sesso} onChange={set('sesso')}><option value="">—</option><option value="M">Maschio</option><option value="F">Femmina</option></select>
            </Campo>
            <Campo label="Data di nascita"><input type="date" value={f.dataNascita} onChange={set('dataNascita')} required /></Campo>
            <Campo label="Luogo di nascita"><input value={f.luogoNascita} onChange={set('luogoNascita')} /></Campo>
            <Campo label="Codice fiscale"><input value={f.codiceFiscale} onChange={set('codiceFiscale')} maxLength={16} /></Campo>
            <Campo label="Indirizzo" wide><input value={f.indirizzo} onChange={set('indirizzo')} /></Campo>
            <Campo label="Città"><input value={f.citta} onChange={set('citta')} /></Campo>
            <Campo label="CAP"><input value={f.cap} onChange={set('cap')} maxLength={5} /></Campo>
            <Campo label="Telefono del ragazzo"><input type="tel" value={f.telefono} onChange={set('telefono')} /></Campo>
            <Campo label="Email del ragazzo"><input type="email" value={f.email} onChange={set('email')} /></Campo>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend>Genitore o tutore</legend>
          <div className="grid">
            <Campo label="Nome e cognome" wide><input value={f.nomeGenitore} onChange={set('nomeGenitore')} /></Campo>
            <Campo label="Telefono"><input type="tel" value={f.telefonoGenitore} onChange={set('telefonoGenitore')} /></Campo>
            <Campo label="Email"><input type="email" value={f.emailGenitore} onChange={set('emailGenitore')} /></Campo>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend>Gruppo e quota di iscrizione</legend>
          <div className="grid">
            <Campo label="Gruppo" wide>
              <select value={f.gruppo} onChange={set('gruppo')}>
                <option value="">Nessun gruppo</option>
                {groups.map((g) => <option key={g._id} value={g._id}>{labelGruppo(g)}</option>)}
              </select>
            </Campo>
            <Campo label="Quota versata (€)"><input type="number" min="0" step="0.01" value={f.quotaVersata} onChange={set('quotaVersata')} /></Campo>
            <Campo label="Data del versamento"><input type="date" value={f.dataVersamento} onChange={set('dataVersamento')} required={Number(f.quotaVersata) > 0} /></Campo>
          </div>
          <p className="hint">L'iscrizione risulta completata quando è stata versata una quota.</p>
        </fieldset>

        <fieldset className="card">
          <legend>Salute, note e privacy</legend>
          <div className="grid">
            <Campo label="Allergie o intolleranze" wide><textarea rows={2} value={f.allergie} onChange={set('allergie')} /></Campo>
            <Campo label="Note" wide><textarea rows={2} value={f.note} onChange={set('note')} /></Campo>
            <label className="check wide"><input type="checkbox" checked={f.consensoPrivacy} onChange={set('consensoPrivacy')} /> Consenso al trattamento dei dati firmato dal genitore</label>
          </div>
        </fieldset>

        {id && f.storico?.length > 0 && (
          <section className="card">
            <h2>Anni precedenti</h2>
            <div className="table-wrap" style={{ border: 0, marginTop: '.5rem' }}>
              <table>
                <thead><tr><th>Anno</th><th>Quota versata</th><th>Data versamento</th></tr></thead>
                <tbody>{f.storico.map((s, i) => <tr key={i}><td>{s.stagione}</td><td>{euro(s.quotaVersata)}</td><td>{dataIt(s.dataVersamento)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        {ok && <p className="success" role="status">{ok}</p>}
        <div className="actions">
            <button className="primary" disabled={busy}>{id ? 'Salva modifiche' : 'Registra iscrizione'}</button>
            {id && user.ruolo === 'admin' && <button type="button" className="danger" onClick={elimina}>Elimina iscrizione</button>}
        </div>
      </form>

      {id && <Fratelli id={id} fratelli={fratelli} onChange={carica} />}

      {id && !f.trasferito && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h2>Trasferimento ad altra parrocchia / Catechismo</h2>
          <p className="muted">Il ragazzo uscirà dagli elenchi dei gruppi e la sua scheda resterà visibile solo agli amministratori.</p>
          <div className="inline">
            <input placeholder="Nome della parrocchia (es. Santa Famiglia, Molfetta)" value={trasf} onChange={(e) => setTrasf(e.target.value)} />
            <button type="button" className="danger" disabled={!trasf.trim()} onClick={trasferisci}>Trasferisci</button>
          </div>
        </section>
      )}
    </>
  );
}
