# TASK-138 Admin Web runtime

## Esito

`PASS_LOCAL_RUNTIME` su Chromium desktop `1440x900` e tablet `900x1180`.
Nessuna nuova dipendenza, migration o modifica al contratto backend TASK-137.

## Implementazione

- gate reale `IntersectionObserver` con cancellazione quando la riga esce dalla
  viewport;
- dedup e batch `read-urls` massimi 100, read concurrency `2`, download
  concurrency `4`, single-flight con cancellation per consumer;
- validazione status/MIME/marker/decode prima del commit Cache Storage;
- cache account/shop scoped e purge su cambio scope e su entrambi i logout;
- preprocess JPEG/PNG in Web Worker con `createImageBitmap`/`OffscreenCanvas`,
  progress e cancellazione prima del finalize;
- thumb lista `crop`, main editor `contain`; placeholder locale senza version ID;
- corretto il wiring lista: l'API riceve ora il UUID `rowKey`, non lo short ID
  presentazionale.

## Prove browser

Run finale TASK-138: `5 passed`, `1 skipped` intenzionale in `15,2 s`.
Lo skip e la duplicazione della sola suite preprocess sul progetto tablet;
Product A/B e lista 200 sono passati su entrambi i viewport.

- Product A: `0` image reference, `0` richiesta Storage;
- Product B: `2` download (thumb + main), `2` cache entry;
- offline reopen: `0` richiesta Storage addizionale;
- lista 200: `200` righe renderizzate, solo `2` riferimenti visibili avviati;
- suite preprocess: `8` input accettati, `3` rifiutati, cancel 48 MP `PASS`;
- GIF di rifiuto verificata dal decoder come realmente multi-frame (`2` frame).

Un run intermedio avviato senza `SUPABASE_SERVICE_ROLE_KEY` server-side ha
fallito correttamente con `503/not_configured`; il run finale ha passato la
chiave locale soltanto al processo server, mai come `NEXT_PUBLIC_*`.

## Check

- `node --test tests/foundation/task-138-product-images-runtime.test.mjs`:
  `4/4 PASS`;
- foundation TASK-138 + allowlist/governance pertinenti: `64/64 PASS`;
- regressione E2E TASK-137: `1/1 PASS`;
- `npm run typecheck`: `PASS`;
- `npm run lint`: `PASS`;
- `npm run build`: `PASS`, Next.js `16.2.6`;
- `git diff --check`: `PASS`.

Il run foundation globale termina con `6` failure esterne al diff: cinque
invarianti Win7POS sul checkout escluso/dirty e TASK-072 su checkout mobile
originale dirty. Nessun test TASK-138 o file Admin modificato fallisce.

`npm run verify` non viene dichiarato PASS: il suo security step ha letto il
checkout Win7POS originale dirty e ha trovato un file atteso assente.
`npm run i18n:check` e `BLOCKED_ENV_EXTERNAL` perche la topologia del worktree
isolato non contiene il sibling Win7POS previsto dallo script. I gate Admin
equivalenti sono stati eseguiti separatamente; lo scan normale scoped e PASS.

## Artifact

- `admin-product-ab-chromium-desktop.png/.json`;
- `admin-product-ab-chromium-tablet.png/.json`;
- `admin-200-visible-chromium-desktop.png/.json`;
- `admin-200-visible-chromium-tablet.png/.json`;
- `admin-preprocessing-chromium-desktop.json`.

Gli screenshot contengono solo fixture sintetiche TASK-138.
