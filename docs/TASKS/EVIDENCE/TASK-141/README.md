# TASK-141 Evidence

## Baseline e target

- Admin main iniziale:
  `8d7907a22af21b0be52638512549d97faeb6330a`.
- Worker staging iniziale:
  `aeb4e70d-8d66-43c7-b686-91a5d31c99be`.
- Supabase linked: target non-production allowlisted, ref redatto
  `jpgo...kyvm`.
- Migration parity iniziale: `PASS`, pending `0`.
- Production: `NOT_RUN`.
- Win7POS/Android/iOS: `NOT_MODIFIED`.

## Diagnosi read-only

- Audit `pos.catalog.pull.failure`, `code=db_failure`, route
  `pos.catalog.pull`, stesso shop/device e cursore `none`.
- Finestra osservata:
  `2026-07-26T23:22:34.146Z` - `2026-07-26T23:53:23.806Z`.
- Ultimo request ID osservato, redatto: `posreq_e...f428`.
- Lease RPC: HTTP `200`.
- Audit RPC: HTTP `200`.
- Page RPC: HTTP `500`.
- Riproduzione Data API: SQLSTATE `57014`,
  `canceling statement due to statement timeout`, elapsed `8309ms`.
- Timeout `authenticator`: `8s`.
- Scope: `authorized_shop_plus_legacy`, mapping `1`, revisione `1`.
- Conteggi: categorie `100`, fornitori `131`, prodotti `19.823`, prezzi
  `41.323`.
- Invalid row/duplicate/product-reference counts: tutti `0`.
- Prezzi classificati orfani: `95`, tutti riferiti a `41` prodotti
  soft-deleted dello stesso scope; nessun prodotto mancante o cross-scope.
- Lane lease-bound senza manifest:
  - categories: `71`, `hasMore=false`;
  - suppliers: `102`, `hasMore=false`;
  - products: `60`, `hasMore=true`;
  - prices: `120`, `hasMore=true`.

## Execution

### File modificati

- `supabase/migrations/20260727002052_task_141_win7pos_catalog_bootstrap_integrity_preflight.sql`
- `supabase/tests/task_141_win7pos_catalog_bootstrap.sql`
- `src/server/pos-auth/catalog-revision.ts`
- `src/server/pos-auth/catalog-pull.ts`
- `tests/foundation/task-139-pos-catalog-v2-pagination.test.mjs`
- `tests/foundation/task-141-win7pos-catalog-bootstrap.test.mjs`
- `tests/foundation/task-079-catalog-pagination-unified.test.mjs`
- governance TASK-141 e Master Plan.

### Fix DB

- Nessun aumento del timeout runtime.
- `pos_catalog_integrity_violation_count_v2` resta `STABLE`,
  `SECURITY DEFINER`, fail-closed e con `search_path` esplicito.
- Conteggi massimi, controlli storage/tipo, duplicati e relazioni restano
  obbligatori.
- Il percorso comune calcola in modo set-based un upper bound conservativo
  dell'espansione JSON; i serializer esatti restano il fallback autoritativo
  per righe o domini vicini al limite.
- Un prezzo storico collegato a un prodotto soft-deleted nello stesso scope
  non è più un orfano; prodotto mancante o cross-scope resta bloccante.
- Manifest e lane continuano a escludere prodotti soft-deleted e relativi
  prezzi dal catalogo attivo.

### Fix runtime

- SQLSTATE `57014` è classificato come
  `catalog_rpc_statement_timeout`.
- Gli audit failure aggiungono solo valori bounded: `stage`, `lane`,
  `reason`, presenza manifest e row count dove già disponibili.
- Messaggio, detail SQL, righe, token e identificativi sensibili non vengono
  copiati nell'audit o nella risposta.

### Gate eseguiti

- `git diff --check`: `PASS`.
- Foundation mirati TASK-139/TASK-141: `11/11 PASS`.
- Foundation governance TASK-079 dopo allowlist TASK-141: `4/4 PASS`.
- `npm run lint`: `PASS`.
- `npm run typecheck`: `PASS`.
- `npm run check:pos-catalog-paging`: `PASS`.
- `npm run verify`: `PASS`; include lint, typecheck, security scan e build
  Next.js 16.2.6.
- `npm run cf:build`: `PASS`; bundle OpenNext Worker generato.
- Reset completo di un Supabase DB temporaneo e isolato con tutte le
  migration: `PASS`.
- `supabase test db ... task_141_win7pos_catalog_bootstrap.sql`:
  `10/10 PASS`, `3s` wall clock.
- La regressione pgTAP contiene `100` categorie, `131` fornitori,
  `19.823` prodotti e `41.323` prezzi, inclusi `95` prezzi storici su
  `41` prodotti soft-deleted, e asserisce il manifest first-page sotto
  `7.500ms`.
- La stessa regressione prova che un prodotto realmente mancante restituisce
  `integrity_blocked` senza righe o manifest parziale.

### Gate esterni

- `npm run test:foundation` completo: `BLOCKED_ENV` su quattro test storici
  che leggono file da `/Users/minxiang/Projects/Win7POS`.
- Il checkout Win7POS esterno è su
  `backup/win7pos-dirty-20260722-81acd479`, già dirty, e non contiene i
  quattro file richiesti dai test TASK-028/081/087/089.
- Dopo l'aggiornamento dell'allowlist TASK-141 non restano failure Admin nella
  suite. Il repository Win7POS non è stato modificato o riconciliato, come
  richiesto dallo scope.
- Production, Android, iOS e device fisico: `NOT_RUN` / `NOT_MODIFIED`.

## Review

### Review locale

- Root cause confermata su lease/audit/page RPC, non dedotta dal client.
- Diff additivo e limitato a preflight, diagnostica e regressioni.
- Nessuna nuova dipendenza.
- Nessuna modifica RLS, lease, timeout Data API o grant client.
- `anon` e `authenticated` non ottengono execute sul preflight;
  `service_role` conserva il solo grant previsto.
- Il comportamento resta fail-closed su corruzione reale e non restituisce
  cataloghi vuoti come successo.
- Codex Security/CodeQL manuali: `NOT_RUN` perché esplicitamente esclusi
  dall'incidente; lo scan security del repository incluso in `verify` è
  `PASS`.

### PR, CI e merge

- Commit fix: `84f1887f961915aa5e7a8d0319cbacece173fc3a`.
- PR: `#41`, pronta per review, mergeable `CLEAN`.
- CI PR:
  - `Database migrations and pgTAP`: `PASS`, `2m12s`;
  - `Cloudflare build`: `PASS`, `2m19s`;
  - `Verify`: `PASS`, `3m05s`;
  - deploy staging/production: correttamente `SKIPPED` sulla PR.
- Merge normale, non squash e non force:
  `7f8104e75533b9dc83d5ef5d1aba28ae17617805`.
- CI `main` sul merge SHA: `PASS`.
- Checkout locale `main` riconciliato con `origin/main`.

### Apply e deploy staging

- Guardrail target: `PASS`; URL HTTPS Supabase, ref linked allowlisted e
  dichiarato non-production.
- Dry-run: una sola migration pending TASK-141.
- `supabase db push --linked`: migration
  `20260727002052` applicata con successo.
- Parity successiva: versione locale e linked entrambe
  `20260727002052`.
- Proprietà live del preflight: `STABLE`, `SECURITY DEFINER`,
  `search_path=public, app_private, pg_temp`.
- Grant live: `service_role=EXECUTE`; `anon` e `authenticated` negati.
- Advisor security/performance post-DDL: nessun finding nuovo riferibile a
  TASK-141; restano warning/info storici fuori scope già presenti.
- Data API reale lease-bound sullo scope Asus, un solo tentativo server-side:
  `status=ok`, elapsed `3.704ms`, scope
  `authorized_shop_plus_legacy`, revisione `1`.
- Prima lane reale: `categories`, `71` righe, page limit `240`,
  `entityHasMore=false`.
- Manifest attivo reale: categorie `71`, fornitori `102`, prodotti
  `19.763`, prezzi `41.228`, prodotti attivi `19.763`.
- Worker staging precedente: `aeb4e70d...99be`.
- Worker staging TASK-141:
  `87430495-6b28-429d-9f40-40240b5793c4`.
- `npm run cf:check:staging`: public workers.dev smoke `PASS`.
- Production apply/deploy: `NOT_RUN`.

### Verdict finale

`DONE`.

Tutti i criteri di accettazione TASK-141 risultano soddisfatti con evidence
reale. Nessun retry fisico è stato richiesto durante fix/deploy.

### Handoff retry fisico Asus

1. Avviare una sola sincronizzazione catalogo dal dispositivo Asus.
2. Atteso: flusso HTTP `200/success` e prosecuzione automatica delle lane
   snapshot-bound; nessun catalogo vuoto.
3. Se fallisce, non ripetere: annotare timestamp, route, codice HTTP/app e
   request ID redatto.
4. Correlare poi quell'unico tentativo con audit `pos.catalog.pull.failure`;
   i nuovi campi bounded `stage/lane/reason` distinguono timeout RPC,
   response invalid e contract invalid senza esporre dati sensibili.
