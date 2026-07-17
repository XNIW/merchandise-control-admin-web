# 02 - API e test di sicurezza

## Boundary server

Route implementate:

- `POST /api/shop/product-images/intent`;
- `POST /api/shop/product-images/finalize`;
- `POST /api/shop/product-images/read-urls`;
- `POST /api/shop/product-images/remove`.

Le route accettano cookie Admin o bearer mobile, sono `no-store`, leggono JSON
bounded e non accettano file o blob. I byte transitano client -> Storage. Il
server valida magic bytes, struttura JPEG, dimensioni, byte, checksum, aspect
ratio e assenza APP1/EXIF prima della finalizzazione.

## Controlli eseguiti

- test foundation post-hardening: `19/19 PASS`;
- pgTAP/RLS post-hardening: `76/76 PASS`;
- scanner repository `scripts/security-checks.mjs`: `PASS`;
- test regressione scanner TASK-027 storico: `8/8 PASS`; la modifica locale
  preesistente a quel file è esclusa dal commit TASK-137;
- API/E2E locale: intent, 2 PUT, finalize, read privata, checksum no-op,
  remove e duplicate remove `PASS`;
- mismatch, cross-shop, viewer/suspended, path fabbricato, lifecycle diretto e
  riferimento prodotto client-managed: negati dai test SQL/contratto;
- audit e sync payload: nessun path, token, signed URL o byte.

Il primo `npm run verify` finale ha evidenziato due problemi di harness:

1. il pattern generico interpretava `node:crypto.createHash().update()` come
   mutazione Supabase;
2. il gate Win7 TASK-027 richiedeva una forma sintattica superata, mentre il
   checkout pulito usa `requestCursor` con la stessa garanzia shop-bound.

Sono stati aggiornati soltanto allowlist e test scanner Admin. Win7POS non e
stato modificato. Il rerun `npm run verify` e terminato `PASS`.
