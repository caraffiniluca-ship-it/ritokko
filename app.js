import { Renderer, PARAMETRI_ZERO, CURSORI_LUCE, CURSORI_MIGLIORA, PRESET, autoMigliora } from './gl.js';
import { EditorVideo, FORMATI, VELOCITA } from './video.js';
import { EFFETTI_SFONDO, componiSfondo, FORMATI_FOTO, ritaglia } from './sfondo.js';
import { STILI_SOTTOTITOLI } from './sottotitoli.js';
import {
  IOS, latoLavoro, modalitaLeggera, impostaModalitaLeggera, preanalisiAutomatica,
  inizioAttivita, fineAttivita, chiusuraPrecedente, liberaCanvas, decodificaRidotta,
} from './memoria.js';

const $ = sel => document.querySelector(sel);
const PASSI_ANNULLA = IOS ? 5 : 10; // ogni passo è una copia della foto in memoria
const token = () => localStorage.getItem('token-hf') || '';

// ---------- utilità ----------
function mostraStato(testo, avanzamento) {
  $('#stato').hidden = false;
  $('#stato-testo').textContent = testo;
  const barra = $('#stato-barra');
  barra.hidden = false;
  if (avanzamento == null) barra.removeAttribute('value'); else barra.value = avanzamento;
  $('#stato').querySelector('.scelte')?.remove();
}
const nascondiStato = () => { $('#stato').hidden = true; };

function mostraScelta(testo, scelte) {
  mostraStato(testo, 1);
  $('#stato-barra').hidden = true;
  const riga = document.createElement('div');
  riga.className = 'riga scelte';
  for (const { etichetta, primario, azione } of scelte) {
    const b = document.createElement('button');
    b.textContent = etichetta;
    b.className = primario ? 'primario' : 'secondario';
    b.onclick = async () => { riga.remove(); $('#stato-barra').hidden = false; nascondiStato(); await azione?.(); };
    riga.append(b);
  }
  $('.carta-stato').append(riga);
}

const avviso = testo => mostraScelta(testo, [{ etichetta: 'OK', primario: true }]);

function copiaCanvas(sorgente, l = sorgente.width, a = sorgente.height) {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = a;
  c.getContext('2d').drawImage(sorgente, 0, 0, l, a);
  return c;
}

const inJpeg = (canvas, nome = `ritokko-${Date.now()}.jpg`) =>
  new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.93)).then(b => new File([b], nome, { type: 'image/jpeg' }));

async function condividi(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.name === 'NotAllowedError') {
        // Safari chiede un tocco recente: offro un pulsante
        mostraScelta('Pronto!', [{ etichetta: 'Condividi', primario: true, azione: () => navigator.share({ files: [file] }).catch(() => {}) },
                                 { etichetta: 'Chiudi' }]);
        return;
      }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}

// Adatta un contenitore (con canvas al 100%) allo spazio dell'area, mantenendo le proporzioni.
function adatta(contenitore, area, l, a) {
  const r = area.getBoundingClientRect();
  const s = Math.min((r.width - 16) / l, (r.height - 16) / a);
  if (!(s > 0)) return;
  contenitore.style.width = `${Math.floor(l * s)}px`;
  contenitore.style.height = `${Math.floor(a * s)}px`;
}

// riempimento a gradiente dei cursori (variabile CSS --p)
function riempi(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', `${p}%`);
}
document.addEventListener('input', e => { if (e.target.type === 'range') riempi(e.target); });
const riempiTutti = () => document.querySelectorAll('input[type=range]').forEach(riempi);

function costruisciCursori(contenitore, definizioni, oggetto, suCambio) {
  contenitore.innerHTML = '';
  const campi = {};
  for (const d of definizioni) {
    const etichetta = document.createElement('label');
    etichetta.className = 'cursore';
    etichetta.innerHTML = `${d.etichetta} <output></output><input type="range" min="${d.min}" max="${d.max}" step="${d.passo}">`;
    const input = etichetta.querySelector('input');
    const out = etichetta.querySelector('output');
    input.addEventListener('input', () => {
      oggetto[d.chiave] = Number(input.value);
      out.textContent = Math.round(input.value * 100);
      suCambio();
    });
    input.addEventListener('dblclick', () => { input.value = 0; input.dispatchEvent(new Event('input')); });
    campi[d.chiave] = { input, out };
    contenitore.append(etichetta);
  }
  return () => {
    for (const [k, { input, out }] of Object.entries(campi)) {
      input.value = oggetto[k] ?? 0;
      out.textContent = Math.round((oggetto[k] ?? 0) * 100);
      riempi(input);
    }
  };
}

function costruisciChip(contenitore, voci, attiva, suScelta) {
  contenitore.innerHTML = '';
  for (const voce of voci) {
    const b = document.createElement('button');
    b.textContent = voce;
    b.classList.toggle('attivo', voce === attiva);
    b.onclick = () => {
      contenitore.querySelectorAll('button').forEach(x => x.classList.toggle('attivo', x === b));
      suScelta(voce);
    };
    contenitore.append(b);
  }
}

// ---------- FOTO ----------
const canvasFoto = $('#canvas-foto');
const canvasMaschera = $('#canvas-maschera');
const palco = $('#palco');
const foto = { base: null, originale: null, storia: [], parametri: { ...PARAMETRI_ZERO }, strumento: null };
let rendererFoto;

function ridisegnaFoto(parametri = foto.parametri) { rendererFoto?.disegna(parametri); }

function adattaPalco() { if (foto.base) adatta(palco, $('#area-foto'), foto.base.width, foto.base.height); }
new ResizeObserver(adattaPalco).observe($('#area-foto'));

// Mostra una sorgente (base o anteprima) adattando le misure dei canvas se servono.
function mostraSorgente(sorgente) {
  if (canvasFoto.width !== sorgente.width || canvasFoto.height !== sorgente.height) {
    for (const c of [canvasFoto, canvasMaschera]) { c.width = sorgente.width; c.height = sorgente.height; }
    pulisciMaschera();
    adatta(palco, $('#area-foto'), sorgente.width, sorgente.height);
  }
  rendererFoto.impostaSorgente(sorgente, sorgente.width, sorgente.height);
  ridisegnaFoto();
}

function impostaBase(nuova, salvaStoria = true) {
  if (salvaStoria && foto.base) {
    foto.storia.push(foto.base);
    if (foto.storia.length > PASSI_ANNULLA) {
      const vecchia = foto.storia.shift();
      if (vecchia !== foto.originale && vecchia !== formato.prima) liberaCanvas(vecchia);
    }
  }
  foto.base = nuova;
  mostraSorgente(nuova);
  avviaPreanalisi();
}

async function caricaFoto(file) {
  if (!file) return;
  mostraStato('Apro la foto…');
  inizioAttivita('apertura della foto');
  try {
    const lato = latoLavoro();
    const bitmap = await decodificaRidotta(file, lato);
    const s = Math.min(1, lato / Math.max(bitmap.width, bitmap.height));
    const base = copiaCanvas(bitmap, Math.round(bitmap.width * s), Math.round(bitmap.height * s));
    bitmap.close?.();
    if (!rendererFoto) rendererFoto = new Renderer(canvasFoto);
    // libero la foto precedente e i suoi passi di "annulla"
    liberaCanvas(foto.originale, ...foto.storia, sfondo.soggetto, sfondo.anteprima);
    if (foto.base !== null) liberaCanvas(foto.base);
    sfondo.anteprima = null;
    foto.originale = base;
    foto.storia = [];
    foto.base = null;
    sfondo.soggetto = null;
    Object.assign(foto.parametri, PARAMETRI_ZERO);
    aggiornaCursoriLuce();
    aggiornaCursoriMigliora();
    costruisciChip($('#preset-foto'), Object.keys(PRESET), 'Naturale', applicaPresetFoto);
    $('#vuoto-foto').hidden = true;
    palco.hidden = false;
    $('#barra-foto').hidden = false;
    $('#azioni-foto').hidden = false;
    impostaBase(copiaCanvas(base), false);
    pulisciMaschera();
    adattaPalco();
    nascondiStato();
  } catch (e) {
    console.error(e);
    avviso('Non riesco ad aprire questa foto.');
  } finally {
    fineAttivita();
  }
}

for (const id of ['#file-foto', '#file-foto-2']) {
  $(id).addEventListener('change', e => { caricaFoto(e.target.files[0]); e.target.value = ''; });
}

const STRUMENTI = ['rimuovi', 'sfondo', 'luce', 'migliora', 'chiedi', 'formato'];
function scegliStrumento(nome) {
  const precedente = foto.strumento;
  foto.strumento = foto.strumento === nome ? null : nome;
  if (precedente === 'sfondo' && foto.strumento !== 'sfondo') annullaSfondo();
  if (foto.strumento === 'formato') apriFormato();
  for (const p of STRUMENTI) $(`#pannello-${p}`).hidden = foto.strumento !== p;
  document.querySelectorAll('#barra-foto [data-strumento]').forEach(b => b.classList.toggle('attivo', b.dataset.strumento === foto.strumento));
  $('#btn-formato').classList.toggle('attivo', foto.strumento === 'formato');
  palco.classList.toggle('disegno', foto.strumento === 'rimuovi' || foto.strumento === 'sfondo');
  avviaPreanalisi();
}
document.querySelectorAll('#barra-foto [data-strumento]').forEach(b => { b.onclick = () => scegliStrumento(b.dataset.strumento); });
$('#btn-formato').onclick = () => scegliStrumento('formato');

$('#btn-annulla').onclick = () => {
  const precedente = foto.storia.pop();
  if (precedente) impostaBase(precedente, false);
};

const confronta = $('#btn-confronta');
const etichettaPrima = $('.etichetta-prima');
confronta.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!foto.originale) return;
  rendererFoto.impostaSorgente(foto.originale, foto.originale.width, foto.originale.height);
  ridisegnaFoto(PARAMETRI_ZERO);
  etichettaPrima.hidden = false;
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  confronta.addEventListener(ev, () => {
    if (etichettaPrima.hidden) return;
    etichettaPrima.hidden = true;
    mostraSorgente(sfondo.anteprima ?? foto.base);
  });
}

// --- Selezione intelligente (SlimSAM): usata da Rimuovi (tocca) e da Sfondo ---
const ctxMaschera = canvasMaschera.getContext('2d');
const COLORE_MASCHERA = '#ff2d55';
let mascheraVuota = true;
let ultimoPunto = null;
let inizioTocco = null;
let modoSelezione = 'tocca';

function pulisciMaschera() {
  ctxMaschera.clearRect(0, 0, canvasMaschera.width, canvasMaschera.height);
  mascheraVuota = true;
  $('#btn-esegui-rimuovi').disabled = true;
}

const AIUTO_TOCCA = 'Tocca la persona o l\'oggetto: lo seleziono io. Puoi toccarne più di uno.';
const AIUTO_PENNELLO = 'Passa il dito su ciò che vuoi togliere: persone, oggetti, scritte.';
const AIUTO_SFONDO = 'Tocca il soggetto da tenere: una persona, un prodotto, un animale.';

function scegliModoSelezione(modo) {
  modoSelezione = modo;
  document.querySelectorAll('#modo-selezione button').forEach(b => b.classList.toggle('attivo', b.dataset.modo === modo));
  $('#riga-pennello').hidden = modo !== 'pennello';
  $('#aiuto-rimuovi').textContent = modo === 'tocca' ? AIUTO_TOCCA : AIUTO_PENNELLO;
  avviaPreanalisi();
}
document.querySelectorAll('#modo-selezione button').forEach(b => { b.onclick = () => scegliModoSelezione(b.dataset.modo); });

const usaTocco = () => foto.strumento === 'sfondo' || (foto.strumento === 'rimuovi' && modoSelezione === 'tocca');
const aiutoAttivo = () => (foto.strumento === 'sfondo' ? $('#aiuto-sfondo') : $('#aiuto-rimuovi'));
const testoAiuto = () => (foto.strumento === 'sfondo' ? AIUTO_SFONDO : AIUTO_TOCCA);

// Appena apri "Rimuovi" o "Sfondo" l'AI analizza la foto in sottofondo: al tocco la selezione è quasi immediata.
let analisiPronta = null;
function avviaPreanalisi() {
  const base = foto.base;
  if (!base || !usaTocco() || analisiPronta === base || !preanalisiAutomatica()) return;
  const aiuto = aiutoAttivo();
  aiuto.textContent = 'Preparo la selezione intelligente…';
  inizioAttivita('preparazione della selezione intelligente');
  import('./seleziona.js')
    .then(({ preanalizza }) => preanalizza(base, {
      suAvanzamento: v => { aiuto.textContent = `Scarico l'AI di selezione (14 MB, solo la prima volta)… ${Math.round(v * 100)}%`; },
    }))
    .then(() => { if (foto.base === base) analisiPronta = base; })
    .catch(e => console.warn('Pre-analisi non riuscita', e))
    .finally(() => { fineAttivita(); if (usaTocco()) aiutoAttivo().textContent = testoAiuto(); });
}

function puntoImmagine(e) {
  const r = canvasMaschera.getBoundingClientRect();
  const s = canvasMaschera.width / r.width;
  return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s, s, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
}

canvasMaschera.addEventListener('pointerdown', e => {
  canvasMaschera.setPointerCapture(e.pointerId);
  if (usaTocco()) { inizioTocco = { x: e.clientX, y: e.clientY }; return; }
  ultimoPunto = puntoImmagine(e);
  tratto(ultimoPunto);
});
canvasMaschera.addEventListener('pointermove', e => {
  if (!ultimoPunto) return;
  const p = puntoImmagine(e);
  tratto(p);
  ultimoPunto = p;
});
canvasMaschera.addEventListener('pointerup', e => {
  ultimoPunto = null;
  if (usaTocco() && inizioTocco && Math.hypot(e.clientX - inizioTocco.x, e.clientY - inizioTocco.y) < 12) {
    selezionaQui(e);
  }
  inizioTocco = null;
});
canvasMaschera.addEventListener('pointercancel', () => { ultimoPunto = null; inizioTocco = null; });

function onda(e) {
  const r = palco.getBoundingClientRect();
  const o = document.createElement('span');
  o.className = 'onda';
  o.style.left = `${e.clientX - r.left}px`;
  o.style.top = `${e.clientY - r.top}px`;
  palco.append(o);
  return o;
}

let selezioneInCorso = false;
async function selezionaQui(e) {
  if (selezioneInCorso) return;
  selezioneInCorso = true;
  const p = puntoImmagine(e);
  const segno = onda(e);
  const strumento = foto.strumento;
  inizioAttivita('selezione con un tocco');
  try {
    const { selezionaConTocco } = await import('./seleziona.js');
    if (analisiPronta !== foto.base) mostraStato('Analizzo la foto (solo al primo tocco)…');
    const { maschera, copertura } = await selezionaConTocco(foto.base, p.fx, p.fy, {
      suAvanzamento: v => mostraStato(`Scarico l'AI di selezione (14 MB, solo la prima volta)… ${Math.round(v * 100)}%`, v),
    });
    analisiPronta = foto.base;
    nascondiStato();
    if (copertura > 0.85 || (strumento === 'rimuovi' && copertura > 0.7)) {
      return avviso('Ho selezionato quasi tutta la foto: tocca più al centro del soggetto.');
    }
    if (copertura < 0.0003) return avviso('Non ho trovato niente da selezionare in quel punto: riprova.');
    if (strumento === 'sfondo') aggiungiSoggetto(maschera);
    else aggiungiAllaMaschera(maschera);
  } catch (err) {
    console.error(err);
    avviso(`Selezione non riuscita: ${err.message}`);
  } finally {
    fineAttivita();
    segno.remove();
    selezioneInCorso = false;
  }
}

// --- Rimuovi ---
// Colora la selezione e la allarga un po' (bordi, capelli, ombre) prima di unirla alla maschera.
function aggiungiAllaMaschera(selezione) {
  const L = canvasMaschera.width;
  const A = canvasMaschera.height;
  const colorata = copiaCanvas(selezione, L, A);
  const cc = colorata.getContext('2d');
  cc.globalCompositeOperation = 'source-in';
  cc.fillStyle = COLORE_MASCHERA;
  cc.fillRect(0, 0, L, A);
  const d = Math.max(3, Math.round(Math.max(L, A) * 0.008));
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctxMaschera.drawImage(colorata, Math.round(Math.cos(a) * d), Math.round(Math.sin(a) * d));
  }
  ctxMaschera.drawImage(colorata, 0, 0);
  mascheraVuota = false;
  $('#btn-esegui-rimuovi').disabled = false;
}

function tratto(p) {
  const spessore = Number($('#pennello').value) * p.s;
  ctxMaschera.strokeStyle = ctxMaschera.fillStyle = COLORE_MASCHERA;
  ctxMaschera.lineWidth = spessore;
  ctxMaschera.lineCap = ctxMaschera.lineJoin = 'round';
  ctxMaschera.beginPath();
  ctxMaschera.moveTo(ultimoPunto.x, ultimoPunto.y);
  ctxMaschera.lineTo(p.x + 0.01, p.y);
  ctxMaschera.stroke();
  mascheraVuota = false;
  $('#btn-esegui-rimuovi').disabled = false;
}

$('#btn-pulisci-maschera').onclick = pulisciMaschera;
$('#btn-esegui-rimuovi').onclick = async () => {
  if (mascheraVuota) return;
  mostraStato('Preparo la gomma magica…');
  inizioAttivita('cancellazione con la gomma magica');
  try {
    const { rimuovi } = await import('./inpaint.js');
    const risultato = await rimuovi(foto.base, canvasMaschera, p => mostraStato(`Scarico il modello (28 MB, solo la prima volta)… ${Math.round(p * 100)}%`, p));
    impostaBase(risultato);
    pulisciMaschera();
    nascondiStato();
  } catch (e) {
    console.error(e);
    avviso(`Rimozione non riuscita: ${e.message}`);
  } finally {
    fineAttivita();
  }
};

// --- Sfondo: tieni il soggetto, cambia il resto ---
const sfondo = { soggetto: null, effetto: 'Sfocato', anteprima: null };

function aggiungiSoggetto(maschera) {
  if (!sfondo.soggetto) sfondo.soggetto = copiaCanvas(maschera, foto.base.width, foto.base.height);
  else sfondo.soggetto.getContext('2d').drawImage(maschera, 0, 0, foto.base.width, foto.base.height);
  aggiornaAnteprimaSfondo();
}

let attesaAnteprima = 0;
function aggiornaAnteprimaSfondo() {
  clearTimeout(attesaAnteprima);
  attesaAnteprima = setTimeout(() => {
    if (!sfondo.soggetto || !foto.base) return;
    const vecchia = sfondo.anteprima;
    inizioAttivita('anteprima dello sfondo');
    try {
      sfondo.anteprima = componiSfondo(foto.base, sfondo.soggetto, sfondo.effetto, Number($('#sfocatura').value));
    } finally {
      fineAttivita();
    }
    liberaCanvas(vecchia);
    mostraSorgente(sfondo.anteprima);
    $('#btn-sfondo-applica').disabled = false;
  }, 30);
}

function annullaSfondo() {
  liberaCanvas(sfondo.soggetto, sfondo.anteprima);
  sfondo.soggetto = null;
  sfondo.anteprima = null;
  $('#btn-sfondo-applica').disabled = true;
  if (foto.base) mostraSorgente(foto.base);
}

costruisciChip($('#effetti-sfondo'), EFFETTI_SFONDO, sfondo.effetto, e => {
  sfondo.effetto = e;
  $('#riga-sfocatura').hidden = e !== 'Sfocato';
  aggiornaAnteprimaSfondo();
});
$('#sfocatura').addEventListener('input', aggiornaAnteprimaSfondo);
$('#btn-sfondo-annulla').onclick = annullaSfondo;
$('#btn-sfondo-applica').onclick = () => {
  if (!sfondo.anteprima) return;
  const nuova = sfondo.anteprima;
  sfondo.soggetto = null;
  sfondo.anteprima = null;
  $('#btn-sfondo-applica').disabled = true;
  impostaBase(nuova);
};

// --- Formato per i social (ritaglio) ---
const formato = { prima: null, nome: 'Originale', salvato: false };
function apriFormato() {
  formato.prima = foto.base;
  formato.nome = 'Originale';
  formato.salvato = false;
  $('#posizione-foto').value = 0.5;
  $('#riga-pos-foto').hidden = true;
  costruisciChip($('#formati-foto'), Object.keys(FORMATI_FOTO), 'Originale', nome => { formato.nome = nome; applicaFormato(); });
}
function applicaFormato() {
  const rapporto = FORMATI_FOTO[formato.nome];
  $('#riga-pos-foto').hidden = !rapporto;
  if (!rapporto) return impostaBase(formato.prima, false);
  const ritagliata = ritaglia(formato.prima, rapporto, Number($('#posizione-foto').value));
  impostaBase(ritagliata, !formato.salvato);
  formato.salvato = true;
}
$('#posizione-foto').addEventListener('input', applicaFormato);

// --- Look e Migliora ---
const aggiornaCursoriLuce = costruisciCursori($('#cursori-luce-foto'), CURSORI_LUCE, foto.parametri, () => ridisegnaFoto());
const aggiornaCursoriMigliora = costruisciCursori($('#cursori-migliora-foto'), CURSORI_MIGLIORA, foto.parametri, () => ridisegnaFoto());

function applicaPresetFoto(nome) {
  Object.assign(foto.parametri, PARAMETRI_ZERO, PRESET[nome]);
  aggiornaCursoriLuce();
  aggiornaCursoriMigliora();
  ridisegnaFoto();
}

$('#btn-auto').onclick = () => {
  Object.assign(foto.parametri, PARAMETRI_ZERO, autoMigliora(foto.base));
  aggiornaCursoriLuce();
  aggiornaCursoriMigliora();
  ridisegnaFoto();
};

// --- Chiedi (online) ---
$('#suggerimenti').addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON') $('#istruzione').value = e.target.textContent;
});
$('#btn-esegui-chiedi').onclick = async () => {
  const istruzione = $('#istruzione').value.trim();
  if (!istruzione) return $('#istruzione').focus();
  if (!navigator.onLine) return avviso('"Chiedi" ha bisogno di internet.');
  mostraStato('Collegamento al servizio online…');
  inizioAttivita('modifica con "Chiedi"');
  try {
    const { modificaConTesto } = await import('./ai-online.js');
    const risultato = await modificaConTesto(foto.base, istruzione, token(), (t, p) => mostraStato(t, p));
    impostaBase(risultato);
    nascondiStato();
  } catch (e) {
    console.error(e);
    avviso(e.message);
  } finally {
    fineAttivita();
  }
};

// --- Pubblica foto ---
$('#btn-condividi-foto').onclick = async () => {
  if (!foto.base) return;
  ridisegnaFoto();
  await condividi(await inJpeg(canvasFoto));
};

// ---------- VIDEO ----------
const editorVideo = new EditorVideo($('#canvas-video'), $('#canvas-sottotitoli'));
const palcoVideo = $('#palco-video');
const secondi = t => `${t.toFixed(1).replace('.', ',')} s`;
const aggiornaCursoriVideo = costruisciCursori($('#cursori-video'), [...CURSORI_LUCE, ...CURSORI_MIGLIORA], editorVideo.parametri, () => {});
const adattaVideo = () => { if (editorVideo.file) adatta(palcoVideo, $('#vista-video .area'), $('#canvas-video').width, $('#canvas-video').height); };
new ResizeObserver(adattaVideo).observe($('#vista-video .area'));

const LINGUE = { Italiano: 'italian', English: 'english', Español: 'spanish', Français: 'french', Deutsch: 'german' };
let linguaSottotitoli = 'italian';

async function caricaVideo(file) {
  if (!file) return;
  mostraStato('Apro il video…');
  try {
    Object.assign(editorVideo.parametri, PARAMETRI_ZERO);
    await editorVideo.carica(file);
    const d = editorVideo.durata;
    for (const id of ['#taglio-inizio', '#taglio-fine']) $(id).max = d;
    $('#taglio-inizio').value = 0;
    $('#taglio-fine').value = d;
    $('#val-inizio').textContent = secondi(0);
    $('#val-fine').textContent = secondi(d);
    editorVideo.formato = 'Originale';
    editorVideo.velocita = 1;
    costruisciChip($('#formati-video'), Object.keys(FORMATI), 'Originale', scegliFormatoVideo);
    costruisciChip($('#preset-video'), Object.keys(PRESET), 'Naturale', nome => {
      Object.assign(editorVideo.parametri, PARAMETRI_ZERO, PRESET[nome]);
      aggiornaCursoriVideo();
    });
    costruisciChip($('#velocita-video'), Object.keys(VELOCITA), '1×', v => { editorVideo.velocita = VELOCITA[v]; editorVideo.video.playbackRate = VELOCITA[v]; });
    aggiornaCursoriVideo();
    $('#stili-sottotitoli').hidden = true;
    $('#testo-sottotitoli').hidden = true;
    $('#tag-sottotitoli').textContent = 'nuovo';
    $('#riga-posizione').hidden = true;
    $('#vuoto-video').hidden = true;
    palcoVideo.hidden = false;
    $('#controlli-video').hidden = false;
    riempiTutti();
    adattaVideo();
    nascondiStato();
  } catch (e) {
    console.error(e);
    avviso(e.message);
  }
}

function scegliFormatoVideo(nome) {
  editorVideo.formato = nome;
  $('#riga-posizione').hidden = nome === 'Originale';
  editorVideo.aggiornaMisure();
  adattaVideo();
}

for (const id of ['#file-video', '#file-video-2']) {
  $(id).addEventListener('change', e => { caricaVideo(e.target.files[0]); e.target.value = ''; });
}

const statoPlay = inRiproduzione => {
  $('#btn-play').innerHTML = inRiproduzione
    ? '<svg><use href="#i-pausa"/></svg><span>Pausa</span>'
    : '<svg><use href="#i-play"/></svg><span>Riproduci</span>';
};
$('#btn-play').onclick = () => statoPlay(editorVideo.riproduciPausa());
editorVideo.video.addEventListener('pause', () => statoPlay(false));

$('#taglio-inizio').addEventListener('input', e => {
  const v = Math.min(Number(e.target.value), editorVideo.fine - 0.2);
  e.target.value = editorVideo.inizio = Math.max(0, v);
  $('#val-inizio').textContent = secondi(editorVideo.inizio);
  editorVideo.vaiA(editorVideo.inizio);
});
$('#taglio-fine').addEventListener('input', e => {
  const v = Math.max(Number(e.target.value), editorVideo.inizio + 0.2);
  e.target.value = editorVideo.fine = Math.min(editorVideo.durata, v);
  $('#val-fine').textContent = secondi(editorVideo.fine);
  editorVideo.vaiA(editorVideo.fine);
});
$('#posizione-video').addEventListener('input', e => { editorVideo.posizione = Number(e.target.value); });

// --- Sottotitoli automatici ---
costruisciChip($('#lingua-sottotitoli'), Object.keys(LINGUE), 'Italiano', l => { linguaSottotitoli = LINGUE[l]; });
costruisciChip($('#stili-sottotitoli'), STILI_SOTTOTITOLI, editorVideo.stileSottotitoli, s => { editorVideo.stileSottotitoli = s; });

$('#btn-sottotitoli').onclick = async () => {
  if (!editorVideo.file) return;
  editorVideo.video.pause();
  mostraStato('Preparo l\'AI dei sottotitoli…');
  inizioAttivita('creazione dei sottotitoli');
  try {
    const { generaSottotitoli } = await import('./sottotitoli.js');
    const righe = await generaSottotitoli(editorVideo.file, editorVideo.durata, {
      lingua: linguaSottotitoli,
      suAvanzamento: v => mostraStato(`Scarico l'AI dei sottotitoli (77 MB, solo la prima volta)… ${Math.round(v * 100)}%`, v),
      suStato: t => mostraStato(t),
    });
    nascondiStato();
    if (!righe.length) return avviso('Non ho sentito parole in questo video.');
    editorVideo.sottotitoli = righe;
    $('#testo-sottotitoli').value = righe.map(r => r.testo).join('\n');
    $('#testo-sottotitoli').hidden = false;
    $('#stili-sottotitoli').hidden = false;
    $('#tag-sottotitoli').textContent = `${righe.length} righe`;
    editorVideo.vaiA(editorVideo.inizio);
  } catch (e) {
    console.error(e);
    avviso(`Sottotitoli non riusciti: ${e.message}`);
  } finally {
    fineAttivita();
  }
};
// correzione a mano: una riga del testo = un sottotitolo (i tempi restano quelli trovati dall'AI)
$('#testo-sottotitoli').addEventListener('input', e => {
  const linee = e.target.value.split('\n');
  editorVideo.sottotitoli.forEach((r, i) => { r.testo = (linee[i] ?? '').trim(); });
});

// --- Musica ---
$('#file-musica').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  editorVideo.musica = f;
  $('#nome-musica').textContent = f.name;
});
$('#volume-originale').addEventListener('input', e => { editorVideo.volumeOriginale = Number(e.target.value); });
$('#volume-musica').addEventListener('input', e => { editorVideo.volumeMusica = Number(e.target.value); });

$('#btn-esporta-video').onclick = async () => {
  mostraStato('Creo il video…', 0);
  inizioAttivita('esportazione del video');
  try {
    const file = await editorVideo.esporta(p => mostraStato(`Creo il video… ${Math.round(p * 100)}%`, p));
    mostraScelta('Video pronto!', [
      { etichetta: 'Pubblica', primario: true, azione: () => condividi(file) },
      { etichetta: 'Chiudi' },
    ]);
  } catch (e) {
    console.error(e);
    avviso(`Esportazione non riuscita: ${e.message}`);
  } finally {
    fineAttivita();
  }
};

// ---------- CREA (immagini da testo) ----------
const crea = { stile: 'Foto', formato: 'Post 4:5', corrente: null, ultimoPrompt: '' };
const canvasCrea = $('#canvas-crea');
const adattaCrea = () => { if (!$('#risultato-crea').hidden) adatta($('#risultato-crea'), $('#area-crea'), canvasCrea.width, canvasCrea.height); };
new ResizeObserver(adattaCrea).observe($('#area-crea'));

async function preparaCrea() {
  const { STILI, FORMATI_CREA } = await import('./crea.js');
  costruisciChip($('#stili-crea'), Object.keys(STILI), crea.stile, s => { crea.stile = s; });
  costruisciChip($('#formati-crea'), Object.keys(FORMATI_CREA), crea.formato, f => { crea.formato = f; });
}

function mostraCreata(canvas) {
  crea.corrente = canvas;
  canvasCrea.width = canvas.width;
  canvasCrea.height = canvas.height;
  canvasCrea.getContext('2d').drawImage(canvas, 0, 0);
  canvasCrea.classList.remove('attesa');
  $('#vuoto-crea').hidden = true;
  $('#risultato-crea').hidden = false;
  $('#azioni-crea').hidden = false;
  adattaCrea();
}

async function genera(descrizione) {
  if (!descrizione) return $('#prompt-crea').focus();
  if (!navigator.onLine) return avviso('"Crea" ha bisogno di internet.');
  crea.ultimoPrompt = descrizione;
  if (crea.corrente) canvasCrea.classList.add('attesa');
  mostraStato('Sto immaginando…');
  inizioAttivita('creazione di un\'immagine con "Crea"');
  try {
    const { generaImmagine } = await import('./crea.js');
    const { canvas } = await generaImmagine(descrizione, crea.stile, crea.formato, token(), (t, p) => mostraStato(t, p));
    mostraCreata(canvas);
    aggiungiAllaGalleria(canvas);
    nascondiStato();
  } catch (e) {
    console.error(e);
    canvasCrea.classList.remove('attesa');
    avviso(e.message);
  } finally {
    fineAttivita();
  }
}

function aggiungiAllaGalleria(canvas) {
  const img = document.createElement('img');
  img.src = copiaCanvas(canvas, 116, Math.round(116 * canvas.height / canvas.width)).toDataURL('image/jpeg', 0.8);
  img.alt = 'Immagine creata';
  img.onclick = () => {
    $('#galleria-crea').querySelectorAll('img').forEach(x => x.classList.toggle('attivo', x === img));
    mostraCreata(canvas);
  };
  $('#galleria-crea').prepend(img);
  $('#galleria-crea').querySelectorAll('img').forEach(x => x.classList.toggle('attivo', x === img));
}

$('#btn-genera').onclick = () => genera($('#prompt-crea').value.trim());
$('#btn-crea-ripeti').onclick = () => genera(crea.ultimoPrompt || $('#prompt-crea').value.trim());
$('#btn-crea-pubblica').onclick = async () => { if (crea.corrente) await condividi(await inJpeg(crea.corrente)); };
$('#btn-crea-modifica').onclick = async () => {
  if (!crea.corrente) return;
  vaiA('foto');
  await caricaFoto(await inJpeg(crea.corrente));
};

// ---------- generale ----------
function vaiA(modo) {
  document.querySelectorAll('.interruttore button').forEach(x => x.classList.toggle('attivo', x.dataset.modo === modo));
  const interruttore = $('.interruttore');
  interruttore.classList.toggle('video', modo === 'video');
  interruttore.classList.toggle('crea', modo === 'crea');
  for (const m of ['foto', 'video', 'crea']) $(`#vista-${m}`).hidden = m !== modo;
  if (modo !== 'video') editorVideo.video.pause();
  if (modo === 'foto') adattaPalco();
  if (modo === 'video') adattaVideo();
  if (modo === 'crea') { preparaCrea(); adattaCrea(); }
}
document.querySelectorAll('.interruttore button').forEach(b => { b.onclick = () => vaiA(b.dataset.modo); });

$('#btn-impostazioni').onclick = () => {
  $('#token-hf').value = token();
  $('#impostazioni').showModal();
};
$('#impostazioni').addEventListener('close', () => {
  const t = $('#token-hf').value.trim();
  if (t) localStorage.setItem('token-hf', t); else localStorage.removeItem('token-hf');
});

// --- Modalità leggera e registro delle chiusure ---
$('#leggera').checked = modalitaLeggera();
$('#leggera').addEventListener('change', e => impostaModalitaLeggera(e.target.checked));

const chiusa = chiusuraPrecedente();
if (chiusa) {
  impostaModalitaLeggera(true);
  $('#leggera').checked = true;
  avviso(`L'ultima volta Ritokko si è chiuso durante: ${chiusa}. Succede quando il telefono finisce la memoria: ` +
    'ho attivato la modalità leggera (foto a 1080 px, AI più parca). Puoi cambiarla nelle impostazioni.');
}

// Nessun errore silenzioso: se qualcosa va storto lo dico, invece di non fare nulla.
function mostraErrore(e) {
  fineAttivita();
  const testo = String(e?.message ?? e ?? '');
  if (!testo || /ResizeObserver/.test(testo)) return;
  console.error(e);
  avviso(`Qualcosa è andato storto: ${testo}`);
}
window.addEventListener('error', e => mostraErrore(e.error ?? e.message));
window.addEventListener('unhandledrejection', e => mostraErrore(e.reason));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));

riempiTutti();

// accesso per le prove dal browser
window.ritokko = { caricaFoto, caricaVideo, foto, editorVideo, vaiA, genera };
