export const getToken = () => localStorage.getItem('acr_token');

async function request(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && !url.startsWith('/auth/login')) {
    localStorage.removeItem('acr_token');
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(data?.message || 'Errore di comunicazione con il server');
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b || {}),
  put: (u, b) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
};

export const eta = (d) => {
  if (!d) return '';
  const n = new Date(d), t = new Date();
  let a = t.getFullYear() - n.getFullYear();
  if (t < new Date(t.getFullYear(), n.getMonth(), n.getDate())) a--;
  return a;
};
export const dataIt = (d) => (d ? new Date(d).toLocaleDateString('it-IT') : '');
export const euro = (n) => Number(n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

// "III elementare - Giovanni e Giorgia"
export const labelGruppo = (g) => {
  const n = (g.educatori || []).map((e) => e.nome);
  const edu = n.length > 1 ? `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}` : n[0] || '';
  return edu ? `${g.nome} - ${edu}` : g.nome;
};

// Scarica il PDF degli elenchi con gli stessi filtri della pagina
export async function scaricaPdf(filtro) {
  const p = new URLSearchParams();
  Object.entries(filtro).forEach(([k, v]) => v && p.set(k, v));
  const res = await fetch('/api/members/pdf?' + p, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.message || 'Impossibile creare il PDF');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'elenco-ragazzi-acr-sant-achille.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

export async function scaricaExcel(filtro) {
  const p = new URLSearchParams();
  Object.entries(filtro).forEach(([k, v]) => v && p.set(k, v));
  const res = await fetch('/api/members/xlsx?' + p, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.message || 'Impossibile creare il foglio Excel');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'elenco-ragazzi-acr-sant-achille.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export async function scarica(percorso, nomePredefinito) {
  const res = await fetch('/api' + percorso, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.message || 'Impossibile creare il file');
  }
  const nome = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || nomePredefinito;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
