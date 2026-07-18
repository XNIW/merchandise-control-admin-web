# TASK-138 Cleanup e handoff finale

## 1. Verdict

`REVIEW_WITH_BLOCKERS`, mai `DONE`: runtime locale e contratti pronti per
review; live parity comune, screenshot mobile e device fisico non provati.

## 2. Repository, SHA e worktree

| Repo | Base locale | Worktree |
|---|---|---|
| Admin | `a20fdaf6ce9ed862d1c0fc0123ee355d4ff9fbdc` | `task-138-20260718/admin` |
| Android | `69c36c2c4e3e331da4ca6ce76524cf766d0a36f1` | `task-138-20260718/android` |
| iOS | `2e2cc6202d4947e13946da7ec6e6ac5337703862` | `task-138-20260718/ios` |

GitHub current-main verification: `BLOCKED_ENV_DNS`; gli SHA locali congelati
coincidono col brief. Nessun commit/push/merge.

## 3. Baseline iniziale

Foundation TASK-137 presente ma con gap reali su visible-only Admin, batching
mobile, decode-before-cache, purge scope, progress/cancel e prove 200/fixture.
Dettaglio in `00-baseline-and-gap-matrix.md`.

## 4. Before/after

I gap autorizzati sono implementati e testati localmente sui tre client. La
sola colonna non chiusa e live same-shop parity, classificata `BLOCKED_ENV`.

## 5. File toccati

Admin: browser client + worker, ProductImageControls, products page, due logout,
test foundation/E2E, governance/evidence. Android: package productimage,
Database UI/ViewModel, stringhe, test e governance. iOS: ProductImages service/
store/cache/processor/API, editor, stringhe, test e governance. Nessun lockfile.

## 6. Criteri di accettazione

Backend/roles, zero-I/O, thumb/main, batching/concurrency, cache/offline,
decode/retry, stale/purge, preprocess/cancel, 200 prodotti, security e cleanup:
`PASS_LOCAL`. Same-shop live cross-client e visual QA mobile: non soddisfatti
per blocker esterno.

## 7. Comandi e risultati

- backend: reset locale, pgTAP `149/149`, foundation `20/20`, lifecycle e
  cross-shop deny E2E `PASS`;
- Admin: TASK-138 foundation `4/4`, targeted foundation `64/64`, Playwright
  finale `5 pass / 1 skip`, typecheck/lint/build/security/diff `PASS`;
- Android: JVM `604` test, `0` fail/error; build/lint PASS; emulator `3/3`;
- iOS: build-for-testing PASS; Simulator `32/32`; l10n `4/4`;
- full Admin foundation: `6` failure esterne Win7/mobile dirty, nessuna TASK-138.

`npm run verify` e `npm run i18n:check` non sono PASS globali: restano
`BLOCKED_ENV_EXTERNAL` sulla dipendenza/topologia Win7POS. Typecheck, lint,
build, TASK-138 foundation/E2E e security scan scoped sono PASS reali.

## 8. Fixture

Shop sintetico con owner, manager, viewer, cashier; Product A senza immagine e
Product B con main/thumb. Manifest mode `0600`, credenziali casuali mai loggate.

## 9. Backend e ruoli

Owner seed/lifecycle PASS; manager noop `200`; viewer read `200`, write `403`;
cashier read/write `403`; cross-shop denied; Storage privato `2` oggetti prima
del cleanup.

## 10. Risultati client

- Admin runtime locale e visual desktop/tablet/390 px: `PASS`;
- Android gate post-optimization: JVM mirati `68/68 PASS`, Emulator API 35
  `3/3 PASS`; screenshot UI `NOT_RUN`;
- iOS gate post-optimization: 34 eseguiti, `33 PASS`, `1 SKIP` opt-in,
  `0 failure`; screenshot UI `NOT_RUN`.

Vedi `02`, `03`, `04`, `05-cross-platform-parity.md` e i ledger `09` dei
tre worktree.

## 11. Rete/batch/concurrency

205 ref unici: batch `100/100/5`, coalescing 410 consumer -> 205 download,
read peak `<=2`, download peak `4`. Lista Admin 200: solo 2 ref visibili.

## 12. Cache/offline/isolation

Product B offline non produce nuove request; invalid decode non entra in cache;
purge logout/account/shop e stale guards provati su tutti i client.

## 13. Upload/progress/cancel

Intent -> main -> thumb -> finalize sequenziale, progress esplicito e cancel
prima del finalize. Lifecycle replace/noop/remove/duplicate remove PASS locale.

## 14. Sync/parity

Il dominio continua a sincronizzare solo UUID versione/timestamp; nessun blob,
path o URL e nessun full pull nuovo. La fixture Admin locale e stata offerta
serialmente ai client mobili:

- Android no-image sullo stesso shop: `PASS`; thumb/main/cache:
  `BLOCKED_LOCAL_ORIGIN_CONTRACT` prima del download, per origin signed URL host
  diversa dalla `storageBase` emulator-safe;
- iOS: `BLOCKED_ENV` prima della rete; Xcode non ha mantenuto un path config
  privato stabile attraverso la reinstallazione/rotazione data container;
- upload/replace/remove incrociati da ciascuna piattaforma sullo stesso shop:
  `NOT_RUN`.

La parity locale completa e la convergenza staging/dev restano quindi blocker
espliciti; non sono dedotte dai test contract/loopback.

## 15. Screenshot

Screenshot Admin sanitizzati: lista placeholder+thumb, dettaglio thumb preview,
main pronta ed errore su desktop/tablet, piu viewport mobile `390x844`; restano
anche i quattro artifact runtime precedenti Product A/B e lista 200.

## 16. Performance/memoria

Campioni e metodo in `06-performance-memory-storage.md`; nessun valore e
presentato come picco assoluto cross-platform.

## 17. Storage/costi

La proiezione dal solo campione `28.864 B` e ritirata. Il follow-up Admin usa
`12` coppie sintetiche rappresentative: media `81.093 B`, p50 `12.148 B`, p90
`60.489 B`, p95 `779.283 B`. A 100.000 prodotti il totale e rispettivamente
`8,109300`, `1,214800`, `6,048900` e `77,928300 GB`, prima di versioni
superseded/overhead. Main, thumb e tutte le scale
1/1k/10k/20k/100k sono separati in `06-performance-memory-storage.md`.

La suite sintetica a 12 classi e completa, ma non e un campione statistico del
catalogo reale e non e un forecast production. I `100 GB` inclusi e USD
`0,0213/GB` oltre quota sono solo scenario Pro condizionale; piano reale:
`BLOCKED_EXTERNAL_PRECONDITION`, nessun costo effettivo inventato.

## 18. Security

Scan normale PASS, diff review bounded completata, no secret/signed URL/blob in
repo/log/evidence, no service role client, no Deep Scan.

## 19. Cleanup

Prima: prodotti `2`, versioni `1`, oggetti `2`, members `3`, staff `1`.
Cleanup finale optimization pass: `1/1 PASS` (`2,3 s`). Probe read-only finale:
`storage_objects=0`, `image_versions=0`, ready/pending scadute `0`, prodotti,
shop e utenti Auth fixture `0`; manifest assente. Server locale, AVD e Simulator
spenti. Le config token locali sono state rimosse da `/tmp` e spostate nel
Cestino; restano recuperabili finche il Cestino non viene svuotato.

Il successivo run distributivo Admin ha trovato una nuova fixture sintetica
locale preesistente: il tentativo di seed e stato bloccato fail-closed, il gate
`status` ha passato e il preprocess non ha eseguito scritture DB/Storage. Questa
lane non ha rimosso un manifest/fixture che non aveva creato.

## 20. Blocker, rischi, deviazioni e prossima fase

- parity locale image/display non chiusa per Android e iOS; matrice
  upload/replace/remove incrociata non eseguita;
- screenshot Android/iOS e device fisici non verificati;
- staging/dev e piano Supabase reale: `BLOCKED_EXTERNAL_PRECONDITION`;
- 12 fixture Admin con byte main/thumb, timing di fase e memoria pagina
  campionata completate; restano timing/memoria comparabili sui client mobili e
  memoria worker/canvas/nativa completa;
- browser `createImageBitmap` resta un decode originale non misurato come
  downsample nativo; il fallback main-thread puo avere memoria peggiore;
- nessun claim di assenza leak, perfezione o production readiness.

Prossima fase: `REVIEW_WITH_BLOCKERS`. Servono origin locale emulator-safe,
config iOS stabile post-install, screenshot mobili seriali e matrice same-shop;
solo conferma utente puo portare il task a `DONE`.
