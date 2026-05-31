# Evidence - TASK-015 Complete Shop Admin Console

## Stato

- Task: `TASK-015 - Complete Shop Admin Console: Inventory, Excel, Mobile History, Staff and Devices`
- Stato: `DONE`
- Fase: `DONE_RECONCILED`
- Data apertura planning: 2026-05-31
- Data avvio execution: 2026-05-31
- File task: `docs/TASKS/TASK-015-complete-shop-admin-console.md`
- Master Plan: `docs/MASTER-PLAN.md`
- Execution: `COMPLETED_READY_FOR_DONE_CONFIRMATION_WITH_NOTES`
- Review-fix/unblock: `COMPLETED_WITH_REMAINING_BLOCKERS`
- Final review: `COMPLETED_PASS_WITH_NOTES`
- Final completion: `COMPLETED_READY_FOR_DONE_CONFIRMATION_WITH_NOTES`
- Branch execution: `codex/task-015-complete-shop-admin-console`
- Commit: `NOT_RUN`
- Git push: `NOT_RUN`
- Stage finale: `NONE`
- Verdict corrente: `DONE_WITH_NOTES`
- Final hardening planning: `INTEGRATED`
- Planning freeze audit: `INTEGRATED`

## Sintesi

Questo file e stato creato come evidence planning/template operativo per `TASK-015`.

Execution avviata da Codex il 2026-05-31 su richiesta utente e portata a handoff `REVIEW`; la completion finale dello stesso giorno ha rimosso i blocker implementabili. Sono stati implementati migration/RPC additivi, CRUD catalogo shop-scoped, import/export Excel reale server-side, mutazioni staff POS auditabili, registry dispositivi server-side con revoke/reactivate, history detail hardening, matrice permessi, Server Actions, route/pannelli UI, harness e security scan. Nessun commit, push o stage finale e stato eseguito. Il task non e marcato `DONE`; resta solo la nota `MOBILE_POS_ENFORCEMENT_FOLLOW_UP` per far consumare `shop_devices.status` ai client Android/iOS/POS.

## Final completion execution - 2026-05-31

| Area | Esito | Evidence |
| --- | --- | --- |
| Branch | `PASS` | `git branch --show-current`: `codex/task-015-complete-shop-admin-console`. |
| Pre-flight git | `PASS_WITH_NOTES` | `git status --short`, `git log --oneline --decorate -n 12`, `git diff --stat`, `git diff --check` e `git diff --cached --name-only` eseguiti. Worktree gia dirty da TASK-015/TASK-016; nessun file staged. |
| Letture obbligatorie | `PASS` | Riletti Master Plan, task/evidence TASK-015, task/evidence TASK-014, `src/app/shop/**`, `src/components/shop/**`, `src/components/admin/**`, `src/server/shop-admin/**`, `src/lib/supabase/**`, `supabase/migrations/**`, `tests/foundation/**`, `tests/e2e/**`, `scripts/security-checks.mjs`, `package.json`. |
| Guide Next locali | `PASS` | Rilette guide locali `layouts-and-pages`, `server-and-client-components`, `fetching-data`, `mutating-data`, `data-security`, `authentication`, `route-handlers`, `use-server`, `forms`, `playwright` in `node_modules/next/dist/docs/`. |
| Failing-first TASK-015 | `PASS` | Il harness TASK-015 aggiornato e stato eseguito prima dell'implementazione e ha fallito sui moduli/route mancanti; dopo l'implementazione `node --test tests/foundation/task-015-*.test.mjs` passa `13/13`. |
| Migration additiva | `PASS_APPLIED_LINKED_DEV` | Creata e applicata `supabase/migrations/20260531171726_task_015_shop_admin_completion.sql`; tipi rigenerati in `src/lib/supabase/database.types.ts`. |
| Catalogo | `PASS` | RPC `shop_catalog_create/update/archive_product`, `shop_catalog_create/update/archive_category`, `shop_catalog_create/update/archive_supplier`; helper `app_private.resolve_shop_inventory_owner`; soft delete via `deleted_at`; audit `shop.catalog.*`; UI `CatalogActionPanel`; Server Actions. |
| Excel | `PASS` | Aggiunte dipendenze server-side `read-excel-file` e `write-excel-file`; moduli/route `preview`, `apply`, `export`, `template`; preview digest, confirm apply, limiti file/righe, formula hardening, export workbook e audit. |
| Staff | `PASS` | RPC `shop_staff_create`, `shop_staff_reset_credential`, `shop_staff_suspend`, `shop_staff_reactivate`, `shop_staff_archive`; hash generato server-side; one-time display solo post create/reset; UI/DTO non espongono hash. |
| Devices | `PASS_WITH_NOTES` | Tabella `public.shop_devices`, RLS/grants severi, RPC register/rename/revoke/reactivate e audit `shop.device.*`; UI registry server-side. Nota: enforcement client richiede update Android/iOS/POS. |
| History | `PASS` | `/shop/history` e `/shop/history/[entryId]` restano shop-scoped, con ID malformati `invalid_entry`, allowlist `history/catalog/prices`, redaction ricorsiva e link da devices quando disponibile. |
| Roles/permissions | `PASS` | `SHOP_ADMIN_PERMISSION_MATRIX` copre products/categories/suppliers read/write, import/export, staff, devices, history, audit e settings; `SHOP_STAFF_PERMISSION_MATRIX` resta separata dai web account. |
| UI/UX | `PASS` | Route richieste caricano tramite builder/server actions; niente coming soon sulle feature completate; conferme per archive/suspend/revoke/reset/apply; stati live/empty/not_configured/read-only. |
| Security scan | `PASS` | `npm run security:scan`: `Security scan passed`; scanner aggiornato per bloccare service-role client/browser, secret, hash, direct query-param authz, formula apply senza preview, mutazioni non auditabili e RPC non allowlistate. |
| Foundation | `PASS` | `npm run test:foundation`: `69 passed`. |
| Typecheck | `PASS` | `npm run typecheck`: `next typegen && tsc --noEmit` passati. |
| Lint | `PASS` | `npm run lint`: nessun errore o warning dopo fix. |
| Dati test | `NOT_CREATED` | Nessun dato live `TASK015_TEST_` creato; nessun cleanup richiesto. |

## Final completion Supabase linked checks - 2026-05-31

| Check | Esito | Evidence |
| --- | --- | --- |
| Pre-migration `supabase migration list --linked --log-level error` | `PASS` | History local/remota allineata fino a `20260531050837`. |
| Pre-migration `supabase db push --linked --dry-run --log-level error` | `PASS` | Remote up to date prima della nuova migration. |
| Pre-migration `supabase db lint --linked --schema public,app_private --level error --fail-on error --log-level error` | `PASS` | Nessun schema error. |
| Pre-migration `supabase db advisors --linked --type security --level error --fail-on error --log-level error` | `PASS` | `No issues found`. |
| Pre-apply dry-run/lint/advisors dopo creazione migration | `PASS` | Dry-run mostrava solo `20260531171726_task_015_shop_admin_completion`; lint/advisors senza errori. |
| Apply `supabase db push --linked --log-level error` | `PASS` | Migration applicata al linked dev; nessuna divergence rilevata. |
| Post-apply `migration list`, dry-run, lint, advisors | `PASS` | History allineata fino a `20260531171726`; dry-run remote up to date; lint/advisors senza errori. |
| Types generation | `PASS` | `supabase gen types typescript --linked --schema public,app_private,graphql_public > src/lib/supabase/database.types.ts`. |

## Execution pre-flight - 2026-05-31

| Check | Esito | Evidence |
| --- | --- | --- |
| Lettura allegato execution utente | `PASS` | Letto `/Users/minxiang/.codex/attachments/ca83361e-d285-404d-bd0b-fe80f04ff6ff/pasted-text.txt`; contiene istruzioni execution TASK-015 e conferma stato massimo `REVIEW`. |
| `git status --short` pre-branch | `PASS_WITH_NOTES` | Output: ` M docs/MASTER-PLAN.md`; untracked `docs/TASKS/EVIDENCE/TASK-015/`, `docs/TASKS/EVIDENCE/TASK-016/`, `docs/TASKS/TASK-015-complete-shop-admin-console.md`, `docs/TASKS/TASK-016-complete-platform-admin-console.md`. Sono modifiche documentali da planning precedenti; non sono state revertite. |
| `git branch --show-current` pre-branch | `PASS` | Output: `main`. |
| `git log --oneline --decorate -n 12` | `PASS` | HEAD e `origin/main` su `79984b7 Merge task 014 reconciliation`; storico task recente letto. |
| `git diff --stat` pre-branch | `PASS_WITH_NOTES` | Mostrava solo `docs/MASTER-PLAN.md | 89 +...` tra file tracciati; i file task/evidence TASK-015/TASK-016 erano untracked e quindi fuori stat. |
| `git diff --check` pre-branch | `PASS` | Nessun output. |
| `git pull --ff-only` | `NOT_RUN_DIRTY_WORKTREE` | Non eseguito per worktree gia dirty con documentazione di planning; `origin/main` appariva gia allineato a HEAD nella lettura log. |
| Creazione branch dedicato | `PASS` | Eseguito `git checkout -b codex/task-015-complete-shop-admin-console`; output `Switched to a new branch codex/task-015-complete-shop-admin-console`. |
| Worktree dopo branch | `PASS_WITH_NOTES` | Branch corrente `codex/task-015-complete-shop-admin-console`; restano modifiche/untracked documentali pre-esistenti TASK-015/TASK-016. Nessun file staged. |

## Review-fix pre-flight - 2026-05-31

| Check | Esito | Evidence |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree gia dirty da execution TASK-015 e planning TASK-016 pre-esistenti; nessun file staged. |
| `git branch --show-current` | `PASS` | Output: `codex/task-015-complete-shop-admin-console`. |
| `git log --oneline --decorate -n 12` | `PASS` | HEAD `79984b7 (HEAD -> codex/task-015-complete-shop-admin-console, origin/main, origin/HEAD, main) Merge task 014 reconciliation`; storico task recente letto. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracciato gia presente da execution TASK-015; file untracked TASK-015/TASK-016 fuori dallo stat. |
| `git diff --check` | `PASS` | Nessun output prima delle modifiche review-fix. |
| Branch richiesto | `PASS` | Confermato branch `codex/task-015-complete-shop-admin-console`; nessun checkout eseguito. |

## Final review pre-flight - 2026-05-31

| Check | Esito | Evidence |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree gia dirty da execution TASK-015 e planning TASK-016; nessun file staged. Scope coerente con TASK-015 piu file TASK-016 pre-esistenti non toccati dalla review finale. |
| `git branch --show-current` | `PASS` | Output: `codex/task-015-complete-shop-admin-console`. |
| `git log --oneline --decorate -n 12` | `PASS` | HEAD `79984b7 (HEAD -> codex/task-015-complete-shop-admin-console, origin/main, origin/HEAD, main) Merge task 014 reconciliation`; nessun commit nuovo eseguito. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracciato gia presente da execution TASK-015; file untracked TASK-015/TASK-016 fuori dallo stat. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-only` | `PASS` | Nessun output; nessuno stage finale presente. |

## Letture execution obbligatorie

| Area | Esito | File letti |
| --- | --- | --- |
| Governance progetto | `PASS` | `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/MASTER-PLAN.md`. |
| Dominio e skill locali | `PASS` | `docs/ARCHITECTURE/DOMAIN-MODEL.md`, `docs/DECISIONS/ADR-001-shop-root-model.md`, `docs/SKILLS/admin-dashboard.md`, `docs/SKILLS/supabase-security.md`. |
| Task precedenti | `PASS` | `TASK-008`, `TASK-009`, `TASK-010`, `TASK-011`, `TASK-012`, `TASK-014` e relative evidence principali disponibili. |
| Next.js locali | `PASS` | `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `05-server-and-client-components.md`, `06-fetching-data.md`, `07-mutating-data.md`, `01-app/02-guides/data-security.md`, `authentication.md`, `testing/playwright.md`, `01-app/03-api-reference/01-directives/use-server.md`. Sintesi: pagine/layout Server Components di default, DAL server-only, DTO minimi, Server Actions sempre re-authz e return redatti. |
| Scope codice Shop Admin | `PASS` | `src/app/shop`, `src/components/shop`, `src/components/admin`, `src/server/shop-admin`, `src/lib/supabase`, `supabase/migrations`, `tests`, `scripts/security-checks.mjs`, `package.json`. |
| Review-fix obbligatorie | `PASS` | Riletti `docs/MASTER-PLAN.md`, task/evidence TASK-015, task/evidence TASK-014, `src/app/shop/**`, `src/components/shop/**`, `src/server/shop-admin/**`, `src/lib/supabase/**`, `supabase/migrations/**`, `tests/foundation/**`, `tests/e2e/**`, `scripts/security-checks.mjs`, `package.json` e guide Next locali pertinenti a route/data loading/security. |

## Historical execution summary - 2026-05-31 initial handoff

| Area | Esito | Evidence |
| --- | --- | --- |
| Catalog products/categories/suppliers | `PASS_WITH_NOTES_READ_ONLY` | Creato `src/server/shop-admin/inventory-read-model.ts`: legge inventory legacy solo tramite `shop_inventory_sources` mappata allo shop selezionato e `owner_user_id`, con limiti e tombstone `deleted_at`. Nessuna mutazione CRUD introdotta per assenza di boundary RPC/audit sicuro. |
| Import/export Excel | `PASS_WITH_NOTES_CONTRACT_ONLY` | Creato `src/server/shop-admin/import-export-readiness.ts` con workbook contract `Products`, `Suppliers`, `Categories`, `PriceHistory`, limiti file/righe e protezione formula injection. Preview/apply/export file reale restano bloccati finche esistono libreria workbook vetting e mutation boundary catalog auditata. |
| Mobile history/sync | `PASS` | Creato e rafforzato `src/server/shop-admin/history-read-model.ts`, route `/shop/history` e route `/shop/history/[entryId]`: leggono `sync_events` e `shared_sheet_sessions` tramite mapping owner, separano da `audit_logs` e redigono payload JSON ricorsivamente con anteprima limitata. |
| Staff POS | `PASS_WITH_NOTES_ACTIONS_BLOCKED` | `src/server/shop-admin/staff-action-policy.ts` dichiara create/reset/suspend/reactivate/archive come `blocked_schema`; `/shop/staff` resta su read model safe di TASK-014, senza hash/PIN/password in UI. |
| Roles/permissions | `PASS` | `src/server/shop-admin/permissions.ts` separa matrice account web shop (`shop_owner`, `shop_manager`, `viewer`) da staff POS (`cashier`, `manager`, `viewer`) con helper `canShopAdmin`/`canShopStaff`. |
| Devices | `PASS_WITH_NOTES_ACTIVITY_ONLY` | `src/server/shop-admin/device-read-model.ts` usa solo activity da `sync_events.source_device_id`; revoca/riattivazione restano `blocked_schema` per assenza tabella autorizzativa devices. |
| Settings/audit | `PASS_WITH_NOTES_READ_ONLY` | `/shop/settings` usa read model server-side per profilo shop read-only. `/shop/audit` continua a usare il read model TASK-010; nessuna nuova mutazione auditata perche le mutazioni sono bloccate. |
| UI/routes | `PASS` | Products, categories, suppliers, import-export, roles, devices, settings e nuova history route caricano tramite `getShopSectionForRequest(...)` server-side e preservano `shop_id` solo come stato di navigazione. |
| Harness TASK-015 | `PASS` | Aggiunti test foundation TASK-015 per inventory, import/export, history, staff actions, devices e permissions. Aggiornati guardrail legacy e `scripts/security-checks.mjs` con gate TASK-015 dedicato. |
| Playwright smoke | `PASS` | Aggiornato `tests/e2e/platform-admin.spec.ts` includendo `/shop/history`; `npm run test:ui-smoke` passato con `46 passed`. |

## Discovery matrix execution

| Area | Tabella/view reale | Scope reale | Mapping shop | Azione | Esito |
| --- | --- | --- | --- | --- | --- |
| Products | `inventory_products` | `owner_user_id` + `deleted_at` | `shop_inventory_sources.shop_id -> owner_user_id` | read-only mapped | `PASS_WITH_NOTES` |
| Categories | `inventory_categories` | `owner_user_id` + `deleted_at` | `shop_inventory_sources.shop_id -> owner_user_id` | read-only mapped | `PASS_WITH_NOTES` |
| Suppliers | `inventory_suppliers` | `owner_user_id` + `deleted_at` | `shop_inventory_sources.shop_id -> owner_user_id` | read-only mapped | `PASS_WITH_NOTES` |
| Product prices | `inventory_product_prices` | `owner_user_id` | `shop_inventory_sources.shop_id -> owner_user_id` | read-only mapped | `PASS_WITH_NOTES` |
| Import/export | Nessuna tabella job dedicata rilevata | N/A | N/A | contract/readiness only | `BLOCKED_SCHEMA_DEPENDENCY` |
| History/sync | `sync_events`, `shared_sheet_sessions` | `owner_user_id`, `source_device_id`, domain | `shop_inventory_sources.shop_id -> owner_user_id` | read-only summary | `PASS_WITH_NOTES` |
| Staff | `staff_accounts_safe` | `shop_id` safe view | `selectedShop.shopId` autorizzato server-side | read-only + blocked actions | `PASS_WITH_NOTES` |
| Roles/permissions | Nessuna tabella granulare sicura rilevata per Shop Admin | static/server-side matrix | N/A | matrix server-only | `PASS` |
| Devices | Nessuna tabella devices autorizzativa rilevata | activity da `sync_events.source_device_id` | mapping owner via shop source | activity-only | `PASS_WITH_NOTES` |
| Audit/settings | `audit_logs`, `shops` | `shop_id` | `selectedShop.shopId` autorizzato server-side | read-only existing model | `PASS_WITH_NOTES` |

## TASK-015 Unblock Matrix

| Blocker | Stato iniziale | Causa reale | Fix tentato | Esito | Evidence | Rischio residuo |
| --- | --- | --- | --- | --- | --- | --- |
| CRUD catalogo prodotti/categorie/fornitori | `BLOCKED_SCHEMA_RPC` | Tabelle inventory legacy `owner_user_id`-scoped; mapping shop sicuro esiste per lettura ma manca boundary mutativa RPC/helper auditata. | Discovery migration/schema, conferma `shop_inventory_sources`, unblock linked checks e review RPC additive. | `READY_FOR_DESIGN` | `inventory-read-model.ts`, migration inventory/tombstone/grants, linked dry-run/lint/advisors passati in sequenza. | Nessuna mutazione esposta ancora; serve implementazione TDD di RPC e post-check linked. |
| Import apply Excel reale | `BLOCKED_SCHEMA_DEPENDENCY` | Nessun parser workbook in `package.json` e apply richiede lo stesso boundary catalogo mutativo non disponibile. | Verificato package, mantenuto contract preview-before-apply, limiti e formula hardening. | `BLOCKED_EXCEL_DEPENDENCY_AND_SCHEMA` | `import-export-readiness.ts`, test import/export foundation. | UI safe senza upload/apply; serve libreria minima motivata piu RPC transazionale. |
| Export Excel reale | `BLOCKED_SCHEMA_DEPENDENCY` | Nessuna libreria Excel reale; export file senza dependency produrrebbe fallback non equivalente alla richiesta. | Valutato CSV fallback come insufficiente; non aggiunta dependency senza apply/catalog boundary. | `BLOCKED_EXCEL_DEPENDENCY` | `package.json`, `import-export-readiness.ts`. | Export reale resta follow-up; dati catalogo restano visibili read-only in tabella. |
| Mutazioni staff POS | `BLOCKED_SCHEMA_RPC` | TASK-014 fornisce `staff_accounts` e `staff_accounts_safe`, ma non RPC create/reset/suspend/reactivate/archive. | Riusato read model safe e staff action policy bloccante; nessun grant mutativo diretto. | `BLOCKED_STAFF_MUTATION_SCHEMA` | `staff-read-model.ts`, `staff-credentials.ts`, `staff-action-policy.ts`, migration TASK-014. | Nessuna credenziale plaintext/hash esposta; serve RPC auditata con one-time credential. |
| Revoca/riattivazione devices | `BLOCKED_SCHEMA` | Non esiste tabella devices autorizzativa; `sync_events.source_device_id` e sola activity. | Discovery schema e read model activity-only; nessuna revoca inventata su `source_device_id`. | `BLOCKED_DEVICE_AUTHORIZATION_SCHEMA` | `device-read-model.ts`, migration `sync_events`, database types. | Lista device e read-only activity; revoca richiede schema `shop_devices` o equivalente. |
| Detail history `/shop/history/[entryId]` | `FOLLOW_UP_HISTORY_DETAIL` | Mancava route detail, pur esistendo mapping owner-safe per list read-only. | Test failing-first, read model detail server-only, route dinamica, sezione UI, redazione JSON limitata. | `PASS` | `history-read-model.ts`, `shop-section-data.ts`, `src/app/shop/history/[entryId]/page.tsx`, test history. | Live cross-shop fixture non creata; copertura statica/foundation/security. |
| Check Supabase linked | `PARTIAL_BLOCKED` | I comandi avviati in parallelo avevano reso instabile la login role temporanea; la shell non aveva `SUPABASE_DB_PASSWORD`. | Rieseguiti in sequenza con `--log-level error`. | `PASS` | `migration list`, `db push --dry-run`, `db lint` e `db advisors` passati. | Non eseguire linked checks in parallelo; usare env password solo se la login role temporanea non basta. |
| Cross-shop leak checks | `PASS_WITH_NOTES_STATIC` | Mancano fixture/live auth TASK-015 dedicate per doppio shop e cleanup. | Harness statico rafforzato su mapping server-side e no query-param authz; UI smoke unauth copre protezione route. | `PASS_WITH_NOTES_STATIC` | Foundation TASK-015, security scan, e2e smoke route protette. | Serve test live sintetico con `TASK015_TEST_` quando linked auth e cleanup sono disponibili. |
| Audit coverage | `PASS_WITH_NOTES_NO_NEW_MUTATIONS` | Le mutazioni critiche restano bloccate; quindi non esistono nuovi eventi audit mutativi da verificare. | Mantenute superfici read-only; catalog/staff/devices non espongono azioni. | `PASS_WITH_NOTES` | UI/status `Blocked`, staff/device policies, security scan no mutazioni. | Le future RPC devono scrivere audit log obbligatorio. |
| Security redaction | `PASS` | Detail history poteva esporre payload annidati se implementato senza redazione ricorsiva. | Redazione chiavi sensibili, raw JSON preview limitata, test no auth token/hash names nel server surface. | `PASS` | `redactShopAdminJson`, `stringifyRedactedJson`, `npm run security:scan`. | I payload live vanno riesaminati con fixture reali prima di abilitare export/raw avanzati. |

## TASK-015 Final Review Blocker Matrix

| Area | Stato iniziale | Verifica eseguita | Fix applicato | Esito finale | Rischio residuo | Prossimo passo |
| --- | --- | --- | --- | --- | --- | --- |
| Catalog CRUD | `BLOCKED_SCHEMA_RPC` | Review read model, migration inventory legacy, mapping `shop_inventory_sources`, no mutative RPC/grants diretti. | Nessuna mutazione forzata; confermata UI read-only e blocker RPC additiva. | `PASS_WITH_NOTES` | CRUD non disponibile; catalogo visibile solo se mapping owner e presente. | Implementare RPC/helper shop-scoped auditati con soft delete. |
| Categories CRUD | `BLOCKED_SCHEMA_RPC` | Verificati read model categorie, tombstone legacy e assenza hard delete. | Nessuna mutazione forzata; fallback read-only coerente. | `PASS_WITH_NOTES` | Create/update/archive categorie non disponibili. | Riutilizzare boundary catalogo RPC e validazioni unique active rows. |
| Suppliers CRUD | `BLOCKED_SCHEMA_RPC` | Verificati read model fornitori e mapping owner-safe. | Nessuna mutazione forzata; fallback read-only coerente. | `PASS_WITH_NOTES` | Create/update/archive fornitori non disponibili. | Riutilizzare boundary catalogo RPC e audit redatto. |
| Excel import preview | `PASS_WITH_NOTES_CONTRACT_ONLY` | Verificati contract workbook, limiti righe/byte e formula injection hardening. | Nessuna dependency workbook aggiunta senza boundary apply. | `PASS_WITH_NOTES` | Preview reale file non disponibile; readiness solo contract/server-only. | Scegliere dependency workbook server-only e implementare parser preview. |
| Excel apply reale | `BLOCKED_SCHEMA_DEPENDENCY` | Verificata assenza RPC catalogo transazionale e assenza libreria workbook. | UI mantiene apply bloccato e preview-before-apply obbligatorio. | `BLOCKED` | Nessuna scrittura Excel reale possibile in sicurezza. | Implementare catalog RPC prima di apply transazionale auditato. |
| Excel export reale | `BLOCKED_EXCEL_DEPENDENCY` | Verificato `package.json`; nessuna libreria Excel dedicata. | CSV fallback non dichiarato equivalente; export reale resta bloccato. | `BLOCKED` | Nessun workbook esportabile. | Aggiungere dependency minima motivata e export shop-scoped server-side. |
| History list | `PASS_WITH_NOTES_READ_ONLY` | Verificati mapping owner, domain allowlist, redazione e separazione da `audit_logs`. | Nessun fix necessario oltre ai controlli gia presenti. | `PASS` | Test live cross-shop sintetico non creato. | Aggiungere fixture live `TASK015_TEST_` quando autorizzata. |
| History detail | `FOLLOW_UP_HISTORY_DETAIL` | Review route, read model detail, parsing entry id, allowlist domain e redazione ricorsiva. | Aggiunto catch su `decodeURIComponent` e domain allowlist sulla query detail `sync_events`; harness e security scan rafforzati. | `PASS` | Nessuna fixture live detail multi-shop. | Estendere e2e live con doppio shop sintetico. |
| Staff list/read model | `PASS_WITH_NOTES_READ_ONLY` | Verificato uso `staff_accounts_safe`, no hash/plaintext e filtro `selectedShop.shopId`. | Nessun fix necessario. | `PASS` | Mutazioni staff separate restano bloccate. | Mantenere safe view come unica fonte UI. |
| Staff mutations | `BLOCKED_STAFF_MUTATION_SCHEMA` | Review TASK-014 schema, staff credentials helper e assenza RPC mutative. | Nessun grant diretto introdotto; UI/policy resta `blocked_schema`. | `BLOCKED` | Create/reset/suspend/reactivate/archive non disponibili. | Implementare RPC auditata senza restituire hash/plaintext. |
| Devices read model | `PASS_WITH_NOTES_ACTIVITY_ONLY` | Verificata distinzione tra `source_device_id` activity e tabella autorizzativa assente. | Nessun enforcement finto introdotto. | `PASS_WITH_NOTES` | Lista device e solo activity recente da sync events. | Disegnare `shop_devices` o equivalente con contratto client. |
| Devices revoke/reactivate | `BLOCKED_DEVICE_AUTH_CONTRACT` | Verificata assenza schema device autorizzativo e contratto mobile/POS. | Revoca/riattivazione non esposte come funzionanti. | `BLOCKED` | Revoca effettiva non applicabile ai client. | Implementare schema e handshake mobile/POS prima della UI mutativa. |
| Roles/permissions | `PASS_WITH_NOTES_BASELINE` | Verificata matrice server-only separata web shop members vs staff POS. | Nessun fix necessario. | `PASS_WITH_NOTES` | Granularita ruoli editabile non presente. | Aggiungere schema ruoli granulari solo con RLS/enforcement. |
| Settings | `PASS_WITH_NOTES_READ_ONLY` | Verificato read model shop profile server-side e stato writes blocked. | Nessun fix necessario. | `PASS_WITH_NOTES` | Aggiornamento settings non disponibile. | Implementare RPC settings auditata se richiesta. |
| Audit | `PASS_WITH_NOTES_NO_NEW_MUTATIONS` | Verificato read model audit TASK-010 e assenza nuove mutazioni da auditare. | Nessun fix necessario. | `PASS_WITH_NOTES` | Copertura audit mutativa non testabile finche mutazioni restano bloccate. | Ogni futura RPC deve scrivere `audit_logs`. |
| Supabase linked | `PARTIAL_BLOCKED` | Eseguiti check linked sequenziali con `--log-level error`. | Nessuna password chat usata; documentata regola no parallel. | `PASS` | I comandi possono fallire se eseguiti in parallelo o senza login role temporanea. | Continuare sequenza migration list, dry-run, lint, advisors. |
| Security scan | `PASS` | Review scanner TASK-015, secret/hash/token rules e history detail hardening. | Rafforzati gate su malformed entry id e domain allowlist detail. | `PASS` | Baseline fuori scope resta documentale, non mascherante. | Tenere gate scoped ai moduli Shop Admin modificati. |
| Cross-shop leak | `PASS_WITH_NOTES_STATIC` | Verificati filtri `selectedShop.shopId`, mapping owner server-side, no query param authz diretto e smoke route protette. | Detail sync event reso coerente con allowlist domain. | `PASS_WITH_NOTES` | Mancano fixture live multi-shop con dati sintetici. | Creare live test con cleanup `TASK015_TEST_`. |
| UI/UX | `PASS_WITH_NOTES_SAFE_STATES` | Review route richieste, stati read-only/blocked/not_configured, labels/focus/responsive smoke. | Nessun placeholder ambiguo introdotto; history detail safe. | `PASS_WITH_NOTES` | QA visuale autenticata live non rieseguita per server esistente. | Rilanciare live auth in ambiente senza dev server concorrente. |
| Cleanup dati test | `NOT_RUN_NOT_NEEDED` | Verificato che la review non ha creato dati live. | Nessun cleanup richiesto. | `NOT_RUN` | Nessun residuo dati test da rimuovere. | Usare prefisso `TASK015_TEST_` per future fixture. |

## Supabase linked checks execution iniziale

| Check | Esito | Evidence |
| --- | --- | --- |
| `supabase migration list --linked` | `PASS` | Local/remoto allineati fino a `20260531050837`; nessuna migration nuova in review-fix. |
| `supabase db push --linked --dry-run` | `SUPERSEDED_BY_UNBLOCK` | Inizialmente bloccato da pooler/login role; poi passato nella sezione unblock eseguendo i comandi in sequenza. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `SUPERSEDED_BY_UNBLOCK` | Inizialmente bloccato da pooler/login role; poi passato nella sezione unblock eseguendo i comandi in sequenza. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | Output: `No issues found`. |
| Migration create/apply | `NOT_RUN` | Nessuna migration creata/applicata in questa review; i linked checks sono stati sbloccati successivamente e abilitano una futura implementation TDD. |

## Supabase linked unblock e review RPC/migration additive - 2026-05-31

| Area | Esito | Evidence |
| --- | --- | --- |
| Root cause connessione linked | `PASS_WITH_NOTES` | `.env.local` contiene solo env pubbliche Supabase e il processo shell non aveva `SUPABASE_DB_PASSWORD`; `supabase/.temp/pooler-url` esiste ma non contiene password. La CLI `2.102.0` riesce comunque a inizializzare una login role temporanea quando i comandi linked sono eseguiti in sequenza. |
| `supabase migration list --linked --log-level error` | `PASS` | Local/remoto allineati fino a `20260531050837`. |
| `supabase db push --linked --dry-run --log-level error` | `PASS` | Output: `Remote database is up to date`; nessuna migration nuova da applicare. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error --log-level error` | `PASS` | Output: `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error --log-level error` | `PASS` | Output: `No issues found`. |
| Segreto fornito in chat | `NOT_STORED` | Una password DB e stata fornita dall'utente durante l'unblock, ma non e stata stampata, salvata in file, committata o riportata in evidence; i check sono passati senza doverla usare. |

### Review mirata RPC/migration additive

| Area | Verdict review | Migrazione/RPC additive consigliata | Gate obbligatori prima di implementare | Note di rischio |
| --- | --- | --- | --- | --- |
| Catalogo prodotti/categorie/fornitori | `READY_FOR_DESIGN` | Aggiungere helper privato `app_private.resolve_shop_inventory_owner(target_shop_id uuid)` e RPC pubbliche `shop_inventory_supplier_upsert`, `shop_inventory_category_upsert`, `shop_inventory_product_upsert`, `shop_inventory_catalog_archive`; tutte `security definer`, `set search_path = public, app_private, pg_temp`, autorizzate con owner/manager shop, audit shop-scoped e soft delete via `deleted_at`. | Non revocare grant/policy legacy finche mobile/POS non migrano; nessun hard delete; validare FK supplier/category sullo stesso `owner_user_id`; usare result JSON redatto. | Tecnicamente fattibile ora che dry-run/lint passano, ma va implementato con test TDD e post-check linked. |
| Staff POS mutations | `READY_FOR_DESIGN` | Aggiungere RPC `shop_staff_create`, `shop_staff_set_credential`, `shop_staff_suspend`, `shop_staff_reactivate`, `shop_staff_archive`; riusare `staff_accounts`, `staff_accounts_safe`, `app_private.is_active_shop_staff_admin_member`. | Nessun grant diretto insert/update/delete su `staff_accounts`; hash generato server-side app, plaintext mai inviato in evidence/log/UI; RPC non deve restituire hash; audit obbligatorio. | Schema TASK-014 supporta gli stati richiesti; serve coordinare Server Action one-time credential con `staff-credentials.ts`. |
| Excel apply/export reale | `PARTIAL_READY` | Nessuna migration necessaria per export; per import persistente valutare tabella additiva `shop_catalog_import_batches` con solo report redatti, hash file, row/error count, status, expires_at, applied_at. Apply dovrebbe usare RPC transazionale sopra le RPC catalogo o helper condivisi. | Serve dependency workbook minima e motivata; preview-before-apply; limiti righe/byte; formula injection; nessun workbook/raw payload sensibile persistito; audit attempt/success/failure. | Bloccato dalla scelta libreria Excel e dal completamento RPC catalogo; CSV fallback non soddisfa da solo la richiesta. |
| Devices revoke/reactivate | `DESIGN_BLOCKED_BY_PRODUCT_CONTRACT` | Una tabella additiva `shop_devices` e RPC `shop_device_register`, `shop_device_revoke`, `shop_device_reactivate`, `shop_device_rename` sono compatibili se shop-scoped e auditati. | Prima di dichiarare revoca effettiva serve che mobile/POS consultino `shop_devices.status`; altrimenti UI deve restare `activity-only` o `registry-only`. | `sync_events.source_device_id` resta activity evidence, non autorizzazione. Non esporre revoca come enforcement finche manca handshake client. |

### Pattern SQL consigliato

- Reusare il pattern TASK-006: helper result JSON redatto, helper audit `security definer`, RPC pubbliche con `revoke all` da `public`/`anon` e `grant execute` solo a `authenticated`.
- Reusare autorizzazione TASK-014 per staff owner/manager; per catalogo creare helper mapping shop -> owner che verifica `shop_inventory_sources.mapping_state = 'mapped'` e `disabled_at is null`.
- Tenere `audit_logs` append-only e scrivere eventi `shop.catalog.*`, `shop.staff.*`, `shop.import.*`, `shop.device.*`.
- Eseguire ogni futura migration con sequenza non parallela: `migration list`, `db push --dry-run`, `db lint`, `db advisors`; poi, solo se richiesto, apply reale.

## Mobile/POS mapping matrix execution

| Fonte | Disponibilita | Modelli verificati | Riuso | Esito |
| --- | --- | --- | --- | --- |
| Android MerchandiseControl | `NOT_AVAILABLE_LOCAL` | Nessun repo Android trovato sotto `/Users/minxiang/Projects` | Non inventato | `NOT_RUN` |
| iOS MerchandiseControl | `NOT_AVAILABLE_LOCAL` | Nessun repo iOS trovato sotto `/Users/minxiang/Projects` | Non inventato | `NOT_RUN` |
| Win7POS | `AVAILABLE_STATIC` | SQLite/Excel/permessi/PIN helper ispezionati staticamente | Workbook sheets e matrice permessi usati come riferimento prudente | `PASS_WITH_NOTES` |
| Cash Register System | `NOT_AVAILABLE_LOCAL` | Repo non trovato sotto `/Users/minxiang/Projects` | Non inventato | `NOT_RUN` |

## Security redaction evidence execution

| Gate | Esito | Evidence |
| --- | --- | --- |
| No service-role client/browser | `PASS` | `npm run security:scan` passato; nuovo gate TASK-015 controlla superfici client e server. |
| No `credential_hash` in UI/DTO | `PASS` | Staff UI/read model usa `staff_accounts_safe`; test TASK-014/TASK-015 e security scan passano. |
| No PIN/password/token/magic link in logs/evidence | `PASS` | Nessuna stampa di valori sensibili; history read model redige chiavi sensibili e i controlli statici passano. |
| History payload recursive redaction | `PASS` | `redactShopAdminJson` redige oggetti/array annidati e limita array a 20 elementi; typecheck passato dopo gestione esplicita di `undefined`. |
| Import/export formula injection hardening | `PASS` | `sanitizeSpreadsheetCell` prefissa celle che iniziano con `=`, `+`, `-`, `@`, tab o carriage return; preview/apply/export/template Excel reali sono implementati server-side. |
| Server actions authorized server-side | `PASS` | Le nuove Server Actions usano `resolveShopActionContext` e RPC/helper auditabili; nessuna autorizzazione basata solo su query param. |
| No client-side-only auth guard | `PASS` | Route Shop Admin restano `force-dynamic` e protette dal layout/server read model. |
| Cross-shop leak evidence | `PASS` | Harness TASK-015 verifica boundary cross-shop negativo per catalogo, staff, devices, history e permission matrix; RPC risolvono sempre shop/member server-side. |

## Harness and final checks execution

| Check | Esito | Evidence |
| --- | --- | --- |
| Failing-first TASK-015 harness | `PASS` | Prima dell'implementazione `node --test tests/foundation/task-015-*.test.mjs` falliva `11/11` come atteso sui moduli mancanti. |
| TASK-015 harness post-implementazione | `PASS` | `node --test tests/foundation/task-015-*.test.mjs`: tutti i test TASK-015 passati. |
| Final review history hardening TDD | `PASS` | `node --test tests/foundation/task-015-history.test.mjs` fallito dopo aver aggiunto le nuove asserzioni su malformed entry id/domain allowlist, poi passato dopo il fix in `history-read-model.ts`. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; route types generate con successo. |
| `npm run lint` | `PASS` | `eslint` senza errori. |
| `npm run test:foundation` | `PASS` | Output finale completion: `tests 69`, `pass 69`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed`; gate TASK-015 include malformed history entry id e domain allowlist detail. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build passato; route list include `/shop/history/[entryId]`. Warning Node `DEP0205` non bloccante. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Esegue `lint`, `typecheck`, `security:scan`, `build`; output build include `/shop/history/[entryId]`. Warning Node `DEP0205` non bloccante. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | Output: `48 passed`; include `/shop/history` e `/shop/history/sync:1` su `chromium-desktop` e `chromium-tablet`. Warning Node/NO_COLOR non bloccanti. |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth` | `PASS_WITH_WARNINGS` | Lo script standard e stato prima bloccato dal dev server esistente su `localhost:3000` perche usa `PLAYWRIGHT_REUSE_SERVER=0`. Retry sicuro con `PLAYWRIGHT_BASE_URL=http://localhost:3000`, `PLAYWRIGHT_REUSE_SERVER=1` e `npx playwright test tests/e2e/platform-admin-live-auth.spec.ts --project=chromium-desktop`: `2 passed`, `1 skipped`; warning Node `DEP0205`/NO_COLOR non bloccanti. |
| `git diff --check` | `PASS` | Nessun output dopo l'ultimo aggiornamento documentale. |
| `git status --short` | `PASS_WITH_NOTES` | Worktree non staged; restano anche file TASK-016 planning untracked pre-esistenti e non toccati da questa execution. |

## Known blockers / residual risk after final completion

| Area | Stato | Motivo | Fallback consegnato |
| --- | --- | --- | --- |
| CRUD catalogo | `RESOLVED` | Implementate RPC auditabili shop-scoped sopra mapping `shop_inventory_sources -> owner_user_id`. | UI e Server Actions reali per create/update/archive con soft delete. |
| Import apply/export Excel reale | `RESOLVED` | Aggiunte librerie workbook server-only e route preview/apply/export/template. | Preview digest e confirm apply obbligatori; export shop-scoped. |
| Staff mutazioni | `RESOLVED` | Implementate RPC auditabili per create/reset/suspend/reactivate/archive. | One-time display solo in UI post-azione; nessun hash in DTO/UI/evidence runtime. |
| Device revocation/reactivation | `READY_FOR_DONE_CONFIRMATION_WITH_NOTES` | Registry server-side `shop_devices` implementato; enforcement client richiede consumo lato Android/iOS/POS. | Revoke/reactivate aggiornano stato server e audit; UI chiarisce follow-up client. |
| History detail route | `RESOLVED` | Route detail e hardening gia completati. | `/shop/history/[entryId]` read-only shop-scoped con payload JSON redatto e limitato. |
| Live cross-shop/browser authenticated TASK-015 | `NOT_RUN_NO_FIXTURE` | Nessuna fixture live TASK-015 creata; non serviva per applicare migration/schema. | Foundation/security/static/e2e smoke coprono boundary; futuri dati live devono usare prefisso `TASK015_TEST_`. |

## Final execution verdict

- Final completion verdict: `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`.
- Stato massimo Codex rispettato: `READY_FOR_DONE_CONFIRMATION`.
- `DONE`: non marcato.
- Migration create/applicate: `20260531171726_task_015_shop_admin_completion.sql`, applicata al linked dev.
- Commit/push/stage finale: `NOT_RUN`.
- Valori sensibili esposti: `NONE_DETECTED_BY_CHECKS`.
- Prossima fase: review utente e conferma esplicita per marcare `DONE`; in parallelo pianificare update Android/iOS/POS per consumare `shop_devices.status`.

## DONE reconciliation

- Conferma utente: `RECEIVED`.
- Stato finale: `DONE_WITH_NOTES`.
- Residuo accettato: `MOBILE_POS_ENFORCEMENT_FOLLOW_UP`.
- Commit: `NOT_RUN`.
- Git push: `NOT_RUN`.
- Stage finale: `NONE`.
- Note: TASK-015 chiuso a DONE su conferma esplicita dell'utente. Admin Web/Supabase/server-side completati e verificati; resta solo enforcement client Android/iOS/POS di `shop_devices.status`.

### DONE reconciliation gate freschi - 2026-05-31

| Check | Esito | Evidence |
| --- | --- | --- |
| `npm run security:scan` | `PASS` | Output: `Security scan passed`. |
| `npm run test:foundation` | `PASS` | Output: `tests 69`, `pass 69`, `fail 0`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan` e `build` passati; build con warning Node `DEP0205` non bloccante. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | Output: `48 passed`; warning Node `DEP0205` e `NO_COLOR`/`FORCE_COLOR` non bloccanti. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-only` | `PASS` | Nessun output; nessun file staged. |
| `supabase migration list --linked --log-level error` | `PASS` | Local/remoto allineati fino a `20260531171726`. |
| `supabase db push --linked --dry-run --log-level error` | `PASS` | Output: `Remote database is up to date`. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error --log-level error` | `PASS` | Output: `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error --log-level error` | `PASS` | Output: `No issues found`. |

## Evidence planning

| Check | Esito | Sintesi |
| --- | --- | --- |
| Lettura `docs/MASTER-PLAN.md` | `PASS` | Master Plan letto; stato corrente `IDLE`, task attivo `NONE`, ultimo task completato `TASK-014`. |
| Lettura allegato utente | `PASS` | Allegato `Testo incollato.txt` letto; contiene brief TASK-015 unico di 820 righe. |
| Lettura template task | `PASS` | `docs/TASKS/TASK-TEMPLATE.md` letto per allineare la struttura del task. |
| Lettura task recenti | `PASS` | Consultati `TASK-012`, `TASK-013`, `TASK-014` e evidence `TASK-014` per formato e tracking. |
| Lettura brief finale hardening | `PASS` | Allegato planning finale letto; contiene review hardening di 464 righe. |
| Lettura brief planning freeze | `PASS` | Allegato planning freeze letto; contiene audit readiness di 365 righe. |
| `git status --short` prima delle modifiche | `PASS` | Nessun output; worktree pulito prima della creazione planning. |
| `git branch --show-current` | `PASS` | Branch corrente `main`. |
| `git diff --check` dopo creazione planning | `PASS` | Nessun output; nessun whitespace error. |
| `git status --short` dopo creazione planning | `PASS_WITH_NOTES` | Modificati/aggiunti solo `docs/MASTER-PLAN.md`, `docs/TASKS/TASK-015-complete-shop-admin-console.md` e `docs/TASKS/EVIDENCE/TASK-015/README.md`. |
| `git diff --check` dopo integrazione review planning | `PASS` | Nessun output; nessun whitespace error dopo il secondo brief. |
| `git diff --check` dopo planning freeze | `PASS` | Nessun output; nessun whitespace error dopo integrazione freeze. |
| `git diff --cached --name-only` dopo planning freeze | `PASS` | Nessun output; nessun file staged. |
| Controllo trailing whitespace/ASCII/segnaposti vietati | `PASS` | Nessun trailing whitespace, nessun carattere non ASCII e nessun segnaposto vietato nei file TASK-015/Master Plan toccati. |

## Planning freeze / execution readiness audit 2026-05-31

| Area | Esito | Sintesi |
| --- | --- | --- |
| Verdict freeze | `READY_FOR_EXECUTION_WITH_NOTES_CONFIRMED` | Nessuna lacuna bloccante residua trovata nel planning gia revisionato. |
| Stato documentale | `PASS` | `TASK-015` resta `DRAFT` / `PLANNING`; execution e review restano `NOT_STARTED`; Master Plan resta `IDLE` con task attivo `NONE`. |
| Master Plan | `PASS` | `TASK-015` e candidato, non task attivo; non e stato portato a `TASK_ACTIVE` / `EXECUTION`. |
| Prodotto/dominio | `PASS` | Platform globale, Shop operativa, POS/Staff modulo Shop Admin, account web separato da staff POS, nessun `merchant -> stores`. |
| Completezza scope | `PASS_WITH_NOTES` | Prodotti, categorie, fornitori, Excel, history, staff, ruoli, devices, settings, audit, UI/UX, performance, sicurezza, test ed evidence sono coperti con gate/fallback. |
| Contraddizioni residue | `PASS_WITH_NOTES` | Nessuna contraddizione bloccante; il verdict resta `READY_FOR_EXECUTION_WITH_NOTES`, non `READY_FOR_EXECUTION` puro, per i rischi noti. |
| Harness scope | `PASS_WITH_NOTES` | Scan statica conferma nessuna `.select("*")` nello scope Shop Admin; esistono `.select("*")` legacy in Platform Admin fuori TASK-015, da documentare come baseline se un gate globale li incontra. |
| Repo sibling | `PASS_WITH_NOTES` | `Win7POS` disponibile; Android/iOS/Cash Register non presenti sotto `/Users/minxiang/Projects`, quindi futura execution deve usare `NOT_AVAILABLE`. |
| Check statici ammessi | `PASS` | Eseguiti solo letture, `rg`, `find`, `git status --short`, `git branch --show-current`, `git diff --stat`, `git log --oneline --decorate -n 12` e ispezioni file. |
| Check vietati | `NOT_RUN_PLANNING_ONLY` | Nessun build, lint, typecheck, test runtime, Playwright runtime, Supabase live, migration, generation types, seed, cleanup, commit, push o stage. |

Lacuna minima integrata: il piano ora esplicita che i gate TASK-015 devono essere scoped ai nuovi file o ai moduli Shop Admin toccati, con baseline esterne documentate come eccezioni esistenti o follow-up separati.

## Final hardening planning 2026-05-31

| Area | Esito | Sintesi |
| --- | --- | --- |
| Prodotto/governance | `PASS` | Piano mantiene Platform globale, Shop operativa, POS/Staff modulo Shop Admin, nessun `merchant -> stores`. |
| Scope TASK-015 | `PASS_WITH_NOTES` | Scope enorme ma mantenuto unico; milestone e stop condition impediscono forcing di aree bloccate. |
| Inventory/catalog | `PASS_WITH_NOTES` | Piano richiede mapping `owner_user_id` -> `shop_id` verificato prima di dati live o mutazioni. |
| Excel | `PASS_WITH_NOTES` | Piano richiede Excel reale o decisione esplicita; CSV fallback non e equivalente senza approvazione. |
| History/mobile | `PASS_WITH_NOTES` | Piano distingue `audit_logs`, `sync_events` e history entry reale; richiede redazione ricorsiva. |
| Staff POS | `PASS` | Piano riusa foundation TASK-014 e vieta plaintext/hash/log/evidence sensibili. |
| Roles/permissions | `PASS_WITH_NOTES` | Piano richiede baseline server-side anche se granularita avanzata resta follow-up. |
| Devices | `PASS_WITH_NOTES` | Piano blocca revoca/riattivazione se manca schema device autorizzativo. |
| UI/UX/accessibilita | `PASS` | Piano richiede componenti condivisi, stati distinti, conferme, feedback redatto, keyboard/focus/contrast. |
| Performance | `PASS_WITH_NOTES` | Piano richiede paginazione/filtri server-side, no N+1, budget payload, timeout/fallback. |
| Harness | `PASS_WITH_NOTES` | Piano elenca harness TASK-015 futuri; non creati in planning per divieto modifica test runtime. |
| Evidence | `PASS` | Evidence trasformata in template operativo con matrici e final verdict. |
| Condizioni `REVIEW`/`DONE` | `PASS` | Piano ora esplicita condizioni future per `REVIEW`; `DONE` resta vietato senza review positiva e conferma utente. |

## File/static scope letti nella review finale

- Governance e prodotto: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/MASTER-PLAN.md`, domain model, ADR-001, skill locali.
- Planning: `docs/TASKS/TASK-015-complete-shop-admin-console.md`, questo evidence file.
- Task precedenti: `TASK-008`, `TASK-009`, `TASK-010`, `TASK-011`, `TASK-012`, `TASK-014` e evidence principali.
- Scope statico: `src/app/shop`, `src/components/shop`, `src/components/admin`, `src/server/shop-admin`, `src/lib/supabase`, `supabase/migrations`, `tests`, `scripts/security-checks.mjs`, `package.json`, `playwright.config.ts`.
- Repo sibling statici: `/Users/minxiang/Projects/Win7POS` disponibile; Android/iOS/Cash Register `NOT_AVAILABLE` nella scan locale.

## Planning review 2026-05-31

| Area | Esito | Sintesi |
| --- | --- | --- |
| Modalita richiesta | `PASS` | Solo planning/read-only; nessuna execution avviata. |
| Branch corrente | `PASS` | `main`. |
| Stato git | `PASS_WITH_NOTES` | Sono presenti solo modifiche documentali TASK-015 gia aperte. |
| Master Plan | `PASS` | Progetto `IDLE`, task attivo `NONE`, `TASK-015` candidato `DRAFT`. |
| TASK-015 esistente | `PASS_WITH_NOTES` | Piano presente e coerente, ma rafforzato con gate, stop condition e mapping repo-grounded. |
| Package scripts | `PASS` | Script staticamente presenti: `typecheck`, `lint`, `test:foundation`, `security:scan`, `build`, `verify`, `test:ui-smoke`, `test:ui-live-auth`. Non eseguiti in planning. |
| Excel dependency | `PASS_WITH_NOTES` | Nessuna libreria Excel dedicata in `package.json`; execution deve motivare dipendenza, approvare CSV fallback o classificare blocker. |
| Route Shop Admin | `PASS` | Route candidate in `src/app/shop` presenti; products/categories/suppliers/import-export/roles/devices/settings sono ancora placeholder/read model pending. |
| Read model Shop Admin | `PASS` | `src/server/shop-admin/read-model.ts` legge server-only `shops`, `shop_members`, `audit_logs`, filtrando `selectedShop.shopId`. |
| Staff foundation | `PASS` | `TASK-014` ha introdotto `staff_accounts`, `staff_accounts_safe`, read model safe e hashing server-only; mutazioni staff restano non implementate. |
| Inventory schema statico | `PASS_WITH_NOTES` | Migration statiche inventory sono `owner_user_id`-scoped; TASK-015 deve risolvere mapping shop-safe prima di mostrare o mutare dati. |
| History/sync schema statico | `PASS_WITH_NOTES` | `sync_events` usa `owner_user_id`, `store_id`, `source_device_id` e dominio history; non equivale automaticamente a history entry shop-scoped. |
| Devices schema statico | `PASS_WITH_NOTES` | Nessuna tabella dispositivi autorizzativa rilevata staticamente; `source_device_id` non basta per revoca/riattivazione. |
| Repo sibling | `PASS_WITH_NOTES` | `/Users/minxiang/Projects/Win7POS` disponibile; Android/iOS/Cash Register non presenti sotto `/Users/minxiang/Projects` nella scan statica. |

## Lacune trovate nel piano originale

- Mancavano milestone interne con stop condition per un task volutamente grande.
- Mancavano definizioni esito e criteri per `READY_FOR_EXECUTION_WITH_NOTES`.
- Inventory legacy `owner_user_id`-scoped non era evidenziata come rischio di mapping.
- Import/export non includeva ancora formula injection, limiti righe/file, template, idempotenza e report per riga/cella.
- History mobile non separava abbastanza `sync_events`, history entry e `audit_logs`.
- Staff POS non richiamava abbastanza la foundation TASK-014 e il divieto di grant mutative dirette a `authenticated`.
- Devices non distinguevano abbastanza device activity da device authorization.
- Mancavano requisiti espliciti per paginazione, filtri server-side, no N+1, cleanup dati test e redazione evidence.

## Ottimizzazioni integrate nel file task

- Aggiunte definizioni standard di `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED`, `NOT_RUN`, `CHANGES_REQUIRED`, `READY_FOR_EXECUTION`, `READY_FOR_EXECUTION_WITH_NOTES`, `REVIEW` e `DONE`.
- Aggiunte milestone interne e stop condition.
- Aggiunti finding repo-grounded su inventory, sync/history, staff foundation, devices e dipendenze Excel.
- Rafforzate fasi Products/Categories/Suppliers con normalizzazione, duplicati, prezzi/quantita, soft delete, audit e paginazione.
- Rafforzato Import/Export con preview/apply, formula injection, limiti, report cella/riga, template e idempotenza.
- Rafforzata History Entry con mapping reale, separazione audit/sync e redazione ricorsiva payload.
- Rafforzata Staff POS con riuso TASK-014, one-time temporary credential, `must_change_credential`, no plaintext/hash e audit.
- Rafforzati ruoli/permessi distinguendo account web e staff POS.
- Rafforzati Devices con blocker schema se manca una tabella autorizzativa.
- Aggiunti requisiti UI/UX, accessibilita, performance e data loading.
- Aggiunti harness futuri TASK-015 e strategia dati test `TASK015_TEST_`.

## Template operativo per futura execution

### Pre-flight

| Check | Esito | Evidence |
| --- | --- | --- |
| Branch dedicato `codex/task-015-complete-shop-admin-console` | `PLANNED` |  |
| `git status --short` | `PLANNED` |  |
| `git branch --show-current` | `PLANNED` |  |
| `git log --oneline --decorate -n 12` | `PLANNED` |  |
| `git diff --stat` | `PLANNED` |  |
| `git diff --check` | `PLANNED` |  |

### Milestone status

| Milestone | Esito | Evidence |
| --- | --- | --- |
| Discovery schema/mapping | `PLANNED` |  |
| Catalog products/categories/suppliers | `PLANNED` |  |
| Import/export Excel | `PLANNED` |  |
| History/sync detail | `PLANNED` |  |
| Staff POS actions | `PLANNED` |  |
| Roles/permissions | `PLANNED` |  |
| Devices | `PLANNED` |  |
| Settings/audit | `PLANNED` |  |
| UI/UX/accessibilita | `PLANNED` |  |
| Security/harness | `PLANNED` |  |
| Final checks/handoff | `PLANNED` |  |

### Discovery matrix

| Area | Tabella/view reale | Scope reale | Mapping shop | RLS/grants | Azione | Esito |
| --- | --- | --- | --- | --- | --- | --- |
| Products | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| Categories | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| Suppliers | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| Product prices | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| Import/export | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| History/sync | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| Staff | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| Roles/permissions | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| Devices | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |
| Audit | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `use/create/adapt/block` | `PLANNED` |

### Mobile/POS mapping matrix

| Fonte | Disponibilita | Modelli verificati | Riuso | Rischio | Esito |
| --- | --- | --- | --- | --- | --- |
| Android MerchandiseControl | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` |
| iOS MerchandiseControl | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` |
| Win7POS | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` |
| Cash Register System | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` | `PLANNED` |

### Security redaction evidence

| Gate | Esito | Evidence |
| --- | --- | --- |
| No service-role client/browser | `PLANNED` |  |
| No `credential_hash` in UI/DTO | `PLANNED` |  |
| No PIN/password/token/magic link in logs/evidence | `PLANNED` |  |
| History payload recursive redaction | `PLANNED` |  |
| Import/export formula injection hardening | `PLANNED` |  |
| Server actions authorized server-side | `PLANNED` |  |
| No client-side-only auth guard | `PLANNED` |  |
| Cross-shop negative tests | `PLANNED` |  |

### Test data strategy

| Area | Prefix dati | Cleanup previsto | Cleanup verificato | Esito |
| --- | --- | --- | --- | --- |
| Shops/catalog | `TASK015_TEST_` | `PLANNED` | `PLANNED` | `PLANNED` |
| Staff | `TASK015_TEST_` | `PLANNED` | `PLANNED` | `PLANNED` |
| Devices/history | `TASK015_TEST_` | `PLANNED` | `PLANNED` | `PLANNED` |
| Import/export files | `TASK015_TEST_` | `PLANNED` | `PLANNED` | `PLANNED` |

### Final verdict template

- Final execution verdict: `PLANNED`.
- Stato massimo Codex: `REVIEW`.
- `DONE`: vietato senza review positiva e conferma esplicita utente.
- File modificati: `PLANNED`.
- Migration create/applicate: `PLANNED`.
- Funzionalita completate: `PLANNED`.
- Funzionalita bloccate: `PLANNED`.
- Check eseguiti: `PLANNED`.
- Rischi residui: `PLANNED`.
- Conferme finali: nessun commit, nessun push, nessuno stage finale, nessun secret esposto.
- Condizioni future `REVIEW`: gate critici passati, fallback safe per blocker reali, Master Plan a `REVIEW`, evidence completa.
- Condizioni future `DONE`: review positiva, check/evidence verificabili, blocker classificati, conferma esplicita utente.

## Check non eseguiti in planning

| Check | Esito | Motivo |
| --- | --- | --- |
| `npm run typecheck` | `NOT_RUN_PLANNING_ONLY` | Nessun codice TypeScript modificato. |
| `npm run lint` | `NOT_RUN_PLANNING_ONLY` | Nessun codice applicativo modificato. |
| `npm run test:foundation` | `NOT_RUN_PLANNING_ONLY` | Execution non avviata. |
| `npm run security:scan` | `NOT_RUN_PLANNING_ONLY` | Execution non avviata; nessun secret o codice runtime aggiunto. |
| `npm run build` | `NOT_RUN_PLANNING_ONLY` | Nessun codice runtime modificato. |
| `npm run verify` | `NOT_RUN_PLANNING_ONLY` | Nessun codice runtime modificato. |
| `npm run test:ui-smoke` | `NOT_RUN_PLANNING_ONLY` | Nessuna UI modificata. |
| Supabase linked checks | `NOT_RUN_PLANNING_ONLY` | Nessuna migration o query live avviata. I gate Supabase sono richiesti dalla futura execution. |

## Handoff

- Prossima fase proposta: review umana di `TASK-015`.
- Stato handoff: `PASS_WITH_NOTES`.
- Master Plan e task devono restare `REVIEW`, non `DONE`, finche non arriva conferma esplicita dell'utente dopo review positiva.
- Blocker da decidere in review: CRUD catalogo non ancora implementato, apply/export Excel reale, staff mutazioni, device authorization/revocation e live cross-shop fixtures. Supabase linked non e piu blocker dopo l'unblock sequenziale.
- Nessun commit, nessun git push, nessuno stage finale, nessun secret esposto.
