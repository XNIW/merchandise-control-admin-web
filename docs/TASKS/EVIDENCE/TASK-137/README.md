# TASK-137 Evidence

Evidence durevole per Product Catalog Images cross-platform.

## Regole

- risultati soltanto da comandi/runtime realmente eseguiti;
- nessun secret, bearer token, cookie, signed URL, byte immagine, EXIF, path
  locale utente o dato cliente;
- fixture esclusivamente sintetiche con prefisso run univoco;
- artefatti temporanei copiati qui solo dopo redazione e controllo permessi;
- Win7POS escluso;
- nessun claim production o deploy; commit/push normali restano vincolati ai
  gate del consolidamento finale.

## Baseline pre-feature

Rilevata il `2026-07-16` prima di qualunque modifica TASK-137.

### Admin Web - hash file sovrapposti

```text
331fd6749e46655c0ec56d5c110f2c6cd97d0f0d  docs/MASTER-PLAN.md
0332998af81e393f05203949b8c5acff5a58de8d  src/lib/supabase/database.types.ts
aa34d0711ee72db5db6c80210ce8deb2b680fed0  src/server/shop-admin/catalog-mutations.ts
bb2248a813cf0ab1d0dd8bf9f7becd0705b116e9  src/server/shop-admin/inventory-read-model.ts
9a302cf978deffe5205f4bdbeadab0d77d8bf9eb  src/server/shop-admin/sync-event-writer.ts
```

### Android - hash file di integrazione

```text
692909d22bf98f8a2de26c290436f396b3513271  docs/MASTER-PLAN.md
7073a89f99e29190e5bd0386302cd916267ae45f  app/src/main/java/com/example/merchandisecontrolsplitview/data/AppDatabase.kt
ee7ff434c0b2c39dbf1f02d153f903248bc27044  app/src/main/java/com/example/merchandisecontrolsplitview/data/InventoryRepository.kt
1489f1271f1726e539655e3ee504ea6cd4db6cd5  app/src/main/java/com/example/merchandisecontrolsplitview/data/SupabaseCatalogRemoteDataSource.kt
6e174081d5784ec8f4541ea5d672ed4921c628bb  app/src/main/java/com/example/merchandisecontrolsplitview/data/SyncEventModels.kt
6889885882d1593537f6136d3929c81383da25fd  app/src/main/java/com/example/merchandisecontrolsplitview/ui/screens/DatabaseScreenComponents.kt
```

### iOS - hash file sovrapposti

```text
cacc426c8f08c892772bd7b6a1381eaf3107dd85  docs/MASTER-PLAN.md
aa518e74ac3e29fd84de5d62ee32a4b9207956dc  iOSMerchandiseControl/DatabaseView.swift
aa939159f1c02c9a4b525246406926cd172a5f72  iOSMerchandiseControl/Sync/Automatic/Catalog/CatalogPushService.swift
9f5c68f2426ecc2e41ba43c70b19916df1eaf5f5  iOSMerchandiseControl/Sync/Automatic/Catalog/CatalogRemoteWriting.swift
8aef55acd4dee80b439231fa9782093ddb5bd650  iOSMerchandiseControl/Sync/Remote/CatalogRemoteSupabaseAdapter.swift
```

### Git iniziale

- Admin Web: worktree gia ampiamente dirty per TASK-088 e task precedenti;
  branch `main`, dietro `origin/main` di 5 commit. Nessun file viene ripristinato.
- Android: `main...origin/main`, worktree pulito al rilevamento.
- iOS: worktree gia dirty per TASK-088/TASK-136 e harness; nessun file viene
  ripristinato.
- Win7POS: `main...origin/main`, worktree pulito; resta intatto.

## Ledger previsto

- `00-contract-and-baseline.md`
- `01-schema-rls-and-grants.md`
- `02-api-and-security-tests.md`
- `03-admin-web.md`
- `04-android.md`
- `05-ios.md`
- `06-cross-platform-runtime.md`
- `07-cleanup-and-baseline.md`
- `08-storage-cost-and-operations.md`
- `09-security-diff-scan/`
- `10-final-handoff.md`
- `11-mac-final-manifest.md`
- `12-publish-checkpoint.md`
- `13-release-security-remediation.md`

I file sono creati solo quando esiste evidence reale da registrare.

Stato al passaggio in review:

- `00`-`08`: compilati con evidence eseguita;
- `09`: conserva il primo scan pre-fix e registra il successivo scan
  consolidato `36/36` con sette finding; remediation locale completata e nuovo
  scan post-remediation ancora `PENDING`;
- `10`: handoff conclusivo `REVIEW_WITH_BLOCKERS`;
- `11`: manifest di inclusione/esclusione riallineato ai commit reali;
- `12`: checkpoint release `REMEDIATION_RESCAN_PENDING`;
- `13`: ledger dei sette finding, remediation, PoC e gate reali;
- runtime live cross-client: `NOT_RUN`, blocker esplicito e non mascherato.

## Run eseguiti

### LOCALT137A - Admin Web + Supabase locale

- `2026-07-17`: Playwright Chromium desktop `PASS 1/1` in `11.871 s`;
- flusso verificato: PNG sintetico -> preprocessing browser -> intent -> due
  `PUT` Storage diretti -> finalize -> read privata/cache -> no-op checksum ->
  offline cache -> remove -> duplicate remove;
- byte server-verificati: main `21.907 B`, thumb `5.980 B`, totale
  `27.887 B`;
- eventi: finalize `1`, duplicate finalize ancora `1`, remove `2`, duplicate
  remove ancora `2`;
- baseline prima/dopo identica su auth user, profili, shop, membership, mapping,
  prodotti, lifecycle, oggetti Storage, sync event e audit;
- oggetti Storage residui TASK-137: `0`;
- evidence: `admin-web-local-e2e.json` e
  `admin-web-product-image-local.png`;
- staging e production: non usati.

### LOCALT137B - browser finale post fallback

- Chromium desktop contro build corrente: `PASS 1/1`;
- durata test `3.5 s`, durata runner `4.5 s`;
- cleanup `finally` eseguito; porta temporanea chiusa;
- nessun secondo set di byte inventato: LOCALT137A resta la misura canonica.

### LOCALT137C - metrica preprocess/heap browser

- Chromium desktop contro build corrente e Supabase locale: `PASS 1/1`;
- durata test `3.4 s`, durata runner `4.2 s`;
- input PNG sintetico `929.526 B`, `1200 x 900`;
- preprocess isolato `24,8 ms`; main `21.907 B`, thumb `5.980 B`;
- heap JavaScript prima/dopo `6.071.148 / 10.229.388 B`, picco campionato
  `22.478.432 B`, delta osservato `16.407.284 B`;
- campionamento CDP `5 ms`: non e RSS browser ne un picco assoluto garantito;
- cleanup `finally`, residuo zero e baseline non-fixture preservata;
- evidence: `admin-web-performance.json`.

### Android finale

- JVM mirati `25/25`, instrumentation `3/3`, assemble/lint `PASS`;
- dopo l'hardening finale, rerun del solo caso instrumentation invalidato
  upload/read/remove: `1/1 PASS`, `BUILD SUCCESSFUL`;
- fixture sintetica `8000 x 6000` (`48 MP`, input `1.258.536 B`): preprocess
  `41 ms`, main `165.769 B`, thumb `17.517 B`, delta PSS `7.881 KiB`,
  nessun OOM;
- server loopback soltanto, nessun claim Supabase live/device fisico.

### iOS finale

- suite Product Images finale `22/22`, sync esistenti `46/46`, localizzazioni
  `8/8`, build Debug baseline `PASS`;
- metriche JSON copiate fuori da `/private/tmp` nel mirror iOS;
- URLProtocol/Simulator soltanto, nessun claim Supabase live/device fisico.

### Residuo finale locale

- cleanup dry-run `candidate_count=0`;
- report read-only: immagini/oggetti/byte/orfani/mancanti/fuori-budget tutti
  `0`;
- baseline non-fixture preservata.

### Consolidamento Mac post-hardening

- Admin: pgTAP TASK-137 `76/76`, foundation `20/20`, typecheck, ESLint mirato,
  check script e diff mirato `PASS`;
- commit locali separati nei tre repository; docs Android `c21de31`, docs iOS
  `21db5edb`, docs Admin nel commit corrente;
- validazione in worktree puliti: `PASS`; Codex Security Changes scan:
  `NOT_STARTED`;
- screenshot sintetico rigenerato dalla build locale corrente e ispezionato
  visivamente: `PASS`; dettaglio prodotto, immagine primaria, placeholder e
  controlli risultano leggibili e coerenti. È evidence headless su fixture
  sintetica, non una prova su device fisico o su ambiente live.

### Remediation audit cross-shop post-scan

- baseline vulnerabile ufficiale: base `38f02bd9`, head `2f166b51`, Changes
  scan completo `35/35`, quattro finding Medium/high-confidence con una sola
  root cause;
- migration additiva `20260717200129` sul denied-audit RPC comune, con binding
  actor/shop e product/shop prima dell'audit sink;
- reset/migration locale `PASS`, lint DB zero errori, pgTAP TASK-137 `76/76` e
  regressione denial `32/32 PASS`;
- PoC originale invariata post-fix: `FAIL 6/9` atteso, quattro chiamate
  `permission_denied`, victim-shop audit rows `0`, metadata vittima `0`;
- foundation TASK-137 `20/20`, typecheck, lint, i18n e build `PASS`;
- report read-only e cleanup dry-run locali `PASS`, residui sintetici `0`;
- E2E HTTP cross-shop `1/1 PASS`, lifecycle completo `1/1 PASS`, residui
  fixture/auth/Storage `0`; nuovo Changes scan: `PENDING`;
- `npm run verify`: `BLOCKED_EXTERNAL_PREREQUISITE` sul Win7POS read-only
  corrente, che non contiene più il file storico atteso dallo scanner Admin.

### Release Security remediation

- Changes scan ufficiale consolidato:
  `276dd0cb-1c47-4bae-b2c2-8e8343bfebb1`;
- range immutabile:
  `38f02bd969e55df91ff41d3905661da8dfdb145a..3bd380c64b24b21fffa8922d61b0d1675156d7dc`;
- worklist `36/36`, coverage classificata `partial`, Deep Scan `OFF`;
- finding validati: `3 High / 2 Medium / 2 Low`;
- remediation: due migration additive, parser POS fail-fast, fixture QA prezzo
  append-only e regressioni dinamiche/statiche;
- database locale: suite completa `241 PASS`, catalog Security `41/41`, POS
  Security `38/38`, lint zero errori e dry-run up-to-date;
- foundation in-scope dopo la compatibilità QA/CI: `48/48 PASS`;
- PoC originali: cross-shop e lifecycle negati, price update divergente
  `price_idempotency_conflict`, mixed-sign `validation_failed`, `pos.pay`
  falso/assente `denied`, residuo fixture `0`;
- nuovo Changes scan post-remediation: `PENDING` sul prossimo commit clean;
- dettaglio autoritativo: `13-release-security-remediation.md`.
