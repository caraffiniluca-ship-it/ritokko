// Sottotitoli automatici: Whisper (OpenAI, licenza MIT) via Transformers.js, sul telefono. Nessun audio esce dall'iPhone.
// La libreria AI si carica solo quando servono davvero i sottotitoli (il disegno delle righe non ne ha bisogno).
const URL_TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
const ID_MODELLO = 'onnx-community/whisper-base';
const PAROLE_PER_RIGA = 4;
let trascrittore = null;

export const STILI_SOTTOTITOLI = ['Pop', 'Classico', 'Box'];

function caricaModello(suAvanzamento) {
  if (!trascrittore) {
    const progresso = {};
    trascrittore = import(URL_TRANSFORMERS).then(({ pipeline }) => pipeline('automatic-speech-recognition', ID_MODELLO, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: p => {
        if (p.status === 'progress' && p.total) {
          progresso[p.file] = [p.loaded, p.total];
          const [f, t] = Object.values(progresso).reduce((a, [l, tt]) => [a[0] + l, a[1] + tt], [0, 0]);
          suAvanzamento?.(f / t);
        }
      },
    })).catch(e => { trascrittore = null; throw e; });
  }
  return trascrittore;
}

// Estrae l'audio del video, mono a 16 kHz come vuole Whisper.
async function audioDa(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let decodificato;
  try {
    decodificato = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error('Non trovo l\'audio in questo video');
  } finally {
    ctx.close?.();
  }
  const offline = new OfflineAudioContext(1, Math.ceil(decodificato.duration * 16000), 16000);
  const sorgente = offline.createBufferSource();
  sorgente.buffer = decodificato;
  sorgente.connect(offline.destination);
  sorgente.start();
  return (await offline.startRendering()).getChannelData(0);
}

// Divide le frasi in righe brevi (stile Reel), distribuendo il tempo in proporzione alle parole.
function inRighe(pezzi, durata) {
  const righe = [];
  for (const { text, timestamp } of pezzi) {
    const parole = text.trim().split(/\s+/).filter(Boolean);
    if (!parole.length) continue;
    const inizio = timestamp[0] ?? 0;
    const fine = timestamp[1] ?? Math.min(durata, inizio + parole.length * 0.4);
    const passo = (fine - inizio) / parole.length;
    for (let i = 0; i < parole.length; i += PAROLE_PER_RIGA) {
      const gruppo = parole.slice(i, i + PAROLE_PER_RIGA);
      righe.push({ testo: gruppo.join(' '), inizio: inizio + i * passo, fine: inizio + (i + gruppo.length) * passo });
    }
  }
  return righe;
}

export async function generaSottotitoli(file, durata, { lingua = 'italian', suAvanzamento, suStato } = {}) {
  suStato?.('Preparo l\'AI dei sottotitoli…');
  const asr = await caricaModello(suAvanzamento);
  suStato?.('Ascolto il video…');
  const audio = await audioDa(file);
  suStato?.('Scrivo i sottotitoli…');
  const risultato = await asr(audio, {
    language: lingua, task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5,
  });
  return inRighe(risultato.chunks ?? [{ text: risultato.text, timestamp: [0, durata] }], durata);
}

// Disegna la riga attiva al tempo t sul contesto 2D (L × A).
export function disegnaSottotitolo(ctx, righe, t, L, A, stile = 'Pop') {
  const riga = righe.find(r => t >= r.inizio && t < r.fine + 0.05);
  if (!riga) return;
  const testo = stile === 'Pop' ? riga.testo.toUpperCase() : riga.testo;
  const corpo = Math.round(Math.min(L, A) * (stile === 'Pop' ? 0.085 : 0.065));
  ctx.save();
  ctx.font = `800 ${corpo}px -apple-system, "SF Pro Display", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // a capo se la riga è troppo larga
  const max = L * 0.86;
  const parole = testo.split(' ');
  const linee = [];
  let corrente = '';
  for (const p of parole) {
    const prova = corrente ? `${corrente} ${p}` : p;
    if (ctx.measureText(prova).width > max && corrente) { linee.push(corrente); corrente = p; } else corrente = prova;
  }
  linee.push(corrente);
  const interlinea = corpo * 1.2;
  const y0 = A * 0.76 - ((linee.length - 1) * interlinea) / 2;
  linee.forEach((linea, i) => {
    const y = y0 + i * interlinea;
    if (stile === 'Box') {
      const w = ctx.measureText(linea).width + corpo * 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.beginPath();
      ctx.roundRect?.(L / 2 - w / 2, y - corpo * 0.62, w, corpo * 1.24, corpo * 0.3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(linea, L / 2, y);
    } else {
      ctx.lineWidth = corpo * 0.18;
      ctx.strokeStyle = '#000';
      ctx.strokeText(linea, L / 2, y);
      ctx.fillStyle = stile === 'Pop' ? '#ffe14d' : '#fff';
      ctx.fillText(linea, L / 2, y);
    }
  });
  ctx.restore();
}
