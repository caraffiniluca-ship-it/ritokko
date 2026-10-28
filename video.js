// Video: taglio, formato (9:16, 1:1, 4:5), velocità, luce/colore, musica, sottotitoli.
// Tutto sul telefono, registrato in tempo reale con MediaRecorder.
import { Renderer } from './gl.js';
import { disegnaSottotitolo } from './sottotitoli.js';

export const FORMATI = { Originale: null, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 };
export const VELOCITA = { '0,5×': 0.5, '1×': 1, '1,5×': 1.5, '2×': 2 };
const LATO_USCITA = 1920;
const LATO_ANTEPRIMA = 720;

function tipoSupportato() {
  const candidati = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return candidati.find(t => window.MediaRecorder?.isTypeSupported?.(t)) ?? '';
}

export class EditorVideo {
  constructor(canvasAnteprima, canvasSottotitoli) {
    this.canvas = canvasAnteprima;
    this.sovrapposto = canvasSottotitoli;
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.preload = 'auto';
    this.file = null;
    this.parametri = {};
    this.formato = 'Originale';
    this.posizione = 0.5; // centro del ritaglio orizzontale/verticale
    this.inizio = 0;
    this.fine = 0;
    this.velocita = 1;
    this.musica = null; // File audio facoltativo
    this.volumeOriginale = 1;
    this.volumeMusica = 0.8;
    this.sottotitoli = [];
    this.stileSottotitoli = 'Pop';
    this.mostraSottotitoli = true;
    this.renderer = null;
    this.inEsportazione = false;
    this.attivo = false;
    this.sporco = true;
    this.video.addEventListener('timeupdate', () => {
      if (!this.inEsportazione && this.fine && this.video.currentTime >= this.fine) {
        this.video.pause();
        this.video.currentTime = this.inizio;
      }
    });
  }

  async carica(file) {
    if (this.video.src) URL.revokeObjectURL(this.video.src);
    this.file = file;
    this.sottotitoli = [];
    this.video.src = URL.createObjectURL(file);
    await new Promise((ok, ko) => {
      this.video.onloadeddata = ok;
      this.video.onerror = () => ko(new Error('Formato video non leggibile'));
    });
    if (!Number.isFinite(this.video.duration)) {
      // alcuni file (es. webm registrati dal browser) non dichiarano la durata: la ricavo andando in fondo
      this.video.currentTime = 1e9;
      await new Promise(ok => { this.video.onseeked = ok; });
      this.video.currentTime = 0;
      await new Promise(ok => { this.video.onseeked = ok; });
      this.video.onseeked = null;
    }
    this.inizio = 0;
    this.fine = this.video.duration;
    this.aggiornaMisure();
    this.ciclo();
  }

  get durata() { return this.video.duration || 0; }

  ritaglio() {
    const { videoWidth: vl, videoHeight: va } = this.video;
    const r = FORMATI[this.formato];
    if (!r) return [0, 0, 1, 1];
    const a = vl / va;
    if (a > r) { const w = r / a; return [(1 - w) * this.posizione, 0, w, 1]; }
    const h = a / r;
    return [0, (1 - h) * this.posizione, 1, h];
  }

  misuraUscita(lato) {
    const { videoWidth: vl, videoHeight: va } = this.video;
    const [, , w, h] = this.ritaglio();
    const l = vl * w;
    const a = va * h;
    const s = Math.min(1, lato / Math.max(l, a));
    const pari = v => Math.max(2, Math.round(v * s / 2) * 2);
    return [pari(l), pari(a)];
  }

  aggiornaMisure() {
    const [l, a] = this.misuraUscita(LATO_ANTEPRIMA);
    this.canvas.width = this.sovrapposto.width = l;
    this.canvas.height = this.sovrapposto.height = a;
    if (!this.renderer) this.renderer = new Renderer(this.canvas);
    this.disegnaFotogramma();
    this.segnaModifica();
  }

  // Safari può togliere la GPU alla pagina: ricreo il motore e ridisegno
  ripristinaRenderer() {
    this.renderer = new Renderer(this.canvas);
    this.segnaModifica();
  }

  disegnaFotogramma(renderer = this.renderer) {
    if (!renderer || this.video.readyState < 2) return;
    renderer.impostaSorgente(this.video, this.video.videoWidth, this.video.videoHeight);
    renderer.disegna(this.parametri, this.ritaglio(), this.video.currentTime);
  }

  disegnaSottotitoliSu(ctx, L, A) {
    ctx.clearRect(0, 0, L, A);
    if (this.mostraSottotitoli && this.sottotitoli.length) {
      disegnaSottotitolo(ctx, this.sottotitoli, this.video.currentTime, L, A, this.stileSottotitoli);
    }
  }

  // da chiamare quando cambiano regolazioni, formato o sottotitoli: il prossimo fotogramma va ridisegnato
  segnaModifica() { this.sporco = true; }

  // Ridisegna solo se serve (video in riproduzione o qualcosa è cambiato) e solo con la scheda Video visibile:
  // ridisegnare sempre un video 4K a 60 fotogrammi al secondo consumerebbe memoria e batteria per niente.
  ciclo() {
    if (this._ciclo) return;
    const ctx = this.sovrapposto.getContext('2d');
    for (const ev of ['seeked', 'loadeddata', 'play']) this.video.addEventListener(ev, () => this.segnaModifica());
    const passo = () => {
      if (!this.inEsportazione && this.attivo && (this.sporco || !this.video.paused)) {
        this.sporco = false;
        this.disegnaFotogramma();
        this.disegnaSottotitoliSu(ctx, this.sovrapposto.width, this.sovrapposto.height);
      }
      this._ciclo = requestAnimationFrame(passo);
    };
    this._ciclo = requestAnimationFrame(passo);
  }

  // la scheda Video è visibile? (impostato dall'app)
  impostaAttivo(attivo) {
    this.attivo = attivo;
    if (attivo) this.segnaModifica(); else this.video.pause();
  }

  riproduciPausa() {
    if (this.video.paused) {
      if (this.video.currentTime < this.inizio || this.video.currentTime >= this.fine) this.video.currentTime = this.inizio;
      this.video.playbackRate = this.velocita;
      // play() viene rifiutato se nel frattempo si mette in pausa: non è un errore
      this.video.play().catch(() => {});
      return true;
    }
    this.video.pause();
    return false;
  }

  vaiA(t) { this.video.currentTime = t; }

  // Grafo audio: audio originale + musica facoltativa → traccia della registrazione.
  async preparaAudio() {
    if (!this.audio) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      const guadagnoOriginale = ctx.createGain();
      ctx.createMediaElementSource(this.video).connect(guadagnoOriginale).connect(dest);
      const guadagnoMusica = ctx.createGain();
      guadagnoMusica.connect(dest);
      this.audio = { ctx, dest, guadagnoOriginale, guadagnoMusica, brano: null, fileBrano: null };
    }
    const a = this.audio;
    a.guadagnoOriginale.gain.value = this.volumeOriginale;
    a.guadagnoMusica.gain.value = this.volumeMusica;
    if (this.musica && a.fileBrano !== this.musica) {
      a.brano?.pause();
      const brano = new Audio(URL.createObjectURL(this.musica));
      brano.crossOrigin = 'anonymous';
      a.ctx.createMediaElementSource(brano).connect(a.guadagnoMusica);
      a.brano = brano;
      a.fileBrano = this.musica;
    }
    await a.ctx.resume();
    return a;
  }

  // Registra il video modificato in tempo reale (durata = tratto scelto ÷ velocità).
  async esporta(suAvanzamento) {
    const tipo = tipoSupportato();
    if (!tipo) throw new Error('Questo browser non può registrare video');
    const [l, a] = this.misuraUscita(LATO_USCITA);
    // un solo contesto WebGL per tutte le esportazioni: crearne uno nuovo ogni volta li esaurisce su Safari
    if (!this.telaEsporta) {
      this.telaEsporta = document.createElement('canvas');
      this.rendererEsporta = new Renderer(this.telaEsporta);
    }
    const telaGl = this.telaEsporta;
    telaGl.width = l;
    telaGl.height = a;
    const r = this.rendererEsporta;
    // la registrazione parte da un canvas 2D: fotogramma WebGL + sottotitoli sopra
    const composta = document.createElement('canvas');
    composta.width = l;
    composta.height = a;
    const cc = composta.getContext('2d');
    const flusso = composta.captureStream(30);

    const pezzi = [];
    let registratore = null;
    let timer = 0;
    let interrotto = null;
    this.inEsportazione = true;
    try {
      const audio = await this.preparaAudio();
      for (const traccia of audio.dest.stream.getAudioTracks()) flusso.addTrack(traccia);

      registratore = new MediaRecorder(flusso, { mimeType: tipo, videoBitsPerSecond: 10_000_000 });
      registratore.ondataavailable = e => e.data.size && pezzi.push(e.data);
      const finito = new Promise(ok => { registratore.onstop = ok; });

      const componi = () => {
        this.disegnaFotogramma(r);
        cc.drawImage(telaGl, 0, 0);
        if (this.mostraSottotitoli && this.sottotitoli.length) {
          disegnaSottotitolo(cc, this.sottotitoli, this.video.currentTime, l, a, this.stileSottotitoli);
        }
      };

      this.video.pause();
      this.video.currentTime = this.inizio;
      await new Promise(ok => { this.video.onseeked = ok; });
      this.video.onseeked = null;
      this.video.muted = false;
      this.video.playbackRate = this.velocita;
      componi();
      registratore.start(500);
      if (audio.brano && this.musica) { audio.brano.currentTime = 0; audio.brano.play().catch(() => {}); }
      await this.video.play();
      // timer a 30 fps invece di requestAnimationFrame: continua anche se il browser rallenta l'animazione
      await new Promise((ok, ko) => {
        const chiudi = () => { clearInterval(timer); this.video.removeEventListener('ended', fine); this.video.removeEventListener('pause', inPausa); };
        const fine = () => { chiudi(); ok(); };
        // se il video si ferma da solo (app in sottofondo, chiamata) interrompo invece di aspettare per sempre
        const inPausa = () => {
          if (this.video.currentTime >= this.fine - 0.05 || this.video.ended) return fine();
          interrotto = new Error('esportazione interrotta: il video si è fermato (app in sottofondo?). Riprova tenendo l\'app aperta');
          chiudi();
          ko(interrotto);
        };
        timer = setInterval(() => {
          componi();
          const t = this.video.currentTime;
          suAvanzamento?.((t - this.inizio) / Math.max(0.01, this.fine - this.inizio));
          if (t >= this.fine - 0.02 || this.video.ended) fine();
        }, 1000 / 30);
        this.video.addEventListener('ended', fine);
        this.video.addEventListener('pause', inPausa);
      });
      audio.brano?.pause();
      registratore.stop();
      await finito;
    } finally {
      // qualunque cosa succeda, rimetto l'editor in uno stato utilizzabile
      clearInterval(timer);
      this.video.pause();
      this.audio?.brano?.pause();
      this.video.muted = true;
      if (registratore && registratore.state !== 'inactive') registratore.stop();
      flusso.getVideoTracks().forEach(t => t.stop());
      composta.width = composta.height = 0;
      this.inEsportazione = false;
      this.video.currentTime = this.inizio;
      this.segnaModifica();
    }
    const estensione = tipo.startsWith('video/mp4') ? 'mp4' : 'webm';
    return new File(pezzi, `ritokko-${Date.now()}.${estensione}`, { type: tipo.split(';')[0] });
  }
}
