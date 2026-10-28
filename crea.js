// "Crea": immagini da una descrizione, tramite Space pubblici e gratuiti di Hugging Face.
// Modelli con licenza che ne consente anche l'uso commerciale: Z-Image-Turbo (Apache 2.0), FLUX.1 schnell (Apache 2.0), Qwen-Image (Apache 2.0).
import { eseguiSuSpace } from './ai-online.js';
import { STILI, FORMATI_CREA } from './crea-opzioni.js';

export async function generaImmagine(descrizione, stile, formato, token, suStato) {
  const prompt = [descrizione.trim(), STILI[stile]].filter(Boolean).join(', ');
  const [l, a, voceZ, rapportoQ] = FORMATI_CREA[formato];
  const elenco = [
    {
      id: 'Tongyi-MAI/Z-Image-Turbo', endpoint: '/generate',
      parametri: () => ({ prompt, resolution: voceZ, seed: 42, steps: 8, shift: 3, random_seed: true, gallery_images: [] }),
    },
    {
      id: 'black-forest-labs/FLUX.1-schnell',
      parametri: () => ({ prompt, seed: 0, randomize_seed: true, width: l, height: a, num_inference_steps: 4 }),
    },
    {
      id: 'Qwen/Qwen-Image',
      parametri: () => ({ prompt, seed: 0, randomize_seed: true, aspect_ratio: rapportoQ, guidance_scale: 4, num_inference_steps: 30, prompt_enhance: true }),
    },
  ];
  const { bitmap, space } = await eseguiSuSpace(elenco, token, suStato);
  // riporto sempre al formato esatto richiesto (ritaglio centrale)
  const c = document.createElement('canvas');
  c.width = l;
  c.height = a;
  const s = Math.max(l / bitmap.width, a / bitmap.height);
  const w = bitmap.width * s;
  const h = bitmap.height * s;
  c.getContext('2d').drawImage(bitmap, (l - w) / 2, (a - h) / 2, w, h);
  bitmap.close?.();
  return { canvas: c, space, prompt };
}
