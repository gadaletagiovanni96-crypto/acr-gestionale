import { useEffect, useRef, useState } from 'react';

// Riga di pulsanti in cui se ne possono accendere più di uno insieme.
// "Tutti" è acceso quando non c'è nessuna scelta; accenderle tutte equivale a "Tutti".
// valori: array dei valori scelti · opzioni: [[valore, etichetta], ...] (senza "Tutti")
export function SceltaMultipla({ valori, onChange, opzioni, etichetta }) {
  const cambia = (v) => {
    const nuovi = valori.includes(v) ? valori.filter((x) => x !== v) : [...valori, v];
    onChange(nuovi.length === opzioni.length ? [] : nuovi);
  };
  return (
    <div className="segmented" role="group" aria-label={etichetta}>
      <button type="button" className={valori.length ? '' : 'on'} aria-pressed={!valori.length} onClick={() => onChange([])}>Tutti</button>
      {opzioni.map(([v, l]) => (
        <button key={v} type="button" className={valori.includes(v) ? 'on' : ''} aria-pressed={valori.includes(v)} onClick={() => cambia(v)}>{l}</button>
      ))}
    </div>
  );
}

// Menu a tendina con le caselle dei gruppi: se ne possono scegliere più di uno.
export function GruppiMultipli({ valori, onChange, opzioni }) {
  const [aperto, setAperto] = useState(false);
  const rif = useRef(null);

  useEffect(() => {
    if (!aperto) return undefined;
    const fuori = (e) => { if (rif.current && !rif.current.contains(e.target)) setAperto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAperto(false); };
    document.addEventListener('mousedown', fuori);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc); };
  }, [aperto]);

  const scelti = opzioni.filter(([v]) => valori.includes(v));
  const testo = !scelti.length ? 'Tutti i gruppi' : scelti.length === 1 ? scelti[0][1] : `${scelti.length} gruppi scelti`;
  const cambia = (v) => onChange(valori.includes(v) ? valori.filter((x) => x !== v) : [...valori, v]);

  return (
    <div className="menu-tendina gruppi-multipli" ref={rif}>
      <button type="button" className="ghost" aria-haspopup="true" aria-expanded={aperto} onClick={() => setAperto(!aperto)}>
        {testo} <span aria-hidden="true">▾</span>
      </button>
      {aperto && (
        <div className="menu-lista caselle">
          <label className="check"><input type="checkbox" checked={!valori.length} onChange={() => onChange([])} />Tutti i gruppi</label>
          {opzioni.map(([v, l]) => (
            <label className="check" key={v}><input type="checkbox" checked={valori.includes(v)} onChange={() => cambia(v)} />{l}</label>
          ))}
        </div>
      )}
    </div>
  );
}
