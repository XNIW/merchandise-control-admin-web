# TASK-077B Evidence - Products + Platform lightweight read models

## Stato

- Stato subtask: `DONE_RECONCILED`
- Parent: `TASK-077`
- Target: local-cloud production-like con Supabase cloud/staging env.
- Produzione: `NOT_RUN`, vietata.
- Commit/push/deploy: `NOT_RUN_UNAUTHORIZED`.
- Nota: DONE Seal utente completato; nessun commit, stage, push, deploy,
  production apply o Supabase apply eseguito.

## Products real-shop

| Fase | Pending | TTFB | Document | Final marker | Query | Server trace | Payload |
|---|---:|---:|---:|---:|---:|---:|---:|
| Before | 35ms | 293ms | 2533ms | 81ms | 10 | 2783.3ms | doc 373624B / RSC 16413B |
| After | 29ms | 377ms | 818ms | 95ms | 5 | 1150.2ms | doc 370988B / RSC 577B |

Root cause before: exact counts and summary in the first paint. The slow labels
were `inventory_product_prices.count`, `inventory_products.count` and
`inventory_products.page` with exact count enabled.

After: first paint uses page rows only, `pageSize + 1` next-page detection and
deferred total status. Removed from first paint: `inventory_products.count`,
`inventory_categories.count`, `inventory_suppliers.count` and
`inventory_product_prices.count`.

## Shop routes after

Report: `task-077b-shop-performance-real-shop-task-077b-shop-after-final.json`.

| Route | Pending | TTFB | Document | Final | Payload |
|---|---:|---:|---:|---:|---:|
| `/shop/products` | 29ms | 377ms | 818ms | 95ms | doc 370988B / RSC 577B |
| `/shop/categories` | 19ms | 289ms | 176ms | 52ms | doc 185073B / RSC 0B |
| `/shop/suppliers` | 17ms | 297ms | 184ms | 50ms | doc 286386B / RSC 267B |
| `/shop/staff` | 10ms | 322ms | 122ms | 42ms | doc 77281B / RSC 263B |
| `/shop/history` | 13ms | 371ms | 199ms | 47ms | doc 223038B / RSC 4947B |
| `/shop/sync` | 27ms | 313ms | 271ms | 59ms | doc 157432B / RSC 262B |

History is out of timeout in the real-shop/local-cloud click-flow.

## Fixture after

Report: `task-077b-shop-performance-fixture-task-077b-fixture-after.json`.

| Route | Pending | TTFB | Final |
|---|---:|---:|---:|
| `/shop/overview` | 25ms | 416ms | 48ms |
| `/shop/products` | 18ms | 477ms | 55ms |
| `/shop/categories` | 11ms | 364ms | 52ms |
| `/shop/suppliers` | 15ms | 388ms | 68ms |
| `/shop/staff` | 14ms | 416ms | 50ms |
| `/shop/history` | 15ms | 487ms | 49ms |
| `/shop/sync` | 14ms | 384ms | 49ms |
| `/shop/devices` | 14ms | 312ms | 51ms |
| `/shop/settings` | 15ms | 450ms | 48ms |

The fixture harness now records route-ready performance from path, title and
loading replacement. Synthetic catalog rows include `shop_id` to exercise the
shop-scoped path while cleanup remains scoped to `TASK076_*`.

## Platform before/after

Before report: `docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-local-cloud-before.json`.
After report: `docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-task-077b-platform-after.json`.

| Route | Before final/query/read model | After final/query/read model | Payload after |
|---|---:|---:|---:|
| `/platform` | 868ms / 11 / global | 873ms / 9 / `getPlatformOverviewReadModel` | doc 62761B / RSC 0B |
| `/platform/users` | 2861ms / 24 / global | 839ms / 7 / `getPlatformUsersReadModel` | doc 127669B / RSC 0B |
| `/platform/shop-admins` | 2847ms / 24 / global | 824ms / 6 / `getPlatformShopAdminsReadModel` | doc 93377B / RSC 32053B |
| `/platform/admins` | 2835ms / 24 / global | 823ms / 6 / `getPlatformAdminsReadModel` | doc 63258B / RSC 0B |
| `/platform/shops` | 2841ms / 24 / global | 817ms / 5 / `getPlatformShopsReadModel` | doc 90663B / RSC 0B |
| `/platform/operations` | 822ms / 11 / global | 829ms / 11 / global | doc 139573B / RSC 97409B |
| `/platform/audit` | 837ms / 11 / global | 831ms / 5 / `getPlatformAuditReadModel` | doc 445747B / RSC 0B |
| `/platform/system` | 815ms / 11 / global | 822ms / 3 / `getPlatformSystemReadModel` | doc 59480B / RSC 0B |

Users/Admins/Shops/Shop Admins no longer load mobile inventory counts in the
first paint. Users still loads Auth identities only on the Users route.

## Check

| Check | Stato |
|---|---:|
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `409/409`. |
| `npm run typecheck` | `PASS`, route types generated and `tsc --noEmit` passed. |
| `npm run lint` | `PASS`. |
| `npm run build` | `PASS_WITH_WARNINGS`, known Next `middleware` deprecation and Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS`, same build warnings. |
| `npm run test:ui-smoke:ci` | `PASS`, `48/48`. |
| `npm run test:shop-admin-auth-smoke` | `PASS`, `5/5`. |
| Foundation mirati shell/nav/ui/i18n | `PASS`, `61/61`. |
| Browser smoke autenticato | `PASS`, 12 route Admin/Master. |
| `git diff --check` | `PASS`, no output. |
| TASK-077 Products benchmark | `PASS`, real-shop/local-cloud and fixture after reports present. |
| TASK-077A Platform benchmark | `PASS`, all measured routes under 1s final marker. |

## Verdict

`DONE_RECONCILED`. No commit, stage, push, deploy, production apply or Supabase
schema change was run.

## Final DONE reconciliation - 2026-06-20

Run freschi local-cloud/read-only con Supabase cloud/staging env:

| Area | Report | Final / payload / query |
|---|---|---|
| Products-only real-shop | `task-077b-shop-performance-real-shop-task-077-final-reconciliation-products.json` | `final=94ms`, `document=885ms`, `visual=35ms`, `query=5`, `server=1327.3ms`, `RSC=16413B`. |
| Shop routes real-shop | `task-077b-shop-performance-real-shop-task-077-final-reconciliation-shop.json` | Products `77ms`, Staff `54ms`, History `46ms`; nessuna route sopra 2s finali. |
| Fixture | `task-077b-shop-performance-fixture-task-077-final-reconciliation-fixture.json` | Products `51ms`, Categories `53ms`, Suppliers `54ms`, Staff `51ms`, History `46ms`, Sync `52ms`. |
| Platform | `docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-task-077-final-reconciliation-platform.json` | Route finali `819-860ms`; query/read model route-specifici confermati. |

Platform final reconciliation:

| Route | Final | Query/render | Read model | Note |
|---|---:|---:|---|---|
| `/platform` | `860ms` | `9` | `getPlatformOverviewReadModel` | No Auth identities. |
| `/platform/users` | `821ms` | `7` | `getPlatformUsersReadModel` | Auth identities solo qui. |
| `/platform/shop-admins` | `821ms` | `6` | `getPlatformShopAdminsReadModel` | No mobile counts. |
| `/platform/admins` | `830ms` | `6` | `getPlatformAdminsReadModel` | No mobile counts. |
| `/platform/shops` | `825ms` | `5` | `getPlatformShopsReadModel` | No mobile counts. |
| `/platform/operations` | `820ms` | `11` | `getPlatformAdminReadModel` | Residuo tecnico accettato: resta globale, final/document sotto soglia. |
| `/platform/audit` | `822ms` | `5` | `getPlatformAuditReadModel` | Audit-only read model. |
| `/platform/system` | `819ms` | `3` | `getPlatformSystemReadModel` | Health summary light. |

Checks freschi:

| Check | Stato |
|---|---|
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, `414/414` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning noti Next `middleware` deprecato e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning build. |
| `git diff --check` | `PASS` |
| Redaction value check evidence | `PASS` |
| Temp artifact cleanup | `PASS`, nessun `*.tmp`, `playwright-report` o `test-results` mantenuto. |

Verdict finale: `DONE_RECONCILED`. Commit, stage, push, deploy staging,
deploy production, Supabase apply e production apply: `NOT_RUN`.
