// Rimozione oggetti/persone sul telefono con MI-GAN (Picsart AI Research, licenza MIT) via ONNX Runtime Web.
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort.webgpu.min.mjs';
import { usaWebGPU, IOS } from './memoria.js';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
ort.env.logLevel = 'error';
if (IOS) ort.env.wasm.numThreads = 1; // meno memoria su iPhone

const URL_MODELLO = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
const CACHE_MODELLI = 'ritokko-modelli-v1';

let sessione = null;

async function scaricaModello(suAvanzamento) {
  const cache = await caches.open(CACHE_MODELLI);
  const salvato = await cache.match(URL_MODELLO);
  if (salvato) return salvato.arrayBuffer();

  const risposta = await fetch(URL_MODELLO);
  if (!risposta.ok) throw new Error(`Download del modello non riuscito (${risposta.status})`);
  const totale = Number(risposta.headers.get('content-length')) || 28_000_000;
  const lettore = risposta.body.getReader();
  const pezzi = [];
  let ricevuti = 0;
  for (;;) {
    const { done, value } = await lettore.read();
    if (done) break;
    pezzi.push(value);
    ricevuti += value.length;
    suAvanzamento?.(Math.min(1, ricevuti / totale));
  }
  const blob = new Blob(pezzi);
  await cache.put(URL_MODELLO, new Response(blob));
  return blob.arrayBuffer();
}

async function preparaSessione(suAvanzamento) {
  if (sessione) return sessione;
  const modello = await scaricaModello(suAvanzamento);
  const provider = usaWebGPU() ? ['webgpu', 'wasm'] : ['wasm'];
  try {
    sessione = await ort.InferenceSession.create(modello, { executionProviders: provider, logSeverityLevel: 3 });
  } catch (e) {
    console.warn('WebGPU non utilizzabile, uso WASM', e);
    sessione = await ort.InferenceSession.create(modello, { executionProviders: ['wasm'], logSeverityLevel: 3 });
  }
  return sessione;
}

// base: canvas con la foto; maschera: canvas della stessa misura, pixel con alfa > 0 = da togliere.
// Restituisce un nuovo canvas con la zona ricostruita.
export async function rimuovi(base, maschera, suAvanzamento) {
  const s = await preparaSessione(suAvanzamento);
  const L = base.width;
  const A = base.height;
  const px = base.getContext('2d').getImageData(0, 0, L, A).data;
  const mk = maschera.getContext('2d').getImageData(0, 0, L, A).data;
  const area = L * A;
  const immagine = new Uint8Array(3 * area);
  const zona = new Uint8Array(area);
  for (let i = 0; i < area; i++) {
    immagine[i] = px[i * 4];
    immagine[area + i] = px[i * 4 + 1];
    immagine[2 * area + i] = px[i * 4 + 2];
    zona[i] = mk[i * 4 + 3] > 0 ? 0 : 255; // MI-GAN: 0 = da ricostruire, 255 = da tenere
  }
  const risultati = await s.run({
    [s.inputNames[0]]: new ort.Tensor('uint8', immagine, [1, 3, A, L]),
    [s.inputNames[1]]: new ort.Tensor('uint8', zona, [1, 1, A, L]),
  });
  const out = risultati[s.outputNames[0]].data;
  const rgba = new Uint8ClampedArray(area * 4);
  for (let i = 0; i < area; i++) {
    rgba[i * 4] = out[i];
    rgba[i * 4 + 1] = out[area + i];
    rgba[i * 4 + 2] = out[2 * area + i];
    rgba[i * 4 + 3] = 255;
  }
  const nuovo = document.createElement('canvas');
  nuovo.width = L;
  nuovo.height = A;
  nuovo.getContext('2d').putImageData(new ImageData(rgba, L, A), 0, 0);
  return nuovo;
}
