import { useState } from 'react';

// Barra dei filtri. Su schermi larghi è tutta in vista; su telefono resta visibile solo la ricerca
// e un pulsante "Filtri" (con il numero di filtri attivi) apre e chiude gli altri controlli.
export default function PannelloFiltri({ ricerca, badge = 0, onAzzera, children }) {
  const [aperto, setAperto] = useState(false);
  return (
    <div className="filtri-box">
      <div className="filtri-top">
        {ricerca}
        <button type="button" className="filtri-toggle" aria-expanded={aperto} aria-controls="pannello-filtri" onClick={() => setAperto(!aperto)}>
          Filtri {badge > 0 && <span className="badge">{badge}</span>}
          <span aria-hidden="true">{aperto ? '▴' : '▾'}</span>
        </button>
      </div>
      <div id="pannello-filtri" className={`filtri-pannello${aperto ? ' open' : ''}`}>
        {children}
        {onAzzera && <button type="button" className="ghost azzera" onClick={onAzzera}>Azzera filtri</button>}
      </div>
    </div>
  );
}