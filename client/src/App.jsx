import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Members from './pages/Members.jsx';
import MemberForm from './pages/MemberForm.jsx';
import Groups from './pages/Groups.jsx';
import Users from './pages/Users.jsx';
import Anno from './pages/Anno.jsx';
import Contabilita from './pages/Contabilita.jsx';
import Evento from './pages/Evento.jsx';

function Layout() {
  const { user, logout } = useAuth();
  const [aperto, setAperto] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setAperto(false), [pathname]); // chiude il menu quando si cambia pagina

  return (
    <>
      <header className="top">
        <div className="brand"><img src="/logo.png" alt="Logo" className="nav-logo" />ACR Sant'Achille · Molfetta</div>
        <button className="menu-btn" aria-label="Apri il menu" aria-expanded={aperto} aria-controls="menu" onClick={() => setAperto(!aperto)}>
          <span /><span /><span />
        </button>
        <div id="menu" className={`menu${aperto ? ' open' : ''}`}>
          <nav>
            <NavLink to="/" end>Ragazzi</NavLink>
            <NavLink to="/iscritti/nuovo">Nuova iscrizione</NavLink>
            {user.ruolo === 'admin' && <NavLink to="/gruppi">Gruppi</NavLink>}
            {user.ruolo === 'admin' && <NavLink to="/educatori">Educatori & Account</NavLink>}
            {user.ruolo === 'admin' && <NavLink to="/anno">Nuovo anno</NavLink>}
            {user.ruolo === 'admin' && <NavLink to="/contabilita">Contabilità</NavLink>}
          </nav>
          <div className="who">
            <span>{user.nome} {user.cognome} <small>({user.ruolo})</small></span>
            <button className="ghost" onClick={logout}>Esci</button>
          </div>
        </div>
      </header>
      <main><Outlet /></main>
    </>
  );
}

function Private({ admin }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.ruolo !== 'admin') return <Navigate to="/" replace />;
  return admin ? <Outlet /> : <Layout />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Private />}>
        <Route path="/" element={<Members />} />
        <Route path="/iscritti/nuovo" element={<MemberForm />} />
        <Route path="/iscritti/:id" element={<MemberForm />} />
        <Route element={<Private admin />}>
          <Route path="/gruppi" element={<Groups />} />
          <Route path="/educatori" element={<Users />} />
          <Route path="/anno" element={<Anno />} />
          <Route path="/contabilita" element={<Contabilita />} />
          <Route path="/contabilita/:id" element={<Evento />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
