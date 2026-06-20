# TASK-077A - Master Console performance audit

## Informazioni generali

- ID: `TASK-077A`
- Titolo: `Master Console performance audit`
- Stato: `DONE_RECONCILED_AS_SUPERSEDED_BY_TASK_077B`
- Fase attuale: `DONE_RECONCILED`
- Parent task: `TASK-077 - Admin Console real-shop performance hardening`
- Data apertura: `2026-06-20`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-077A/README.md`

## Contesto

`TASK-077` resta bloccato sul fix mirato Products della Shop Admin Console.
Questo subtask e separato: misura la Master Console route-by-route prima di
qualunque ottimizzazione, per verificare se il read model Platform carica dati
globali non necessari e se il feedback di navigazione e immediato.

## Scope

- Misurare, con Supabase cloud/staging o local-cloud production-like, le route:
  - `/platform`
  - `/platform/users`
  - `/platform/shop-admins`
  - `/platform/admins`
  - `/platform/shops`
  - `/platform/operations`
  - `/platform/audit`
  - `/platform/system`
- Per ogni route raccogliere:
  - click-to-pending/skeleton;
  - TTFB;
  - final content;
  - numero query Supabase/server admin;
  - read model caricati;
  - dimensione approssimativa payload document/RSC quando misurabile.
- Verificare se `getPlatformAdminReadModel` carica troppe tabelle globali per
  route che dovrebbero usare read model leggeri.
- Verificare se `Users`/`Admins` caricano Auth identities, mobile inventory
  counts, devices, sync, staff e audit fuori dal necessario.
- Verificare se `Overview`, `Shops`, `Audit` e `System` possono usare read model
  leggeri.
- Aggiungere pending/skeleton Platform solo se la misura conferma feedback
  insufficiente.

## Non incluso

- Nessun fix Products in questo subtask.
- Nessun refactor grande o ottimizzazione non misurata.
- Nessun commit/push/deploy senza conferma esplicita.
- Nessun production deploy o Supabase production apply.
- Nessun service-role client/browser.
- Nessun dato reale, email, shop id, profile id, shop code o secret in evidence.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Subtask/evidence aperti senza cambiare TASK-077 in `DONE`. | `PASS` |
| CA-02 | Harness misura tutte le route richieste con target cloud/local-cloud production-like. | `PASS` |
| CA-03 | Evidence include click pending, TTFB, final content, query count, read model e payload approssimativo. | `PASS` |
| CA-04 | Root cause route >2s documentata prima di qualunque ottimizzazione. | `PASS` |
| CA-05 | Users/Admins non restano considerati sani se caricano ancora tutto il read model globale senza motivo. | `PASS_AFTER_TASK_077B` |
| CA-06 | Nessun dato reale o secret scritto in log/evidence. | `PASS` |

## Fonti lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-077-admin-console-real-shop-performance-hardening.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `src/components/platform/AppShell.tsx`
- `src/components/platform/PlatformPage.tsx`
- `src/components/platform/PlatformSidebarNav.tsx`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `src/server/platform-admin/auth-identities.ts`
- `src/app/platform/page.tsx`
- `src/app/platform/users/page.tsx`
- `src/app/platform/shop-admins/page.tsx`
- `src/app/platform/admins/page.tsx`
- `src/app/platform/shops/page.tsx`
- `src/app/platform/operations/page.tsx`
- `src/app/platform/audit/page.tsx`
- `src/app/platform/system/page.tsx`

## Risultato benchmark

Benchmark local-cloud production-like eseguito con Supabase cloud/staging env,
`next build` + `next start`, `ADMIN_WEB_PERF_DEBUG=1` e report redatto:

- Evidence:
  `docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-local-cloud-before.json`
- Pending/skeleton osservato su tutte le route tra `24ms` e `49ms`; non serve
  fix skeleton prima dei read model.
- Route sotto 2s finali: `/platform`, `/platform/operations`,
  `/platform/audit`, `/platform/system`.
- Route sopra 2s finali: `/platform/users`, `/platform/shop-admins`,
  `/platform/admins`, `/platform/shops`.
- Root cause principale: le route sopra soglia caricano `Auth identities` e
  mobile inventory count per owner, arrivando a `24` query/server render. Le
  query `inventory_product_prices count` e `inventory_products count` dominano
  i trace (`~0.57s-2.0s` per singole count nei render misurati).
- Root cause secondaria: anche le route veloci caricano ancora il read model
  globale (`profiles`, `shops`, `shop_members`, `platform_admins`,
  `shop_inventory_sources`, `audit_logs`, `shop_devices`, `sync_events`,
  `staff_accounts_safe`) invece di read model route-specifici.

## Reconciliation after TASK-077B - 2026-06-20

`TASK-077B` ha applicato read model route-specifici e rieseguito il benchmark
Platform after in
`docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-task-077b-platform-after-light-read-models.json`.

Risultati after:

- `/platform`: `852ms`, `getPlatformOverviewReadModel`, `9` query.
- `/platform/users`: `815ms`, `getPlatformUsersReadModel`, `7` query.
- `/platform/shop-admins`: `816ms`, `getPlatformShopAdminsReadModel`, `6` query.
- `/platform/admins`: `820ms`, `getPlatformAdminsReadModel`, `6` query.
- `/platform/shops`: `813ms`, `getPlatformShopsReadModel`, `5` query.
- `/platform/operations`: `815ms`, `getPlatformAdminReadModel`, `11` query.
- `/platform/audit`: `831ms`, `getPlatformAuditReadModel`, `5` query.
- `/platform/system`: `818ms`, `getPlatformSystemReadModel`, `3` query.

Il subtask di audit e quindi chiuso come superato da `TASK-077B`; non restano
route Master Console sopra 2s nel benchmark after.

## Stato corrente

`DONE_RECONCILED_AS_SUPERSEDED_BY_TASK_077B`. Nessun deploy, commit, push,
stage o production apply eseguito.
