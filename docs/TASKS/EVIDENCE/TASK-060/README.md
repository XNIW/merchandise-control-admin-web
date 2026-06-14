# Evidence TASK-060

Verdict corrente: `DONE`.

TASK-060 e chiuso a `DONE` su conferma esplicita dell'utente del 2026-06-14.
Questo file raccoglie solo evidence redatta e risultati di comandi eseguiti
davvero. I workbook reali forniti dall'utente restano
manual-only/non-versionati e non vengono copiati nel repository.

## DONE confirmation 2026-06-14

- Verdict tecnico: `DONE`.
- Stato governance: `DONE`; conferma esplicita utente ricevuta nel prompt
  `Mettilo in DONE e poi fai merge sul main e poi commit push`.
- Fix finale applicato: le route
  `src/app/shop/import-export/preview/route.ts` e
  `src/app/shop/import-export/apply/route.ts` ora eseguono guardia
  content-type/size/origin e autorizzazione shop-scoped prima di
  `request.formData()` e prima dei bytes workbook. Lo `shop_id` usato per
  autorizzare arriva dalla query string generata dal client ed e comunque
  validato dal resolver esistente.
- Client aggiornato: `ImportExportActionPanel` chiama preview/apply con
  `?shop_id=...` oltre al form data legacy, cosi il server puo autorizzare
  prima di leggere il multipart body.
- Test foundation aggiornato: copre auth-before-`formData()` e
  auth-before-`arrayBuffer()` per preview/apply.
- E2E browser reale locale: la suite TASK-060 usa anche i workbook reali:
  `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx` e
  `/Users/minxiang/Downloads/2604137549-Belina.xls`.
- Esito E2E reale: `PASS`, 7 test passati su Chromium desktop, server locale
  `http://127.0.0.1:3060`, Supabase locale process-only.
- Nota run E2E: un primo tentativo contro `npm run dev` e fallito per restart
  automatico del dev server (`Server is approaching the used memory threshold,
  restarting...`). La suite finale valida e stata rieseguita su `next start`
  locale dopo build con env Supabase locale, con esito `PASS` 7/7.
- Dingli reale: mapping verificato su header cinese, `purchasePrice` su
  `单价`, niente retail mutativo automatico, preview senza righe blocked,
  input mutativi vuoti prima della compilazione manuale, apply con prodotti
  creati/aggiornati in fixture locale.
- Belina reale: `.xls` HTML-Excel verificato, alias `Ref`, `Código Barras`,
  `Descripción`, `Local Descripción`, `CNT`, `Precio`; `IMP(CLP)` rimane in
  ignored columns e non diventa retail/import value.
- Browser laterale in-app: reso visibile durante la QA su `127.0.0.1:3060`
  con pagina Products e dialog `Supplier workbook preview` aperto. Il Browser
  plugin non espone `setInputFiles`; l'upload/apply dei file reali e stato
  eseguito con Playwright esterno sullo stesso server/Supabase locale, poi lo
  stato e stato mostrato nel browser laterale.
- Cleanup finale locale: `TASK060_*` e `LIVE060_*` rimossi da Supabase locale;
  verifica finale `shops=0`, `profiles=0`, `auth_users=0`.
- Nessun workbook reale, secret, PIN, password, token o credential hash copiato
  nel repo/evidence.
- Commit e push finali su `main` autorizzati esplicitamente dall'utente il
  2026-06-14. Nessun production/cloud apply, schema, migration, RLS o RPC.

## Scope execution

- Drop zone e preview larga per `Import supplier Excel`.
- File selected UX con estensione/dimensione/ready, remove e replace.
- Wizard supplier in tre passi: `Workbook file`, `Check columns` e
  `Import preview`; Step 2 contiene mapping/raw sample, Step 3 contiene tabella
  e apply.
- FIX 5: Step 1 e l'unico con upload grande/replace/remove; Step 2 mostra
  default supplier/category, sample prodotto dalla header rilevata, contesto
  raw collassato e mapping tabellare; Step 3 mostra solo preview/apply con
  tabella compatta `Product` / `Recognized` / `Import values`.
- Rifinitura browser review FIX 5: il back Step2/Step3 e nella barra titolo
  del dialog come freccia Android-style a sinistra di `Supplier workbook
  preview`; la body card non mostra piu il bottone back testuale quando il
  wizard e dentro il dialog.
- Rifinitura browser review FIX 5 follow-up: lo stepper ora sta sopra la
  descrizione contestuale del passo, la descrizione cambia tra workbook,
  mapping e preview, l'area `Confirm APPLY` e compatta su una riga desktop e
  la tabella preview sfrutta lo spazio centrale con prodotto e valori
  riconosciuti piu densi.
- FIX 7: Dingli non mappa `purchasePrice` su colonne testuali; il parser
  numerico client/server rifiuta codici/testo con cifre come numeri.
  `Retail price` e nascosto nel mapping supplier, `Total price` usa il label
  Android/iOS, lo Step 2 mostra solo le prime 5 righe prodotto senza colonna
  Excel `Row`, e lo Step 3 usa `No.` come numerazione prodotto.
- Parser supplier Android-style scoped: alias/header shifted/column sources,
  generated metadata, recognized quantity/price e summary rows conservative.
- Supporto server-side `.xlsx`, `.xls` legacy/BIFF e HTML-Excel tramite
  `@e965/xlsx`; Belina `.xls` e un HTML-Excel reale.
- Mapping colonne editabile e validato server-side, incluso nel preview digest.
- Default supplier/category top-level: collegano solo nomi gia esistenti nello
  shop e non creano nuove anagrafiche. La tabella supplier principale non
  mostra colonne supplier/category per-riga.
- Belina aliases: `Ref` -> item number, `Código Barras` -> barcode,
  `Descripción` -> product name, `Local Descripción` -> second name,
  `CNT` -> quantity, `Precio` -> purchase price; `IMP(CLP)` resta unmapped.
- Apply supplier con input `Quantity to import` / `Retail price to import` vuoti
  inizialmente e mutativi solo se compilati dall'utente.
- Apply supplier crea/aggiorna prodotti validi dallo sheet supplier: identita
  prodotto e purchase price riconosciuti possono essere importati; quantity e
  retail price restano manual-only. Campi manuali vuoti preservano valori
  esistenti e restano vuoti/default sulle righe nuove.
- Riferimenti supplier/category vengono collegati solo se gia esistenti nello
  shop; riferimenti non risolti diventano warning e non creano anagrafiche.
- Preview/apply supplier distinguono sessione staff scaduta/non attiva da
  permesso mancante: `session_expired`/`no_active_session` tornano 401 con UX
  login, `permission_denied` torna 403 e il bottone import non e visibile per
  staff senza `catalog.import`.
- Preview/apply supplier autorizzano prima di leggere il multipart body o i
  bytes del workbook, cosi richieste non autorizzate non fanno parsing del file.
- Database transfer ed export devono restare compatibili.

## File modificati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-060-supplier-excel-android-style-preview-import.md`
- `docs/TASKS/EVIDENCE/TASK-060/README.md`
- `docs/TASKS/EVIDENCE/TASK-060/browser-dingli-real-preview.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-dingli-real-products.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-dingli-real-products-in-app.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-fix5-step1-live.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-fix5-compact-preview-e2e.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-fix5-titlebar-back-e2e.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step2-dingli-sample.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step2-dingli-mapping.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step3-dingli-preview.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-session-expired.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-session-relogin-preview.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-supplier-preview.png`
- `docs/TASKS/EVIDENCE/TASK-060/browser-live-products-fix4.png`
- `scripts/security-checks.mjs`
- `src/app/(staff-auth)/shop/staff-login/actions.ts`
- `src/app/(staff-auth)/shop/staff-login/page.tsx`
- `src/app/auth/login/page.tsx`
- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/import-export/apply/route.ts`
- `src/app/shop/import-export/preview/route.ts`
- `src/app/shop/import-export/page.tsx`
- `src/app/shop/layout.tsx`
- `src/app/shop/products/page.tsx`
- `src/components/auth/AccessState.tsx`
- `src/components/auth/ShopCodeLoginForm.tsx`
- `src/server/shop-admin/access-principal.ts`
- `src/server/shop-admin/catalog-import-contract.ts`
- `src/server/shop-admin/action-context.ts`
- `src/server/shop-admin/data-access.ts`
- `src/server/shop-admin/import-export-workbook.ts`
- `src/server/shop-admin/staff-web-auth.ts`
- `package.json`
- `package-lock.json`
- `tests/e2e/task-060-supplier-excel-preview.spec.ts`
- `tests/foundation/task-032-excel-hardening.test.mjs`
- `tests/foundation/task-038-pos-manager-web-login.test.mjs`
- `tests/foundation/task-047-master-admin-access-model.test.mjs`
- `tests/foundation/task-053-unified-admin-console-login-tabs.test.mjs`
- `tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs`

## Browser QA sintetica

- Comando finale FIX 5:
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[redacted-local-publishable-key] SUPABASE_SERVICE_ROLE_KEY=[redacted-local-service-role] PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_DISABLE_WEB_SERVER=1 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop --workers=1`
- Esito FIX 5: `PASS`, 5 test passati.
- Casi verificati:
  - Dingli-like `.xlsx`: Step 1 solo workbook upload, Step 2 senza card file
    grande e con default supplier/category, sample prodotto con header reali
    `条码 (Col 3)` / `产品名1 (Col 4)`, mapping tabellare con sample values,
    rerun obbligatorio dopo override, Step 3 senza defaults/card file e con
    input `Quantity to import` / `Retail price to import` visibili senza scroll
    orizzontale iniziale; back top-level Step3->Step2->Step1 verificato nella
    barra titolo del dialog tramite freccia Android-style con aria-label
    `Back to check columns` / `Back to workbook file`.
  - Belina-like `.xls`: header reali `Código Barras (Col 2)`, sample product
    rows, `IMP(CLP) (Col 7)` in `Ignored columns`, retail non mappato e non
    visibile in Step 3.
  - Sessione staff scaduta, sessione cancellata e staff senza `catalog.import`
    restano coperti come in FIX 3.
- Browser laterale live FIX 5: server `next start` locale su
  `http://127.0.0.1:3060` ricostruito con Supabase locale; pagina Products
  autenticata sulla fixture locale `LIVE060 Fix4 Shop 04E829ED19`, modal
  `Supplier workbook preview` aperto e verificato su Step 1: una sola sezione
  `workbook-file`, zero sezioni `check-columns` e zero sezioni `import-preview`
  prima della preview.
- Screenshot redatta FIX 5:
  - `docs/TASKS/EVIDENCE/TASK-060/browser-fix5-step1-live.png`
  - `docs/TASKS/EVIDENCE/TASK-060/browser-fix5-titlebar-back-e2e.png`
  - `docs/TASKS/EVIDENCE/TASK-060/browser-fix5-compact-preview-e2e.png`
- Follow-up browser review FIX 5: ricostruita la build locale, riavviato
  `next start` su `127.0.0.1:3060` con Supabase locale e rilanciata la suite:
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_DISABLE_WEB_SERVER=1 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop --workers=1`
- Esito follow-up FIX 5: `PASS`, 5 test passati. Verificato screenshot E2E
  con stepper sopra la descrizione per-step, area `Confirm APPLY` in riga
  desktop e tabella preview senza vuoto centrale evidente.

- Comando finale FIX 4:
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[redacted-local-publishable-key] SUPABASE_SERVICE_ROLE_KEY=[redacted-local-service-role] npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop --workers=1`
- Esito FIX 4: `PASS`, 5 test passati.
- Casi verificati:
  - Dingli-like `.xlsx`: Step 2 `Check columns`, mapping manuale su
    `Retail price -> Ignore`, `Continue to import preview` bloccato finche il
    mapping non viene rieseguito, Step 3 con default supplier/category
    top-level, tabella senza colonne supplier/category, apply reale e verifica
    DB locale.
  - Belina-like `.xls`: alias `Ref`, `Código Barras`, `Descripción`,
    `Local Descripción`, `CNT`, `Precio`; `IMP(CLP)` resta unmapped e non
    appare come retail price in Step 3; apply reale con una sola quantity
    manuale e verifica DB locale.
  - Sessione staff scaduta, sessione cancellata e staff senza
    `catalog.import` restano coperti come in FIX 3.
- Browser laterale live FIX 4: server `next start` locale su
  `http://127.0.0.1:3060` ricostruito con Supabase locale; login Shop Code su
  fixture `LIVE060_FIX4_*`, prodotti importati visibili:
  `9060600002016` e `9060600002023`.
- Screenshot redatta FIX 4:
  - `docs/TASKS/EVIDENCE/TASK-060/browser-live-products-fix4.png`
- Nota storica: la fixture live `LIVE060_FIX4_*` era stata lasciata nel
  Supabase locale per review nel browser laterale durante FIX 4. Nel gate
  finale 2026-06-14 e stata rimossa insieme alle fixture `TASK060_*`.

- Comando finale FIX 3:
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[redacted-local-publishable-key] SUPABASE_SERVICE_ROLE_KEY=[redacted-local-service-role] PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3004" PLAYWRIGHT_REUSE_SERVER=0 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop`
- Esito FIX 3: `PASS`, 4 test passati.
- Casi verificati:
  - sessione Shop Code manager valida: preview e apply supplier funzionano;
  - sessione staff scaduta lato DB, senza reload pagina: UI mostra
    `Session expired. Please sign in again.`, non mostra `Sheet: Unknown`,
    preserva `next` verso `/shop/staff-login`, re-login e preview tornano a
    funzionare;
  - sessione staff cancellata lato DB: UI mostra la stessa recovery UX senza
    preview finta;
  - staff valido senza `catalog.import`/full access: `Import supplier Excel`
    non e visibile e direct-call browser same-origin riceve 403
    `permission_denied`.
- Screenshot redatte FIX 3:
  - `docs/TASKS/EVIDENCE/TASK-060/browser-session-expired.png`
  - `docs/TASKS/EVIDENCE/TASK-060/browser-session-relogin-preview.png`
- Cleanup: ogni test usa fixture locale `TASK060_*` e cleanup finale; nessun
  dato cloud/production e nessun workbook reale viene copiato nel repo.

- Comando finale FIX 2:
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[redacted-local-publishable-key] SUPABASE_SERVICE_ROLE_KEY=[redacted-local-service-role] PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 PLAYWRIGHT_WEB_SERVER_COMMAND="NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[redacted-local-publishable-key] npm run start -- --hostname 127.0.0.1 --port 3004" PLAYWRIGHT_REUSE_SERVER=0 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop`
- Esito: `PASS`, 1 test passato.
- Fixture: `TASK060_*` locale sintetica, prodotto catalogo esistente e workbook
  `.xls` generato dal test.
- Verificato: drop zone, file picker via `setInputFiles`, preview step larga,
  colonne richieste, recognized quantity/price read-only, input mutativi vuoti,
  compilazione manuale retail price, conferma `APPLY`, apply reale su prodotto
  esistente, creazione di prodotto nuovo, preservazione dei campi manuali
  lasciati vuoti, default supplier/category collegati a record esistenti nello
  shop.
- Screenshot redatta: `docs/TASKS/EVIDENCE/TASK-060/browser-supplier-preview.png`.
- Cleanup: query locale post-run ha confermato `{"shops":0,"profiles":0}` per
  residui `TASK060_*`.

## Parser QA workbook reali

- `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx`: `@e965/xlsx`
  legge 1 sheet (`产品`), 110 righe, max 10 colonne. Il parser applicativo
  e stato verificato anche nella suite Playwright finale su browser locale.
- `/Users/minxiang/Downloads/2604137549-Belina.xls`: file reale `.xls` in
  formato HTML-Excel (`file` lo riconosce come HTML document); `@e965/xlsx`
  legge 1 sheet (`Sheet1`), 48 righe, max 7 colonne. La suite Playwright finale
  verifica mapping/ignored columns con il file reale.
- Comando finale real workbook:
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[redacted-local-publishable-key] SUPABASE_SERVICE_ROLE_KEY=[redacted-local-service-role] TASK060_REAL_DINGLI_PATH=/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx TASK060_REAL_BELINA_PATH=/Users/minxiang/Downloads/2604137549-Belina.xls PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop --workers=1`
- Esito finale real workbook: `PASS`, 7 test passati.
- Nota: il Browser plugin in-app non espone `setInputFiles`; upload/apply reali
  sono stati eseguiti con Playwright esterno sullo stesso server/Supabase
  locale e poi mostrati nel browser laterale.

## FIX 7 - Dingli mapping regression e cleanup Step 2/3

- Esito: `PASS`.
- Root cause: il parser numerico client/server rimuoveva tutte le lettere prima
  di convertire; una stringa come `TASK060 Cafe ES` o una colonna prodotto con
  cifre poteva diventare numerica (`060`). Ora sono accettati simboli/codici
  valuta comuni, ma eventuale testo residuo rende la colonna incompatibile.
- Mapping Dingli:
  - `purchasePrice` torna su `单价 (Col 7)` e non su `产品名2 (Col 5)`;
  - se l'utente forza `Purchase price -> 产品名2`, Step 2 mostra
    `Choose a numeric column before continuing.` e disabilita
    `Continue to import preview`;
  - `Retail price` non appare nel mapping supplier e non puo essere incluso nel
    digest supplier;
  - `Discount`, `Discounted price` e `Total price` restano reference optional
    off fino ad attivazione manuale; `Total price` sostituisce il vecchio label
    UI `Line total` per allineamento Android/iOS (`header_total_price` /
    `product.field.total_price`).
- Step 2:
  - `Product row sample` ora precede il mapping;
  - mostra massimo 5 righe prodotto reali, escludendo la riga header rilevata;
  - non mostra la colonna tecnica `Row` del numero Excel;
  - `Show raw workbook context` resta collassato per debug, separato dal sample
    prodotto.
- Step 3:
  - la colonna `Row` e rinominata `No.` e usa numerazione prodotto effettiva
    (`1`, `2`, `3`, ...), non il numero riga Excel;
  - i blocchi `Recognized from file` non mostrano placeholder `-` per valori
    assenti;
  - `Total price` appare come reference read-only quando incluso.
- Browser/Playwright QA FIX 7:
  - comando:
    `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop --workers=1`
  - esito: `PASS`, 5 test passati.
  - fixture Dingli sintetica ampliata a 6 prodotti per verificare che il sample
    Step 2 si fermi a 5 righe senza usare workbook reali nel repository.
- Browser laterale FIX 7:
  - tab in-app ricaricato su
    `http://127.0.0.1:3060/shop/products?shop_id=5d0b3ea5-2482-4734-b418-a65d5dd547ba`;
  - pagina `Products` visibile, nessun dialog appeso e nessun errore console.
- Screenshot aggiornate:
  - `docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step2-dingli-sample.png`
  - `docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step2-dingli-mapping.png`
  - `docs/TASKS/EVIDENCE/TASK-060/browser-fix7-step3-dingli-preview.png`
  - `docs/TASKS/EVIDENCE/TASK-060/browser-supplier-preview.png`

## FIX 6 - Clean supplier wizard, mapping include/exclude e reference price context

- Esito: `PASS`.
- UI supplier:
  - rimossa la card/header ridondante `Import supplier Excel` dal wizard
    supplier;
  - file chip spostato nella titlebar del dialog negli step `Check columns` e
    `Import preview` nel formato `XLSX · filename · size`;
  - back Step2/Step3 resta nella titlebar come chevron Android-style a sinistra
    di `Supplier workbook preview`;
  - Step 1 mostra solo stepper e card `Workbook file` con descrizione
    `Upload or replace the supplier workbook. Preview only checks the file and
    does not change catalog data.`;
  - Step 2 inizia con `Verify detected product columns`, poi mapping,
    product row sample e infine `Default values for imported rows`;
  - Step 3 mostra `Current catalog values`, `Recognized from file` e input
    `Import values` vuoti.
- Mapping/parser:
  - colonne mapping: `Use`, `Field`, `Requirement`, `Detected Excel column`,
    `Confidence`, `Sample values`, `Override`;
  - `Barcode` e `Product name` required locked/on;
  - recommended riconosciuti on di default;
  - `Retail price`, `Discount`, `Discounted price`, `Total price`
    (`lineTotal` interno) optional off di default ma attivabili e digest-bound;
  - `折扣` -> `discount`, `售价` -> `discountedPrice`, `总价` -> `lineTotal`;
  - discount/discounted/line total restano reference read-only e non entrano
    nel payload apply se l'utente non digita quantity/retail.
- Browser laterale:
  - server locale aggiornato su `http://127.0.0.1:3060`;
  - tab in-app ricaricato e modal supplier aperto live su shop locale
    `5d0b3ea5-2482-4734-b418-a65d5dd547ba`;
  - verificato Step 1 pulito nel browser laterale; il bridge in-app non ha
    agganciato l'upload via file picker macOS e non espone `setInputFiles`,
    quindi la prova mutativa completa e stata eseguita con Playwright esterno
    sullo stesso server locale.
- Screenshot aggiornata:
  - `docs/TASKS/EVIDENCE/TASK-060/browser-supplier-preview.png`

## Browser QA reale Dingli

- Workbook usato manual-only/non-versionato:
  `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx`.
- Esito: `PASS_WITH_NOTE`.
- Percorso eseguito: Shop Code manager locale, `Products`, `Import supplier
  Excel`, upload workbook Dingli reale, `Preview supplier workbook`, edit minimo
  di una riga (`Quantity to import` e `Retail price to import`), conferma
  `APPLY`, ritorno a Products.
- Risultato osservato: sheet `产品`, header row `10`, colonne Dingli riconosciute
  (`产品货号`, `条码`, `产品名1`, `产品名2`, `数量`, `单价`, `售价`), nessun
  `Sheet: Unknown`, nessun errore `This account is not authorized`, apply con
  `failed rows 0`, 101 prodotti presenti nella shop locale e 1 riga modificata
  manualmente.
- Screenshot redatte:
  - `docs/TASKS/EVIDENCE/TASK-060/browser-dingli-real-preview.png`
  - `docs/TASKS/EVIDENCE/TASK-060/browser-dingli-real-products.png`
  - `docs/TASKS/EVIDENCE/TASK-060/browser-dingli-real-products-in-app.png`
- Nota oggettiva: il Browser plugin in-app non supporta `setInputFiles`/file
  upload programmatico. Il workbook reale e stato applicato con Playwright
  locale sullo stesso server/Supabase locale; poi l'in-app browser e stato
  autenticato sulla shop locale popolata per inspection laterale.
- La fixture reale Dingli locale e stata visibile nel browser laterale durante
  la review; nel gate finale le fixture `TASK060_*`/`LIVE060_*` sono state
  ripulite da Supabase locale con conteggi residui zero.

## Root cause resume/fix

- FIX 3: `resolveStaffWebSessionPrincipal` marcava sessione scaduta come
  `no_session` e sessione staff cancellata/non valida come `unauthorized`;
  `resolveShopActionContext` rimappava poi quasi tutti i blocchi in
  `unauthorized`, quindi preview/apply non potevano distinguere re-login da
  permesso negato.
- FIX 3: le route preview/apply leggevano i bytes workbook prima di eseguire
  il controllo autorizzativo specifico per import; il gate finale ha stretto
  ulteriormente il boundary: guardia size/content-type/origin e autorizzazione
  shop-scoped avvengono prima di `request.formData()` e prima di
  `file.arrayBuffer()`.
- FIX 3: la UI vedeva solo il messaggio generico e non aveva una recovery path;
  ora `session_expired`/`no_active_session` mostrano banner login, mentre
  `permission_denied` mostra il messaggio di permesso mancante senza preview.
- UI: `previewWorkbook` mostrava come preview anche una risposta `ok:false`,
  causando il falso stato `Sheet: Unknown; header row: not detected`.
- Auth/audit: la preview/apply da Shop Code staff arrivava al permesso corretto
  ma l'audit usava il path personale `shop_admin_audit_event`, generando
  `This account is not authorized for this shop action`.
- Import semantics: il supplier apply precedente aggiornava solo righe esistenti
  con adjustment; ora crea/aggiorna prodotti validi e lascia quantity/retail
  manual-only.
- Parser Dingli: header reale gia riconoscibile; aggiunto filtro piu
  conservativo per righe summary e validazione barcode 8-14 cifre.

## Check

| Check | Esito |
|---|---|
| DONE confirmation 2026-06-14 | `DONE`, conferma esplicita utente ricevuta |
| `node --test tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS`, final gate: 13/13 |
| `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[redacted-local-publishable-key] SUPABASE_SERVICE_ROLE_KEY=[redacted-local-service-role] TASK060_REAL_DINGLI_PATH=/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx TASK060_REAL_BELINA_PATH=/Users/minxiang/Downloads/2604137549-Belina.xls PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop --workers=1` | `PASS`, final gate: 7/7 |
| `npm run security:scan` | `PASS`, final gate: `Security scan passed.` |
| `npm run typecheck` | `PASS`, final gate |
| `npm run lint` | `PASS`, final gate |
| `npm run build` | `PASS_WITH_WARNINGS`, final gate: warning noti Next `middleware` -> `proxy` e Node `DEP0205` |
| `npm run verify` | `PASS_WITH_WARNINGS`, final gate: `lint`, `typecheck`, `security:scan` e `build` completati; stessi warning Next/Node |
| `npm run test:foundation` | `PASS`, final gate: 297/297 |
| `npm run test:shop-admin-auth-smoke` | `PASS`, final gate: 4/4 |
| `npm run test:shop:local` | `PASS`, final gate: 4/4 |
| `npm run cf:build` | `PASS_WITH_WARNINGS`, final gate: exit 0/OpenNext bundle generato; warning Next/Node e messaggi OpenNext `Failed to copy` per `compress-commons`, `crc32-stream`, `zip-stream` |
| Cleanup fixture locali `TASK060_*`/`LIVE060_*` | `PASS`, final gate: `shops=0`, `profiles=0`, `auth_users=0` |
| `node --test tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS`, FIX 7: 13/13 |
| `npm run typecheck` | `PASS`, FIX 7: `next typegen && tsc --noEmit` |
| `npm run lint` | `PASS`, FIX 7 |
| `npm run security:scan` | `PASS`, FIX 7: `Security scan passed.` |
| `npm run build` | `PASS_WITH_WARNINGS`, FIX 7: warning noti Next `middleware` -> `proxy` e Node `DEP0205` |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop --workers=1` | `PASS`, FIX 7: 5/5 |
| Browser laterale in-app su `127.0.0.1:3060` | `PASS`, FIX 7: pagina `Products` visibile e console error log vuoto |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_MODIFIED_FILES`, `## main...origin/main`; modifiche e file untracked attesi TASK-060, nessuno stage/commit/push |
| `git diff --check` | `PASS`, nessun output |
| `node --test tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS`, FIX 6: 13/13 |
| `npm run typecheck` | `PASS`, FIX 6: `next typegen && tsc --noEmit` |
| `npm run lint` | `PASS`, FIX 6 |
| `npm run security:scan` | `PASS`, FIX 6: `Security scan passed.` |
| `npm run build` | `PASS_WITH_WARNINGS`, FIX 6: warning noti Next `middleware` -> `proxy` e Node `DEP0205` |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop` | `PASS`, FIX 6: 5/5 |
| `git diff --check` | `PASS`, FIX 6 finale, nessun output |
| `node --test tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS`, FIX 5: 13/13 |
| `node --test tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS`, follow-up FIX 5: 13/13 |
| `npm run typecheck` | `PASS`, `next typegen && tsc --noEmit` |
| `npm run lint -- src/app/shop/_components/ImportExportActionPanel.tsx src/server/shop-admin/catalog-import-contract.ts src/server/shop-admin/import-export-workbook.ts tests/e2e/task-060-supplier-excel-preview.spec.ts tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS` |
| `npx eslint src/app/shop/_components/CatalogActionPanel.tsx src/app/shop/_components/ImportExportActionPanel.tsx tests/e2e/task-060-supplier-excel-preview.spec.ts tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS`, titlebar-back refinement |
| `npx eslint src/app/shop/_components/ImportExportActionPanel.tsx` | `PASS`, follow-up FIX 5 compact preview refinement |
| `npx tsc --noEmit --pretty false` | `PASS`, titlebar-back and follow-up FIX 5 compact preview refinement |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, 296/296 |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, FIX 5: warning noto Next `middleware` -> `proxy` e warning Node `DEP0205` |
| `npm run build` | `PASS_WITH_WARNINGS`, follow-up FIX 5: stessi warning noti Next `middleware` -> `proxy` e Node `DEP0205` |
| `npm run cf:build` | `PASS_WITH_WARNINGS`, exit 0/OpenNext bundle generato; warning build noti e messaggi OpenNext `Failed to copy` per `compress-commons`, `crc32-stream`, `zip-stream` |
| `npm audit --json` | `FAIL_WITH_EXISTING_WARNINGS`, exit 1 per 4 vulnerabilita high in OpenNext/Wrangler/esbuild toolchain; nessuna attribuita a `@e965/xlsx` |
| Browser/Playwright QA supplier import sintetico Dingli `.xlsx`, Belina `.xls` + auth/sessione | `PASS`, follow-up FIX 5: 5/5 |
| Browser laterale live FIX 4 su `127.0.0.1:3060` | `PASS_WITH_NOTE`, fixture locale `LIVE060_FIX4_*` mostrata storicamente e rimossa nel gate finale |
| Browser QA reale Dingli locale | `PASS_WITH_NOTE`, 101 prodotti, 1 riga manuale modificata |
| Parser smoke reale Dingli/Belina con `@e965/xlsx` | `PASS` |
| Cleanup fixture sintetica `TASK060_*` | `PASS`, `{"shops":0,"profiles":0}` |
| `git diff --check` finale | `PASS`, nessun output |
| `git status --short --branch --untracked-files=all` finale | `PASS_WITH_MODIFIED_FILES`, branch `main...origin/main`; file modificati/non tracciati solo TASK-060/code/test/evidence |

## Review finale

- Reviewer Security/import boundary: P1 su sheets accessorie supplier, conferma
  mode-specific e side effects apply; fix applicati.
- Reviewer Parser/correctness: P1 su metadati read-only trascinati nel merge
  prodotto; fix applicato costruendo payload supplier da prodotto esistente.
- Reviewer UI/browser/tests: P1/P2 su mutazioni supplier e focus drop zone; fix
  applicati e test aggiornati.

## Note operative

- `Preview` supplier non modifica catalogo; l'audit preview resta server-side e
  redatto secondo il contratto storico TASK-028.
- Il browser test sintetico esegue apply reale su Supabase locale e usa cleanup
  SQL locale filtrato `TASK060_*` per rimuovere audit append-only, shop, profilo
  e prodotti creati dal test.
- La QA live FIX 4 e la QA reale finale sono state mostrate nel browser
  laterale; nel gate finale le fixture locali `TASK060_*`/`LIVE060_*` sono
  state rimosse e verificate a residui zero.
- Workbook reali `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx` e
  `/Users/minxiang/Downloads/2604137549-Belina.xls` non sono stati
  committati/copiati nel repository.
- `PreGeneratedScreen` non trovato nella repo Android; usati `ExcelUtils.kt` e
  `GeneratedScreen.kt` come riferimenti funzionali.
- Il dev server corrente su `127.0.0.1:3000` puo puntare a `.env.local` cloud;
  per evitare production/cloud apply, l'E2E mutativo FIX 4 e stato eseguito su
  server `next start` locale `127.0.0.1:3060` ricostruito con Supabase locale.

## Sicurezza e redazione

- Commit e push finali su `main` autorizzati esplicitamente dall'utente il
  2026-06-14; nessun production/cloud apply.
- Nessun production/cloud apply.
- Nuova dipendenza runtime motivata: `@e965/xlsx` per parsing `.xls`
  legacy/HTML-Excel server-side.
- Nessuna migration/schema/RLS/RPC.
- Nessun workbook reale committato o copiato nel repo.
- Nessun secret/raw workbook/PIN/password/token/credential hash in UI/log/evidence.
