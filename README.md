# Museum Touch Installation (WebGL)

Bootstrap per installazione museale touch in verticale (`9:16`), con:
- carosello immagini WebGL (swipe sinistra/destra),
- picker data a 3 ruote stile iOS (anno/mese/giorno),
- sincronizzazione bidirezionale data <-> immagine,
- fallback automatico all’immagine più vicina quando la data esatta non esiste.

## Avvio locale

```bash
npm install
npm run generate:demo
npm run dev
```

## Dati e configurazione

- Impostazioni: `/public/config/settings.json`
- Immagini: `/public/images`
- Manifest immagini: `/public/images/manifest.json`

### Naming immagini

Le immagini devono iniziare con la data:

`YYYY-MM-DD_titolo-esteso.jpg`

Esempi:
- `1954-03-12_scavo-archeologico.jpg`
- `1989-11-09_apertura-sala-B.webp`

Il parser supporta: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.svg`.

## Script utili

- Genera 50 immagini demo e manifest:
  - `npm run generate:demo`
- Rigenera solo il manifest leggendo i file in `/public/images`:
  - `npm run build:manifest`

## Struttura progetto

```text
public/
  config/settings.json
  images/
    manifest.json
scripts/
  build-manifest.mjs
  generate-demo-images.mjs
src/
  components/
    DateWheelPicker.tsx
    WebGLCarousel.tsx
  lib/
    data-loader.ts
    date-utils.ts
    indexing.ts
  App.tsx
```
