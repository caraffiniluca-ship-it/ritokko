// Modifica con istruzioni a parole tramite Space pubblici e gratuiti di Hugging Face (Qwen-Image-Edit, Apache 2.0).
import { Client, handle_file } from 'https://cdn.jsdelivr.net/npm/@gradio/client@2.7.2/dist/index.min.js';

const LATO_MASSIMO = 1024;
const multiplo8 = v => Math.max(256, Math.round(v / 8) * 8);

// In ordine di preferenza: prima i più veloci (pochi passi = meno quota e durata GPU accettata anche senza account).
// Verificato il 28.10.2026: FLUX Kontext risponde anche senza account; gli Space Qwen restano come riserva.
const SPACE = [
  {
    id: 'black-forest-labs/FLUX.1-Kontext-Dev',
    parametri: (file, istruzione) => ({
      input_image: handle_file(file), prompt: istruzione, seed: 0, randomize_seed: true, guidance_scale: 2.5, steps: 28,
    }),
  },
  {
    id: 'linoyts/Qwen-Image-Edit-2511-Fast',
    parametri: (file, istruzione, l, a) => ({
      images: [{ image: handle_file(file), caption: null }], prompt: istruzione, seed: 0, randomize_seed: true,
      true_guidance_scale: 1, num_inference_steps: 4, height: multiplo8(a), width: multiplo8(l), rewrite_prompt: true,
    }),
  },
  {
    id: 'multimodalart/Qwen-Image-Edit-Fast',
    parametri: (file, istruzione) => ({
      image: handle_file(file), prompt: istruzione, seed: 0, randomize_seed: true,
      true_guidance_scale: 1, num_inference_steps: 8, rewrite_prompt: true,
    }),
  },
];

function trovaUrl(dato) {
  if (!dato) return null;
  if (typeof dato === 'string') return dato.startsWith('http') || dato.startsWith('data:') ? dato : null;
  if (Array.isArray(dato)) { for (const x of dato) { const u = trovaUrl(x); if (u) return u; } return null; }
  if (typeof dato === 'object') return dato.url ?? trovaUrl(dato.image) ?? null;
  return null;
}

function messaggioChiaro(errore) {
  const t = String(errore?.message ?? errore ?? '');
  if (/illegal duration|larger than the maximum/i.test(t)) {
    return 'Senza account il servizio gratuito non accetta questa elaborazione: aggiungi un token gratuito di Hugging Face nelle impostazioni.';
  }
  if (eQuota(t)) {
    return 'Quota gratuita di oggi esaurita. Riprova domani, oppure aggiungi un token gratuito di Hugging Face nelle impostazioni (⚙︎).';
  }
  if (/sleep|paused|building|not found|404|worker error|runtimeerror/i.test(t)) {
    return 'Il servizio online gratuito è occupato o non disponibile in questo momento: riprova tra qualche minuto.';
  }
  return t || 'Errore sconosciuto dal servizio online.';
}

function eQuota(e) {
  return /quota|exceeded your|too many requests/i.test(String(e?.message ?? e));
}

// Prova gli Space in ordine finché uno restituisce un'immagine. Ogni voce: { id, endpoint?, parametri: () => oggetto }.
export async function eseguiSuSpace(elenco, token, suStato) {
  let ultimoErrore;
  for (const space of elenco) {
    try {
      suStato?.(`Collegamento a ${space.id}…`);
      const opzioni = { events: ['data', 'status'], ...(token ? { hf_token: token, token } : {}) };
      const client = await Client.connect(space.id, opzioni);
      const lavoro = client.submit(space.endpoint ?? '/infer', space.parametri());
      let url = null;
      for await (const msg of lavoro) {
        if (msg.type === 'status') {
          if (msg.stage === 'error') throw new Error([msg.title, msg.message].filter(Boolean).join(': ') || 'errore dal servizio');
          const p = msg.progress_data?.[0];
          if (msg.position > 0) suStato?.(`In coda: posizione ${msg.position}`);
          else if (p?.length) suStato?.(`${p.desc || 'Elaborazione'}… ${Math.round((p.index / p.length) * 100)}%`, p.index / p.length);
          else if (msg.stage === 'pending') suStato?.('Elaborazione in corso (10-60 s)…');
        }
        if (msg.type === 'data') { url = trovaUrl(msg.data); break; }
      }
      if (!url) throw new Error('Il servizio non ha restituito un\'immagine');
      return { bitmap: await createImageBitmap(await (await fetch(url)).blob()), space: space.id };
    } catch (e) {
      console.warn(space.id, e);
      ultimoErrore = e;
      if (eQuota(e)) break; // la quota è per utente: inutile provare un altro Space
    }
  }
  throw new Error(messaggioChiaro(ultimoErrore));
}

// base: canvas con la foto. Restituisce un canvas con il risultato, già riportato alla misura di base.
export async function modificaConTesto(base, istruzione, token, suStato) {
  const scala = Math.min(1, LATO_MASSIMO / Math.max(base.width, base.height));
  const l = Math.round(base.width * scala);
  const a = Math.round(base.height * scala);
  const ridotta = document.createElement('canvas');
  ridotta.width = l;
  ridotta.height = a;
  ridotta.getContext('2d').drawImage(base, 0, 0, l, a);
  const blob = await new Promise(r => ridotta.toBlob(r, 'image/jpeg', 0.92));
  const elenco = SPACE.map(s => ({ id: s.id, parametri: () => s.parametri(blob, istruzione, l, a) }));
  const { bitmap } = await eseguiSuSpace(elenco, token, suStato);
  const out = document.createElement('canvas');
  out.width = base.width;
  out.height = base.height;
  out.getContext('2d').drawImage(bitmap, 0, 0, base.width, base.height);
  bitmap.close?.();
  ridotta.width = ridotta.height = 0;
  return out;
}
