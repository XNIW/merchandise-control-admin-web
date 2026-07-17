# 03 - Admin Web

## Implementazione

- input JPEG/PNG, firma e dimensioni validate;
- canvas con orientamento browser, sfondo bianco e nessun upscale;
- main: `1600 px`, qualita `0.82/0.76/0.70`, target `750 KiB`, hard max
  `1 MiB`, fallback risoluzione `85%` fino a `640 px`;
- thumb: `384 px`, qualita `0.75/0.68/0.60/0.52`, hard max `90 KiB`, fallback
  fino a `128 px`;
- SHA-256 sull'output effettivo, due PUT multipart exact-path, `x-upsert=false`;
- cache byte in memoria account/shop/product/version/variant; nessun
  `localStorage` o `sessionStorage` per URL/token;
- controlli upload/replace/remove separati dal form business prodotto.

## LOCALT137A - E2E Supabase locale

- Chromium desktop: `PASS 1/1`, durata `11.871 s`;
- main `21.907 B`, thumb `5.980 B`, totale `27.887 B`;
- finalize: evento `1`; duplicate/no-op: ancora `1`;
- remove: evento `2`; duplicate remove: ancora `2`;
- cache offline scoped, audit redatto e baseline esatta: `PASS`;
- oggetti finali: `0`.

Artefatti: `admin-web-local-e2e.json` e
`admin-web-product-image-local.png`.

## LOCALT137B - regressione post fallback progressivo

- build corrente servita con `next start` su porta temporanea;
- Chromium desktop: `PASS 1/1` (`3.5 s` test, `4.5 s` totale);
- il run ha verificato il codice browser finale; non e stato inventato un
  secondo set di byte e il JSON metrico LOCALT137A resta la misura canonica;
- cleanup `finally` eseguito; porta temporanea non piu in ascolto.

## LOCALT137C - preprocess e heap browser

- Chromium desktop contro Supabase locale: `PASS 1/1` (`3.4 s` test,
  `4.2 s` runner);
- input PNG sintetico: `929.526 B`, `1200 x 900`;
- preprocess isolato (decode, resize, JPEG encode e SHA-256): `24,8 ms`;
- heap JavaScript prima/dopo: `6.071.148 / 10.229.388 B`;
- picco heap JavaScript osservato con campionamento CDP ogni `5 ms`:
  `22.478.432 B`, delta dal valore iniziale `16.407.284 B`;
- output invariato: main `21.907 B`, thumb `5.980 B`;
- cleanup `finally`, oggetti/versioni `0` e baseline esatta: `PASS`.

Il picco e `JSHeapUsedSize` campionato, non RSS dell'intero processo browser e
non garantisce di catturare un massimo tra due campioni. Artefatto durevole:
`admin-web-performance.json`.

## Gate finali

- test foundation TASK-137 post-hardening: `20/20 PASS`;
- `npm run typecheck`: `PASS`;
- `npm run verify` nel clean merge: `PASS` (lint, typecheck, scanner e build);
- `npm run i18n:check`: `PASS` sul checkout Win7POS read-only corrente;
- scanner TASK-027 mirato: `8/8 PASS`.

Il primo build sandboxed non poteva scaricare il font configurato; il rerun
autorizzato e il gate aggregato finale hanno compilato correttamente.

Il run Admin registra byte input/output, durata preprocess separata dalla rete
e heap JavaScript osservato. Resta non misurato il picco fisico/RSS dell'intero
browser su hardware dedicato.
