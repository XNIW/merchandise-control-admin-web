# TASK-077 Evidence - Admin Console real-shop performance hardening

## Stato

- Data apertura: `2026-06-20`
- Stato operativo: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED_AFTER_TASK_077B`
- Commit / push / stage: `NOT_RUN_UNAUTHORIZED`
- Production deploy / production migration apply: `NOT_RUN_FORBIDDEN`

## Preflight

| Check | Esito |
|---|---|
| `git status --short --branch --untracked-files=all` | `PASS`, repo pulito su `main...origin/main` prima dell'apertura task. |
| `git log --oneline --decorate -5` | `PASS`, `HEAD` e `origin/main` su `28fa02c0 perf: improve shop admin navigation latency`. |
| `git diff --check` preflight | `PASS`, nessun output. |

## Baseline before

| Target | Stato | Report | Note |
|---|---|---|---|
| Fixture sintetica cloud | `PASS_WITH_HISTORY_TIMEOUT` | `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-fixture-before.json` | Cleanup `residualRows=0`, `userDeleted=true`; `/shop/history` resta `timeout`. |
| Real-shop cloud read-only | `BLOCKED_NO_REAL_SHOP_CANDIDATE` | `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-real-shop-blocked.json` | Discovery redatta: `activeShopsTotal=3`, `ownerOrManagerMembersTotal=2`, `joinCandidates=2`, `syntheticCandidates=2`, `authableCandidates=2`. Nessun candidato non sintetico disponibile; non usati dati finti per real-shop. |

Fixture before principali:

| Route | TTFB ms | pending ms | final |
|---|---:|---:|---:|
| Overview | `981` | `21` | `941ms` |
| Products | `237` | `16` | `1051ms` |
| Categories | `314` | `36` | `953ms` |
| Suppliers | `222` | `18` | `882ms` |
| Staff | `273` | `23` | `1099ms` |
| History | `291` | `31` | `timeout` |

## After

Fixture after eseguita su app locale TASK-077 (`TASK077_APP_TARGET=local-cloud`)
con Supabase cloud e fixture sintetica `TASK076_*`, senza deploy production e
con cleanup finale:

- Report: `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-fixture-after.json`
- Cleanup: `cleanupErrors=[]`, `residualRows=0`, `userDeleted=true`
- Nota criterio TASK-077: tutte le route hanno sostituzione visiva osservata
  entro `40-69ms`; `/shop/history` non e piu in timeout.

| Route | TTFB ms | pending/skeleton ms | final |
|---|---:|---:|---:|
| Overview | `643` | `55` | `1404ms` |
| Products | `590` | `55` | `2470ms` |
| Categories | `484` | `69` | `916ms` |
| Suppliers | `508` | `55` | `1413ms` |
| Staff | `669` | `51` | `900ms` |
| History | `551` | `51` | `1425ms` |

Real-shop after resta `BLOCKED_NO_REAL_SHOP_CANDIDATE` per lo stesso motivo
redatto sopra. Il blocco e di disponibilita dati reali, non di harness: il
wrapper `test:shop:cloud-performance:task077` supporta `TASK077_REAL_SHOP_ID`
e `TASK077_REAL_SHOP_USER_EMAIL`, usa magic-link nel processo Playwright e
scrive solo evidence redatta.

## Final review gate real-shop

Eseguito il `2026-06-20` su shop reale read-only autorizzato tramite env/browser,
con Supabase cloud e app locale TASK-077. Evidence redatta: nessun shop id,
shop code, nome reale, email o secret stampato nei report.

Stato Git/deploy:

| Gate | Esito |
|---|---|
| TASK-077 in `HEAD`/`main` | `FAIL`, `docs/TASKS/TASK-077-admin-console-real-shop-performance-hardening.md` esiste solo nel worktree locale. |
| Commit/push TASK-077 | `NOT_RUN_UNAUTHORIZED`, nessuna autorizzazione esplicita a commit/push. |
| Cloudflare staging TASK-077 | `NOT_DEPLOYED`, ultimo staging verificato e precedente a TASK-077. |
| Production deploy/apply | `NOT_RUN_FORBIDDEN`. |

Real-shop read-only before/final-review local-cloud:

| Route | Before final | After final | Visual replacement after | Esito |
|---|---:|---:|---:|---|
| Overview | `351ms` | `345ms` | `not_observed`, gia pronta | `PASS` |
| Products | `8642ms` | `4419ms` | `58ms` | `FAIL_OVER_2S` |
| Categories | `934ms` | `1361ms` | `59ms` | `PASS` |
| Suppliers | `1926ms` | `844ms` | `51ms` | `PASS` |
| Staff | `882ms` | `849ms` | `49ms` | `PASS` |
| History | `1903ms` | `842ms` | `45ms` | `PASS`, fuori timeout |
| Sync | `2439ms` | `841ms` | `41ms` | `PASS` |
| Devices | `1418ms` | `1343ms` | `35ms` | `PASS` |
| Settings | `1892ms` | `1843ms` | `36ms` | `PASS_WITH_NOTE` |

Reports:

- Before/final-review local-cloud:
  `task-077-cloud-performance-real-shop-final-review-local.json`
- After/final-review local-cloud:
  `task-077-cloud-performance-real-shop-final-review-after-marker-local.json`
- Production-local report:
  `task-077-cloud-performance-real-shop-final-review-production-local.json`,
  `UNRELIABLE` per marker timeout su piu route e non utilizzato come staging
  evidence.

Conclusione gate storica pre-TASK-077B: `CHANGES_REQUIRED`. La sostituzione visiva passa entro
`35-59ms` sulle route navigate, `History` esce dal timeout e `Staff` e sotto 1s,
ma `Products` resta sopra 2s finali su real-shop (`4419ms`) e TASK-077 non e
committato/pushato/deployato su staging.

## TASK-077B final reconciliation - 2026-06-20

`TASK-077B` supera il blocker Products e chiude il parent task come lavoro locale
verificato:

| Route / area | Evidence | Esito |
|---|---|---|
| Products real-shop after light counts | `docs/TASKS/EVIDENCE/TASK-077B/task-077b-shop-performance-real-shop-task-077b-shop-after-final2.json` | `PASS`, `finalMs=580ms`, `documentMs=805ms`, `visualReplacementMs=32ms`, `queryCount=5`. |
| Platform after light read models | `docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-task-077b-platform-after-light-read-models.json` | `PASS`, route final marker `813-852ms`. |
| Final Review UI Shell Admin + Master | Browser smoke temporaneo local-only | `PASS`, 12 route Admin/Master autenticate, H1 unico, tag/icona topbar, nessuna descrizione visibile, no overlay/Not authorized inatteso. |

Gate finali locali:

| Check | Esito |
|---|---|
| `git diff --check` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run typecheck` | `PASS` |
| `npm run security:scan` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning preesistenti `middleware` deprecato e `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning build. |
| `npm run test:ui-smoke:ci` | `PASS`, `48/48`. |
| `npm run test:shop-admin-auth-smoke` | `PASS`, `5/5`. |
| `npm run test:foundation` | `PASS`, `409/409`. |
| Foundation mirati shell/nav/ui/i18n | `PASS`, `61/61`. |
| Browser smoke autenticato | `PASS`, Admin Overview/Products/Devices/History/Sync/ImportExport e Master Overview/Users/Shops/Shop Admins/Platform Admins/Operations. |

Commit, push, stage, staging deploy, production deploy e Supabase apply:
`NOT_RUN`.

## Fix applicati

- `ShopShell`: durante `pendingNavigation` il content frame viene sostituito da
  `ShopPendingNavigationSkeleton` target (`data-shop-route-loading-target`) e
  non renderizza piu il vecchio `{children}` sotto il banner.
- Categories/Suppliers: aggiunti `getShopCategoriesPageReadModel` e
  `getShopSuppliersPageReadModel`; le pagine passano `catalogOptionsReadModel`
  e non chiamano piu `getShopInventoryReadModel` nel primo render.
- Staff: aggiunto `resolveStaffPageBundle`, con righe safe staff e permessi
  `staff.manage`/role permissions risolti in un unico boundary server-only.
- History: aggiunto `getShopHistoryListReadModel`; la lista legge colonne light
  da `shared_sheet_sessions`, evita `loadHistorySummary`/`count exact` e non
  rende diagnostics/related sync secondari nel primo paint. Detail continua a
  caricare payload, overlay e sync correlati.
- Overview: `/shop/overview` usa `buildOverviewSection(readModel)` leggero nel
  primo render; le card operative pesanti restano sui read model dedicati.
- Harness: aggiunto `npm run test:shop:cloud-performance:task077`, con dataset
  `fixture`, `real-shop` o `both`, supporto app locale con Supabase cloud e
  evidence TASK-077.

## Evidence incrementale

- `TASK-076` resta `REVIEW_WITH_NOTES`: `/shop/history` final marker in timeout
  nel click-flow cloud e Categories/Suppliers caricavano ancora il read model
  inventario completo.
- Lettura guide Next locali completata prima delle modifiche framework: navigation,
  prefetching, loading, streaming, instant navigation, route segment config,
  data fetching, Server/Client Components e data security.
- Lettura codice pre-edit completata per `ShopShell`, Staff, Categories,
  Suppliers, History, Overview, `shop-section-data`, `history-read-model`,
  `staff-read-model`, `inventory-read-model` e boundary access/action.

## Check eseguiti

| Check | Esito |
|---|---|
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, `409/409` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning preesistenti `middleware` deprecato e `[DEP0205]` |
| `npm run verify` | `PASS_WITH_WARNINGS`, ripete lint/typecheck/security/build con gli stessi warning build |
| Cloud performance before fixture | `PASS_WITH_HISTORY_TIMEOUT`, report copiato in evidence TASK-077. |
| Cloud performance before real-shop read-only | `BLOCKED_NO_REAL_SHOP_CANDIDATE`, report redatto `task-077-cloud-performance-real-shop-blocked.json`. |
| Cloud performance after fixture | `PASS`, report `task-077-cloud-performance-fixture-after.json`. |
| Cloud performance after real-shop read-only | `PASS_AFTER_TASK_077B`, Products local-cloud redatto `580ms` nel report TASK-077B; staging/deploy non eseguiti. |
| `git diff --check` finale | `PASS`, nessun output. |

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-077-admin-console-real-shop-performance-hardening.md`
- `docs/TASKS/EVIDENCE/TASK-077/README.md`
- `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-real-shop-blocked.json`
- `package.json`
- `scripts/security-checks.mjs`
- `scripts/testing/task-077-shop-cloud-performance.mjs`
- `src/app/shop/categories/page.tsx`
- `src/app/shop/history/page.tsx`
- `src/app/shop/staff/page.tsx`
- `src/app/shop/suppliers/page.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/server/shop-admin/staff-read-model.ts`
- `tests/e2e/staging/task-077-shop-admin-real-cloud-performance.spec.ts`
- `tests/foundation/pos-staff-credential-planning.test.mjs`
- `tests/foundation/shop-admin-shell.test.mjs`
- `tests/foundation/task-014-pos-staff-foundation.test.mjs`
- `tests/foundation/task-015-history.test.mjs`
- `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`
- `tests/foundation/task-068m-product-list-readability-icons.test.mjs`
- `tests/foundation/task-076-cloud-runtime-admin-console-performance.test.mjs`
- `tests/foundation/task-077-admin-console-real-shop-performance-hardening.test.mjs`
- `tests/foundation/task-history-sync-console.test.mjs`

## Rischi residui

- Il blocco storico `BLOCKED_NO_REAL_SHOP_CANDIDATE` e superato dalla
  riconciliazione finale con target real-shop autorizzato e redatto.
- Products fixture/real-shop non resta piu sopra 2s nel final marker finale.
- Nessun deploy production/staging e nessun Supabase apply sono stati eseguiti;
  after finale misura app locale production-like con Supabase cloud/staging env.

## Handoff

`DONE_RECONCILED_AFTER_TASK_077B`. DONE Seal utente completato; nessun commit,
push, stage, deploy o Supabase apply eseguito.

## Final DONE reconciliation - 2026-06-20

Riconciliazione finale richiesta dall'utente su evidence fresca. Nessun dato
reale identificabile e nessun secret sono inclusi nei report.

| Area | Report | Esito |
|---|---|---|
| Products real-shop/local-cloud, debug | `task-077-cloud-performance-real-shop-task-077-final-reconciliation-products.json` | `PASS`, `pending=35ms`, `TTFB=494ms`, `document=885ms`, `final=94ms`, `queryCount=5`, `serverTotalMsMax=1327.3ms`, `RSC=16413B`. |
| Admin Console real-shop/local-cloud | `task-077-cloud-performance-real-shop-task-077-final-reconciliation-shop.json` | `PASS`, nessuna route sopra 2s finali; Products `77ms`, Staff `54ms`, History `46ms`. |
| Fixture cloud/local-cloud | `task-077-cloud-performance-fixture-task-077-final-reconciliation-fixture.json` | `PASS`, Products `51ms`, History `46ms`, nessun timeout. |
| Master Console local-cloud | `docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-task-077-final-reconciliation-platform.json` | `PASS`, final marker `819-860ms`; read model leggeri confermati sulle route richieste. |

Products root cause/fix finale: count exact e summary pesanti rimossi dal first
paint; Products usa `pageSize + 1`, total count `deferred`, 10 righe pagina,
toolbar light e dialog non caricato quando `product_action` e assente.

Gate freschi: `security:scan`, `test:foundation` (`414/414`), `typecheck`,
`lint`, `build`, `verify`, `git diff --check`: `PASS` o
`PASS_WITH_WARNINGS` solo per warning build noti. Commit, stage, push, deploy e
Supabase apply: `NOT_RUN`.
