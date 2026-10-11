import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, euro, dataIt, scarica } from '../api';

const oggi = () => new Date().toISOString().slice(0, 10);
const giorno = (d) => (d ? String(d).slice(0, 10) : '');
const nuova = (tipo = 'entrata', data = oggi()) => ({ tipo, importo: '', descrizione: '', data });

export default function Evento() {
  const { id } = useParams();
  const nav = useNavigate();
  const [ev, setEv] = useState(null);
  const [voce, setVoce] = useState(nuova());
  const [editId, setEditId] = useState(null);
  const [modEvento, setModEvento] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => { api.get(`/events/${id}`).then(setEv).catch((e) => setErr(e.message)); }, [id]);

  // Movimenti in ordine di data, con il saldo che si aggiorna riga dopo riga
  const righe = useMemo(() => {
    if (!ev) return [];
    let saldo = 0;
    return [...ev.voci]
      .sort((a, b) => new Date(a.data) - new Date(b.data) || a._id.localeCompare(b._id))
      .map((v) => { saldo += v.tipo === 'entrata' ? v.importo : -v.importo; return { ...v, progressivo: Math.round(saldo * 100) / 100 }; });
  }, [ev]);

  const setV = (k) => (e) => setVoce((v) => ({ ...v, [k]: e.target.value }));

  const salvaVoce = async (e) => {
    e.preventDefault(); setErr('');
    const body = { ...voce, importo: voce.importo === '' ? '' : Number(voce.importo) };
    try {
      const r = editId ? await api.put(`/events/${id}/voci/${editId}`, body) : await api.post(`/events/${id}/voci`, body);
      setEv(r); setEditId(null); setVoce(nuova(voce.tipo, voce.data));
    } catch (x) { setErr(x.message); }
  };
  const modifica = (v) => {
    setErr(''); setEditId(v._id);
    setVoce({ tipo: v.tipo, importo: v.importo, descrizione: v.descrizione || '', data: giorno(v.data) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const annulla = () => { setEditId(null); setVoce(nuova(voce.tipo)); setErr(''); };
  const eliminaVoce = async (v) => {
    if (!confirm(`Eliminare «${v.descrizione || v.tipo}» di ${euro(v.importo)}?`)) return;
    try { setEv(await api.del(`/events/${id}/voci/${v._id}`)); if (editId === v._id) annulla(); } catch (x) { setErr(x.message); }
  };
  const salvaEvento = async (e) => {
    e.preventDefault(); setErr('');
    try { setEv(await api.put(`/events/${id}`, modEvento)); setModEvento(null); } catch (x) { setErr(x.message); }
  };
  const esporta = async (tipo) => {
    setErr(''); setBusy(tipo);
    try { await scarica(`/events/${tipo}?evento=${id}`, `contabilita.${tipo}`); } catch (x) { setErr(x.message); }
    setBusy('');
  };
  const eliminaEvento = async () => {
    if (!confirm(`Eliminare l'evento «${ev.nome}» con tutti i suoi ${ev.voci.length} movimenti?\n\nNon si può annullare.`)) return;
    try { await api.del(`/events/${id}`); nav('/contabilita'); } catch (x) { setErr(x.message); }
  };

  if (!ev) return <p className="muted">{err || 'Caricamento…'}</p>;
  const uscita = voce.tipo === 'uscita';

  return (
    <>
      <div className="page-head">
        <div><h1>{ev.nome}</h1><p className="muted">{dataIt(ev.data)}{ev.note ? ` · ${ev.note}` : ''}</p></div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="button ghost" to="/contabilita">Tutti gli eventi</Link>
          <button className="ghost" onClick={() => setModEvento({ nome: ev.nome, data: giorno(ev.data), note: ev.note || '' })}>Modifica evento</button>
          <button className="ghost" onClick={() => esporta('pdf')} disabled={!!busy}>{busy === 'pdf' ? 'Creo il PDF…' : 'Scarica PDF'}</button>
          <button className="ghost" onClick={() => esporta('xlsx')} disabled={!!busy}>{busy === 'xlsx' ? 'Creo il foglio…' : 'Scarica Excel'}</button>
        </div>
      </div>

      {modEvento && (
        <form className="card stack" onSubmit={salvaEvento} style={{ marginBottom: '1.25rem' }}>
          <h2>Modifica evento</h2>
          <div className="grid">
            <label>Nome<input value={modEvento.nome} onChange={(e) => setModEvento({ ...modEvento, nome: e.target.value })} required /></label>
            <label>Data<input type="date" value={modEvento.data} onChange={(e) => setModEvento({ ...modEvento, data: e.target.value })} required /></label>
            <label className="wide">Note<input value={modEvento.note} onChange={(e) => setModEvento({ ...modEvento, note: e.target.value })} /></label>
          </div>
          <div className="actions"><button className="primary">Salva evento</button><button type="button" className="ghost" onClick={() => setModEvento(null)}>Annulla</button></div>
        </form>
      )}

      <div className="totals">
        <div className="tile in"><span>Entrate</span><strong>{euro(ev.totaleEntrate)}</strong></div>
        <div className="tile out"><span>Uscite</span><strong>{euro(ev.totaleUscite)}</strong></div>
        <div className={`tile ${ev.saldo >= 0 ? 'in' : 'out'}`}><span>Saldo</span><strong>{euro(ev.saldo)}</strong></div>
      </div>

      <form className="card stack" onSubmit={salvaVoce}>
        <h2>{editId ? 'Modifica movimento' : 'Nuovo movimento'}</h2>
        <div className="segmented" role="radiogroup" aria-label="Tipo di movimento">
          <button type="button" className={voce.tipo === 'entrata' ? 'on in' : ''} onClick={() => setVoce({ ...voce, tipo: 'entrata' })} role="radio" aria-checked={!uscita}>Entrata</button>
          <button type="button" className={uscita ? 'on out' : ''} onClick={() => setVoce({ ...voce, tipo: 'uscita' })} role="radio" aria-checked={uscita}>Uscita</button>
        </div>
        <div className="grid">
          <label>Importo (€)<input type="number" inputMode="decimal" min="0.01" step="0.01" value={voce.importo} onChange={setV('importo')} required /></label>
          <label>Data<input type="date" value={voce.data} onChange={setV('data')} required /></label>
          <label className="wide">{uscita ? 'Descrizione della spesa' : 'Descrizione (facoltativa)'}
            <input value={voce.descrizione} onChange={setV('descrizione')} required={uscita} placeholder={uscita ? 'es. Acquisto materiale per i giochi' : 'es. Offerte, vendita dolci'} />
          </label>
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions">
          <button className="primary">{editId ? 'Salva modifiche' : uscita ? 'Aggiungi uscita' : 'Aggiungi entrata'}</button>
          {editId && <button type="button" className="ghost" onClick={annulla}>Annulla</button>}
        </div>
      </form>

      <h2 style={{ marginTop: '1.75rem' }}>Movimenti</h2>
      {!righe.length ? <p className="empty">Nessun movimento registrato.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Descrizione</th><th className="num">Importo</th><th className="num">Saldo progressivo</th><th /></tr></thead>
            <tbody>
              {righe.map((v) => (
                <tr key={v._id} className={editId === v._id ? 'editing' : ''}>
                  <td>{dataIt(v.data)}</td>
                  <td><span className={`chip ${v.tipo === 'entrata' ? 'ok' : 'warn'}`}>{v.tipo === 'entrata' ? 'Entrata' : 'Uscita'}</span></td>
                  <td>{v.descrizione || <span className="muted">—</span>}</td>
                  <td className={`num ${v.tipo === 'entrata' ? 'money-in' : 'money-out'}`}>{v.tipo === 'entrata' ? '+' : '−'} {euro(v.importo)}</td>
                  <td className="num">{euro(v.progressivo)}</td>
                  <td className="right"><button className="ghost" onClick={() => modifica(v)}>Modifica</button><button className="ghost danger" onClick={() => eliminaVoce(v)}>Elimina</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="actions" style={{ marginTop: '2rem' }}><button className="danger" onClick={eliminaEvento}>Elimina evento</button></div>
    </>
  );
}