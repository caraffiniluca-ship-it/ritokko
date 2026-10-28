// Scontorno automatico delle persone: MODNet (Apache 2.0) via Transformers.js, sul telefono.
// Lavora a 512 px: molta meno memoria della selezione con un tocco, ed è pensato per i ritratti.
import { liberaCanvas } from './memoria.js';

const URL_TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
const ID_MODELLO = 'Xenova/modnet';
const LATO_MODELLO = 512;
let caricamento = null;

function carica(suAvanzamento) {
  if (!caricamento) {
    const progresso = {};
    const progress_callback = p => {
      if (p.status === 'progress' && p.total) {
        progresso[p.file] = [p.loaded, p.total];
        const [f, t] = Object.values(progresso).reduce((a, [l, tt]) => [a[0] + l, a[1] + tt], [0, 0]);
        suAvanzamento?.(f / t);
      }
    };
    caricamento = import(URL_TRANSFORMERS).then(async T => {
      T.env.allowLocalModels = false;
      const [modello, processore] = await Promise.all([
        T.AutoModel.from_pretrained(ID_MODELLO, { dtype: 'q8', device: 'wasm', progress_callback }),
        T.AutoProcessor.from_pretrained(ID_MODELLO),
      ]);
      return { T, modello, processore };
    }).catch(e => { caricamento = null; throw e; });
  }
  return caricamento;
}

// Opacità delle persone a bassa risoluzione (0-255), calcolata una volta per foto e poi riusata dai tocchi.
let ultima = { base: null, dati: null, l: 0, a: 0 };
async function opacitaPiccola(base, suAvanzamento) {
  if (ultima.base === base) return ultima;
  const { T, modello, processore } = await carica(suAvanzamento);
  const s = Math.min(1, LATO_MODELLO / Math.max(base.width, base.height));
  const piccola = document.createElement('canvas');
  piccola.width = Math.max(1, Math.round(base.width * s));
  piccola.height = Math.max(1, Math.round(base.height * s));
  piccola.getContext('2d').drawImage(base, 0, 0, piccola.width, piccola.height);
  const immagine = (await T.RawImage.fromCanvas(piccola)).rgb();
  liberaCanvas(piccola);
  const { pixel_values } = await processore(immagine);
  const { output } = await modello({ input: pixel_values });
  const op = await T.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(immagine.width, immagine.height);
  const dati = new Uint8Array(op.width * op.height);
  for (let i = 0; i < dati.length; i++) dati[i] = op.data[i * op.channels];
  ultima = { base, dati, l: op.width, a: op.height };
  return ultima;
}

// Porta una maschera piccola (0-255) alla misura della foto, con bordi morbidi (il canvas la ingrandisce sfumando).
function inCanvas(dati, l, a, L, A) {
  const rgba = new Uint8ClampedArray(l * a * 4);
  for (let i = 0; i < l * a; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = dati[i];
  }
  const piccola = document.createElement('canvas');
  piccola.width = l;
  piccola.height = a;
  piccola.getContext('2d').putImageData(new ImageData(rgba, l, a), 0, 0);
  const grande = document.createElement('canvas');
  grande.width = L;
  grande.height = A;
  const g = grande.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(piccola, 0, 0, L, A);
  liberaCanvas(piccola);
  return grande;
}

// Restituisce un canvas maschera della misura di base: bianco opaco = persona, trasparente = sfondo (bordi sfumati).
export async function scontornaPersone(base, suAvanzamento) {
  const { dati, l, a } = await opacitaPiccola(base, suAvanzamento);
  let copertura = 0;
  for (let i = 0; i < dati.length; i++) if (dati[i] > 127) copertura++;
  return { maschera: inCanvas(dati, l, a, base.width, base.height), copertura: copertura / dati.length };
}

// Tocco leggero (per iPhone): seleziona SOLO la persona toccata, cioè la zona di "persona" collegata al punto.
// fx, fy: posizione del tocco in frazioni della foto. Se lì non c'è una persona, cerca la più vicina entro un piccolo raggio.
export async function personaNelPunto(base, fx, fy, suAvanzamento) {
  const { dati, l, a } = await opacitaPiccola(base, suAvanzamento);
  const SOGLIA = 100;
  let px = Math.min(l - 1, Math.max(0, Math.round(fx * (l - 1))));
  let py = Math.min(a - 1, Math.max(0, Math.round(fy * (a - 1))));
  if (dati[py * l + px] < SOGLIA) {
    // tocco appena fuori dal contorno: cerco il pixel di persona più vicino (raggio ~4% della foto)
    const r = Math.round(Math.max(l, a) * 0.04);
    let migliore = null;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = px + dx, y = py + dy;
      if (x < 0 || y < 0 || x >= l || y >= a || dati[y * l + x] < SOGLIA) continue;
      const d = dx * dx + dy * dy;
      if (!migliore || d < migliore.d) migliore = { x, y, d };
    }
    if (!migliore) return { maschera: null, copertura: 0 };
    px = migliore.x; py = migliore.y;
  }
  // riempimento dal punto toccato: tengo solo la persona collegata
  const zona = new Uint8Array(l * a);
  const coda = [py * l + px];
  zona[coda[0]] = 1;
  let n = 0;
  while (coda.length) {
    const i = coda.pop();
    n++;
    const x = i % l, y = (i / l) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < l - 1 ? i + 1 : -1, y > 0 ? i - l : -1, y < a - 1 ? i + l : -1]) {
      if (j >= 0 && !zona[j] && dati[j] >= SOGLIA / 2) { zona[j] = 1; coda.push(j); }
    }
  }
  const scelta = new Uint8Array(l * a);
  for (let i = 0; i < scelta.length; i++) if (zona[i]) scelta[i] = Math.max(dati[i], 160);
  return { maschera: inCanvas(scelta, l, a, base.width, base.height), copertura: n / (l * a) };
}
