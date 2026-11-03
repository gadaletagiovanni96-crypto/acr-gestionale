import { useEffect, useRef, useState } from 'react';

// Pulsante con un piccolo menu a tendina.
// voci: [{ etichetta: 'Testo della voce', azione: () => ... }]
export default function MenuTendina({ etichetta, disabilitato, voci }) {
  const [aperto, setAperto] = useState(false);
  const rif = useRef(null);

  // Si chiude toccando fuori dal menu o premendo Esc
  useEffect(() => {
    if (!aperto) return undefined;
    const fuori = (e) => { if (rif.current && !rif.current.contains(e.target)) setAperto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAperto(false); };
    document.addEventListener('mousedown', fuori);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc); };
  }, [aperto]);

  return (
    <div className="menu-tendina" ref={rif}>
      <button type="button" className="ghost" aria-haspopup="menu" aria-expanded={aperto} disabled={disabilitato} onClick={() => setAperto(!aperto)}>
        {etichetta} <span aria-hidden="true">▾</span>
      </button>
      {aperto && (
        <div className="menu-lista" role="menu">
          {voci.map((v) => (
            <button key={v.etichetta} type="button" role="menuitem" onClick={() => { setAperto(false); v.azione(); }}>{v.etichetta}</button>
          ))}
        </div>
      )}
    </div>
  );
}