import { useEffect, useState } from 'react';
import { api } from './api';

// Impostazioni scelte dall'admin nella pagina "Nuovo anno".
// Vale null finché il server non ha risposto; poi { iscrizioniAperte, annoAssociativo }.
export function useImpostazioni(ricarica) {
  const [imp, setImp] = useState(null);
  useEffect(() => {
    api.get('/settings').then(setImp).catch(() => setImp({ iscrizioniAperte: true, annoAssociativo: '' }));
  }, [ricarica]);
  return imp;
}