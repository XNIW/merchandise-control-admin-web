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

I file sono creati solo quando esiste evidence reale da registrare.

Stato al passaggio in review:

- `00`-`08`: compilati con evidence eseguita;
- `09`: vecchia selezione working-tree stale, non riusata; scan committed
  ancora `NOT_STARTED`;
- `10`: handoff conclusivo `REVIEW_WITH_BLOCKERS`;
- `11`: manifest di inclusione/esclusione riallineato ai commit reali;
- `12`: checkpoint `COMMITS_CREATED`;
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

- Admin: pgTAP TASK-137 `76/76`, foundation `19/19`, typecheck, ESLint mirato,
  check script e diff mirato `PASS`;
- commit locali separati nei tre repository; docs Android `c21de31`, docs iOS
  `21db5edb`, docs Admin nel commit corrente;
- validazione in worktree puliti e Codex Security Changes scan: pendenti;
- audit visuale con screenshot della build corrente: `NOT_RUN` perché non è
  stato indicato un browser. Lo screenshot storico sintetico LOCALT137A resta
  evidence del run precedente, non viene promosso a QA visuale corrente.
