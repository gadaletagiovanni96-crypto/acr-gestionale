import { useState } from 'react';

// Un filtro con il suo titolo (solo nella barra "nuova", quella del parroco)
export function Filtro({ titolo, children }) {
  return (
    <div className="filtro">
      <span className="filtro-titolo">{titolo}</span>
      {children}
    </div>
  );
}

// Barra dei filtri. Su schermi larghi è tutta in vista; su telefono resta visibile solo la ricerca
// e un pulsante "Filtri" (con il numero di filtri attivi) apre e chiude gli altri controlli.
// nuovo = barra del parroco: un riquadro con la ricerca in alto e i filtri con il titolo, separati da linee.
export default function PannelloFiltri({ ricerca, badge = 0, onAzzera, nuovo = false, children }) {
  const [aperto, setAperto] = useState(false);
  const azzera = onAzzera && <button type="button" className="ghost azzera" onClick={onAzzera}>Azzera filtri</button>;
  return (
    <div className={`filtri-box${nuovo ? ' nuovo' : ''}`}>
      <div className="filtri-top">
        {ricerca}
        {nuovo && onAzzera && <button type="button" className="ghost azzera-alto" onClick={onAzzera}>Azzera filtri</button>}
        <button type="button" className="filtri-toggle" aria-expanded={aperto} aria-controls="pannello-filtri" onClick={() => setAperto(!aperto)}>
          Filtri {badge > 0 && <span className="badge">{badge}</span>}
          <span aria-hidden="true">{aperto ? '▴' : '▾'}</span>
        </button>
      </div>
      <div id="pannello-filtri" className={`filtri-pannello${aperto ? ' open' : ''}`}>
        {nuovo ? <div className="filtri-gruppi">{children}</div> : children}
        {azzera}
      </div>
    </div>
  );
}
