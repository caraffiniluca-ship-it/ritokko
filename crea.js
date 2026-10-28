// "Crea": immagini da una descrizione, tramite Space pubblici e gratuiti di Hugging Face.
// Modelli con licenza che ne consente anche l'uso commerciale: Z-Image-Turbo (Apache 2.0), FLUX.1 schnell (Apache 2.0), Qwen-Image (Apache 2.0).
import { eseguiSuSpace } from './ai-online.js';

export const STILI = {
  Foto: 'photorealistic, natural light, shot on a full-frame camera, sharp details',
  Cinema: 'cinematic still, dramatic lighting, anamorphic lens, film color grading',
  Anime: 'anime illustration, vibrant colors, clean line art, studio quality',
  '3D': '3D render, soft studio lighting, octane render, high detail',
  Acquerello: 'watercolor painting, soft washes, paper texture',
  Neon: 'neon cyberpunk night, glowing lights, rain reflections',
  Minimal: 'minimalist, clean composition, pastel colors, lots of negative space',
};

// formato → [larghezza, altezza, voce Z-Image, rapporto Qwen]
export const FORMATI_CREA = {
  'Post 4:5': [896, 1120, '864x1152 ( 3:4 )', '3:4'],
  'Storia 9:16': [720, 1280, '720x1280 ( 9:16 )', '9:16'],
  'Quadrato': [1024, 1024, '1024x1024 ( 1:1 )', '1:1'],
  'Orizzontale': [1280, 720, '1280x720 ( 16:9 )', '16:9'],
};

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
  return { canvas: c, space, prompt };
}
