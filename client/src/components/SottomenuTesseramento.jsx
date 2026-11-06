import { NavLink } from 'react-router-dom';

// Sottomenu delle pagine del tesseramento
export default function SottomenuTesseramento() {
  return (
    <nav className="sottomenu" aria-label="Sezioni del tesseramento">
      <NavLink to="/tesseramento" end>Tessere per gruppo</NavLink>
      <NavLink to="/tesseramento/contabilita">Contabilità tessere</NavLink>
    </nav>
  );
}
