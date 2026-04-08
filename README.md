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

- Genera 50 immagini demo e manifest: `npm run generate:demo`
- Rigenera solo il manifest leggendo i file in `/public/images`: `npm run build:manifest`
- Watch live sulla cartella immagini (rigenera manifest automatico): `npm run watch:images`
- Avvio logger + watcher immagini + Vite insieme: `npm run dev` (alias `npm run dev:live`)
- Avvio solo Vite (senza watcher e logger): `npm run dev:vite`
- Avvio solo server log: `npm run logger:server`
- Build produzione completa (manifest + build): `npm run build:prod`
- Avvio server produzione statico da `dist`: `npm run start:prod`

## Log File

I log vengono scritti in:

`/logs/installation-YYYY-MM-DD.log`

Nel log trovi:
- avvio/arresto orchestrator e server log,
- avvio/arresto watcher immagini e aggiornamenti manifest,
- swipe selettori data e swipe carosello,
- immagine finale su cui l’utente si è fermato,
- metriche periodiche performance grafica in `dev` (fps medio, long frames, frame peggiore, heap).

## Struttura progetto

```text
public/
  config/settings.json
  images/
    manifest.json
scripts/
  build-manifest.mjs
  dev-live.mjs
  generate-demo-images.mjs
  logger-server.mjs
  logging.mjs
  watch-images.mjs
src/
  components/
    DateWheelPicker.tsx
    WebGLCarousel.tsx
  lib/
    client-logger.ts
    data-loader.ts
    date-utils.ts
    indexing.ts
  App.tsx
```
