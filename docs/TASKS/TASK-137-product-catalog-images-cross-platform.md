# TASK-137 - Product Catalog Images cross-platform

## Informazioni generali

- ID: `TASK-137`
- Stato: `REVIEW_WITH_BLOCKERS`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CLAUDE/CHATGPT_REVIEWER`
- Data apertura: `2026-07-16`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-137/README.md`
- Coordinamento: Admin Web e fonte canonica; Android e iOS hanno un mirror
  TASK-137 di governance che rinvia a questo contratto.
- Task precedente: TASK-088 resta
  `REVIEW_WITH_ENVIRONMENTAL_PERFORMANCE_BLOCKER` e non viene riaperto.
- Esclusione esplicita: Win7POS non partecipa a TASK-137 e non deve essere
  modificato, pubblicato o usato come client immagini.

## Obiettivo

Permettere a owner e manager autorizzati di associare una sola immagine
primaria a un prodotto da Admin Web, Android e iOS. I byte devono risiedere in
un bucket Supabase Storage privato, mentre il catalogo sincronizza soltanto un
riferimento UUID versionato. Il flusso deve essere sicuro, idempotente,
shop-scoped, offline-friendly in lettura e privo di blob, Base64, token o URL
firmati persistiti nel database o nella normale outbox.

## Stato di partenza verificato

- nessun campo immagine, bucket applicativo, policy Storage o pipeline immagini
  esiste nei tre client;
- `public.inventory_products.id` e l'identita UUID cloud comune;
- Android collega l'ID Room del prodotto all'UUID cloud con
  `ProductRemoteRef`; iOS usa `Product.remoteID`;
- `sync_events` trasporta gia `catalog_changed` con `product_ids`: non serve un
  nuovo tipo evento e nessun path Storage deve entrare nell'evento;
- Android e iOS hanno gia primitive native sufficienti per resize/JPEG/cache;
  non e autorizzata una nuova dipendenza solo per questa feature;
- i worktree Admin/iOS erano gia dirty prima del task. Gli hash baseline dei
  file sovrapposti sono registrati nell'evidence e le modifiche preesistenti
  devono essere preservate.

## Perimetro

- migration append-only per metadata, RPC atomiche, bucket privato, grant e
  policy RLS;
- API server Admin per intent, finalize, read URL batch e remove;
- upload diretto client -> Supabase Storage tramite URL firmato exact-path;
- preprocessing equivalente Admin/Android/iOS;
- thumbnail in catalogo/lista e immagine principale nel dettaglio/editor;
- cache locale shop/account scoped e visualizzazione offline dell'ultima
  versione gia scaricata;
- sincronizzazione incrementale del solo riferimento UUID versione;
- cleanup idempotente di pending/orfani scaduti tramite script amministrativo
  dry-run di default;
- test di contratto, sicurezza, autorizzazione, idempotenza, cache, sync e
  regressione sui tre client;
- esecuzione live soltanto su Supabase locale o staging/dev allowlistato e
  dichiarato non-production.

## Non incluso

- gallery, immagini multiple, video, OCR, AI, crop editor o trasformazioni a
  pagamento;
- immagini nei file Excel o negli import/export catalogo;
- upload o visualizzazione immagini in Win7POS;
- conservazione dell'originale o del file HEIC/PNG sorgente;
- bucket pubblico, URL pubblici permanenti o signed URL nel database;
- blob/Base64 nella tabella prodotto, negli eventi sync o nell'outbox normale;
- service role, secret o token in browser, app mobile, log o evidence;
- refactor generale di catalogo/sync o nuove dipendenze non necessarie;
- cron nuovo: se non esiste un scheduler sicuro, si consegna uno script admin
  idempotente da pianificare separatamente;
- migration/deploy Supabase production e force push; commit/push normali restano
  vincolati ai gate del consolidamento finale.

## Contratto congelato v1

Le decisioni di questa sezione sono bloccanti. Un cambiamento sostanziale deve
essere documentato qui, con motivazione ed evidence, prima di modificare i
client mobili.

### 1. Identita, cardinalita e stato corrente

- una sola immagine primaria corrente per prodotto;
- chiave prodotto: `public.inventory_products.id` UUID;
- chiave versione immagine: UUID opaco generato dal server;
- `inventory_products.primary_image_version_id` e nullable e rappresenta la
  sola versione corrente pronta;
- `inventory_products.primary_image_updated_at` e nullable e consente merge e
  osservabilita senza esporre path;
- nessun client costruisce o sceglie un object path.

### 2. Bucket e object path

- bucket: `product-images`;
- bucket privato (`public = false`), MIME consentito `image/jpeg`, limite
  singolo oggetto `1 MiB`;
- due oggetti immutabili per versione:
  - `shops/{shop_uuid}/products/{product_uuid}/primary/{version_uuid}/main.jpg`
  - `shops/{shop_uuid}/products/{product_uuid}/primary/{version_uuid}/thumb.jpg`
- path senza barcode, nome prodotto, email, nome persona o altro dato
  leggibile;
- overwrite/upsert vietato: replace crea sempre una nuova versione UUID.

### 3. Modello lifecycle

Tabella canonica: `public.inventory_product_image_versions`.

Campi congelati:

- `id uuid primary key`;
- `shop_id uuid not null`, `product_id uuid not null`;
- `previous_version_id uuid null`;
- `status text` in `pending | ready | superseded | removed | failed`;
- `main_path text unique not null`, `thumb_path text unique not null`;
- metadata dichiarati per main/thumb: SHA-256 esadecimale lowercase, byte
  count, width, height e MIME;
- metadata verificati dal server per main/thumb con gli stessi campi;
- `requested_by uuid`, `finalized_by uuid`, timestamp created/expires/finalized,
  superseded/removed;
- `cleanup_status text` in `not_due | pending | complete | failed`,
  `cleanup_attempts`, `cleanup_last_error_code`, `cleanup_updated_at`;
- vincoli positivi su dimensioni/byte e coerenza stato/timestamp;
- unique parziale per un solo `pending` attivo per prodotto non necessaria:
  intent concorrenti sono serializzati dall'RPC e il precedente pending viene
  marcato `failed`/cleanup pending.

La tabella prodotto contiene soltanto i due campi current indicati sopra. Path,
checksum e dimensioni restano nella tabella lifecycle non esposta ai client.

### 4. Formato e budget immagini

- output server-accettato: JPEG baseline/progressive valido, magic bytes JPEG;
- orientamento normalizzato nei pixel e metadata rimossi;
- main: lato lungo massimo `1600 px`, mai upscale, quality iniziale circa `82`,
  poi `76` e `70` se necessario; target `<= 750 KiB`, hard max `1 MiB`;
- thumb: lato lungo massimo `384 px`, mai upscale, quality circa `75`, target
  e hard max applicativo `<= 90 KiB` (il bucket conserva il limite generale
  per oggetto di `1 MiB`);
- input JPEG e PNG su tutti i client; PNG viene appiattito su sfondo bianco;
- HEIC/HEIF e accettato come input su iOS quando prodotto dal picker, ma non
  viene caricato o conservato: l'output e sempre JPEG;
- il server verifica magic bytes, parse JPEG, dimensioni, byte count, checksum,
  assenza di segmenti EXIF (`APP1/Exif`) e assenza di metadata GPS; una
  discrepanza rende finalize permanentemente fallito e schedula cleanup;
- main e thumb devono derivare dalla stessa selezione e avere aspect ratio
  coerente entro la tolleranza di arrotondamento.

### 5. Flusso two-phase a tre chiamate

1. `POST /api/shop/product-images/intent`
2. `PUT` diretto dei due JPEG a Supabase Storage usando gli URL firmati
   exact-path restituiti dall'intent
3. `POST /api/shop/product-images/finalize`

L'upload dei byte non attraversa Next.js. Il finalize puo scaricare una volta i
due oggetti dal server per la validazione indipendente e bounded (`<= 1 MiB`
main, `<= 90 KiB` thumb).

#### Intent request

```json
{
  "shopId": "uuid",
  "productId": "uuid",
  "main": {"sha256": "hex64", "bytes": 1, "width": 1, "height": 1, "mimeType": "image/jpeg"},
  "thumb": {"sha256": "hex64", "bytes": 1, "width": 1, "height": 1, "mimeType": "image/jpeg"}
}
```

#### Intent response

- `status = "noop"`: la versione corrente ready ha gli stessi due checksum;
  nessun nuovo record, oggetto o sync event;
- `status = "upload_required"`: include `versionId`, `expiresAt` e due URL
  firmati effimeri `mainUploadUrl`/`thumbUploadUrl` validi al massimo due ore;
- gli URL sono secret operativi: mai loggati, persistiti o copiati in evidence.

#### Finalize request/response

- request: `shopId`, `productId`, `versionId`;
- response: `status = finalized | already_finalized`, `versionId` e
  `imageUpdatedAt`; nessun path o signed URL;
- duplicate finalize e idempotente;
- mismatch product/shop/version, scadenza, oggetto mancante o validazione
  fallita non modifica la versione corrente;
- l'RPC finalize prende lock sul prodotto e sulla versione, aggiorna
  lifecycle+prodotto, marca la versione precedente `superseded`, inserisce
  audit e registra esattamente un `catalog_changed` con `product_ids=[id]`.

### 6. Lettura e rimozione

- `POST /api/shop/product-images/read-urls` accetta max 100 riferimenti
  `{productId, versionId, variant}` e restituisce URL privati firmati a vita
  breve; riferimenti stale/cross-shop sono negati;
- la cache in memoria/disco usa
  `(account_scope, shop_id, product_id, version_id, variant)`; signed URL e
  token non fanno parte della chiave e non sono persistiti;
- l'ultima immagine valida gia scaricata puo essere mostrata offline solo nello
  stesso account e shop;
- `POST /api/shop/product-images/remove` richiede `shopId`, `productId` ed
  `expectedVersionId`; l'RPC atomico azzera i campi current, marca `removed`,
  inserisce audit e un solo `catalog_changed`; la cancellazione oggetti e
  best-effort post-commit e resta recuperabile dal cleanup;
- remove ripetuto sullo stesso stato e idempotente/no-op senza evento duplicato.

### 7. Auth, autorizzazione e RLS

- API accetta sessione cookie Admin oppure bearer Supabase dell'app mobile;
- tutte le decisioni sono server-side e richiedono shop esplicito;
- write consentito soltanto a owner/manager con `products.write`, membership e
  shop attivi;
- viewer, cashier, revoked/suspended, anonimo e cross-shop sono negati;
- platform admin e ammesso soltanto dal boundary server gia autorizzato e ogni
  operazione viene auditata;
- service role resta esclusivamente nel processo server/cleanup;
- `inventory_product_image_versions`: nessuna grant diretta mutativa ad
  `authenticated`/`anon`; accesso via RPC server-only;
- Storage INSERT/UPDATE/DELETE per `authenticated` non viene concesso; upload
  solo con URL firmato exact-path;
- Storage SELECT, se usato con JWT, richiede bucket, path, prodotto corrente e
  membership attiva nello stesso shop; la via normale usa signed read URL
  server-side;
- migration con grant/revoke espliciti per ogni nuova tabella/funzione.

### 8. Rate limit, audit e log

- intent limita per default a 20 richieste per attore/15 minuti e 100 per shop
  per ora usando i record lifecycle recenti; il no-op checksum non consuma una
  nuova versione;
- audit obbligatorio per intent/upload pending, finalize, replace, remove,
  cleanup, denial e permanent validation failure;
- nei log/audit sono ammessi UUID, variante, byte count, dimensioni, stato e
  codici errore redatti;
- vietati signed URL, token, byte immagine, EXIF, path locale e secret;
- gli object path restano metadata server-side e non entrano in sync event,
  log applicativi o errori client.

### 9. Sync incrementale e merge

- nessun nuovo event type: si riusa `catalog_changed`;
- payload evento contiene il solo `product_ids` esistente e metadata operazione
  redatti, mai path/checksum/token/URL;
- fetch prodotto aggiunge `primary_image_version_id` e
  `primary_image_updated_at`;
- finalize/remove sono remote-authoritative e non entrano nelle normali write
  payload prodotto dei client;
- duplicate/no-op/stale event preservano checkpoint e idempotenza esistenti;
- nessun full pull e necessario per una modifica immagine;
- edit prodotto puo concludersi anche se upload immagine fallisce; l'upload
  richiede rete in v1 e non viene inserito nell'outbox catalogo.

### 10. Cleanup

- pending scaduti e versioni superseded/removed con oggetti ancora presenti
  diventano eleggibili dopo 24 ore;
- script canonico `scripts/admin/task-137-product-image-cleanup.mjs`:
  dry-run di default, `--execute` esplicito, target non-production obbligatorio,
  scope/batch bounded, idempotente, nessun secret/log sensibile;
- delete Storage riuscita -> `cleanup_status=complete`; errore -> `failed` con
  codice redatto e retry successivo;
- nessun cron viene introdotto in TASK-137; scheduling e follow-up operativo.

## Superficie file congelata

### Admin Web / Supabase

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-137-product-catalog-images-cross-platform.md`
- `docs/TASKS/EVIDENCE/TASK-137/**`
- nuova migration creata con `supabase migration new`
- `src/app/api/shop/product-images/**`
- `src/server/shop-admin/product-images/**`
- `src/lib/supabase/database.types.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- componenti prodotto/catalogo strettamente necessari
- `scripts/admin/task-137-product-image-cleanup.mjs`
- test foundation/API e script di contratto TASK-137

### Android

- mirror task/evidence e `docs/MASTER-PLAN.md`
- modello/DAO/migration Room solo per riferimento UUID versione immagine;
- DTO/fetch/apply catalogo esistenti;
- nuovo package ristretto `productimage` per preprocess, API, upload e cache;
- `DatabaseScreenComponents.kt`/editor prodotto e risorse localizzate;
- test JVM/instrumentation mirati TASK-137.

### iOS

- mirror task/evidence e `docs/MASTER-PLAN.md`
- `Models.swift`/DTO/apply catalogo soltanto per riferimento UUID versione;
- nuovo gruppo ristretto `ProductImages` per preprocess, API, upload e cache;
- `DatabaseView.swift`/`EditProductView.swift` e localizzazioni;
- test XCTest mirati TASK-137.

Qualunque file aggiuntivo deve essere motivato nell'Execution ledger prima
della modifica. Win7POS e fuori dalla superficie consentita.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Schema, bucket privato, grant e RLS passano test locale. | `PASS` |
| CA-02 | Owner/manager hanno write; viewer e read-only; cashier/revoked/cross-shop non hanno write o accesso non autorizzato. | `PASS` |
| CA-03 | Intent/upload/finalize e remove sono atomici e idempotenti. | `PASS` |
| CA-04 | No-op checksum non crea versione, oggetto o sync event. | `PASS` |
| CA-05 | Magic bytes/dimensioni/size/checksum/EXIF-GPS sono verificati server-side. | `PASS` |
| CA-06 | Admin preprocessa, carica, sostituisce, rimuove e mostra cache privata. | `PASS` |
| CA-07 | Android offre lo stesso workflow e lettura offline shop/account scoped. | `PASS_CONTRACT` |
| CA-08 | iOS offre lo stesso workflow, incluso input HEIC, e cache scoped. | `PASS_CONTRACT` |
| CA-09 | Sync incrementale propaga finalize/remove senza blob, URL o full pull. | `PASS_CONTRACT / LIVE_NOT_RUN` |
| CA-10 | Duplicate/no-op/stale/offline/reconnect/account switch restano corretti. | `PASS` |
| CA-11 | Cleanup dry-run/execute su fixture sintetiche lascia residuo zero e preserva baseline. | `PASS` |
| CA-12 | Build/test/gate dei tre repository e security-diff-scan feature-only passano. | `BLOCKED_REMEDIATION_RESCAN_PENDING` |
| CA-13 | Evidence durevole include costi, limiti, metriche, file e risultati reali. | `PASS_WITH_DECLARED_GAPS` |
| CA-14 | Nessun file Win7POS, force push, deploy o production apply. | `PASS` |

## Matrice test obbligatoria

- SQL/pgTAP: schema, constraint, grant, RLS, auth matrix, exact path, atomicita,
  idempotenza, no-op, stale finalize, remove e cleanup eligibility;
- Admin: parser/validator JPEG, auth boundary, route contract, redaction,
  component/preprocess e build;
- Android: preprocess size/dimensioni, cache isolation/offline, DTO/apply,
  checkpoint/duplicate/no-op/stale/tombstone/reconnect/account switch, build;
- iOS: JPEG/PNG/HEIC preprocess, metadata stripping, cache isolation/offline,
  DTO/apply e stessi invarianti sync, build Debug;
- shared: JSON contract API/sync, no secret/path/URL in event/outbox;
- runtime non-production: upload/replace/remove Admin -> Android/iOS e mobile ->
  altri client, negative authorization, cleanup e baseline;
- finali: `git diff --check`, status quattro repository e
  `security-diff-scan` limitato al diff TASK-137. Nessun nuovo Deep Scan.

## Gate prima di operazioni live

- target Supabase esplicitamente locale o staging/dev non-production;
- dry-run migration vuoto o con sole migration TASK-137 attese;
- fixture sintetica univoca e baseline non-fixture registrata;
- sessioni Admin/Android/iOS valide e shop identico verificato senza stampare
  token;
- nessun altro runner/cleanup TASK-137 attivo;
- evidence directory e temporanei con permessi corretti;
- cleanup precedente a residuo zero.

## Decisioni

| # | Decisione | Alternative escluse | Motivazione | Stato |
|---|---|---|---|---|
| 1 | TASK-137 e il prossimo ID globale libero. | Riutilizzare ID locali piu bassi. | iOS arriva a TASK-136 e gli ID non si riusano. | attiva |
| 2 | Current UUID sul prodotto + lifecycle separato. | Blob/path completi sul prodotto. | Sync minimo, lifecycle/audit verificabile, nessun dato Storage nel payload. | attiva |
| 3 | Oggetti immutabili main+thumb. | Overwrite o originale conservato. | Cache/versioning sicuri e cleanup deterministico. | attiva |
| 4 | API server condivisa con upload diretto Storage. | Service role/client upload via Next. | Auth centralizzata e byte path scalabile senza secret client. | attiva |
| 5 | Evento `catalog_changed` esistente. | Nuovo evento immagini. | Il riferimento fa parte del prodotto e il targeted pull esiste gia. | attiva |
| 6 | Primitive native per i tre client. | Dipendenze immagini nuove. | Riduce superficie e rispetta il vincolo dependency-minimal. | attiva |

## Execution

### Piano minimo

1. congelare contratto, baseline e mirror governance;
2. implementare e verificare migration/RPC/API backend localmente;
3. integrare Admin Web e testare il workflow end-to-end locale;
4. integrare Android, poi iOS, senza cambiare il contratto gia verificato;
5. eseguire parity non-production, cleanup, gate finali e security diff scan;
6. passare a `REVIEW`, mai a `DONE` senza conferma utente.

### Stato corrente

- inventario e architecture review read-only completati;
- contratto v1 congelato;
- lane Android: sono motivati prima della scrittura anche
  `app/build.gradle.kts`, `MerchandiseControlApplication.kt`,
  `DatabaseViewModel.kt`, `DatabaseScreen.kt` e `res/xml/file_paths.xml`:
  servono rispettivamente per il base URL non segreto dell'API Admin, il
  wiring singleton del client/cache, lo stato UI indipendente dall'edit
  prodotto e una URI privata FileProvider per la cattura fotocamera; nessuno
  di questi file introduce dipendenze, secret, outbox immagini o nuovo scope
  funzionale;
- `app/src/androidTest/.../productimage/ProductImageDeviceTest.kt` e
  esplicitamente incluso nella lane Android: verifica su emulator il Photo
  Picker image-only, il contratto camera/FileProvider, preprocess e cache
  account/shop scoped, oltre a intent -> due PUT -> finalize contro un server
  loopback di test; non usa dipendenze nuove, credenziali o rete esterna;
  `app/src/androidTest/AndroidManifest.xml` abilita cleartext esclusivamente
  nel test APK per quel server `127.0.0.1`; il manifest e il transport policy
  dell'app production non vengono rilassati;
- `app/src/debug/AndroidManifest.xml` e
  `app/src/debug/res/xml/task137_network_security_config.xml` completano il
  contratto Debug gia presente nel client (HTTP consentito solo per
  localhost/127.0.0.1/10.0.2.2): senza questo override Android blocca il
  loopback prima della rete; Release e production restano HTTPS-only;
- lane iOS: sono motivati prima della scrittura anche
  `SupabaseConfig.swift`, `SupabaseConfig.example.plist`,
  `iOSMerchandiseControlApp.swift` e
  `iOSMerchandiseControl.xcodeproj/project.pbxproj`: servono rispettivamente
  per il base URL non segreto e opzionale dell'API Admin, il wiring root del
  servizio/cache e una descrizione camera coerente con la cattura prodotto;
  `SwiftDataInventorySnapshotService.swift`, `SupabasePullPreviewModels.swift`,
  `SupabasePullPreviewService.swift`, `SupabasePullApplyService.swift`,
  `CatalogRemoteSupabaseAdapter.swift` e `SupabaseManualPushService.swift`
  sono esplicitati come parte del mapping DTO/apply: rendono osservabile anche
  un cambio remoto di sola versione immagine senza includerlo nei payload di
  scrittura catalogo o nei fingerprint business;
- i gruppi Xcode app/test sono filesystem-synchronized: il nuovo gruppo
  `ProductImages` e gli XCTest mirati non richiedono modifiche manuali al
  progetto oltre alla sola stringa privacy camera sopra motivata;
- `ProductImageAPIClient.swift`, `ProductImageService.swift` e il nuovo
  `ProductImageAPIClientTests.swift` includono una seam interna limitata ai
  test per iniettare `URLSession`: serve a provare senza rete o credenziali il
  workflow intent -> due PUT multipart JPEG -> finalize, i relativi header e
  il rifiuto di signed URL fuori dal path Storage previsto; il wiring runtime
  continua a costruire sessioni ephemeral senza cookie, cache o redirect;
- il fallback progressivo `85%` con floor `640/128 px` e stato implementato e
  rivalidato in Admin e Android; iOS lo aveva gia nel processor finale;
- cache e trasporto Android rifiutano anche JPEG APP1 ricevuti da un boundary
  esterno, oltre al controllo processor/server;
- `scripts/admin/task-137-product-image-report.mjs` e motivato come report
  operativo read-only richiesto: target locale/staging, scan bounded,
  aggregati shop con hash redatto, nessun path/ID/secret in output;
- `scripts/security-checks.mjs` include l'allowlist esplicita degli RPC
  server-only immagini. La modifica preesistente al test foundation TASK-027,
  legata a Win7POS, è stata esclusa dal commit TASK-137;
- Admin E2E locale, Android emulator e iOS Simulator sono verdi; manca una
  sessione mobile riusabile sul medesimo shop Supabase per la parity live;
- Admin registra preprocess browser isolato (`24,8 ms`) e heap JavaScript
  campionato; Android copre ora la fixture sintetica `48 MP` (`41 ms`, nessun
  OOM). Entrambe le misure sono nei rispettivi ledger durevoli;
- il Changes scan pre-fix ufficiale, base `38f02bd9` e head vulnerabile
  `2f166b51`, si e concluso con copertura `35/35` e quattro finding Medium ad
  alta confidenza riconducibili al denied-audit cross-shop. La remediation
  comune e le regressioni locali sono pronte per il freeze; il nuovo Changes
  scan post-fix sul commit pulito resta `PENDING`, con Deep Scan disattivato;
- il successivo Changes scan consolidato sulla snapshot
  `38f02bd9..3bd380c6` ha chiuso `36/36` righe e validato sette finding
  aggiuntivi nel confine catalogo/history/sync/lifecycle/POS; il task e tornato
  in `FIX` con approvazione utente per una patch additiva e regressioni
  mirate prima di un nuovo freeze Security;
- la remediation release additiva e applicata localmente: due migration
  `20260717235400`/`20260717235500`, nuovo pgTAP catalogo `41/41`, suite POS
  `38/38`, suite DB completa `241 PASS` e foundation in-scope `48/48`. I PoC
  cross-shop, price-header, lifecycle shop, mixed-sign e `pos.pay` non
  raggiungono piu i sink vulnerabili e lasciano residuo zero;
- la fixture QA ProductPrice e stata resa compatibile con il contratto
  append-only: un `update` valida il target shop-scoped e crea una nuova
  versione deterministica; nessuna riga storica viene riscritta;
- le asserzioni foundation storiche usate dalla CI sono state riallineate alla
  singola RPC POS atomica e allo stato `imageBusy`, senza modificare il runtime
  finanziario o riaprire la matrice TASK-088;
- nessuna operazione production; commit locali separati creati, nessun branch
  ancora pubblicato.

### Stato handoff

- Supabase locale: migration applicate, suite completa `241 PASS`, release
  catalogo `41/41`, POS `38/38`, lint DB zero errori, dry-run up-to-date e
  residuo PoC zero;
- Admin post-fix: foundation in-scope `48/48`, riallineamento CI `19/19`,
  typecheck, lint, i18n e build `PASS`; gli E2E storici cross-shop/lifecycle
  restano `1/1 PASS` ciascuno e il rerun finale post-remediation e pendente
  prima del freeze. `npm run verify` e
  `npm run security:scan` sono `BLOCKED_EXTERNAL_PREREQUISITE` perche il
  checkout Win7POS read-only corrente non contiene piu il file storico atteso
  dallo scanner Admin;
- Android clean merge: unit mirati, `assembleDebug` e `lintDebug` `PASS`;
  instrumentation baseline `3/3` e rerun invalidato precedente `1/1` restano
  evidence preservata;
- iOS clean merge: build Debug e suite Product Images `22/22 PASS`; sync
  baseline `46/46` e localizzazioni baseline `8/8` preservate;
- commit locali: Admin fino a `2f166b51` piu remediation/freeze corrente
  `SELF`, Android fino a `c21de31`, iOS fino a `21db5edb`; nuovo Security
  Changes scan post-fix pendente;
- blocker 1: parity live Admin/Android/iOS sullo stesso target non-production
  `NOT_RUN`;
- blocker 2: nuovo security-diff-scan ufficiale post-remediation in attesa di
  avvio sul commit clean;
- fase: `REVIEW_WITH_BLOCKERS`, mai `DONE` senza review utente.
