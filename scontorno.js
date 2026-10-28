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

// Restituisce un canvas maschera della misura di base: bianco opaco = persona, trasparente = sfondo (bordi sfumati).
export async function scontornaPersone(base, suAvanzamento) {
  const { T, modello, processore } = await carica(suAvanzamento);
  const s = Math.min(1, LATO_MODELLO / Math.max(base.width, base.height));
  const piccola = document.createElement('canvas');
  piccola.width = Math.round(base.width * s);
  piccola.height = Math.round(base.height * s);
  piccola.getContext('2d').drawImage(base, 0, 0, piccola.width, piccola.height);
  const immagine = (await T.RawImage.fromCanvas(piccola)).rgb();
  liberaCanvas(piccola);
  const { pixel_values } = await processore(immagine);
  const { output } = await modello({ input: pixel_values });
  const opacita = await T.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(base.width, base.height);

  const L = base.width;
  const A = base.height;
  const rgba = new Uint8ClampedArray(L * A * 4);
  const canali = opacita.channels;
  let copertura = 0;
  for (let i = 0; i < L * A; i++) {
    const a = opacita.data[i * canali];
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = a;
    if (a > 127) copertura++;
  }
  const maschera = document.createElement('canvas');
  maschera.width = L;
  maschera.height = A;
  maschera.getContext('2d').putImageData(new ImageData(rgba, L, A), 0, 0);
  return { maschera, copertura: copertura / (L * A) };
}
