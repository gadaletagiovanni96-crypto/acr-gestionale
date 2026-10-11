import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, euro, dataIt } from '../api';

const oggi = () => new Date().toISOString().slice(0, 10);

export default function Contabilita() {
  const nav = useNavigate();
  const [eventi, setEventi] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/events').then(setEventi).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const entrate = eventi.reduce((a, e) => a + e.totaleEntrate, 0);
  const uscite = eventi.reduce((a, e) => a + e.totaleUscite, 0);
  const saldo = Math.round((entrate - uscite) * 100) / 100;
  // Le barre sono tutte nella stessa scala, così gli eventi si possono confrontare a colpo d'occhio
  const max = Math.max(1, ...eventi.flatMap((e) => [e.totaleEntrate, e.totaleUscite]));

  const crea = async (ev) => {
    ev.preventDefault(); setErr('');
    try { const e = await api.post('/events', form); nav(`/contabilita/${e._id}`); } catch (x) { setErr(x.message); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Contabilità</h1><p className="muted">Un evento per ogni attività: dentro registri entrate e uscite.</p></div>
        {!form && <button className="primary" onClick={() => setForm({ nome: '', data: oggi(), note: '' })}>Nuovo evento</button>}
      </div>

      <div className="totals">
        <div className="tile in"><span>Entrate totali</span><strong>{euro(entrate)}</strong></div>
        <div className="tile out"><span>Uscite totali</span><strong>{euro(uscite)}</strong></div>
        <div className={`tile ${saldo >= 0 ? 'in' : 'out'}`}><span>Saldo complessivo</span><strong>{euro(saldo)}</strong></div>
      </div>

      {form && (
        <form className="card stack" onSubmit={crea} style={{ marginBottom: '1.25rem' }}>
          <h2>Nuovo evento</h2>
          <div className="grid">
            <label>Nome dell'evento<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="es. Festa di inizio anno" required autoFocus /></label>
            <label>Data<input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required /></label>
            <label className="wide">Note (facoltative)<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="actions"><button className="primary">Crea e aggiungi movimenti</button><button type="button" className="ghost" onClick={() => setForm(null)}>Annulla</button></div>
        </form>
      )}

      {!form && err && <p className="error">{err}</p>}
      {loading && <p className="muted">Caricamento…</p>}
      {!loading && !eventi.length && <p className="empty">Non c'è ancora nessun evento. Creane uno per iniziare.</p>}

      <div className="cards">
        {eventi.map((e) => (
          <Link className="card event-card" to={`/contabilita/${e._id}`} key={e._id}>
            <div className="event-top"><h2>{e.nome}</h2><span className="muted">{dataIt(e.data)}</span></div>
            <div className="flow">
              <span>Entrate</span>
              <div className="track"><i className="in" style={{ width: `${(e.totaleEntrate / max) * 100}%` }} /></div>
              <strong className="money-in">{euro(e.totaleEntrate)}</strong>
            </div>
            <div className="flow">
              <span>Uscite</span>
              <div className="track"><i className="out" style={{ width: `${(e.totaleUscite / max) * 100}%` }} /></div>
              <strong className="money-out">{euro(e.totaleUscite)}</strong>
            </div>
            <div className="saldo">
              <span className="muted">{e.numeroVoci} moviment{e.numeroVoci === 1 ? 'o' : 'i'} · Saldo</span>
              <strong className={e.saldo >= 0 ? 'money-in' : 'money-out'}>{euro(e.saldo)}</strong>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}