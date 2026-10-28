// Sfondo: tiene il soggetto selezionato e cambia tutto il resto (sfocato tipo ritratto, bianco prodotto, colori).
// Tutto su canvas 2D, sul telefono. Per il ritaglio nei formati social c'è ritaglia().

export const EFFETTI_SFONDO = ['Sfocato', 'Bianco', 'Nero', 'Pastello', 'Gradiente'];

function tela(l, a) {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = a;
  return c;
}

// Sfocatura robusta ovunque (anche dove ctx.filter non c'è): riduco e riingrandisco in più passaggi.
function sfoca(sorgente, raggio) {
  const L = sorgente.width;
  const A = sorgente.height;
  let corrente = sorgente;
  const passi = 3;
  const fattore = Math.max(1.5, raggio / passi);
  for (let i = 0; i < passi; i++) {
    const piccola = tela(Math.max(1, Math.round(L / fattore ** (i + 1))), Math.max(1, Math.round(A / fattore ** (i + 1))));
    const pc = piccola.getContext('2d');
    pc.imageSmoothingQuality = 'high';
    pc.drawImage(corrente, 0, 0, piccola.width, piccola.height);
    corrente = piccola;
  }
  const out = tela(L, A);
  const oc = out.getContext('2d');
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(corrente, 0, 0, L, A);
  return out;
}

function riempi(ctx, effetto, L, A) {
  if (effetto === 'Bianco') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, L, A); return; }
  if (effetto === 'Nero') { ctx.fillStyle = '#0b0b0f'; ctx.fillRect(0, 0, L, A); return; }
  const g = ctx.createLinearGradient(0, 0, L, A);
  if (effetto === 'Pastello') { g.addColorStop(0, '#fde2e4'); g.addColorStop(0.5, '#e2ece9'); g.addColorStop(1, '#dfe7fd'); }
  else { g.addColorStop(0, '#ff4d8d'); g.addColorStop(0.55, '#a95cff'); g.addColorStop(1, '#ffb547'); }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, A);
}

// base: foto; soggetto: maschera (bianco = da tenere), stessa misura; intensita: raggio di sfocatura in px "di schermo".
export function componiSfondo(base, soggetto, effetto, intensita = 14) {
  const L = base.width;
  const A = base.height;
  const out = tela(L, A);
  const ctx = out.getContext('2d');
  if (effetto === 'Sfocato') ctx.drawImage(sfoca(base, intensita * Math.max(L, A) / 1000), 0, 0);
  else riempi(ctx, effetto, L, A);

  // bordo morbido della maschera, così il soggetto non sembra ritagliato con le forbici
  const morbida = sfoca(soggetto, Math.max(2, Math.max(L, A) / 400));
  const ritaglio = tela(L, A);
  const rc = ritaglio.getContext('2d');
  rc.drawImage(base, 0, 0);
  rc.globalCompositeOperation = 'destination-in';
  rc.drawImage(morbida, 0, 0);

  if (effetto === 'Bianco' || effetto === 'Pastello') {
    // ombra leggera sotto il soggetto: effetto "foto prodotto"
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = Math.max(L, A) / 40;
    ctx.shadowOffsetY = Math.max(L, A) / 120;
    ctx.drawImage(ritaglio, 0, 0);
    ctx.restore();
  }
  ctx.drawImage(ritaglio, 0, 0);
  return out;
}

export const FORMATI_FOTO = { Originale: null, 'Post 4:5': 4 / 5, 'Quadrato': 1, 'Storia 9:16': 9 / 16, 'Orizzontale': 1.91 };

// Ritaglio centrato (posizione 0..1 sposta l'inquadratura) nel rapporto larghezza/altezza richiesto.
export function ritaglia(sorgente, rapporto, posizione = 0.5) {
  if (!rapporto) return sorgente;
  const L = sorgente.width;
  const A = sorgente.height;
  let w = L;
  let h = Math.round(L / rapporto);
  if (h > A) { h = A; w = Math.round(A * rapporto); }
  const x = Math.round((L - w) * (L > w ? posizione : 0.5));
  const y = Math.round((A - h) * (A > h ? posizione : 0.5));
  const out = tela(w, h);
  out.getContext('2d').drawImage(sorgente, x, y, w, h, 0, 0, w, h);
  return out;
}
