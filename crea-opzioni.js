// Opzioni di "Crea" (stili e formati), separate dal codice che va online:
// così la scheda si apre anche senza rete e senza scaricare le librerie per Hugging Face.

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
