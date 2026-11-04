import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, eta, dataIt, euro, labelGruppo, scaricaPdf, scaricaExcel } from '../api';
import { useAuth } from '../auth.jsx';
import PannelloFiltri from '../components/PannelloFiltri.jsx';
import { useImpostazioni } from '../impostazioni';
import MenuTendina from '../components/MenuTendina.jsx';
import { SceltaMultipla, GruppiMultipli } from '../components/FiltriMultipli.jsx';

// Ogni filtro è una lista di scelte (vuota = Tutti). Dentro un filtro basta una scelta qualsiasi, tra filtri diversi valgono tutti.
const CHIAVE_FILTRI = 'acr_filtri_ragazzi';
const FILTRI_VUOTI = { iscrizione: [], tesserato: [], fratelli: [], gruppo: [], q: '' };
const AMMESSI = { iscrizione: ['si', 'dacompletare', 'noniscritti'], tesserato: ['si', 'no'], fratelli: ['si', 'no'] };
const filtriSalvati = () => {
  try {
    const salvati = JSON.parse(sessionStorage.getItem(CHIAVE_FILTRI)) || {};
    const f = { ...FILTRI_VUOTI, q: typeof salvati.q === 'string' ? salvati.q : '' };
    const comeLista = (v) => (Array.isArray(v) ? v : v ? [v] : []); // le versioni precedenti salvavano un solo valore
    for (const k of Object.keys(AMMESSI)) f[k] = comeLista(salvati[k]).filter((v) => AMMESSI[k].includes(v));
    f.gruppo = comeLista(salvati.gruppo).filter((v) => typeof v === 'string');
    return f;
  } catch { return FILTRI_VUOTI; }
};
// Iscritto (ha versato la quota) · Da completare (la verserà) · Non iscritto (non vuole iscriversi)
const statoDi = (m) => (m.iscritto ? 'si' : m.nonIscritto ? 'noniscritti' : 'dacompletare');

export default function Members() {
  const { user } = useAuth();
  const admin = user.ruolo === 'admin';
  const imp = useImpostazioni();
  const iscrizioniChiuse = !admin && imp?.iscrizioniAperte === false;
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [filtro, setFiltro] = useState(filtriSalvati);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem(CHIAVE_FILTRI, JSON.stringify(filtro)); } catch { /* browser senza memoria: i filtri non vengono ricordati */ }
  }, [filtro]);

  useEffect(() => {
    Promise.all([api.get('/members'), api.get('/groups')])
      .then(([m, g]) => {
        setMembers(m); setGroups(g);
        // se il gruppo salvato nel filtro non esiste più (es. eliminato), toglie solo quel filtro
        setFiltro((f) => ({ ...f, gruppo: f.gruppo.filter((v) => ['nessuno', 'trasferiti'].includes(v) || g.some((x) => x._id === v)) }));
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (v) => setFiltro((f) => ({ ...f, [k]: v }));
  const attivi = useMemo(() => members.filter((m) => !m.trasferito), [members]);
  const trasferiti = useMemo(() => members.filter((m) => m.trasferito), [members]);

  const sezioni = useMemo(() => {
    const q = filtro.q.trim().toLowerCase();
    const nomeOk = (m) => !q || `${m.nome} ${m.cognome}`.toLowerCase().includes(q);
    const fratelliOk = (m) => filtro.fratelli.length !== 1 || (filtro.fratelli[0] === 'si') === !!m.familyId;
    const statoOk = (m) => !filtro.iscrizione.length || filtro.iscrizione.includes(statoDi(m));
    const tesseraOk = (m) => !admin || filtro.tesserato.length !== 1 || (filtro.tesserato[0] === 'si') === !!m.tesserato;
    const ok = (m) => statoOk(m) && tesseraOk(m) && fratelliOk(m) && nomeOk(m);
    const gruppoOk = (id) => !filtro.gruppo.length || filtro.gruppo.includes(id);
    const lista = [...groups.map((g) => ({ id: g._id, nome: g.nome, educatori: g.educatori, conta: g.contaNelTotale !== false })),
      { id: 'nessuno', nome: 'Senza gruppo', educatori: [], conta: true }]
      .filter((s) => gruppoOk(s.id))
      .map((s) => {
        const tutti = attivi.filter((m) => (m.gruppo?._id || 'nessuno') === s.id);
        return { ...s, tutti, iscritti: tutti.filter((m) => m.iscritto).length, visibili: tutti.filter(ok) };
      })
      .filter((s) => s.id !== 'nessuno' || s.tutti.length)
      .filter((s) => !(filtro.iscrizione.length || filtro.tesserato.length || filtro.fratelli.length || q) || s.visibili.length);
    // I trasferiti: compaiono senza filtri su iscrizione e tessera, oppure se scelti esplicitamente tra i gruppi
    const trasfScelti = filtro.gruppo.includes('trasferiti');
    if (admin && trasferiti.length && (trasfScelti || (!filtro.gruppo.length && !filtro.iscrizione.length && !filtro.tesserato.length))) {
      const visibili = trasferiti.filter((m) => nomeOk(m) && fratelliOk(m));
      if (visibili.length || !(q || filtro.fratelli.length)) lista.push({ id: 'trasferiti', nome: 'Trasferiti in altre parrocchie', educatori: [], tutti: trasferiti, visibili });
    }
    return lista;
  }, [attivi, trasferiti, groups, filtro, admin]);

  // Totali: esclusi i ragazzi dei gruppi segnati "non contare nel totale"
  const esclusi = groups.filter((g) => g.contaNelTotale === false);
  const conteggiati = attivi.filter((m) => !m.gruppo || !esclusi.some((g) => g._id === m.gruppo._id));
  const totIscritti = conteggiati.filter((m) => m.iscritto).length;
  const totNonIscritti = conteggiati.filter((m) => statoDi(m) === 'noniscritti').length;

  const pdf = async (conFratelli) => {
    setErr(''); setPdfBusy(true);
    try { await scaricaPdf(filtro, conFratelli === true ? { conFratelli: '1' } : {}); } catch (e) { setErr(e.message); }
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
          <p className="muted">{conteggiati.length} registrati · {totIscritti} iscritti · {conteggiati.length - totIscritti - totNonIscritti} da completare · {totNonIscritti} non iscritti</p>
          {esclusi.length > 0 && <p className="muted" style={{ fontSize: '.85rem', marginTop: '.15rem' }}>Non conteggiati nel totale: {esclusi.map((g) => g.nome).join(', ')}</p>}
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          {admin ? (
            <MenuTendina etichetta={pdfBusy ? 'Creo il PDF…' : 'Scarica PDF'} disabilitato={pdfBusy}
              voci={[{ etichetta: 'PDF senza fratelli', azione: () => pdf(false) }, { etichetta: 'PDF con fratelli', azione: () => pdf(true) }]} />
          ) : (
            <button className="ghost" onClick={pdf} disabled={pdfBusy}>{pdfBusy ? 'Creo il PDF…' : 'Scarica PDF'}</button>
          )}
          <button className="ghost" onClick={xls} disabled={xlsBusy}>{xlsBusy ? 'Creo il foglio…' : 'Scarica Excel'}</button>
          {!iscrizioniChiuse && <Link className="button primary" to="/iscritti/nuovo">Nuova iscrizione</Link>}
        </div>
      </div>
      {iscrizioniChiuse && <p className="notice" style={{ marginBottom: '1rem' }}>Le iscrizioni di nuovi ragazzi sono chiuse al momento. Solo il parroco o il responsabile possono aggiungere nuovi iscritti.</p>}
      <PannelloFiltri
        badge={[filtro.iscrizione, filtro.tesserato, filtro.fratelli, filtro.gruppo].filter((v) => v.length).length}
        onAzzera={filtro.iscrizione.length || filtro.tesserato.length || filtro.fratelli.length || filtro.gruppo.length || filtro.q
          ? () => setFiltro(FILTRI_VUOTI) : null}
        ricerca={<input type="search" placeholder="Cerca per nome o cognome" value={filtro.q} onChange={(e) => set('q')(e.target.value)} aria-label="Cerca" />}
      >
        <SceltaMultipla etichetta="Stato iscrizione" valori={filtro.iscrizione} onChange={set('iscrizione')}
          opzioni={[['si', 'Iscritti'], ['dacompletare', 'Da completare'], ['noniscritti', 'Non iscritti']]} />
        {admin && (
          <SceltaMultipla etichetta="Tesseramento" valori={filtro.tesserato} onChange={set('tesserato')}
            opzioni={[['si', 'Tesserati'], ['no', 'Non tesserati']]} />
        )}
        <SceltaMultipla etichetta="Fratelli" valori={filtro.fratelli} onChange={set('fratelli')}
          opzioni={[['si', 'Con fratelli'], ['no', 'Senza fratelli']]} />
        <GruppiMultipli valori={filtro.gruppo} onChange={set('gruppo')}
          opzioni={[...groups.map((g) => [g._id, labelGruppo(g)]), ['nessuno', 'Senza gruppo'], ...(admin ? [['trasferiti', 'Trasferiti']] : [])]} />
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
                      {admin && !tr && <span className={`chip ${m.tesserato ? 'ok' : 'sib'}`}>{m.tesserato ? 'Tesserato' : 'Non tesserato'}</span>}
                      {tr ? (
                        <span className="chip sib">{m.parrocchiaTrasferimento} · {dataIt(m.dataTrasferimento)}</span>
                      ) : (
                        <span className={`chip ${m.iscritto ? 'ok' : m.nonIscritto ? 'no' : 'warn'}`}>
                          {m.iscritto ? `Iscritto · ${euro(m.quotaVersata)} il ${dataIt(m.dataVersamento)}` : m.nonIscritto ? 'Non iscritto' : 'Da completare'}
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