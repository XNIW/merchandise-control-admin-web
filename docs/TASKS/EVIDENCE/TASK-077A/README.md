# TASK-077A Evidence - Master Console performance audit

## Stato

- Stato subtask: `DONE_RECONCILED_AS_SUPERSEDED_BY_TASK_077B`
- Parent: `TASK-077`
- Target iniziale: local-cloud production-like con Supabase cloud/staging env.
- Produzione: `NOT_RUN`, vietata.
- Commit/push/deploy: `NOT_RUN_UNAUTHORIZED`.

## Benchmark

| Evidence | Stato | Note |
|---|---:|---|
| `task-077a-platform-performance-local-cloud-before.json` | `PASS_WITH_ROUTE_BLOCKERS` | Local-cloud production-like: `next build` + `next start`, Supabase cloud/staging env, `ADMIN_WEB_PERF_DEBUG=1`, payload byte capture. |
| `task-077a-platform-performance-task-077b-platform-after-light-read-models.json` | `PASS` | Route-specific read models after TASK-077B; all measured Platform routes final marker `813-852ms`. |

## Route Results

| Route | Pending | TTFB | Final | Query/render | Payload doc/RSC | Verdict |
|---|---:|---:|---:|---:|---:|---|
| `/platform` | `49ms` | `201ms` | `868ms` | `11` | `62.6KB / 0KB` | `PASS` |
| `/platform/users` | `24ms` | `1244ms` | `2861ms` | `24` | `127.5KB / 0KB` | `FAIL_GT_2S` |
| `/platform/shop-admins` | `29ms` | `203ms` | `2847ms` | `24` | `93.2KB / 0KB` | `FAIL_GT_2S` |
| `/platform/admins` | `25ms` | `196ms` | `2835ms` | `24` | `62.7KB / 0KB` | `FAIL_GT_2S` |
| `/platform/shops` | `31ms` | `198ms` | `2841ms` | `24` | `92.6KB / 30.4KB` | `FAIL_GT_2S` |
| `/platform/operations` | `31ms` | `178ms` | `822ms` | `11` | `138.8KB / 0KB` | `PASS_WITH_PAYLOAD_NOTE` |
| `/platform/audit` | `27ms` | `199ms` | `837ms` | `11` | `754.1KB / 0KB` | `PASS_WITH_PAYLOAD_NOTE` |
| `/platform/system` | `25ms` | `193ms` | `815ms` | `11` | `59.3KB / 22.3KB` | `PASS` |

## Root Cause

- `getPlatformAdminReadModel` e ancora il read model unico per tutte le route
  misurate.
- Le route `/platform/users`, `/platform/shop-admins`, `/platform/admins` e
  `/platform/shops` includono Auth identities e mobile inventory count.
- Queste route arrivano a `24` query/server render:
  base Platform read (`11` query) + `auth.admin.listUsers` + count su
  `inventory_products`, `inventory_product_prices`, `inventory_suppliers`,
  `inventory_categories`, `shared_sheet_sessions`, `sync_events`.
- I trace piu lenti sono i count mobile:
  `inventory_product_prices.count` fino a circa `2.0s` e
  `inventory_products.count` fino a circa `1.0s`.
- `Auth identities` non e il collo principale in questo dataset (`~0.2s`), ma
  e comunque caricato dove non serve al primo paint, in particolare Shops/Admins.
- `/platform/audit` passa il tempo finale ma produce documento grande
  (`~754KB`) perche renderizza tabella/audit rows dal read model globale.

## Pending/Skeleton

Pending visuale osservato su tutte le route (`24-49ms`). Nessun fix skeleton
applicato in questa iterazione: il blocker misurato e il read model/payload.

## After TASK-077B

| Route | Final | Query/render | Read model | Verdict |
|---|---:|---:|---|---|
| `/platform` | `852ms` | `9` | `getPlatformOverviewReadModel` | `PASS` |
| `/platform/users` | `815ms` | `7` | `getPlatformUsersReadModel` | `PASS` |
| `/platform/shop-admins` | `816ms` | `6` | `getPlatformShopAdminsReadModel` | `PASS` |
| `/platform/admins` | `820ms` | `6` | `getPlatformAdminsReadModel` | `PASS` |
| `/platform/shops` | `813ms` | `5` | `getPlatformShopsReadModel` | `PASS` |
| `/platform/operations` | `815ms` | `11` | `getPlatformAdminReadModel` | `PASS` |
| `/platform/audit` | `831ms` | `5` | `getPlatformAuditReadModel` | `PASS` |
| `/platform/system` | `818ms` | `3` | `getPlatformSystemReadModel` | `PASS` |

## Privacy

I report devono contenere solo route, tempi, conteggi, dimensioni payload e nomi
di read model/query label. Email, profile id, shop id, shop code, nomi reali,
token e secret devono restare fuori da log/evidence.

## Check

| Check | Stato |
|---|---:|
| Benchmark local-cloud/staging-like | `PASS_WITH_ROUTE_BLOCKERS` |
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, `409/409` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, eseguito nel benchmark e in `verify`; warning preesistenti `middleware` deprecato e `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning build. |
| `git diff --check` | `PASS` |

## Verdict

`DONE_RECONCILED_AS_SUPERSEDED_BY_TASK_077B`. Il blocker misurato in questo
audit e stato corretto dal subtask `TASK-077B`; DONE Seal utente completato.
Nessun deploy, commit, push, stage o production apply eseguito.

## Final DONE reconciliation - 2026-06-20

Report fresco:
`docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-task-077-final-reconciliation-platform.json`.

| Route | Pending | TTFB | Document | Final | Query/read model | Payload |
|---|---:|---:|---:|---:|---|---:|
| `/platform` | `46ms` | `354ms` | `728ms` | `860ms` | `9` / `getPlatformOverviewReadModel` | `62761B` |
| `/platform/users` | `25ms` | `371ms` | `136ms` | `821ms` | `7` / `getPlatformUsersReadModel` | `127669B` |
| `/platform/shop-admins` | `23ms` | `211ms` | `100ms` | `821ms` | `6` / `getPlatformShopAdminsReadModel` | `93527B` |
| `/platform/admins` | `30ms` | `230ms` | `140ms` | `830ms` | `6` / `getPlatformAdminsReadModel` | `63258B` |
| `/platform/shops` | `22ms` | `194ms` | `347ms` | `825ms` | `5` / `getPlatformShopsReadModel` | `90663B` |
| `/platform/operations` | `23ms` | `1256ms` | `1264ms` | `820ms` | `11` / `getPlatformAdminReadModel` | `139573B` |
| `/platform/audit` | `26ms` | `231ms` | `380ms` | `822ms` | `5` / `getPlatformAuditReadModel` | `445747B` |
| `/platform/system` | `27ms` | `319ms` | `105ms` | `819ms` | `3` / `getPlatformSystemReadModel` | `59480B` |

Users/Admins/Shops/Shop Admins non caricano mobile inventory counts nel primo
paint. Users carica Auth identities solo sulla route Users. `/platform/operations`
resta intenzionalmente sul read model globale per workflow controllati; il
benchmark browser resta sotto 2s final/document e il residuo e documentato.
