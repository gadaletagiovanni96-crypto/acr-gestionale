import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, dataIt, scarica, parametriFiltri } from '../api';
import { SceltaMultipla } from '../components/FiltriMultipli.jsx';
import { useAuth } from '../auth.jsx';

const STATI = { si: 'Iscritto', dacompletare: 'Da completare', noniscritti: 'Non iscritto' };
const VUOTI = { iscrizione: [], fratelli: [], q: '' };
const minuscolo = (s) => String(s || '').toLowerCase();
// Stesso testo che usa il server: nome, cognome, luogo, via, telefono e nomi dei fratelli
const testoRicerca = (r) => minuscolo([r.cognome, r.nome, `${r.nome} ${r.cognome}`, r.luogoNascita, r.indirizzo, r.citta, r.telefonoGenitore,
  ...r.fratelli.map((f) => `${f.nome} ${f.cognome}`)].join(' '));

function Contenuto() {
  const [gruppi, setGruppi] = useState(null);
  const [filtro, setFiltro] = useState(VUOTI);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => { api.get('/miei-gruppi').then(setGruppi).catch((e) => setErr(e.message)); }, []);

  const set = (k) => (v) => setFiltro((f) => ({ ...f, [k]: v }));
  const parole = minuscolo(filtro.q).split(/\s+/).filter(Boolean);
  const attivi = !!(filtro.iscrizione.length || filtro.fratelli.length || parole.length);

  const sezioni = useMemo(() => {
    const ok = (r) =>
      (!filtro.iscrizione.length || filtro.iscrizione.some((v) => STATI[v] === r.stato)) &&
      (filtro.fratelli.length !== 1 || (filtro.fratelli[0] === 'si') === r.fratelli.length > 0) &&
      (!parole.length || parole.every((p) => testoRicerca(r).includes(p)));
    const lista = (gruppi || []).map((g) => ({ ...g, totale: g.ragazzi.length, ragazzi: g.ragazzi.filter(ok) }));
    return attivi ? lista.filter((g) => g.ragazzi.length) : lista;
  }, [gruppi, filtro, attivi]); // eslint-disable-line react-hooks/exhaustive-deps

  const totali = (gruppi || []).reduce((a, g) => a + g.ragazzi.length, 0);
  const mostrati = sezioni.reduce((a, g) => a + g.ragazzi.length, 0);

  // PDF ed Excel rispettano i filtri attivi
  const esporta = async (tipo) => {
    setErr(''); setBusy(tipo);
    const p = parametriFiltri(filtro);
    try { await scarica(`/miei-gruppi/${tipo}?${p}`, `i-miei-gruppi.${tipo}`); } catch (x) { setErr(x.message); }
    setBusy('');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>I miei gruppi</h1>
          {gruppi?.length > 0 && (
            <p className="muted">
              {gruppi.length} grupp{gruppi.length === 1 ? 'o' : 'i'} · {attivi ? `${mostrati} ragazzi su ${totali}` : `${totali} ragazz${totali === 1 ? 'o' : 'i'}`}
            </p>
          )}
        </div>
        {gruppi?.length > 0 && (
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="ghost" onClick={() => esporta('pdf')} disabled={!!busy}>{busy === 'pdf' ? 'Creo il PDF…' : 'Scarica PDF'}</button>
            <button className="ghost" onClick={() => esporta('xlsx')} disabled={!!busy}>{busy === 'xlsx' ? 'Creo il foglio…' : 'Scarica Excel'}</button>
          </div>
        )}
      </div>

      {gruppi?.length > 0 && (
        <>
          <div className="filters">
            <SceltaMultipla etichetta="Iscrizione" valori={filtro.iscrizione} onChange={set('iscrizione')}
              opzioni={[['si', 'Iscritti'], ['dacompletare', 'Da completare'], ['noniscritti', 'Non iscritti']]} />
            <SceltaMultipla etichetta="Fratelli" valori={filtro.fratelli} onChange={set('fratelli')}
              opzioni={[['si', 'Con fratelli'], ['no', 'Senza fratelli']]} />
            <input type="search" placeholder="Cerca nome, cognome, via, telefono…" value={filtro.q} onChange={(e) => set('q')(e.target.value)} aria-label="Cerca" />
            {attivi && <button className="ghost" onClick={() => setFiltro(VUOTI)}>Azzera filtri</button>}
          </div>
          {attivi && <p className="muted" style={{ marginTop: '-.75rem', marginBottom: '1rem' }}>PDF ed Excel scaricano solo i ragazzi che vedi qui sotto.</p>}
        </>
      )}

      {err && <p className="error">{err}</p>}
      {!gruppi && !err && <p className="muted">Caricamento…</p>}
      {gruppi && !gruppi.length && <p className="empty">Non hai ancora nessun gruppo assegnato.</p>}
      {gruppi?.length > 0 && attivi && !sezioni.length && <p className="empty">Nessun ragazzo corrisponde ai filtri.</p>}

      {sezioni.map((g) => (
        <section className="group" key={g._id}>
          <header>
            <div>
              <h2>{g.nome}</h2>
              <p className="muted">Educatori: {g.educatori.join(', ') || 'nessuno'}</p>
            </div>
            <div className="count">
              {attivi ? <><strong>{g.ragazzi.length}</strong> di {g.totale}</> : <><strong>{g.totale}</strong> ragazz{g.totale === 1 ? 'o' : 'i'}</>}
            </div>
          </header>
          {!g.ragazzi.length ? <p className="empty small">Nessun ragazzo in questo gruppo.</p> : (
            <div className="table-wrap tabella-gruppo">
              <table>
                <thead>
                  <tr><th>N.</th><th>Cognome</th><th>Nome</th><th>Data di nascita</th><th>Luogo di nascita</th><th>Via</th><th>Telefono genitore</th><th>Iscrizione</th><th>Fratelli</th></tr>
                </thead>
                <tbody>
                  {g.ragazzi.map((r, i) => (
                    <tr key={r._id}>
                      <td className="nowrap">{i + 1}</td>
                      <td><Link to={`/iscritti/${r._id}`}><strong>{r.cognome}</strong></Link></td>
                      <td><Link to={`/iscritti/${r._id}`}>{r.nome}</Link></td>
                      <td className="nowrap">{dataIt(r.dataNascita)}</td>
                      <td>{r.luogoNascita || '—'}</td>
                      <td>{[r.indirizzo, r.citta].filter(Boolean).join(', ') || '—'}</td>
                      <td className="nowrap">{r.telefonoGenitore ? <a href={`tel:${r.telefonoGenitore.replace(/\s/g, '')}`}>{r.telefonoGenitore}</a> : '—'}</td>
                      <td className="nowrap"><span className={`chip ${r.iscritto ? 'ok' : r.stato === 'Non iscritto' ? 'no' : 'warn'}`}>{r.stato}</span></td>
                      <td>
                        {r.fratelli.length ? r.fratelli.map((f) => (
                          <div className="sib-line" key={f._id}>
                            <Link to={`/iscritti/${f._id}`}><strong>{f.nome} {f.cognome}</strong></Link> <span className="chip sib">{f.gruppo}</span>
                          </div>
                        )) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </>
  );
}

// Solo gli educatori vedono questa scheda
export default function MieiGruppi() {
  const { user } = useAuth();
  return user.ruolo === 'educatore' ? <Contenuto /> : <Navigate to="/" replace />;
}