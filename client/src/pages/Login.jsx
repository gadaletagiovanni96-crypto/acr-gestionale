import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [ruolo, setRuolo] = useState('educatore');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(email, password, ruolo); } catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <div className="login">
      <section className="login-side">
        <img src="/logo.png" alt="Logo ACR" className="login-logo" />
        <h1>ACR Parrocchia Sant'Achille</h1>
        <p>Molfetta · iscrizioni, gruppi e quote dei ragazzi in un posto solo.</p>
      </section>
      <form className="login-form" onSubmit={submit}>
        <h2>Accedi</h2>
        <div className="segmented" role="radiogroup" aria-label="Tipo di account">
          {['educatore', 'admin'].map((r) => (
            <button type="button" key={r} className={ruolo === r ? 'on' : ''} onClick={() => setRuolo(r)} role="radio" aria-checked={ruolo === r}>
              {r === 'admin' ? 'Admin' : 'Educatore'}
            </button>
          ))}
        </div>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Accesso in corso…' : 'Entra'}</button>
      </form>
    </div>
  );
}
