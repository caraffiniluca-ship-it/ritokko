# Glowy · Ogni scatto, da copertina

Web app (PWA) per iPhone che ritocca foto e video, crea immagini con l'AI e li condivide su Instagram e TikTok.
È gratuita e open source: non servono abbonamenti, server propri né un PC acceso.

## Funzioni

### Foto
| Funzione | Dove lavora | Tecnologia |
|---|---|---|
| **Rimuovi → Tocca**: selezioni persona o oggetto con un tocco | sull'iPhone | SlimSAM (Segment Anything, Apache 2.0) con Transformers.js |
| **Rimuovi → Pennello / Cancella**: gomma magica | sull'iPhone | MI-GAN (Picsart AI Research, MIT) con ONNX Runtime Web e WebGPU |
| **Sfondo**: tocchi il soggetto e lo sfondo diventa sfocato (effetto ritratto), bianco con ombra (foto prodotto, ideale per Vinted ed eBay), nero, pastello o gradiente | sull'iPhone | SlimSAM e canvas |
| **Look**: Clean, Pellicola, Y2K, Golden, Vintage, Notte, Pop, B&N… con grana e sbiadito | sull'iPhone | shader WebGL |
| **Migliora**: auto-ritocco, nitidezza, vivacità, vignettatura | sull'iPhone | istogramma e WebGL |
| **Formato**: Post 4:5, Quadrato, Storia 9:16, Orizzontale, con inquadratura regolabile | sull'iPhone | canvas |
| **Chiedi**: modifiche a parole ("togli l'uomo in rosso") | online, gratis, pochi usi al giorno | Space Hugging Face: FLUX.1 Kontext [dev], Qwen-Image-Edit |

### Video
- Taglio, formati 9:16 / 1:1 / 4:5, velocità 0,5×–2×, look e regolazioni di luce e colore.
- **Sottotitoli automatici** in italiano, inglese, spagnolo, francese e tedesco, con Whisper (OpenAI, MIT) che gira sull'iPhone.
  Tre stili (Pop, Classico, Box) e testo correggibile a mano.
- **Musica** di sottofondo, con volume separato da quello dell'audio originale.

### Crea
- Immagini da una descrizione, anche in italiano, con 7 stili (Foto, Cinema, Anime, 3D, Acquerello, Neon, Minimal) e
  4 formati social. Si possono poi modificare nell'editor Foto o pubblicare direttamente.
- Servizi online gratuiti di Hugging Face: Z-Image-Turbo, FLUX.1 schnell e Qwen-Image, tutti con licenza Apache 2.0.

Tutto si pubblica con il pulsante **Pubblica**, che apre il menu Condividi di iOS: da lì scegli Instagram, TikTok o "Salva".

## Privacy
Tutte le funzioni lavorano sul telefono, tranne **Chiedi** e **Crea**. "Chiedi" invia la foto ridotta a 1024 px,
"Crea" invia solo il testo; entrambi vanno a Space pubblici di Hugging Face. Non ci sono account, server propri,
statistiche o pubblicità.

## Requisiti
- iPhone con **iOS 26**, dove WebGPU è attivo di serie. Su iOS precedenti funziona, ma più lenta.
- Al primo uso alcune funzioni scaricano un modello, che poi resta in cache:

  | Funzione | Download |
  |---|---|
  | Selezione con un tocco | circa 14 MB |
  | Gomma magica | 28 MB |
  | Sottotitoli | circa 77 MB |

## Pubblicarla gratis con GitHub Pages
1. Su GitHub apri il repository e vai in **Settings → Pages**.
2. Alla voce **Build and deployment → Source** scegli "Deploy from a branch", poi `main` e la cartella `/ (root)`, e premi **Save**.
3. Dopo circa un minuto l'app è su `https://<utente>.github.io/<repository>/`.

In alternativa, sempre gratis: Cloudflare Pages, Netlify (trascinando la cartella) o Codeberg Pages.
Non c'è niente da compilare: sono file statici.

## Installarla sull'iPhone
1. Apri l'indirizzo con **Safari**.
2. Tocca **Condividi**, poi **Aggiungi alla schermata Home**.
3. Apri Glowy dall'icona: si avvia a tutto schermo, come un'app.

## Più utilizzi di "Chiedi" e "Crea" (facoltativo)
Crea un account gratuito su huggingface.co, poi vai in **Settings → Access Tokens** e crea un token di tipo **Read**.
Incollalo nelle Impostazioni di Glowy, l'icona in alto a destra. Il token resta solo sul telefono.

## Provarla sul PC
```bash
python -m http.server 8600
```
Poi apri http://localhost:8600.

## Limiti noti
- Gli Space gratuiti di Hugging Face possono essere occupati, in errore o cambiare API: l'app prova da sola quelli di
  riserva (elenchi in `ai-online.js` e `crea.js`). Per un uso commerciale serve un servizio a pagamento.
- **FLUX.1 Kontext [dev]**, usato da "Chiedi", ha licenza **non commerciale**. Le altre componenti permettono anche l'uso
  commerciale.
- Il video si esporta in tempo reale: un clip da 30 s a velocità 1× richiede 30 s. Nell'anteprima l'audio è spento,
  ma nel file finale c'è.
- La rimozione di oggetti dai **video** non è inclusa: richiede troppa potenza per un telefono.
- Quando pubblichi immagini create o modificate con l'AI, usa l'etichetta "Creato con l'AI" di Instagram e TikTok.

## Struttura
| File | Contenuto |
|---|---|
| `index.html`, `style.css` | interfaccia |
| `app.js` | logica dell'interfaccia |
| `gl.js` | motore luce, colore e look (WebGL) |
| `seleziona.js` | selezione con un tocco (SlimSAM) |
| `inpaint.js` | gomma magica (MI-GAN) |
| `sfondo.js` | effetti sfondo e ritaglio nei formati social |
| `ai-online.js` | "Chiedi" e collegamento agli Space di Hugging Face |
| `crea.js` | "Crea": immagini da testo |
| `video.js` | editor video |
| `sottotitoli.js` | sottotitoli automatici (Whisper) |
| `sw.js`, `manifest.webmanifest`, `icone/` | installazione come app e cache |

## Licenza
Codice di Glowy: [MIT](LICENSE). I modelli AI hanno le loro licenze, elencate anche nell'app (Impostazioni → Licenze e crediti).
