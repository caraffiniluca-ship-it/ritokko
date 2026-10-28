// Selezione automatica con un tocco: SlimSAM (Segment Anything compresso, Apache 2.0) via Transformers.js, sul telefono.
import { env, SamModel, AutoProcessor, RawImage, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

import { usaWebGPU, IOS } from './memoria.js';

env.allowLocalModels = false;
if (IOS && env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1; // meno memoria su iPhone
const ID_MODELLO = 'Xenova/slimsam-77-uniform';

let caricamento = null;
let analisi = null; // { sorgente, promessa }

function preparaModello(suAvanzamento) {
  if (!caricamento) {
    const progresso = {};
    const progress_callback = p => {
      if (p.status === 'progress' && p.total) {
        progresso[p.file] = [p.loaded, p.total];
        const [fatti, totale] = Object.values(progresso).reduce((a, [l, t]) => [a[0] + l, a[1] + t], [0, 0]);
        suAvanzamento?.(fatti / totale);
      }
    };
    // GPU (WebGPU, mezza precisione) se c'è; altrimenti processore (WASM, quantizzato)
    const modello = (usaWebGPU()
      ? SamModel.from_pretrained(ID_MODELLO, { dtype: 'fp16', device: 'webgpu', progress_callback })
      : Promise.reject(new Error('WebGPU non usato su questo dispositivo'))
    ).catch(e => {
      console.info('SlimSAM su WASM:', e.message);
      return SamModel.from_pretrained(ID_MODELLO, { dtype: 'q8', device: 'wasm', progress_callback });
    });
    caricamento = Promise.all([modello, AutoProcessor.from_pretrained(ID_MODELLO)])
      .catch(e => { caricamento = null; throw e; });
  }
  return caricamento;
}

// Analizza la foto una sola volta (la parte lenta); poi ogni tocco è quasi istantaneo.
export function preanalizza(base, { suAvanzamento, suAnalisi } = {}) {
  if (analisi?.sorgente === base) return analisi.promessa;
  const promessa = (async () => {
    const [modello, processore] = await preparaModello(suAvanzamento);
    suAnalisi?.();
    const immagine = (await RawImage.fromCanvas(base)).rgb();
    const input = await processore(immagine);
    const embedding = await modello.get_image_embeddings(input);
    return { modello, processore, input, embedding };
  })();
  analisi = { sorgente: base, promessa };
  promessa.catch(() => { if (analisi?.promessa === promessa) analisi = null; });
  return promessa;
}

// x, y: posizione del tocco in frazioni (0..1) della foto. Restituisce un canvas maschera (bianco = selezionato).
export async function selezionaConTocco(base, x, y, opzioni) {
  const { modello, processore, input, embedding } = await preanalizza(base, opzioni);
  const [alt, larg] = input.reshaped_input_sizes[0];
  const uscita = await modello({
    ...embedding,
    input_points: new Tensor('float32', [x * larg, y * alt], [1, 1, 1, 2]),
    input_labels: new Tensor('int64', [1n], [1, 1, 1]),
  });
  const maschere = await processore.post_process_masks(uscita.pred_masks, input.original_sizes, input.reshaped_input_sizes);
  const m = maschere[0][0]; // [3, H, W]: tre proposte, tengo quella con il punteggio migliore
  const punteggi = Array.from(uscita.iou_scores.data);
  const migliore = punteggi.indexOf(Math.max(...punteggi));
  const [, H, W] = m.dims;
  const offset = migliore * H * W;
  const rgba = new Uint8ClampedArray(W * H * 4);
  let pixel = 0;
  for (let i = 0; i < W * H; i++) {
    if (m.data[offset + i]) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = rgba[i * 4 + 3] = 255; pixel++; }
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d').putImageData(new ImageData(rgba, W, H), 0, 0);
  return { maschera: c, copertura: pixel / (W * H) };
}
