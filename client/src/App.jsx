import { Routes, Route, Navigate, Outlet, NavLink } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Members from './pages/Members.jsx';
import MemberForm from './pages/MemberForm.jsx';
import Groups from './pages/Groups.jsx';
import Users from './pages/Users.jsx';
import Anno from './pages/Anno.jsx';

function Layout() {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="top">
        <div className="brand"><span className="mark" />ACR Sant'Achille · Molfetta</div>
        <nav>
          <NavLink to="/" end>Ragazzi</NavLink>
          <NavLink to="/iscritti/nuovo">Nuova iscrizione</NavLink>
          {user.ruolo === 'admin' && <NavLink to="/gruppi">Gruppi</NavLink>}
          {user.ruolo === 'admin' && <NavLink to="/educatori">Account</NavLink>}
          {user.ruolo === 'admin' && <NavLink to="/anno">Nuovo anno</NavLink>}
        </nav>
        <div className="who">
          <span>{user.nome} {user.cognome} <small>({user.ruolo})</small></span>
          <button className="ghost" onClick={logout}>Esci</button>
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
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
