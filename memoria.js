// Memoria: su iPhone Safari chiude (e ricarica) la pagina se usa troppa RAM, senza dare errori.
// Qui ci sono le regole per restare leggeri e il "registro" che capisce se l'ultima volta l'app si è chiusa.

export const VERSIONE_APP = '1.4.1';

export const IOS =/iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const CHIAVE_LEGGERA = 'ritokko-leggera';
const CHIAVE_ATTIVITA = 'ritokko-attivita';

export const modalitaLeggera = () => localStorage.getItem(CHIAVE_LEGGERA) === '1';
export function impostaModalitaLeggera(attiva) {
  if (attiva) localStorage.setItem(CHIAVE_LEGGERA, '1'); else localStorage.removeItem(CHIAVE_LEGGERA);
}

// Lato massimo delle foto in lavorazione. Instagram pubblica comunque a 1080 px.
export const latoLavoro = () => (modalitaLeggera() ? 1080 : IOS ? 1280 : 2048);

// Su iPhone la GPU (WebGPU) per l'AI pesa troppo insieme al resto: uso il processore (WASM), più parco di memoria.
export const usaWebGPU = () => 'gpu' in navigator && !IOS && !modalitaLeggera();

// Pre-analisi automatica della foto all'apertura di Rimuovi/Sfondo: comoda ma costosa. Su iPhone la faccio solo al tocco.
export const preanalisiAutomatica = () => !IOS && !modalitaLeggera();

// ---------- Diagnostica ----------
// Traccia circolare degli ultimi eventi, salvata subito: se Safari chiude la pagina, alla riapertura la rileggo.
const CHIAVE_TRACCIA = 'ritokko-traccia';
const CHIAVE_SESSIONE = 'ritokko-sessione';
const MAX_EVENTI = 60;

export function traccia(evento) {
  try {
    const lista = JSON.parse(localStorage.getItem(CHIAVE_TRACCIA) || '[]');
    const ora = new Date();
    lista.push(`${ora.toLocaleTimeString('it-IT')}.${String(ora.getMilliseconds()).padStart(3, '0')} ${evento}`);
    localStorage.setItem(CHIAVE_TRACCIA, JSON.stringify(lista.slice(-MAX_EVENTI)));
  } catch { /* spazio pieno: pazienza */ }
}
export const leggiTraccia = () => JSON.parse(localStorage.getItem(CHIAVE_TRACCIA) || '[]');

export function infoDispositivo() {
  return [
    `Ritokko ${VERSIONE_APP} su ${navigator.userAgent}`,
    `schermo ${screen.width}×${screen.height} @${devicePixelRatio}x, app installata: ${matchMedia('(display-mode: standalone)').matches ? 'sì' : 'no'}`,
    `WebGPU: ${'gpu' in navigator ? 'sì' : 'no'}, memoria dichiarata: ${navigator.deviceMemory ?? '?'} GB, modalità leggera: ${modalitaLeggera() ? 'sì' : 'no'}`,
  ].join('\n');
}

// Sessione: "aperta" finché la pagina è visibile. Se la pagina viene chiusa da Safari per un crash,
// pagehide/visibilitychange non arrivano e alla riapertura la trovo ancora "aperta".
export function avviaSessione() {
  const precedente = localStorage.getItem(CHIAVE_SESSIONE);
  const segna = stato => { try { localStorage.setItem(CHIAVE_SESSIONE, stato); } catch { /* */ } };
  segna('aperta');
  document.addEventListener('visibilitychange', () => segna(document.visibilityState === 'hidden' ? 'chiusa' : 'aperta'));
  addEventListener('pagehide', () => segna('chiusa'));
  return precedente === 'aperta'; // true = l'ultima sessione è finita di colpo
}

// Registro: segno l'operazione pesante prima di iniziarla e la cancello alla fine.
// Se all'avvio la trovo ancora, vuol dire che l'app si è chiusa a metà.
export function inizioAttivita(nome) {
  traccia(`inizio: ${nome}`);
  try { localStorage.setItem(CHIAVE_ATTIVITA, JSON.stringify({ nome, quando: Date.now() })); } catch { /* spazio pieno */ }
}
export function fineAttivita() {
  if (localStorage.getItem(CHIAVE_ATTIVITA)) traccia('fine operazione');
  localStorage.removeItem(CHIAVE_ATTIVITA);
}

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
  try {
    // una sola decodifica, limitando la larghezza: se la foto è verticale resta un po' più alta di "lato",
    // e la riduzione finale la fa chi chiama (decodificare due volte costerebbe il doppio della memoria)
    return await createImageBitmap(file, { resizeQuality: 'high', resizeWidth: lato });
  } catch {
    // browser senza opzioni di ridimensionamento: decodifica normale
    return createImageBitmap(file);
  }
}
