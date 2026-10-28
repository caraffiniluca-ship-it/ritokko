// Motore di regolazione luce/colore su GPU (WebGL 1): stesso codice per foto e video.

export const PARAMETRI_ZERO = Object.freeze({
  esposizione: 0, contrasto: 0, luci: 0, ombre: 0, calore: 0,
  saturazione: 0, vivacita: 0, nitidezza: 0, vignettatura: 0, grana: 0, sbiadito: 0,
});

export const CURSORI_LUCE = [
  { chiave: 'esposizione', etichetta: 'Esposizione', min: -1.5, max: 1.5, passo: 0.01 },
  { chiave: 'contrasto', etichetta: 'Contrasto', min: -0.5, max: 0.8, passo: 0.01 },
  { chiave: 'luci', etichetta: 'Luci', min: -1, max: 1, passo: 0.01 },
  { chiave: 'ombre', etichetta: 'Ombre', min: -1, max: 1, passo: 0.01 },
  { chiave: 'calore', etichetta: 'Calore', min: -1, max: 1, passo: 0.01 },
  { chiave: 'saturazione', etichetta: 'Saturazione', min: -1, max: 1, passo: 0.01 },
];

export const CURSORI_MIGLIORA = [
  { chiave: 'nitidezza', etichetta: 'Nitidezza', min: 0, max: 1.5, passo: 0.01 },
  { chiave: 'vivacita', etichetta: 'Vivacità', min: -1, max: 1, passo: 0.01 },
  { chiave: 'vignettatura', etichetta: 'Vignettatura', min: -0.5, max: 1, passo: 0.01 },
  { chiave: 'grana', etichetta: 'Grana', min: 0, max: 1, passo: 0.01 },
  { chiave: 'sbiadito', etichetta: 'Sbiadito', min: 0, max: 1, passo: 0.01 },
];

// "Look" di tendenza: un tocco e la foto prende uno stile riconoscibile.
export const PRESET = {
  Naturale: {},
  Clean: { esposizione: 0.2, ombre: 0.3, contrasto: -0.08, saturazione: -0.15, calore: 0.1, nitidezza: 0.2 },
  Pellicola: { calore: 0.2, contrasto: -0.05, sbiadito: 0.3, grana: 0.35, saturazione: -0.12, vignettatura: 0.15 },
  Y2K: { esposizione: 0.2, contrasto: 0.25, saturazione: 0.3, calore: -0.25, vignettatura: 0.25, grana: 0.12 },
  Golden: { calore: 0.6, contrasto: 0.15, saturazione: 0.15, vignettatura: 0.3, ombre: 0.15 },
  Vintage: { calore: 0.45, sbiadito: 0.4, saturazione: -0.3, vignettatura: 0.45, grana: 0.3 },
  Luminosa: { esposizione: 0.35, ombre: 0.4, luci: -0.2, vivacita: 0.2 },
  Notte: { esposizione: 0.3, ombre: 0.5, calore: -0.35, contrasto: 0.2, vivacita: 0.2 },
  Pop: { contrasto: 0.3, vivacita: 0.5, nitidezza: 0.4 },
  'B&N': { saturazione: -1, contrasto: 0.25, grana: 0.2 },
};

const VERTICI = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAMMENTI = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec4 u_ritaglio;
uniform float u_esposizione, u_contrasto, u_luci, u_ombre, u_calore;
uniform float u_saturazione, u_vivacita, u_nitidezza, u_vignettatura, u_grana, u_sbiadito, u_tempo;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
void main() {
  vec2 uv = u_ritaglio.xy + v_uv * u_ritaglio.zw;
  vec3 c = texture2D(u_tex, uv).rgb;
  if (u_nitidezza > 0.0) {
    vec3 sfocato = (texture2D(u_tex, uv + vec2(u_texel.x, 0.0)).rgb +
                    texture2D(u_tex, uv - vec2(u_texel.x, 0.0)).rgb +
                    texture2D(u_tex, uv + vec2(0.0, u_texel.y)).rgb +
                    texture2D(u_tex, uv - vec2(0.0, u_texel.y)).rgb) * 0.25;
    c += (c - sfocato) * u_nitidezza * 2.0;
  }
  c *= pow(2.0, u_esposizione);
  float l = clamp(dot(c, LUMA), 0.0, 1.0);
  c *= 1.0 + u_ombre * 0.8 * (1.0 - smoothstep(0.0, 0.55, l));
  c *= 1.0 + u_luci * 0.5 * smoothstep(0.45, 1.0, l);
  c = (c - 0.5) * (1.0 + u_contrasto) + 0.5;
  c.r += u_calore * 0.07;
  c.b -= u_calore * 0.07;
  float g = dot(c, LUMA);
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  c = mix(vec3(g), c, 1.0 + u_saturazione + u_vivacita * (1.0 - sat));
  if (u_vignettatura != 0.0) {
    float d = distance(v_uv, vec2(0.5));
    c *= 1.0 - u_vignettatura * smoothstep(0.25, 0.85, d);
  }
  c = mix(c, c * 0.82 + 0.1, u_sbiadito);
  if (u_grana > 0.0) {
    float n = fract(sin(dot(gl_FragCoord.xy + u_tempo * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    c += n * u_grana * 0.16;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL non disponibile su questo dispositivo');
    this.gl = gl;
    const prog = gl.createProgram();
    for (const [tipo, src] of [[gl.VERTEX_SHADER, VERTICI], [gl.FRAGMENT_SHADER, FRAMMENTI]]) {
      const sh = gl.createShader(tipo);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.uniform = {};
    for (const nome of ['u_texel', 'u_ritaglio', 'u_tempo', ...Object.keys(PARAMETRI_ZERO).map(k => 'u_' + k)]) {
      this.uniform[nome] = gl.getUniformLocation(prog, nome);
    }
    this.larghezzaSorgente = 1;
    this.altezzaSorgente = 1;
  }

  // sorgente: canvas, ImageBitmap, <img> o <video> (va richiamato a ogni fotogramma per i video)
  impostaSorgente(sorgente, larghezza, altezza) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sorgente);
    this.larghezzaSorgente = larghezza;
    this.altezzaSorgente = altezza;
  }

  // ritaglio: [x, y, larghezza, altezza] in frazioni della sorgente (0..1)
  // tempo: per i video cambia la grana a ogni fotogramma (sulle foto resta fissa)
  disegna(parametri, ritaglio = [0, 0, 1, 1], tempo = 0) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniform.u_tempo, tempo % 100);
    gl.uniform2f(this.uniform.u_texel, 1 / this.larghezzaSorgente, 1 / this.altezzaSorgente);
    gl.uniform4f(this.uniform.u_ritaglio, ...ritaglio);
    for (const k of Object.keys(PARAMETRI_ZERO)) gl.uniform1f(this.uniform['u_' + k], parametri[k] ?? 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// Calcola regolazioni automatiche dall'istogramma della luminosità.
export function autoMigliora(sorgente) {
  const lato = 256;
  const scala = Math.min(1, lato / Math.max(sorgente.width, sorgente.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sorgente.width * scala));
  c.height = Math.max(1, Math.round(sorgente.height * scala));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sorgente, 0, 0, c.width, c.height);
  const dati = ctx.getImageData(0, 0, c.width, c.height).data;
  const istogramma = new Uint32Array(256);
  let somma = 0;
  const n = dati.length / 4;
  for (let i = 0; i < dati.length; i += 4) {
    const l = Math.round(0.2126 * dati[i] + 0.7152 * dati[i + 1] + 0.0722 * dati[i + 2]);
    istogramma[l]++;
    somma += l;
  }
  const percentile = p => {
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += istogramma[i]; if (acc >= n * p) return i / 255; }
    return 1;
  };
  const media = somma / n / 255;
  const basso = percentile(0.02);
  const alto = percentile(0.98);
  const ampiezza = Math.max(0.05, alto - basso);
  const limita = (v, a, b) => Math.min(b, Math.max(a, v));
  return {
    esposizione: limita(Math.log2(0.46 / Math.max(0.02, media)) * 0.6, -0.8, 0.9),
    contrasto: limita((0.9 / ampiezza - 1) * 0.35, 0, 0.35),
    ombre: media < 0.38 ? 0.35 : 0.1,
    luci: alto > 0.97 ? -0.3 : 0,
    vivacita: 0.3,
    nitidezza: 0.35,
  };
}
