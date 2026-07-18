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

- test foundation post-hardening e clean-merge authorization: `20/20 PASS`;
- pgTAP/RLS post-hardening: `76/76 PASS`;
- scanner repository `scripts/security-checks.mjs`: baseline clean-merge
  storica `PASS` con repository esterno saltato dal meccanismo nativo; rerun
  corrente con Win7POS read-only reale `BLOCKED_EXTERNAL_PREREQUISITE`;
- test regressione scanner TASK-027 storico: `8/8 PASS`; la modifica locale
  preesistente a quel file è esclusa dal commit TASK-137;
- API/E2E locale: intent, 2 PUT, finalize, read privata, checksum no-op,
  remove e duplicate remove `PASS`;
- mismatch, cross-shop, viewer/suspended, path fabbricato, lifecycle diretto e
  riferimento prodotto client-managed: negati dai test SQL/contratto;
- audit e sync payload: nessun path, token, signed URL o byte.

La validazione clean-merge ha evidenziato e risolto dipendenze di harness gia
presenti nel worktree, incluse senza ampliare il runtime Win7POS:

1. il pattern generico interpretava `node:crypto.createHash().update()` come
   mutazione Supabase;
2. il gate Win7 TASK-027 richiedeva una forma sintattica superata, mentre il
   checkout pulito usa `requestCursor` con la stessa garanzia shop-bound.
3. il gate TASK-041 richiedeva ancora scritture finanziarie dirette rimosse
   dalla RPC atomica TASK-088; ora verifica migration e pgTAP congelati.
4. il gate i18n usava il vecchio `OperatorLoginDialog` e interpretava il
   prefisso dinamico `notice.` come chiave letterale.

Sono stati aggiornati soltanto i gate Admin e il resolver autorizzativo
necessario alle nuove letture. Win7POS non e stato modificato. Nel run storico
clean-merge `npm run verify` e `npm run i18n:check` terminarono `PASS`, con il
repository esterno saltato dal meccanismo nativo. Nel rerun finale corrente,
`npm run i18n:check` resta `PASS`, mentre `npm run verify` e
`npm run security:scan` sono `BLOCKED_EXTERNAL_PREREQUISITE`: il checkout
Win7POS reale e read-only non contiene piu il file storico
`OperatorLoginDialog.xaml.cs` richiesto dallo scanner Admin. Typecheck, lint,
foundation TASK-137 e build sono stati rieseguiti separatamente con esito
`PASS`.
