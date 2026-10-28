// Rimozione oggetti/persone sul telefono con MI-GAN (Picsart AI Research, licenza MIT) via ONNX Runtime Web.
import { usaWebGPU, IOS, liberaCanvas } from './memoria.js';

const CDN_ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
const URL_MODELLO = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
const CACHE_MODELLI = 'ritokko-modelli-v1';

let ort = null;
let sessione = null;

// Su iPhone carico la versione "solo WASM" del runtime: più piccola, senza il motore WebGPU.
async function caricaRuntime() {
  if (ort) return ort;
  ort = await import(usaWebGPU() ? `${CDN_ORT}ort.webgpu.min.mjs` : `${CDN_ORT}ort.wasm.min.mjs`);
  ort.env.wasm.wasmPaths = CDN_ORT;
  ort.env.logLevel = 'error';
  if (IOS) ort.env.wasm.numThreads = 1; // meno memoria su iPhone
  return ort;
}

async function scaricaModello(suAvanzamento) {
  const cache = await caches.open(CACHE_MODELLI);
  const salvato = await cache.match(URL_MODELLO);
  if (salvato) return new Uint8Array(await salvato.arrayBuffer());

  const risposta = await fetch(URL_MODELLO);
  if (!risposta.ok) throw new Error(`Download del modello non riuscito (${risposta.status})`);
  const totale = Number(risposta.headers.get('content-length')) || 28_000_000;
  const lettore = risposta.body.getReader();
  let pezzi = [];
  let ricevuti = 0;
  for (;;) {
    const { done, value } = await lettore.read();
    if (done) break;
    pezzi.push(value);
    ricevuti += value.length;
    suAvanzamento?.(Math.min(1, ricevuti / totale));
  }
  const blob = new Blob(pezzi);
  pezzi = null; // non tengo tre copie dello stesso file in memoria
  await cache.put(URL_MODELLO, new Response(blob));
  return new Uint8Array(await blob.arrayBuffer());
}

async function preparaSessione(suAvanzamento) {
  if (sessione) return sessione;
  const o = await caricaRuntime();
  const modello = await scaricaModello(suAvanzamento);
  const opzioni = { logSeverityLevel: 3, enableCpuMemArena: !IOS };
  try {
    sessione = await o.InferenceSession.create(modello, { ...opzioni, executionProviders: usaWebGPU() ? ['webgpu', 'wasm'] : ['wasm'] });
  } catch (e) {
    console.warn('WebGPU non utilizzabile, uso WASM', e);
    sessione = await o.InferenceSession.create(modello, { ...opzioni, executionProviders: ['wasm'] });
  }
  return sessione;
}

// Riquadro che contiene la maschera, con un margine intorno: MI-GAN ha bisogno del contesto vicino.
function riquadroMaschera(mk, L, A) {
  let x0 = L, y0 = A, x1 = -1, y1 = -1;
  for (let y = 0; y < A; y++) {
    const riga = y * L;
    for (let x = 0; x < L; x++) {
      if (mk[(riga + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const margine = Math.max(64, Math.round(Math.max(x1 - x0, y1 - y0) * 0.5));
  const x = Math.max(0, x0 - margine);
  const y = Math.max(0, y0 - margine);
  return { x, y, w: Math.min(L, x1 + margine + 1) - x, h: Math.min(A, y1 + margine + 1) - y };
}

// base: canvas con la foto; maschera: canvas della stessa misura, pixel con alfa > 0 = da togliere.
// Restituisce un nuovo canvas con la zona ricostruita.
export async function rimuovi(base, maschera, suAvanzamento) {
  const s = await preparaSessione(suAvanzamento);
  const L = base.width;
  const A = base.height;
  const r = riquadroMaschera(maschera.getContext('2d').getImageData(0, 0, L, A).data, L, A);
  if (!r) throw new Error('Non hai selezionato niente da togliere');

  const px = base.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
  const mk = maschera.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
  const area = r.w * r.h;
  const immagine = new Uint8Array(3 * area);
  const zona = new Uint8Array(area);
  for (let i = 0; i < area; i++) {
    immagine[i] = px[i * 4];
    immagine[area + i] = px[i * 4 + 1];
    immagine[2 * area + i] = px[i * 4 + 2];
    zona[i] = mk[i * 4 + 3] > 0 ? 0 : 255; // MI-GAN: 0 = da ricostruire, 255 = da tenere
  }
  const ingresso1 = new ort.Tensor('uint8', immagine, [1, 3, r.h, r.w]);
  const ingresso2 = new ort.Tensor('uint8', zona, [1, 1, r.h, r.w]);
  const risultati = await s.run({ [s.inputNames[0]]: ingresso1, [s.inputNames[1]]: ingresso2 });
  const uscita = risultati[s.outputNames[0]];
  const out = uscita.data;
  const rgba = new Uint8ClampedArray(area * 4);
  for (let i = 0; i < area; i++) {
    rgba[i * 4] = out[i];
    rgba[i * 4 + 1] = out[area + i];
    rgba[i * 4 + 2] = out[2 * area + i];
    rgba[i * 4 + 3] = 255;
  }
  uscita.dispose?.();

  // incollo solo il riquadro ricostruito su una copia della foto
  const nuovo = document.createElement('canvas');
  nuovo.width = L;
  nuovo.height = A;
  const ctx = nuovo.getContext('2d');
  ctx.drawImage(base, 0, 0);
  const pezzo = document.createElement('canvas');
  pezzo.width = r.w;
  pezzo.height = r.h;
  pezzo.getContext('2d').putImageData(new ImageData(rgba, r.w, r.h), 0, 0);
  ctx.drawImage(pezzo, r.x, r.y);
  liberaCanvas(pezzo);
  return nuovo;
}
