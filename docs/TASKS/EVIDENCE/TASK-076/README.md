# TASK-076 Evidence - Cloud Runtime Admin Console Performance

## Stato

- Data apertura: `2026-06-19`
- Stato operativo: `DONE_RECONCILED_WITH_NOTES`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Commit / push / stage: `NOT_RUN`
- Production deploy / production migration apply: `NOT_RUN_FORBIDDEN`

## Preflight

| Check | Esito |
|---|---|
| `git status --short --branch --untracked-files=all` | `PASS`, TASK-075 presente solo come modifiche locali su `main...origin/main`; `HEAD` e `origin/main` sono `c82d225a Finalize TASK-074 devices UX polish`. |
| `git diff --check` | `PASS`, nessun output. |
| `git log --oneline --decorate -5` | `PASS`, nessun commit TASK-075/TASK-076 presente. |

## Baseline cloud

Command:

```bash
set -a
. ./.env.local
set +a
ALLOWED_STAGING_SUPABASE_PROJECT_REFS="$SUPABASE_PROJECT_REF" CONFIRM_TASK076_CLOUD_PERFORMANCE=yes ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes TASK076_PERF_PHASE=baseline npm run test:shop:cloud-performance
```

Result: `PASS`, Cloudflare staging authenticated, synthetic `TASK076_*`,
cleanup `cleanupErrors=[]`, `residualRows=0`, `userDeleted=true`.
Report: `docs/TASKS/EVIDENCE/TASK-076/task-076-cloud-performance-baseline.json`.

| Route | TTFB ms | click->active ms | click->pending/skeleton | click->final ms | Query/error notes |
|---|---:|---:|---:|---:|---|
| `/shop/overview` | `1049` | `20` | `not_observed` | `1377` | No console errors. |
| `/shop/products` | `535` | `30` | `not_observed` | `835` | No console errors. |
| `/shop/categories` | `470` | `43` | `not_observed` | `708` | No console errors. |
| `/shop/suppliers` | `648` | `21` | `not_observed` | `543` | No console errors. |
| `/shop/import-export` | `224` | `null` | `not_observed` | `timeout` | Sidebar link missing before fix. |
| `/shop/staff` | `310` | `19` | `not_observed` | `689` | No console errors. |
| `/shop/devices` | `1478` | `23` | `not_observed` | `527` | No console errors. |
| `/shop/history` | `486` | `25` | `not_observed` | `timeout` | Final marker not reached before route timeout. |
| `/shop/sync` | `448` | `19` | `not_observed` | `538` | No console errors. |
| `/shop/members` | `413` | `17` | `not_observed` | `443` | No console errors. |
| `/shop/roles` | `224` | `20` | `not_observed` | `325` | No console errors. |
| `/shop/settings` | `391` | `23` | `not_observed` | `447` | No console errors. |

Cloud worker query labels were not captured from logs; the harness measures
authenticated route TTFB with browser cookies plus browser console/page errors.
Static/data-access audit identified duplicate access/action paths and missing
route loading coverage as the primary actionable causes for this task.

## After cloud

Deploy: `npm run cf:deploy:staging` `PASS`.

- Worker: `merchandise-control-admin-web-staging`
- URL: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`
- Version ID: `d266644d-78e0-4ccd-8da2-0844ab91a175`
- Production deploy/apply: `NOT_RUN_FORBIDDEN`

Command:

```bash
set -a
. ./.env.local
set +a
ALLOWED_STAGING_SUPABASE_PROJECT_REFS="$SUPABASE_PROJECT_REF" CONFIRM_TASK076_CLOUD_PERFORMANCE=yes ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes TASK076_PERF_PHASE=after npm run test:shop:cloud-performance
```

Result: `PASS`, Cloudflare staging authenticated, cleanup
`cleanupErrors=[]`, `residualRows=0`, `userDeleted=true`.
Report: `docs/TASKS/EVIDENCE/TASK-076/task-076-cloud-performance-after.json`.

| Route | TTFB ms | click->active ms | click->pending/skeleton ms | click->final ms | Query/error notes |
|---|---:|---:|---:|---:|---|
| `/shop/overview` | `349` | `32` | `26` | `1472` | No console errors. |
| `/shop/products` | `243` | `26` | `21` | `965` | PASS focus route, under 1.5s. |
| `/shop/categories` | `249` | `62` | `33` | `985` | No console errors. |
| `/shop/suppliers` | `313` | `25` | `20` | `940` | No console errors. |
| `/shop/import-export` | `246` | `25` | `19` | `868` | Sidebar navigation fixed. |
| `/shop/staff` | `240` | `25` | `21` | `887` | PASS focus route, under 1.5s. |
| `/shop/devices` | `242` | `15` | `12` | `901` | No console errors. |
| `/shop/history` | `237` | `24` | `20` | `timeout` | Pending visible, final marker remains over the 12s harness window. |
| `/shop/sync` | `244` | `19` | `16` | `902` | No console errors. |
| `/shop/members` | `250` | `20` | `17` | `875` | No console errors. |
| `/shop/roles` | `222` | `19` | `15` | `130` | No console errors. |
| `/shop/settings` | `270` | `22` | `19` | `929` | No console errors. |

## Ipotesi iniziali da verificare

- TASK-075 non era sufficiente perche non ha misurato o deployato il runtime
  autenticato cloud.
- `src/app/shop/layout.tsx` esegue access/auth runtime prima delle pagine:
  secondo le guide Next, il `loading.tsx` della pagina non copre il lavoro
  asincrono del layout.
- Route come Staff, Members, Devices e History duplicano resolver access/action
  oltre al read model principale.
- Categories/Suppliers continuano a caricare il read model inventory completo.
- Il feedback visivo della sidebar dipende da stato ottimistico semplice, ma
  non mostra ancora overlay/skeleton globale finche la navigazione e in corso.

## Evidence incrementale

- Subagent performance/data-access: duplicazioni confermate su Staff/Members,
  Products catalog options e History/Sync; non ha modificato file.
- Subagent UI navigation: `loading.tsx` non copre async work del layout Shop;
  pending client-side nel `ShopShell` consigliato; non ha modificato file.
- Subagent cloud profiler: baseline/after devono puntare a Cloudflare staging;
  service role solo nel processo Playwright; non ha modificato file.
- Fixture cloud TASK-076: utente auth, profilo, shop, membership, mapping,
  catalogo 121 prodotti, staff, devices, shared session e sync events; cleanup
  verificato a zero residui in baseline e after.
- Root cause reale rispetto a TASK-075: il deploy/staging non aveva un feedback
  pending misurabile (`not_observed` su tutte le route), `/shop/import-export`
  non era navigabile dalla sidebar, Staff/Members serializzavano read model e
  action context.

## Check eseguiti

| Check | Esito |
|---|---|
| `git status --short --branch --untracked-files=all` preflight | `PASS` |
| `git diff --check` preflight | `PASS` |
| Baseline cloud authenticated performance | `PASS`, report baseline JSON, cleanup zero. |
| `npm run test:shop:cloud-performance` after | `PASS`, report after JSON, cleanup zero. |
| `npm run cf:deploy:staging` | `PASS`, Version ID `d266644d-78e0-4ccd-8da2-0844ab91a175`. |
| `npm run security:scan` | `PASS` |
| `node --test tests/foundation/task-076-cloud-runtime-admin-console-performance.test.mjs tests/foundation/task-075-admin-web-performance-products-latency.test.mjs tests/foundation/shop-admin-shell.test.mjs` | `PASS`, 11/11. |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS`, executed inside `npm run verify` and `cf:deploy:staging`. |
| `npm run verify` | `PASS` |
| `git diff --check` finale | `PASS`, nessun output. |
| `git status --short --branch --untracked-files=all` finale | `PASS_WITH_NOTES`, working tree include anche modifiche locali TASK-075 non committate. |

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-076-cloud-runtime-admin-console-performance.md`
- `docs/TASKS/EVIDENCE/TASK-076/README.md`
- `docs/TASKS/EVIDENCE/TASK-076/task-076-cloud-performance-baseline.json`
- `docs/TASKS/EVIDENCE/TASK-076/task-076-cloud-performance-after.json`
- `package.json`
- `scripts/security-checks.mjs`
- `scripts/testing/task-076-shop-cloud-performance.mjs`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/shopSections.ts`
- `src/app/shop/_components/ShopRouteLoading.tsx`
- `src/app/shop/categories/loading.tsx`
- `src/app/shop/devices/loading.tsx`
- `src/app/shop/history/loading.tsx`
- `src/app/shop/import-export/loading.tsx`
- `src/app/shop/members/loading.tsx`
- `src/app/shop/overview/loading.tsx`
- `src/app/shop/roles/loading.tsx`
- `src/app/shop/settings/loading.tsx`
- `src/app/shop/staff/loading.tsx`
- `src/app/shop/suppliers/loading.tsx`
- `src/app/shop/sync/loading.tsx`
- `src/app/shop/members/page.tsx`
- `src/app/shop/staff/page.tsx`
- `tests/e2e/staging/task-076-shop-admin-cloud-performance.spec.ts`
- `tests/foundation/task-076-cloud-runtime-admin-console-performance.test.mjs`

## Rischi residui

- `/shop/history` resta `REVIEW_WITH_NOTES`: after TTFB `237ms` e pending
  `20ms`, ma final marker non arriva entro 12s nel click-flow cloud. Serve
  task successivo mirato a History read model/rendering se il reviewer vuole
  chiudere anche questa coda.
- Il test performance e il deploy sono stati eseguiti su staging Cloudflare; la
  produzione non e stata toccata.
- Il working tree include TASK-075 locale non committato; nessun commit/push/stage
  eseguito da Codex.

## Handoff

`REVIEW_WITH_NOTES`. Codex non marca `DONE`.

## Nota post-handoff 2026-06-20

Su richiesta esplicita utente `commit push`, sono stati rieseguiti gate locali
prima dello stage/commit:

- `git diff --check`: `PASS`.
- `npm run security:scan`: `PASS`.
- Test mirati TASK-075/TASK-076/shell: `PASS`, 11/11 iniziale.
- Test legacy aggiornati per il nuovo pattern TASK-076 di navigazione pending
  e sidebar `Import / Export`; targeted legacy: `PASS`, 41/41.
- `npm run test:foundation`: `PASS`, 400/400.
- `npm run verify`: `PASS`, con warning noti `middleware` deprecato e Node
  `DEP0205`.

Nessun deploy production o Supabase cloud apply eseguito in questa fase.

## Final DONE reconciliation - 2026-06-20

`TASK-076` viene riconciliato con note dopo `TASK-077B`: il timeout storico di
`/shop/history` nel click-flow cloud non e piu riproducibile nei benchmark
finali local-cloud/read-only.

Benchmark freschi redatti:

| Target | Report | Esito |
|---|---|---|
| Admin Console real-shop/local-cloud | `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-real-shop-task-077-final-reconciliation-shop.json` | `PASS`, `/shop/history finalMs=46ms`, `documentMs=440ms`, `visualReplacementMs=14ms`. |
| Fixture cloud/local-cloud | `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-fixture-task-077-final-reconciliation-fixture.json` | `PASS`, `/shop/history finalMs=46ms`, pending `12ms`. |
| Products debug real-shop/local-cloud | `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-real-shop-task-077-final-reconciliation-products.json` | `PASS`, `queryCount=5`, `totalCountStatus=deferred`. |

Gate freschi:

| Check | Esito |
|---|---|
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, `414/414` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning noti Next `middleware` deprecato e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning build. |
| `git diff --check` | `PASS` |

Commit, stage, push, deploy staging/production e Supabase apply: `NOT_RUN`.
