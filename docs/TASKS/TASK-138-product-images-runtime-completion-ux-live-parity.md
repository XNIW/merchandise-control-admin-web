# TASK-138 - Product Images Runtime Completion, UX e Live Parity

## Informazioni generali

- ID: `TASK-138`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `USER_CONFIRMED_RELEASE`
- Verdict finale: `RELEASE_READY_WITH_MEASURED_GATES`
- Data apertura: `2026-07-18`
- Contratto canonico: questo file nel repository Admin Web
- Evidence: `docs/TASKS/EVIDENCE/TASK-138/README.md`
- Mirror Android:
  `docs/TASKS/TASK-138-product-images-runtime-completion-android.md`
- Mirror iOS:
  `docs/TASKS/TASK-138-product-images-runtime-completion-ios.md`
- Dipendenza: TASK-137 resta in `REVIEW_WITH_BLOCKERS`; non viene riaperto,
  chiuso o marcato `DONE` da questo follow-up.
- Esclusione esplicita: Win7POS e production non partecipano al task.

## Autorizzazione e governance

Il prompt utente del `2026-07-18` autorizza esplicitamente l'apertura di questo
follow-up e la sua esecuzione coordinata nei tre repository. Questa istruzione
specifica prevale sulle regole generiche dei mirror che riservano al planner la
creazione dei task. TASK-138 e l'unico task in lavorazione; TASK-137 rimane una
voce precedente nella coda review.

La regola iniziale impediva a Codex di chiudere autonomamente il task. Il prompt
utente finale del `2026-07-18` richiede esplicitamente review completa, gate,
chiusura `DONE`, merge e push; questa conferma soddisfa il gate di governance.
I verdict executor storici erano:

- `COMPLETE_FOR_REVIEW`;
- `REVIEW_WITH_BLOCKERS`;
- `BLOCKED`.

## Obiettivo

Completare e provare il runtime immagini prodotto fondato da TASK-137 su Admin
Web, Android e iOS. Il risultato deve offrire placeholder locale, thumb lazy in
lista, main nel dettaglio, cache privata scoped e offline, batching/coalescing
bounded, upload preprocessato e cancellabile, parita live non-production e
misure riproducibili senza persistere URL firmate, token o byte nei record di
catalogo/sync.

## Baseline Git e worktree

Riferimenti attesi e verificati sui tracking ref locali:

| Repository | `origin/main` locale | Worktree TASK-138 |
|---|---|---|
| Admin Web | `a20fdaf6ce9ed862d1c0fc0123ee355d4ff9fbdc` | detached, pulito |
| Android | `69c36c2c4e3e331da4ca6ce76524cf766d0a36f1` | detached, pulito |
| iOS | `2e2cc6202d4947e13946da7ec6e6ac5337703862` | detached, pulito |

Il tentativo di aggiornare `origin/main` da GitHub e fallito prima di qualunque
modifica con `Could not resolve host: github.com`. Di conseguenza la conferma
remota live e `BLOCKED_ENV`, mentre gli SHA locali coincidono esattamente con
quelli congelati nel prompt. I checkout originali dirty sono preservati e non
sono target di scrittura.

## Contratto TASK-137 preservato

- una sola immagine primaria corrente per prodotto;
- bucket privato `product-images` e object path server-owned immutabile;
- catalogo/sync con il solo UUID versione e timestamp, mai blob/path/URL;
- main max `1600 px` e `1 MiB`, thumb max `384 px` e `90 KiB`;
- input JPEG/PNG, piu HEIF/HEIC iOS quando decodificabile; output JPEG;
- cache key `(account_scope, shop_id, product_id, version_id, variant)`;
- `read-urls` max 100 riferimenti, signed URL effimere e non persistite;
- un solo refresh+retry su download `401/403`;
- owner/manager possono scrivere; viewer resta read-only; cashier e negato
  secondo il contratto backend; nessuna service role nel client;
- nessuna nuova dipendenza senza motivazione esplicita;
- nessun cambiamento Win7POS, production, commit, push o merge.

## Audit pre-modifica e gap autorizzati

| Area | Stato iniziale | Gap TASK-138 da chiudere |
|---|---|---|
| Placeholder/no-image | presente nei tre client | prova dinamica zero rete e zero cache entry |
| Thumb/main | wiring presente | Android main usa crop; screenshot/list assertion mancanti |
| Lazy 200 prodotti | mobile parziale; Admin non reale | visibility gate Admin, cancellazione offscreen mobile, test 200 |
| Batch/dedup/coalescing | chunk Admin parziale; mobile singolo | dedup, batch max 100, in-flight condiviso e limite download |
| Cache/scope/offline | chiavi corrette e cache-first | purge logout/switch e prova no cross-scope |
| Retry scadenza | un retry presente | prova uniforme anti-loop |
| Decode/MIME | validazione parziale | nessuna cache prima di decode valido |
| Replace/remove/race | purge base presente | replace reale e stale completion test |
| Preprocess | budget base presente | Admin off-main e suite fixture completa |
| Progress/cancel | stati generici | fasi preprocess/main/thumb/finalize e cancel end-to-end |
| Live parity | non eseguita | stessa fixture/shop/session non-production sui tre client |
| Misure/evidence | parziale TASK-137 | 10 fixture, scroll/memoria, screenshot e stima storage |

Non sono autorizzati refactor o riscritture delle parti gia conformi.

## Sequenza obbligatoria

1. Verificare ID, riferimenti Git, worktree isolati e assenza di runner
   concorrenti.
2. Registrare audit e matrice prima di modificare il runtime.
3. Eseguire baseline black-box sui tre client senza preliminary runtime patch.
4. Resettare soltanto il progetto Supabase locale identificato e creare fixture
   sintetica con shop, owner, manager, viewer, cashier, Product A senza immagine
   e Product B con immagine.
5. Verificare prima schema, RLS/grant, Storage, API, idempotenza, audit e cleanup.
6. Solo dopo il PASS backend, modificare Admin, Android e iOS nei rispettivi
   worktree, con un solo writer per repository.
7. Rieseguire test mirati, baseline di regressione, lint/build/typecheck e prove
   black-box; nessun `PASS` senza comando reale.
8. Eseguire staging/live soltanto su target esplicitamente non-production e
   allowlistato. Se prerequisiti, rete o sessione mancano, fermarsi fail-closed.
9. Eseguire un normale scan di sicurezza e una sola diff review bounded; nessun
   Deep Security Scan.
10. Preparare handoff verso `REVIEW`; passare a `DONE` solo dopo conferma
    esplicita dell'utente, ricevuta il `2026-07-18`.

## Requisiti runtime

### Lettura e UX

- placeholder interamente locale con spazio 1:1 stabile e label accessibile;
- un prodotto senza versione non deve invocare API, Storage, cache write o
  allocazione di immagine remota;
- thumb `crop` in lista e main `contain/fit` nel dettaglio/editor;
- loading, error+retry e offline-cache chiaramente distinguibili;
- visibilita reale: i prodotti non visibili non avviano download e gli item
  usciti rapidamente dalla viewport non trattengono job/byte non necessari;
- fixture da 200 prodotti con evidenza visible-only e memoria bounded.

### Batch, rete e cache

- deduplicare i riferimenti prima di ogni `read-urls`;
- batch per shop da massimo 100 riferimenti;
- coalescere richieste concorrenti della stessa chiave;
- limitare esplicitamente i download concorrenti e provare il limite;
- non persistere signed URL, bearer token, cookie o response sensibili;
- validare status, MIME, size, magic bytes e decode prima del commit cache;
- una risposta corrotta non deve lasciare entry cache;
- su `401/403` rinnovare URL e riprovare una volta sola;
- cache scoped per account/shop e purge selettivo su replace/remove;
- logout/account switch/shop switch devono cancellare o rendere
  irraggiungibile e poi eliminare il vecchio scope, senza cross-leak;
- completion stale non deve sovrascrivere la nuova versione/scope.

### Upload

- preprocessing pesante fuori dal main/UI thread;
- input/budget e normalizzazione TASK-137 invariati;
- progress osservabile per preprocess, upload main, upload thumb e finalize;
- cancellazione esplicita con cleanup dei temporanei e nessun finalize parziale;
- upload, replace, noop checksum, remove e duplicate remove provati;
- nessun originale conservato e nessun segreto in log/evidence.

## Matrice black-box minima

Ogni caso usa una delle sole classificazioni:
`PASS`, `FAIL`, `NOT_IMPLEMENTED`, `IMPLEMENTED_NOT_CONNECTED`,
`IMPLEMENTED_NOT_TESTED`.

| Caso | Admin | Android | iOS |
|---|---|---|---|
| Product A placeholder/zero network | required | required | required |
| Product B thumb lista | required | required | required |
| Product B main dettaglio | required | required | required |
| offline cache hit | required | required | required |
| signed URL expired one retry | required | required | required |
| invalid MIME/decode no cache | required | required | required |
| replace + stale completion | required | required | required |
| remove + purge selettivo | required | required | required |
| account/shop switch isolation | required | required | required |
| 200 prodotti visible-only/bounded | required | required | required |
| progress + cancel | required | required | required |

## Fixture e misure

La suite deve comprendere almeno dieci input sintetici/redistribuibili, tra cui:

- JPEG landscape, portrait e square;
- PNG con alpha;
- immagine ruotata/orientata;
- input piccolo da non upscalare;
- input ad alta risoluzione, incluso almeno un caso 48 MP;
- JPEG progressivo quando supportato;
- file corrotto e MIME errato;
- animato/multi-frame da rifiutare.

Registrare input/output byte e dimensioni, tempo preprocess, limite/conteggio
download, memoria osservata con metodo dichiarato, hit/miss cache, residui
Storage e una proiezione storage per `1`, `10.000` e `100.000` immagini. Le
misure campionate non devono essere presentate come picchi assoluti.

## Check obbligatori

### Backend/Admin

- reset locale mirato e migration apply;
- pgTAP/test SQL TASK-137 e regressioni catalogo/security;
- test route/contract e lifecycle locale;
- unit/component/E2E TASK-138;
- typecheck, lint mirato, build;
- Playwright desktop e viewport mobile;
- cleanup/report residui;
- scan normale e diff review bounded.

### Android

- unit test mirati service/cache/processor/ViewModel;
- test batch max 100, coalescing, concurrency, cancel e 200 prodotti;
- baseline JVM pertinente, `assembleDebug`, `lintDebug`;
- instrumentation/emulator serializzato dopo la fixture backend;
- screenshot e misure dichiarate; device fisico solo se realmente disponibile.

### iOS

- XCTest mirati service/cache/store/processor;
- test batch max 100, coalescing, concurrency, cancel e 200 prodotti;
- sync baseline pertinente, localizzazioni, build Debug;
- Simulator serializzato dopo la fixture backend;
- screenshot e misure dichiarate; device fisico solo se realmente disponibile.

Ogni check non eseguito deve essere marcato `NOT_RUN`, `BLOCKED_ENV` o
`BLOCKED_PREREQUISITE` con causa concreta.

## Criteri di accettazione

1. Backend locale e fixture multi-ruolo passano prima delle patch mobili.
2. Tutti i gap autorizzati nell'audit sono chiusi o documentati come blocker
   esterno non mascherabile.
3. Nessun comportamento gia conforme viene degradato o riscritto fuori scope.
4. Le tre app mostrano la stessa versione corrente nello stesso shop e
   convergono dopo upload/replace/remove.
5. Product A genera zero traffico/entry; Product B usa thumb/main corretti.
6. Batch, dedup, coalescing e limite di concorrenza sono provati.
7. Cache offline, isolation, purge e invalid decode sono provati.
8. Preprocess, progress e cancel rispettano i budget senza bloccare l'UI.
9. Test 200 prodotti, 10 fixture, misure, screenshot e stima storage sono
   durevoli e riproducibili.
10. Nessun secret, signed URL, blob o dato reale entra in repo/log/evidence.
11. Win7POS, production e checkout originali restano intatti.
12. Handoff completo porta il task a `REVIEW`; la conferma utente finale porta
    il task a `DONE` dopo i gate misurati.

## Handoff richiesto

L'handoff finale deve includere almeno: verdict; repository/SHA/worktree;
baseline iniziale; matrice before/after; file toccati; criteri di accettazione;
comandi e risultati reali; fixture; risultati backend e ruoli; risultati per
client; rete/batch/concurrency; cache/offline/isolation; upload/progress/cancel;
sync/parity; screenshot; performance/memoria; storage/costi; security scan;
cleanup; blocker; rischi residui; deviazioni; prossima fase `REVIEW`.

## Handoff executor 2026-07-18

Implementazione e verifiche locali completate. Backend locale, ruoli, runtime
Admin, Android JVM/emulator, iOS build/Simulator, batching/concurrency, cache,
preprocess/cancel, suite 200/fixture, scan normale e cleanup sono documentati
in `docs/TASKS/EVIDENCE/TASK-138/`.

Verdict: `REVIEW_WITH_BLOCKERS`. Nell'optimization pass la stessa fixture
locale e stata consumata da Admin e offerta serialmente ai client mobili:
Android ha chiuso no-image ma ha rifiutato la thumb prima del download per
origin signed URL locale non coincidente; iOS si e fermato prima della rete
per rotazione del data container Xcode. La matrice incrociata resta quindi
incompleta. Screenshot mobile, device fisici e staging/dev restano
`NOT_RUN`/bloccati. Il follow-up Admin ha chiuso la distribuzione a 12 fixture
valide rappresentative piu 3 negative, con main/thumb, timing, memoria
campionata e proiezioni separate. Dettagli in
`docs/TASKS/EVIDENCE/TASK-138/09-optimization-review.md`. Nessun claim `DONE`,
production-ready o live parity.

## Chiusura finale 2026-07-18

Il precedente handoff e storico e viene superato dalla review finale richiesta
esplicitamente dall'utente. La parity locale e ora completa in entrambe le
direzioni: Android replace -> Admin/iOS read, iOS replace -> Admin/Android read,
Android remove -> Admin absent e iOS remove -> Admin absent. L'unico `503` iOS
remove e avvenuto dopo il commit DB; l'unico retry consentito ha provato
l'idempotenza `already_removed` e il cleanup finale ha portato DB, Storage e Auth
a zero residui TASK-138.

Admin typecheck/lint/build/security/i18n e foundation `6/6` sono verdi; Android
JVM `74/74`, assemble app/test, lint e runtime visual/performance sono verdi;
iOS Analyze e suite completa `40` test (`37 PASS`, `3 SKIP` opt-in attesi,
`0 failure`) sono verdi. Evidence consolidata a 30 punti:
`docs/TASKS/EVIDENCE/TASK-138/11-final-release-review.md`.

Verdict: `RELEASE_READY_WITH_MEASURED_GATES`. Stato: `DONE`, autorizzato
dall'utente. Staging autenticato e device fisici restano note esterne dichiarate,
non PASS inventati e non blocker del perimetro locale accettato.
