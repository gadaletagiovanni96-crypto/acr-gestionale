import { useEffect, useState } from 'react';
import { api } from '../api';

const VUOTO = { nome: '', descrizione: '', educatori: [] };

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [educatori, setEducatori] = useState([]);
  const [edit, setEdit] = useState(null); // null = chiuso, {_id?} = form aperto
  const [err, setErr] = useState('');

  const carica = () => Promise.all([api.get('/groups'), api.get('/users?ruolo=educatore')])
    .then(([g, u]) => { setGroups(g); setEducatori(u.filter((x) => x.attivo)); }).catch((e) => setErr(e.message));
  useEffect(() => { carica(); }, []);

  const apri = (g) => { setErr(''); setEdit(g ? { _id: g._id, nome: g.nome, descrizione: g.descrizione, educatori: g.educatori.map((e) => e._id) } : { ...VUOTO }); };
  const toggle = (id) => setEdit((e) => ({ ...e, educatori: e.educatori.includes(id) ? e.educatori.filter((x) => x !== id) : [...e.educatori, id] }));

  const salva = async (ev) => {
    ev.preventDefault(); setErr('');
    try {
      if (edit._id) await api.put(`/groups/${edit._id}`, edit); else await api.post('/groups', edit);
      setEdit(null); carica();
    } catch (x) { setErr(x.message); }
  };
  const elimina = async (g) => {
    if (!confirm(`Eliminare il gruppo "${g.nome}"? I ragazzi resteranno iscritti, senza gruppo.`)) return;
    try { await api.del(`/groups/${g._id}`); carica(); } catch (x) { setErr(x.message); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Gruppi</h1><p className="muted">Dai un nome a ogni gruppo e scegli i suoi educatori.</p></div>
        {!edit && <button className="primary" onClick={() => apri(null)}>Nuovo gruppo</button>}
      </div>
      {err && <p className="error">{err}</p>}

      {edit && (
        <form className="card stack" onSubmit={salva}>
          <h2>{edit._id ? 'Modifica gruppo' : 'Nuovo gruppo'}</h2>
          <label>Nome del gruppo<input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} required autoFocus /></label>
          <label>Descrizione (facoltativa)<input value={edit.descrizione} onChange={(e) => setEdit({ ...edit, descrizione: e.target.value })} /></label>
          <fieldset className="plainset">
            <legend>Educatori</legend>
            {educatori.length === 0 && <p className="muted">Non ci sono ancora educatori: creali dalla pagina Account.</p>}
            <div className="checks">
              {educatori.map((u) => (
                <label className="check" key={u._id}><input type="checkbox" checked={edit.educatori.includes(u._id)} onChange={() => toggle(u._id)} />{u.nome} {u.cognome}</label>
              ))}
            </div>
          </fieldset>
          <div className="actions"><button className="primary">Salva gruppo</button><button type="button" className="ghost" onClick={() => setEdit(null)}>Annulla</button></div>
        </form>
      )}

      {!groups.length && !edit && <p className="empty">Non c'è ancora nessun gruppo. Creane uno per iniziare.</p>}
      <div className="cards">
        {groups.map((g) => (
          <article className="card" key={g._id}>
            <h2>{g.nome}</h2>
            {g.descrizione && <p className="muted">{g.descrizione}</p>}
            <p>{g.educatori.length ? g.educatori.map((e) => `${e.nome} ${e.cognome}`.trim()).join(', ') : <span className="muted">Nessun educatore</span>}</p>
            <div className="actions"><button className="ghost" onClick={() => apri(g)}>Modifica</button><button className="danger ghost" onClick={() => elimina(g)}>Elimina</button></div>
          </article>
        ))}
      </div>
    </>
  );
}
