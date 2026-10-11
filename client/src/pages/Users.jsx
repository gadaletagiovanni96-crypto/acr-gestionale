import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth.jsx';

const VUOTO = { nome: '', cognome: '', email: '', password: '', ruolo: 'educatore', attivo: true };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');

  const carica = () => api.get('/users').then(setUsers).catch((e) => setErr(e.message));
  useEffect(() => { carica(); }, []);

  const salva = async (ev) => {
    ev.preventDefault(); setErr('');
    try {
      if (edit._id) await api.put(`/users/${edit._id}`, edit); else await api.post('/users', edit);
      setEdit(null); carica();
    } catch (x) { setErr(x.message); }
  };
  const elimina = async (u) => {
    if (!confirm(`Eliminare l'account di ${u.nome} ${u.cognome}?`)) return;
    try { await api.del(`/users/${u._id}`); carica(); } catch (x) { setErr(x.message); }
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <div className="page-head">
        <div><h1>Educatori & Account</h1><p className="muted">Aggiungi, modifica o rimuovi gli account di educatori e amministratori.</p></div>
        {!edit && <button className="primary" onClick={() => { setErr(''); setEdit({ ...VUOTO }); }}>Nuovo Educatore</button>}
      </div>
      {err && <p className="error">{err}</p>}

      {edit && (
        <form className="card stack" onSubmit={salva}>
          <h2>{edit._id ? 'Modifica account' : 'Nuovo account'}</h2>
          <div className="grid">
            <label>Nome<input value={edit.nome} onChange={set('nome')} required /></label>
            <label>Cognome<input value={edit.cognome} onChange={set('cognome')} /></label>
            <label>Email<input type="email" value={edit.email} onChange={set('email')} required /></label>
            <label>{edit._id ? 'Nuova password (lascia vuoto per non cambiarla)' : 'Password (min. 8 caratteri)'}
              <input type="password" minLength={8} value={edit.password} onChange={set('password')} required={!edit._id} autoComplete="new-password" />
            </label>
            <label>Tipo di account
              <select value={edit.ruolo} onChange={set('ruolo')} disabled={edit._id === me._id}><option value="educatore">Educatore</option><option value="admin">Admin</option></select>
            </label>
            <label className="check"><input type="checkbox" checked={edit.attivo} onChange={set('attivo')} disabled={edit._id === me._id} /> Account attivo</label>
          </div>
          <div className="actions"><button className="primary">Salva account</button><button type="button" className="ghost" onClick={() => setEdit(null)}>Annulla</button></div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Email</th><th>Tipo</th><th>Stato</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.nome} {u.cognome}</td>
                <td>{u.email}</td>
                <td>{u.ruolo === 'admin' ? 'Admin' : 'Educatore'}</td>
                <td><span className={`chip ${u.attivo ? 'ok' : 'warn'}`}>{u.attivo ? 'Attivo' : 'Disattivato'}</span></td>
                <td className="right">
                  <button className="ghost" onClick={() => { setErr(''); setEdit({ ...u, password: '' }); }}>Modifica</button>
                  {u._id !== me._id && <button className="ghost danger" onClick={() => elimina(u)}>Elimina</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
