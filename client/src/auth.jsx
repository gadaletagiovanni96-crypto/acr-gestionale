import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api.get('/auth/me').then(setUser).catch(() => localStorage.removeItem('acr_token')).finally(() => setLoading(false));
  }, []);

  const login = async (email, password, ruolo) => {
    const r = await api.post('/auth/login', { email, password, ruolo });
    localStorage.setItem('acr_token', r.token);
    setUser(r.user);
  };
  const logout = () => { localStorage.removeItem('acr_token'); sessionStorage.removeItem('acr_filtri_ragazzi'); setUser(null); };

  if (loading) return <p className="boot">Caricamento…</p>;
  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}
