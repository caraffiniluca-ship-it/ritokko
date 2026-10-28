// Memoria: su iPhone Safari chiude (e ricarica) la pagina se usa troppa RAM, senza dare errori.
// Qui ci sono le regole per restare leggeri e il "registro" che capisce se l'ultima volta l'app si è chiusa.

export const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const CHIAVE_LEGGERA = 'ritokko-leggera';
const CHIAVE_ATTIVITA = 'ritokko-attivita';

export const modalitaLeggera = () => localStorage.getItem(CHIAVE_LEGGERA) === '1';
export function impostaModalitaLeggera(attiva) {
  if (attiva) localStorage.setItem(CHIAVE_LEGGERA, '1'); else localStorage.removeItem(CHIAVE_LEGGERA);
}

// Lato massimo delle foto in lavorazione. Instagram pubblica comunque a 1080 px.
export const latoLavoro = () => (modalitaLeggera() ? 1080 : IOS ? 1600 : 2048);

// Su iPhone la GPU (WebGPU) per l'AI pesa troppo insieme al resto: uso il processore (WASM), più parco di memoria.
export const usaWebGPU = () => 'gpu' in navigator && !IOS && !modalitaLeggera();

// Pre-analisi automatica della foto all'apertura di Rimuovi/Sfondo: comoda ma costosa, la salto in modalità leggera.
export const preanalisiAutomatica = () => !modalitaLeggera();

// Registro: segno l'operazione pesante prima di iniziarla e la cancello alla fine.
// Se all'avvio la trovo ancora, vuol dire che l'app si è chiusa a metà.
export function inizioAttivita(nome) {
  try { localStorage.setItem(CHIAVE_ATTIVITA, JSON.stringify({ nome, quando: Date.now() })); } catch { /* spazio pieno */ }
}
export function fineAttivita() { localStorage.removeItem(CHIAVE_ATTIVITA); }

export function chiusuraPrecedente() {
  const v = localStorage.getItem(CHIAVE_ATTIVITA);
  if (!v) return null;
  fineAttivita();
  try {
    const { nome, quando } = JSON.parse(v);
    return Date.now() - quando < 30 * 60 * 1000 ? nome : null; // conta solo se recente
  } catch { return null; }
}

// Svuota subito un canvas che non serve più (su Safari la memoria dei canvas torna libera solo così o molto più tardi).
export function liberaCanvas(...canvas) {
  for (const c of canvas) if (c && c.width !== undefined && !c.isConnected) { c.width = 0; c.height = 0; }
}

// Decodifica una foto già ridotta, senza mai tenere in memoria i 12-48 megapixel originali.
export async function decodificaRidotta(file, lato) {
  // file piccoli (sotto ~2 MB, quindi pochi megapixel): decodifica normale, così non li ingrandisco
  if (file.size < 2_000_000) return createImageBitmap(file);
  const opzioni = { resizeQuality: 'high' };
  try {
    // prima prova: limito la larghezza; se la foto è verticale ripeto limitando l'altezza
    let bmp = await createImageBitmap(file, { ...opzioni, resizeWidth: lato });
    if (bmp.height > bmp.width) {
      bmp.close?.();
      bmp = await createImageBitmap(file, { ...opzioni, resizeHeight: lato });
    }
    return bmp;
  } catch {
    // browser senza opzioni di ridimensionamento: decodifica normale
    return createImageBitmap(file);
  }
}
