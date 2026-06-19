# TASK-071 Evidence - Final closure and fix-all

## Stato

- Data: 2026-06-19
- Verdict generale: `DONE`
- `TASK-068Z`: `DONE`
- `TASK-069`: `DONE`
- `TASK-070`: `DONE`
- Commit / push / stage / merge: `AUTHORIZED_AFTER_USER_DONE_CONFIRMATION`; merge no-op perche' i repo erano gia su `main`
- Deploy / `db push` / migration apply: `NOT_RUN_BY_REQUEST`
- Secret exposure: `NONE_INTENDED`; nessun PIN/password/hash/token/secret
  stampato.

## Fix TASK-071

| Repo | Fix |
|---|---|
| Admin Web | Messaggi pubblici staff login unificati su `sign_in_blocked`; test foundation/e2e aggiornati; path locali assoluti rimossi dai nuovi handoff/evidence. |
| Android | Backfill migration `17 -> 18` per dirty legacy refs; guard runtime su dirty mask `NULL`; test mirati aggiunti; `.idea/deploymentTargetSelector.xml` sanificato senza serial/path locali. |
| Win7POS | Product permission guards, price-edit guard, supplier/category serialization/re-read, CSV formula hardening, Change PIN cleanup in `finally`, physical bridge collect-log exit code e timeout note. |
| iOS | Nessun fix sorgente aggiuntivo in TASK-071; backup SwiftData `default.store*` spostato fuori repo in quarantena locale `.codex`; review finale conferma patch TASK-069 e gate mirati gia verdi. |

## Check finali

### Admin Web

| Comando | Esito |
|---|---|
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, 378/378. |
| `npm run verify` | `PASS`; include lint, typecheck, security scan e build. |
| `npm run lint` | `PASS` via `verify`. |
| `npm run typecheck` | `PASS` via `verify`. |
| `npm run build` | `PASS` via `verify`; warning noti Next `middleware` deprecation e Node `DEP0205`. |
| `test:shop:local` | `PASS`, 5/5 via subagent finale su `next start`; copre overview, products pagination/search/reset, import dialog, staff manager session e cashier denial. |
| `git diff --check` | `PASS`. |

### Android

| Comando | Esito |
|---|---|
| `./gradlew assembleDebug` | `PASS`, `BUILD SUCCESSFUL`. |
| `./gradlew testDebugUnitTest --tests ...AppDatabaseMigrationTest --tests ...DefaultInventoryRepositoryTest --rerun-tasks` | `PASS`, targeted forced rerun dopo fix. |
| `./gradlew lintDebug testDebugUnitTest` | `PASS`, `BUILD SUCCESSFUL`. |
| `git diff --check` | `PASS`. |
| `rg` su `.idea/deploymentTargetSelector.xml` per serial/path locali | `PASS`, nessun match. |

### iOS

| Comando | Esito |
|---|---|
| XcodeBuildMCP `build_sim` | `PASS`, Debug simulator. |
| XcodeBuildMCP targeted `test_sim` | `PASS`, 200 passed, 0 failed, 0 skipped. |
| Full `test_sim` | `NOT_RERUN_IN_TASK_071`; precedente TASK-069 `FAIL_WITH_PREEXISTING_SUITE_DRIFT`, 856 passed, 25 failed, 29 skipped. |
| `git diff --check` | `PASS`. |
| `find docs/TASKS/EVIDENCE` per `default.store*` o file `>50M` | `PASS`, nessun output; backup spostato in `/Users/minxiang/.codex/quarantine/TASK-071-ios-store-backup`. |

### Win7POS

| Comando | Esito |
|---|---|
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS`, 0 warnings, 0 errors. |
| `pwsh -File scripts/check-dialog-standards.ps1` | `PASS`, `ALL PASS`. |
| `pwsh -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `ALL PASS`. |
| `pwsh -File scripts/check-pos-online-client.ps1` | `PASS`, `ALL PASS`. |
| `pwsh -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `ALL PASS`. |
| `pwsh -File scripts/check-product-dialog-free-text.ps1` | `PASS`, `ALL PASS`. |
| `bash -n` su 8 script shell Win7POS | `PASS`. |
| PowerShell parser su 9 script `.ps1` Win7POS | `PASS`, `PARSER_OK`. |
| `git diff --check` | `PASS`. |

## CodeRabbit

| Repo | Esito |
|---|---|
| Admin Web | `BLOCKED_EXTERNAL_RATE_LIMIT` su review finale CLI gratuita. Prima review subagent aveva trovato solo path assoluti nei nuovi docs; fix applicato e `rg` finale sui quattro documenti nuovi non trova path locali assoluti. |
| Win7POS | Review finale CLI: 2 finding (`start-physical-win7-bridge.bat` timeout documentale e `collect-logs` exit code). Entrambi corretti; syntax/static checks rieseguiti. |

## Browser smoke e query read-only

- Browser smoke Admin Web `test:shop:local`: `PASS`, 5/5 via subagent.
- Platform smoke TASK-068Z precedente: `PASS` su sidebar/shop profile, come
  evidence `TASK-068Z`.
- Query read-only TASK-068Z: `PASS_READ_ONLY_REDACTED`; staff `1001` manager
  active verificato, hash solo booleano, recovery audit presente. Nessun valore
  segreto stampato.
- Query read-only aggiuntive TASK-071: `NOT_RUN`; non necessarie dopo evidence
  redatta e per evitare esposizione/uso ambiente cloud.

## Matrice cross-platform finale

| Area | Stato | Nota |
|---|---|---|
| Products | `PASS_WITH_NOTES` | Admin/Android/iOS compatibili owner-scoped; Win7POS compatibile con mapping. Barcode canonical e shop-scoped contract restano follow-up. |
| Categories | `GAP_PLANNED` | Rename/dirty fields migliorati; iOS tombstone remoto ok. Restano Android tombstone locale end-to-end e Win7POS remote UUID/tombstone. |
| Suppliers | `GAP_PLANNED` | Stesso stato categories: rename ok, iOS tombstone remoto ok, Win7POS/Android ancora da completare. |
| Prices | `PASS_WITH_NOTES` | Parser Admin allineato, mobile `ProductPrice`, Win7POS CLP integer. Serve policy rounding esplicita. |
| Price history | `PASS_WITH_NOTES` | Admin/mobile hanno modello storico prezzi; Win7POS ha `product_price_history` locale. Mapping/sync Win7POS resta nota. |
| Inventory history | `PASS_WITH_NOTES` | Admin legge history/sync read-only con fallback legacy owner; Android/iOS hanno history remote refs. Win7POS non e' sorgente history mobile. |
| Shared sheet sessions | `PASS_WITH_NOTES` | Admin read-only su `shared_sheet_sessions`; Android/iOS supportano session backup/history. Win7POS fuori scope. |
| Sync events | `PASS_WITH_NOTES` | iOS allineato a `changed_count` 100.000; Admin migration pronta ma non applicata; Android compatibile/compatta IDs. |
| Staff/POS | `PASS_WITH_NOTES` | Admin staff/POS e Win7POS first-login/offline mirror coerenti; UI login Admin non enumera identita. |
| Devices | `PASS_WITH_NOTES` | Admin device/session + Win7POS DPAPI/trusted device ok. Runtime fisico Win7/TLS/root certs e health screen restano planned. |
| Sales | `NOT_READY` | Admin ha lato server, ma Win7POS manca client sales sync, queue, ack/idempotency e mapping pagamenti/refund/void end-to-end. |
| Offline queue | `NOT_READY` | Android/iOS hanno outbox sync-events; Win7POS non ha sales outbox locale. |
| Delete/tombstone | `GAP_PLANNED` | Product tombstone piu maturo; supplier/category ancora parziale su Android/Win7POS. |
| Conflict handling | `RISK` | Manca contratto unico per barcode, shop-scoped identity, sales duplicate/refund/void e conflitti cross-device. |

## Residui non bloccanti

- Windows 7 fisico/VM reale, TLS/root certificates e native SQLite drop non
  verificati in TASK-071.
- Sales sync completo Win7POS resta roadmap.
- iOS full suite resta drift preesistente/non introdotto dalle patch correnti.
- CodeRabbit Admin Web finale bloccato da rate limit CLI gratuita.
- Supabase migration `changed_count=100000` non applicata a cloud; nessun
  `db push` autorizzato.
- Worktree multi-repo gia sporchi/untracked; nessun reset/revert di modifiche
  non mie.
- Android `.idea/deploymentTargetSelector.xml` resta modificato localmente ma
  contiene solo `<selectionStates />`, senza device serial o path AVD locali.
- Il backup iOS SwiftData `default.store*` e' stato spostato fuori dal repo in
  `/Users/minxiang/.codex/quarantine/TASK-071-ios-store-backup`.
- Screenshot tracked `TASK-035` modificato dai run smoke, classificato come
  artefatto generato/accidentale e non rimosso senza richiesta.

## Roadmap successiva

- `TASK-072 Win7POS config/device`.
- `TASK-073 catalog bridge`.
- `TASK-074 staff permissions`.
- `TASK-075 sales queue`.
- `TASK-076 Admin Web sales read model`.
- `TASK-077 sales sync prototype`.
