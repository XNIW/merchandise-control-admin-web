# TASK-060 - Supplier Excel Android-style preview/import

## Informazioni generali

- ID: `TASK-060`
- Titolo: `Supplier Excel Android-style preview/import`
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `CODEX_ORCHESTRATOR`
- Verdict tecnico: `DONE`
- Data apertura: `2026-06-13`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-060/README.md`
- Nota governance: task chiuso a `DONE` il 2026-06-14 su conferma esplicita
  dell'utente dopo review, evidence e check finali.

## Contesto

TASK-057 ha introdotto Catalog Workspace e import/export Excel. TASK-060 e un
follow-up mirato sul flusso `Import supplier Excel`, per avvicinare preview e
apply al riferimento Android `ExcelUtils.kt` / `GeneratedScreen`: preview ampia,
valori riconosciuti read-only e valori da importare compilati manualmente.

## Scope

- Aprire e tracciare TASK-060 in Master Plan ed evidence.
- Aggiungere drop zone accessibile per file `.xlsx` / `.xls` supplier.
- Mostrare preview supplier in dialog largo, nello stesso flusso UI.
- Mostrare il file selezionato in modo evidente con estensione, dimensione,
  stato ready, remove e replace.
- Separare il flusso supplier in tre passi: `Workbook file`, `Check columns`
  e `Import preview`; la tabella finale e l'apply sono disponibili solo dopo
  conferma/rerun del mapping.
- Aggiungere mapping colonne editabile: campi canonici Android-style, sorgente
  riconosciuta/confidence, `Ignore` e re-run preview con mapping digest-bound.
- Supportare parsing server-side `.xls` legacy/BIFF e HTML-Excel oltre `.xlsx`.
- Aggiungere default supplier/category top-level con suggerimenti dai nomi
  esistenti dello shop; la tabella supplier principale non mostra colonne
  supplier/category per-riga.
- Esporre tabella preview supplier compatta con colonne:
  - No.
  - Status
  - Product (barcode, item number, name, second name multiline)
  - Current catalog values
  - Recognized from file (quantity, purchase price e reference read-only)
  - Import values (quantity e retail price manuali, visibili senza scroll
    orizzontale su desktop normale)
- Tenere `Quantity to import` e `Retail price to import` vuote all'inizio.
- Separare valori riconosciuti read-only da valori mutativi.
- Estendere parser supplier con subset Android-style verificabile:
  - alias multilingua cinesi/spagnoli/italiani;
  - header spostato dopo metadata;
  - sorgente riconoscimento colonne;
  - colonne generate solo come metadata/blocked state, senza inventare valori;
  - pattern deterministico solo per fixture sintetiche sicure;
  - righe summary/total escluse in modo conservativo.
- Preservare preview/apply digest, row fingerprint e validation bounded.
- Garantire che apply supplier crei/aggiorni righe prodotto valide nel catalogo
  shop-scoped usando identita prodotto e purchase price riconosciuti, mentre
  prezzo retail e quantita restano mutativi solo se scritti dall'utente.
- In supplier mode, campi vuoti `retailPrice`/`stockQuantity` non sovrascrivono
  valori esistenti; per righe nuove restano non valorizzati/default se non
  compilati manualmente.
- Riferimenti supplier/category vengono collegati solo se gia esistenti nello
  shop; riferimenti non risolti diventano warning e non creano nuove anagrafiche.
- Manual supplier/category priority UI: default UI top-level > valore
  riconosciuto dal workbook > vuoto/preservazione esistente. Il contratto
  server mantiene compatibilita con override per-riga validati, ma la UX
  principale non li espone.
- Belina `.xls`/HTML-Excel: `Ref`, `Código Barras`, `Descripción`,
  `Local Descripción`, `CNT` e `Precio` devono mappare rispettivamente a
  item number, barcode, product name, second name, quantity e purchase price;
  `IMP(CLP)` resta unmapped e non diventa retail price.
- Correggere UX auth/sessione per preview/apply supplier: sessione Shop Code
  scaduta o non piu attiva mostra `Session expired. Please sign in again.`
  con rientro login, mentre permesso mancante resta `permission_denied` e non
  mostra preview finta o `Sheet: Unknown`.
- Aggiungere test TASK-060, browser/Playwright QA con fixture sintetiche e QA
  locale redatta sui workbook reali Dingli e Belina forniti dall'utente.
- Review finale: preview/apply devono autorizzare prima di leggere/parsing del
  multipart body; lo `shop_id` di auth arriva dalla query string e resta
  verificato dal resolver shop-scoped esistente.

## Esclusioni

- Nessun commit/push/stage durante execution non confermata; commit e push
  finali su `main` sono stati autorizzati esplicitamente dall'utente il
  2026-06-14.
- Nessun deploy production/cloud apply.
- Nessuna nuova dipendenza non motivata: `@e965/xlsx` e stata aggiunta per
  supportare `.xls` legacy/HTML-Excel server-side senza esporre parsing nel
  browser/client.
- Nessun cambio schema Supabase, migration, RLS o RPC.
- Nessun Sales Sync, POS runtime, dashboard fake, Win7POS/iOS/Android edits.
- Nessun workbook reale committato o copiato nel repository.
- Nessun raw workbook, PIN, password, token, credential hash o secret in UI/log/evidence.
- Nessun workbook reale committato o copiato nel repository.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | TASK-060 aperto con evidence dedicata e Master Plan aggiornato come task attivo. | `PASS` |
| CA-02 | Drop zone `.xlsx` / `.xls` supporta click file picker, drag over/drop, tastiera, file badge e reset preview/apply/error su cambio file. | `PASS` |
| CA-03 | Preview positiva mostra dialog largo `Supplier workbook preview` con wizard `Workbook file` -> `Check columns` -> `Import preview`; apply e tabella finale non sono disponibili nello step mapping. | `PASS` |
| CA-04 | Valori riconosciuti quantity/price sono read-only reference; input `to import` partono vuoti. | `PASS` |
| CA-05 | Apply supplier richiede `APPLY`, digest valido e crea/aggiorna prodotti; quantity/retail price sono importati solo se compilati dall'utente. | `PASS` |
| CA-06 | Campi vuoti quantity/price non sovrascrivono valori esistenti e restano vuoti/default su righe nuove. | `PASS` |
| CA-07 | Parser supplier copre alias/header shifted/summary rows/column sources con fixture sintetiche Dingli `.xlsx`, Belina `.xls` e workbook reali smoke; `IMP(CLP)` resta unmapped. | `PASS` |
| CA-08 | Preview non modifica catalogo; audit resta redatto e server-side. | `PASS_WITH_NOTE` |
| CA-09 | Database transfer/export esistenti non regrediscono. | `PASS` |
| CA-10 | Check reali documentati con esito `PASS`, `PASS_WITH_WARNINGS`, `FAIL`, `BLOCKED` o `NOT_RUN`. | `PASS` |
| CA-11 | Mapping override viene validato server-side e incluso nel digest preview/apply. | `PASS` |
| CA-12 | Default supplier/category top-level collegano solo nomi esistenti nello shop e non creano nuove anagrafiche; supplier/category non sono colonne nella tabella supplier principale. | `PASS` |
| CA-13 | Sessione staff scaduta/cancellata e permesso mancante hanno codici/UX distinti e non mostrano preview finta. | `PASS` |
| CA-14 | Step `Check columns` mostra sample prodotto bounded dalla header rilevata, contesto raw collassato, mapping required, warning low/missing, rerun quando il mapping cambia e `Continue to import preview` solo su digest aggiornato. | `PASS` |
| CA-15 | FIX 5: Step 1 e l'unico con upload/replace/remove; Step 2 contiene default supplier/category e mapping tabellare con header Excel reali/sample values; Step 3 non mostra card file/defaults e ha input import visibili senza scroll orizzontale iniziale. Il back Step2/Step3 vive nella barra titolo del dialog come freccia Android-style a sinistra del titolo. Follow-up browser review: stepper sopra la descrizione contestuale per step, area APPLY compatta in riga desktop e tabella preview piu densa sullo spazio centrale. | `PASS` |
| CA-16 | FIX 6: supplier wizard pulito senza card `Import supplier Excel`; file chip in titlebar negli step 2/3; Step 2 `Verify detected product columns` e mapping-first con `Use` include/exclude; `retailPrice`, `discount`, `discountedPrice`, `lineTotal` optional off di default; `售价` e reference discounted e `总价` line total non mutativo; Step 3 mostra `Current catalog values`, reference file e input mutativi vuoti. | `PASS` |
| CA-17 | FIX 7: Dingli non mappa `purchasePrice` su colonna testuale `产品名2`; `retailPrice` non appare nel mapping supplier; Step 2 mostra sample prodotto prima del mapping, senza colonna Excel `Row`, massimo 5 righe prodotto e label Android/iOS `Total price`; Step 3 usa numerazione prodotto `No.` e non mostra placeholder `-` per valori non presenti. | `PASS` |
| CA-18 | Review finale: route preview/apply eseguono guardia size/content-type/origin e autorizzazione shop-scoped prima di `request.formData()`/bytes workbook; staff senza permesso non fa parsing multipart. | `PASS` |
| CA-19 | Review finale: i workbook reali `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx` e `/Users/minxiang/Downloads/2604137549-Belina.xls` passano in E2E locale browser con cleanup sintetico e senza copiare workbook nel repository. | `PASS` |

## Fonti obbligatorie lette

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`
- `docs/TASKS/EVIDENCE/TASK-057/README.md`
- Guide Next locali:
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- Codice Shop Admin/import-export indicato nel brief TASK-060.
- Android reference:
  - `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview/util/ExcelUtils.kt`
  - `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview/ui/screens/GeneratedScreen.kt`
- Nota: `PreGeneratedScreen` non e stato trovato nei sorgenti Android; `ExcelUtils.kt`
  resta la fonte funzionale principale.

## Matrice test/check prevista

| Check | Stato |
|---|---|
| `node --test tests/foundation/task-060-*.test.mjs` | `PASS` |
| `npm run typecheck` | `PASS` |
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS` |
| `npm run verify` | `PASS_WITH_WARNINGS` |
| `npm run test:shop-admin-auth-smoke` | `PASS` |
| `npm run test:shop:local` | `PASS` |
| `npm run cf:build` | `PASS_WITH_WARNINGS` |
| `npm audit --json` | `FAIL_WITH_EXISTING_WARNINGS` |
| Browser/Playwright QA locale supplier import sintetico Dingli `.xlsx`, Belina `.xls` + auth/sessione | `PASS` |
| Browser/Playwright QA locale FIX 7 su `127.0.0.1:3060` | `PASS` |
| Browser/Playwright QA locale con workbook reali Dingli/Belina su `127.0.0.1:3060` | `PASS` |
| Rerun E2E reale su `next start` locale dopo dev-server memory restart | `PASS` |
| Browser laterale live finale su `127.0.0.1:3060` | `PASS` |
| Browser laterale live FIX 4 su `127.0.0.1:3060` locale | `PASS_WITH_NOTE` |
| Browser QA reale Dingli locale precedente | `PASS_WITH_NOTE` |
| Parser smoke reale Dingli/Belina con `@e965/xlsx` | `PASS` |
| Cleanup fixture locali `TASK060_*`/`LIVE060_*` | `PASS` |
| `git diff --check` | `PASS` |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_MODIFIED_FILES` |

## Execution log

- `2026-06-13`: TASK-060 aperto da brief utente con orchestrator overlay.
  Fase iniziale: `EXECUTION`; nessun commit/push/stage autorizzato.
- `2026-06-13`: implementati drop zone, preview larga, parser Android-style
  scoped, preview DTO recognized e apply supplier preview-first.
- `2026-06-13`: review finale read-only ha trovato P1 su side sheets,
  conferma apply e metadati read-only; fix applicati e coperti da test.
- `2026-06-13`: resume/fix su test reale Dingli: corretti rendering di preview
  non-ok, audit staff Shop Code, creazione prodotti nuovi da supplier workbook
  e filtro righe summary Dingli. Browser/Playwright QA locale completata con
  fixture sintetica; browser reale Dingli completato su Supabase locale con 101
  prodotti importati e in-app browser lasciato sulla shop popolata. Handoff
  massimo `REVIEW / READY_FOR_REVIEW`.
- `2026-06-13`: resume/fix 2: aggiunti supporto `.xls` legacy/HTML-Excel con
  `@e965/xlsx`, mapping override digest-bound, default/per-row supplier/category,
  UI file badge/replace/upload collassabile, tabella preview piu ampia e E2E
  locale `.xls` con supplier/category esistenti. Handoff resta
  `REVIEW / READY_FOR_REVIEW`.
- `2026-06-13`: resume/fix 3: corretti codici auth preview/apply per sessione
  staff scaduta (`session_expired`), sessione non attiva (`no_active_session`)
  e permesso mancante (`permission_denied`); route preview/apply restituiscono
  401/403 e autorizzano prima di leggere i bytes workbook. La UI mostra banner
  `Session expired. Please sign in again.`, bottone `Sign in again` con `next`
  preservato verso Shop Code, e non rende `Sheet: Unknown` o il messaggio
  generico come preview. E2E locale copre manager valido, sessione scaduta,
  sessione cancellata e staff senza `catalog.import`.
- `2026-06-13`: resume/fix 4: UI supplier divisa in step `Workbook file`,
  `Check columns` e `Import preview`; mapping con sample raw bounded e
  digest aggiornato obbligatorio prima della tabella/apply. Rimossi
  supplier/category dalla tabella supplier principale mantenendo default
  top-level. Aggiunti alias Belina (`Ref`, `CNT`, `Local Descripción`) e
  verifica che `IMP(CLP)` resti unmapped. Playwright locale `3060` passa
  5/5 su Dingli `.xlsx`, Belina `.xls`, sessione scaduta/cancellata e
  staff senza import. Browser laterale autenticato su fixture locale live con
  prodotti importati visibili.
- `2026-06-13`: resume/fix 5: Step 1 resta l'unico punto con upload grande,
  Step 2 `Check columns` mostra default supplier/category, sample prodotto
  dalla header rilevata, contesto raw collassato e mapping in tabella con
  header Excel reali e sample values; Step 3 resta solo preview/apply con
  tabella supplier compatta `Product`/`Recognized`/`Import values`, senza
  default/card file e con back top-level tra step. Rifinitura browser review:
  il back Step2/Step3 e ora una freccia Android-style nella barra titolo del
  dialog, a sinistra di `Supplier workbook preview`. Follow-up browser review:
  lo stepper e sopra la descrizione per-step, APPLY e compatto in una riga
  desktop e la preview table usa meglio lo spazio tra prodotto, valori
  riconosciuti e input import. Stato resta `REVIEW / READY_FOR_REVIEW`.
- `2026-06-13`: resume/fix 6: rimosso l'header/card ridondante `Import
  supplier Excel` dal wizard supplier; file chip spostato nella titlebar del
  dialog negli step successivi al workbook; mapping Step 2 ora e prioritario
  con colonna `Use`, required locked/on, recommended on quando riconosciuti e
  optional off by default. Aggiunti alias/reference Dingli `折扣`,
  `售价` -> `discountedPrice` e `总价` -> `lineTotal` senza mutazione apply;
  Step 3 mostra valori catalogo correnti per righe update e reference file
  separati dagli input manuali. Stato resta `REVIEW / READY_FOR_REVIEW`.
- `2026-06-13`: resume/fix 7: corretta regressione Dingli che permetteva
  `purchasePrice -> 产品名2`; parser numerico client/server non accetta piu
  codici/testo con cifre come numeri. `Retail price` viene escluso dal mapping
  supplier, `Line total` rinominato `Total price` come Android/iOS, sample Step
  2 limitato a 5 righe prodotto senza colonna Excel `Row`, e Step 3 usa `No.`
  come numerazione prodotto. Playwright `3060` passa 5/5 e browser laterale
  ricaricato senza errori console. Stato resta `REVIEW / READY_FOR_REVIEW`.
- `2026-06-14`: review finale/DONE gate: trovato e corretto un blocker di
  boundary nelle route preview/apply, che leggevano `request.formData()` prima
  dell'autorizzazione import. Ora lo shop target arriva da query string, viene
  validato dal resolver shop-scoped e solo dopo si legge il multipart body.
  Aggiunti test foundation per garantire auth prima di `formData()` e bytes,
  piu E2E Playwright sui workbook reali Dingli `.xlsx` e Belina `.xls` dalla
  cartella Downloads. Browser laterale in-app reso visibile su `127.0.0.1:3060`
  durante la QA; fixture locali `TASK060_*`/`LIVE060_*` ripulite con conteggi
  finali zero. Stato resta `REVIEW`; verdict tecnico
  `READY_FOR_DONE_CONFIRMATION` in attesa di conferma utente esplicita.
- `2026-06-14`: DONE confirmation: l'utente ha richiesto esplicitamente
  `Mettilo in DONE ... commit push`. TASK-060 viene quindi chiuso a `DONE`.
  Il repository era gia su `main`, quindi il merge locale e un no-op; segue
  commit/push autorizzato su `main` dopo rerun dei gate finali.
