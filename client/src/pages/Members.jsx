import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, eta, dataIt, euro, labelGruppo, scaricaPdf, scaricaExcel } from '../api';
import { useAuth } from '../auth.jsx';
import PannelloFiltri from '../components/PannelloFiltri.jsx';

export default function Members() {
  const { user } = useAuth();
  const admin = user.ruolo === 'admin';
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [filtro, setFiltro] = useState({ iscrizione: '', fratelli: '', gruppo: '', q: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/members'), api.get('/groups')])
      .then(([m, g]) => { setMembers(m); setGroups(g); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (v) => setFiltro((f) => ({ ...f, [k]: v }));
  const attivi = useMemo(() => members.filter((m) => !m.trasferito), [members]);
  const trasferiti = useMemo(() => members.filter((m) => m.trasferito), [members]);

  const sezioni = useMemo(() => {
    const q = filtro.q.trim().toLowerCase();
    const nomeOk = (m) => !q || `${m.nome} ${m.cognome}`.toLowerCase().includes(q);
    const fratelliOk = (m) => !filtro.fratelli || (filtro.fratelli === 'si') === !!m.familyId;
    const ok = (m) => (!filtro.iscrizione || (filtro.iscrizione === 'si') === m.iscritto) && fratelliOk(m) && nomeOk(m);
    const lista = [...groups.map((g) => ({ id: g._id, nome: g.nome, educatori: g.educatori })), { id: 'nessuno', nome: 'Senza gruppo', educatori: [] }]
      .filter((s) => !filtro.gruppo || filtro.gruppo === s.id)
      .map((s) => {
        const tutti = attivi.filter((m) => (m.gruppo?._id || 'nessuno') === s.id);
        return { ...s, tutti, iscritti: tutti.filter((m) => m.iscritto).length, visibili: tutti.filter(ok) };
      })
      .filter((s) => s.id !== 'nessuno' || s.tutti.length)
      .filter((s) => !(filtro.iscrizione || filtro.fratelli || q) || s.visibili.length);
    if (admin && trasferiti.length && !filtro.iscrizione && (!filtro.gruppo || filtro.gruppo === 'trasferiti')) {
      const visibili = trasferiti.filter((m) => nomeOk(m) && fratelliOk(m));
      if (visibili.length || !(q || filtro.fratelli)) lista.push({ id: 'trasferiti', nome: 'Trasferiti in altre parrocchie', educatori: [], tutti: trasferiti, visibili });
    }
    return lista;
  }, [attivi, trasferiti, groups, filtro, admin]);

  const totIscritti = attivi.filter((m) => m.iscritto).length;

  const pdf = async () => {
    setErr(''); setPdfBusy(true);
    try { await scaricaPdf(filtro); } catch (e) { setErr(e.message); }
    setPdfBusy(false);
  };

    const xls = async () => {
    setErr(''); setXlsBusy(true);
    try { await scaricaExcel(filtro); } catch (e) { setErr(e.message); }
    setXlsBusy(false);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ragazzi</h1>
          <p className="muted">{attivi.length} registrati · {totIscritti} con iscrizione completata · {attivi.length - totIscritti} ancora da completare</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="ghost" onClick={pdf} disabled={pdfBusy}>{pdfBusy ? 'Creo il PDF…' : 'Scarica PDF'}</button>
          <button className="ghost" onClick={xls} disabled={xlsBusy}>{xlsBusy ? 'Creo il foglio…' : 'Scarica Excel'}</button>
          <Link className="button primary" to="/iscritti/nuovo">Nuova iscrizione</Link>
        </div>
      </div>

      <PannelloFiltri
        badge={[filtro.iscrizione, filtro.fratelli, filtro.gruppo].filter(Boolean).length}
        onAzzera={filtro.iscrizione || filtro.fratelli || filtro.gruppo || filtro.q
          ? () => setFiltro({ iscrizione: '', fratelli: '', gruppo: '', q: '' }) : null}
        ricerca={<input type="search" placeholder="Cerca per nome o cognome" value={filtro.q} onChange={(e) => set('q')(e.target.value)} aria-label="Cerca" />}
      >
        <div className="segmented" role="radiogroup" aria-label="Stato iscrizione">
          {[['', 'Tutti'], ['si', 'Iscritti'], ['no', 'Non ancora iscritti']].map(([v, l]) => (
            <button key={v} className={filtro.iscrizione === v ? 'on' : ''} onClick={() => set('iscrizione')(v)} role="radio" aria-checked={filtro.iscrizione === v}>{l}</button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Fratelli">
          {[['', 'Tutti'], ['si', 'Con fratelli'], ['no', 'Senza fratelli']].map(([v, l]) => (
            <button key={v} className={filtro.fratelli === v ? 'on' : ''} onClick={() => set('fratelli')(v)} role="radio" aria-checked={filtro.fratelli === v}>{l}</button>
          ))}
        </div>
        <select value={filtro.gruppo} onChange={(e) => set('gruppo')(e.target.value)} aria-label="Gruppo">
          <option value="">Tutti i gruppi</option>
          {groups.map((g) => <option key={g._id} value={g._id}>{labelGruppo(g)}</option>)}
          <option value="nessuno">Senza gruppo</option>
          {admin && <option value="trasferiti">Trasferiti</option>}
        </select>
      </PannelloFiltri>

      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Caricamento…</p>}
      {!loading && !sezioni.length && <p className="empty">Nessun ragazzo corrisponde ai filtri.</p>}

      {sezioni.map((s) => {
        const tr = s.id === 'trasferiti';
        return (
          <section className={`group${tr ? ' trasferiti' : ''}`} key={s.id}>
            <header>
              <div>
                <h2>{s.nome}</h2>
                <p className="muted">
                  {tr ? 'Visibili solo agli amministratori'
                    : s.educatori.length ? 'Educatori: ' + s.educatori.map((e) => `${e.nome} ${e.cognome}`.trim()).join(', ')
                    : s.id === 'nessuno' ? 'Da assegnare a un gruppo' : 'Nessun educatore assegnato'}
                </p>
              </div>
              <div className="count">
                {tr ? <><strong>{s.tutti.length}</strong> ragazzi</> : (
                  <>
                    <strong>{s.iscritti}/{s.tutti.length}</strong> iscritti
                    <div className="bar"><i style={{ width: s.tutti.length ? `${(s.iscritti / s.tutti.length) * 100}%` : 0 }} /></div>
                  </>
                )}
              </div>
            </header>
            {s.visibili.length === 0 ? (
              <p className="empty small">Nessun ragazzo in questo gruppo.</p>
            ) : (
              <ul>
                {s.visibili.map((m) => (
                  <li key={m._id}>
                    <Link to={`/iscritti/${m._id}`}>
                      <span className="name">{m.cognome} {m.nome}</span>
                      <span className="muted">{eta(m.dataNascita)} anni</span>
                      {m.familyId && <span className="chip sib">Fratelli</span>}
                      {tr ? (
                        <span className="chip sib">{m.parrocchiaTrasferimento} · {dataIt(m.dataTrasferimento)}</span>
                      ) : (
                        <span className={`chip ${m.iscritto ? 'ok' : 'warn'}`}>
                          {m.iscritto ? `Iscritto · ${euro(m.quotaVersata)} il ${dataIt(m.dataVersamento)}` : 'Da completare'}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
