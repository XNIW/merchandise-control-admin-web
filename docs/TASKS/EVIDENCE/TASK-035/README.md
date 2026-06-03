# TASK-035 Evidence

## Stato corrente

- Task: `TASK-035 - Authenticated Admin Web QA + Shop Admin smoke harness`
- Stato task: `DONE`
- Fase: `DONE`
- Milestone interna: `AUTHENTICATED_LOCAL_SMOKE_PASSED`
- Data apertura: `2026-06-02`
- Branch Admin Web: `main`
- Verdict corrente: `DONE`
- Stage: `COMMITTED_BY_USER_REQUEST`
- Commit: `COMMITTED_BY_USER_REQUEST`
- Push: `PUSHED_BY_USER_REQUEST`

## Apertura planning

TASK-035 nasce come follow-up piccolo del residuo `BLOCKED_NO_AUTH_SESSION` mantenuto in TASK-034.

Scopo: creare o rafforzare un harness QA autenticato per Admin Web e Shop Admin con dataset sintetico `TASK035_*`, cleanup verificabile e screenshot/log redatti, senza dipendere da VM Win7.

## Pre-flight execution 2026-06-02

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `git status --short --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Admin Web pre-flight pulito; worktree dirty ora per file TASK-035/evidence modificati. |
| `git branch --show-current` | `PASS` | `main`. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git diff --cached --name-status` | `PASS` | Nessun file staged. |

Dirty worktree preesistente osservato al pre-flight:

- Modifiche gia presenti: `docs/MASTER-PLAN.md`, `scripts/security-checks.mjs`, componenti Shop Admin TASK-034, mutazioni device, vari test foundation.
- Untracked gia presenti: documenti/evidence TASK-034, planning TASK-035, POS sales sync plan, test TASK-034/TASK-035.
- File aggiunti/modificati da questa execution TASK-035 sono separati sotto "File toccati TASK-035".

## Letture iniziali

| Fonte | Esito | Note |
| --- | --- | --- |
| `README.md` | `PASS` | Stack e limiti progetto confermati. |
| `AGENTS.md` | `PASS` | Lingua italiana, un task attivo, no secret, no PASS inventati. |
| `CLAUDE.md` | `PASS` | `DONE` solo dopo review e conferma esplicita utente. |
| `docs/MASTER-PLAN.md` | `PASS` | TASK-034 riconciliato; TASK-029/031/032/033 restano non chiusi. |
| `docs/TASKS/TASK-034-unified-project-progression.md` | `PASS` | Residuo principale: `BLOCKED_NO_AUTH_SESSION`. |
| `docs/TASKS/EVIDENCE/TASK-034/README.md` | `PASS` | Smoke non-auth conferma guardia Shop Admin. |
| `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md` | `PASS` | Sales sync resta planning-only; non entra in TASK-035. |
| `package.json` | `PASS` | Script futuri disponibili: security, foundation, typecheck, lint, build, verify. |
| `vercel.json` | `PASS` | Vercel Git deploy disabilitato. |

## Letture execution

| Fonte | Esito | Note |
| --- | --- | --- |
| `node_modules/next/dist/docs/01-app/02-guides/authentication.md` | `PASS` | Confermata separazione auth/session/authorization e DAL/server-side authz. |
| `node_modules/next/dist/docs/01-app/02-guides/data-security.md` | `PASS` | Confermato no secret client, server-only e validazione nelle Server Actions/DAL. |
| `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` | `PASS` | Route handlers App Router verificati per import/export. |
| `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` | `PASS` | Boundary server/client confermato. |
| `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` | `PASS` | Proxy usato solo per refresh sessione SSR, non come unico authz. |
| `src/app/shop/layout.tsx` | `PASS` | Layout Shop Admin usa `resolveCurrentShopAdminShellAccess`. |
| `src/server/shop-admin/shop-access.ts` | `PASS` | Accesso da `shop_members` active con ruoli `shop_owner` / `shop_manager`. |
| `src/server/shop-admin/read-model.ts` | `PASS` | `requestedShopId` selezionato solo da `availableShops`. |
| `src/server/shop-admin/action-context.ts` | `PASS` | Server Actions risolvono contesto shop e permesso sul server. |
| `src/app/shop/actions.ts` | `PASS` | Mutazioni Shop Admin server-side; device revoke/reactivate richiedono confirmation. |
| `src/server/shop-admin/device-mutations.ts` | `PASS` | Reason obbligatoria per revoke/reactivate lato server. |
| `src/server/shop-admin/shop-section-data.ts` | `PASS` | Route Shop Admin mappate a read model shop-scoped. |
| `src/components/shop/ShopShell.tsx` | `PASS` | Switcher usa solo shop autorizzati passati dal server. |
| `tests/e2e/platform-admin.spec.ts` | `PASS` | Baseline smoke non-auth route protette. |
| `tests/e2e/platform-admin-live-auth.spec.ts` | `PASS` | Live-auth esistente TASK-014, ma non dedicato a `TASK035_*`. |
| `scripts/pos-local-e2e-harness.mjs` | `PASS_READ_ONLY` | POS harness fuori scope TASK-035. |

## Scope futuro

- Discovery harness auth esistente.
- Strategia auth test sicura.
- Dataset sintetico `TASK035_*`.
- Cleanup verificabile.
- Smoke route Shop Admin autenticate.
- Access guard e no cross-shop leak.
- Device revoke/reactivate con reason obbligatoria.
- No secret/PIN/password/token/hash in UI/log.
- Screenshot/evidence ripetibili.

## Scope execution confermato

- QA autenticata Shop Admin.
- Smoke harness dedicato.
- Dataset sintetico `TASK035_*`.
- Cleanup verificabile nel ramo autenticato.
- Niente Win7POS.
- Niente Vercel live/non-production.
- Niente Supabase production.
- Niente sales sync.
- Nessuna migration, tabella, colonna o policy nuova.

## Route candidate

- `/shop`
- `/shop/products`
- `/shop/categories`
- `/shop/suppliers`
- `/shop/import-export`
- `/shop/members`
- `/shop/roles`
- `/shop/staff`
- `/shop/devices`
- `/shop/audit`
- `/shop/settings`
- `/shop/pos`
- eventuale `/shop/sync`

## Route Shop Admin analizzate

| Route | Presenza repo | Protezione | Note |
| --- | --- | --- | --- |
| `/shop` | `PASS` | `ShopLayout` | Overview entrypoint. |
| `/shop/overview` | `PASS` | `ShopLayout` | Overview esplicita. |
| `/shop/products` | `PASS` | `ShopLayout` + inventory read model | Catalogo prodotti. |
| `/shop/products/[productId]` | `PASS` | `ShopLayout` + mapping inventory | Detail shop-scoped. |
| `/shop/categories` | `PASS` | `ShopLayout` + inventory read model | Catalogo categorie. |
| `/shop/categories/[categoryId]` | `PASS` | `ShopLayout` + mapping inventory | Detail shop-scoped. |
| `/shop/suppliers` | `PASS` | `ShopLayout` + inventory read model | Catalogo fornitori. |
| `/shop/suppliers/[supplierId]` | `PASS` | `ShopLayout` + mapping inventory | Detail shop-scoped. |
| `/shop/import-export` | `PASS` | `ShopLayout` + route handlers server-side | Preview/apply/export/template. |
| `/shop/members` | `PASS` | `ShopLayout` + `shop_members` | Member read/action surface. |
| `/shop/members/[memberId]` | `PASS` | `ShopLayout` + selected shop read model | Detail shop-scoped. |
| `/shop/roles` | `PASS` | `ShopLayout` | Permission matrix static/server-rendered. |
| `/shop/staff` | `PASS` | `ShopLayout` + safe staff view | Credential hashes esclusi. |
| `/shop/staff/[staffId]` | `PASS` | `ShopLayout` + safe staff view | Detail shop-scoped. |
| `/shop/devices` | `PASS` | `ShopLayout` + device read model/actions | Reason required UI/server. |
| `/shop/devices/[deviceId]` | `PASS` | `ShopLayout` + device read model | Detail shop-scoped. |
| `/shop/audit` | `PASS` | `ShopLayout` + redaction | Audit shop-scoped. |
| `/shop/audit/[eventId]` | `PASS` | `ShopLayout` + redaction | Detail shop-scoped. |
| `/shop/settings` | `PASS` | `ShopLayout` | Read-only settings. |
| `/shop/history` | `PASS` | `ShopLayout` + mapping inventory | Mobile history read-only. |
| `/shop/history/[entryId]` | `PASS` | `ShopLayout` + mapping inventory | Detail read-only. |
| `/shop/pos` | `PASS` | `ShopLayout` + POS live read model | Read-only; no sales sync. |
| `/shop/sync` | `PASS` | `ShopLayout` + history read model | Read-only; no sync trigger. |

## Route testate nel smoke eseguito

| Route | Esito | Note |
| --- | --- | --- |
| `/shop` | `PASS_NON_AUTH_GUARD` | `Shop Admin access required` / `No active session`. |
| `/shop/products` | `PASS_NON_AUTH_GUARD` | `Shop Admin access required` / `No active session`. |
| `/shop/import-export` | `PASS_NON_AUTH_GUARD` | `Shop Admin access required` / `No active session`. |
| `/shop/devices` | `PASS_NON_AUTH_GUARD` | `Shop Admin access required` / `No active session`; screenshot salvato. |
| `/shop/pos` | `PASS_NON_AUTH_GUARD` | `Shop Admin access required` / `No active session`. |
| Route autenticate definite dal harness | `PASS_AUTHENTICATED_LOCAL` | Eseguite su Supabase locale/non-production con dataset `TASK035_*` e cleanup zero. |

Screenshot evidence:

- `docs/TASKS/EVIDENCE/TASK-035/browser-shop-devices-auth-required.png` (`1440x900`).

## File toccati TASK-035

| File | Tipo | Note |
| --- | --- | --- |
| `package.json` | `MODIFIED` | Aggiunto `test:shop-admin-auth-smoke`. |
| `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts` | `ADDED` | Harness Playwright TASK-035 local-only. |
| `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs` | `MODIFIED` | Guardrail statico per script/spec harness. |
| `docs/TASKS/TASK-035-authenticated-admin-web-qa-shop-admin-smoke-harness.md` | `MODIFIED` | Stato, execution, blocker, handoff. |
| `docs/TASKS/EVIDENCE/TASK-035/README.md` | `MODIFIED` | Evidence execution. |
| `docs/TASKS/EVIDENCE/TASK-035/browser-shop-devices-auth-required.png` | `ADDED` | Screenshot guardia non-auth. |
| `docs/MASTER-PLAN.md` | `MODIFIED` | Tracking TASK-035 aggiornato. |

## Strategia auth/sessione

Strategia scelta: sessione browser reale solo se Supabase locale e configurata in modo esplicito.

Il nuovo harness usa solo variabili gia previste:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Boundary:

- `SUPABASE_SERVICE_ROLE_KEY` viene usata solo nel processo Playwright/Node per setup/cleanup sintetico.
- Nessuna service-role key viene passata al client/browser.
- La sessione browser viene ottenuta con login email/password normale via `/auth/login`.
- Il ramo autenticato rifiuta target `supabase_cloud` o `custom_remote`.

Classificazione runtime corrente redatta:

| Check | Esito |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `present` |
| Target Supabase | `supabase_cloud` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `present` |
| `SUPABASE_SERVICE_ROLE_KEY` | `missing` |
| `supabase/.temp/project-ref` | `present` |
| REST locale `127.0.0.1:54321/rest/v1/` | `reachable_200` |
| `supabase status -o env` | `failed_no_repo_container` |

Decisione: `BLOCKED_NO_AUTH_SESSION`.

Non e stata usata la Supabase CLI per recuperare API key cloud perche il target non e qualificabile come non-production dal repository. La porta locale `54321` risponde, ma non e stata usata per creare dati perche `supabase status -o env` non riesce a ispezionare lo stack del repo (`supabase_db_merchandise-control-admin-web` assente).

## Dataset TASK035_*

Dataset creato prima del completion gate locale: `NONE`; il dataset autenticato `TASK035_*` e stato poi creato e cancellato nel completion gate 2026-06-03 documentato sopra.

Il ramo autenticato locale del harness creera solo:

- auth user temporaneo `task035-*.example.invalid`;
- `profiles`;
- shop autorizzato `TASK035_SHOP_*`;
- shop non autorizzato `TASK035_BLOCKED_*`;
- membership solo sullo shop autorizzato;
- mapping `shop_inventory_sources`;
- supplier/category/product `TASK035_*`;
- staff row `TASK035_STAFF_*` senza hash/secret hardcoded;
- device row `TASK035_DEVICE_*`;
Non crea audit row sintetiche perche `audit_logs` e append-only; la route `/shop/audit` viene testata autenticata sull'empty state e il cleanup conta comunque eventuali residui audit shop-scoped.

## Cleanup

Cleanup eseguito in questo turno: `PASS_VERIFIED_ZERO_RESIDUALS`.

Cleanup implementato nel ramo autenticato locale:

- cancella audit/device/staff/mapping/membership/shop per gli shop fixture;
- cancella inventory `TASK035_*` per owner sintetico;
- cancella profile e auth user;
- registra `cleanupErrors` per ogni delete e per `auth.admin.deleteUser()`;
- verifica residui su shops/profile/inventory/audit/devices/staff/mapping/membership e richiede `0`;
- fallisce il test se cleanup, delete auth user o verifica residui fallisce.

## Review/fix 2026-06-03

Review readiness eseguita senza dichiarare `DONE`.

Esiti:

- Guardrail statico TASK-035 aggiornato in rosso/verde per richiedere `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `cleanupErrors` e `BLOCKED_TASK035_CLEANUP_FAILED`.
- Harness Playwright aggiornato per classificare `BLOCKED_NO_AUTH_SESSION` anche quando manca la publishable key necessaria a login browser/sessione SSR.
- Cleanup del ramo autenticato rafforzato: non ignora piu errori delle singole delete, conteggia anche righe figlie shop-scoped e richiede `cleanupErrors = []`.
- Probe locali redatti: `.env` continua a puntare a `supabase_cloud`, `SUPABASE_SERVICE_ROLE_KEY` e assente; REST locale `54321` risponde ma lo stack Supabase del repo non risulta ispezionabile (`supabase_db_merchandise-control-admin-web` assente).
- Nessun dataset `TASK035_*` creato nella review; nessun cleanup runtime necessario.

Verdict review/fix: `BLOCKED_NO_AUTH_SESSION`.

## Completion local Supabase gate 2026-06-03

Ambiente usato: Supabase locale/non-production su `127.0.0.1:54321`, con key locali lette solo come env di processo dai container Supabase locali. Nessun valore secret stampato, salvato o scritto in evidence.

Preparazione Supabase locale:

| Check | Esito | Note |
| --- | --- | --- |
| `supabase --version` | `PASS` | `2.104.0`. |
| Container Supabase locali | `PASS_WITH_NOTES` | Stack Docker locale `MerchandiseControlSupabase` attivo. |
| `supabase status -o env` dal repo | `BLOCKED_PROJECT_ID_MISMATCH` | Cerca `supabase_db_merchandise-control-admin-web`; non usato per stampare key. |
| Ispezione DB locale | `PASS` | `supabase_db_MerchandiseControlSupabase` ispezionato via `psql` locale. |
| Migration locali | `PASS_WITH_LOCAL_HISTORY_REPAIR` | History locale riparata da `20260417` a `20260417000000`, poi pending migrations applicate; `schema_migrations_count=32`. |
| Tabelle richieste | `PASS` | Presenti `profiles`, `shops`, `shop_members`, `shop_inventory_sources`, `staff_accounts`, `shop_devices`, `audit_logs`, inventory, `pos_sessions`, `pos_device_credentials`. |

Fix applicati nel turno:

- Staff fixture allineata a schema reale: `status = pending_credential`, `credential_status = pending_setup`.
- Device fixture allineata a schema reale: `device_type = pos`.
- Login Playwright corretto con attesa su `url.pathname === "/shop"` per non matchare `/auth/login?next=/shop`.
- Audit fixture sintetica rimossa: `audit_logs` e append-only; `/shop/audit` resta testata autenticata sull'empty state e il cleanup continua a contare eventuali residui audit.
- Redaction check ristretto a materiale sensibile reale (`*_token`, `*_hash`, JWT, password sintetica fixture e valori env locali in memoria), senza fallire su label UI legittime.

Smoke autenticato:

| Area | Esito |
| --- | --- |
| Guard non-auth `/shop`, `/shop/products`, `/shop/import-export`, `/shop/devices`, `/shop/pos` | `PASS` |
| Login browser email/password con sessione SSR | `PASS` |
| Route autenticate `/shop`, prodotti, categorie, fornitori, import/export, membri, ruoli, staff, devices, audit, settings, POS, sync | `PASS` |
| No cross-shop leak su `TASK035_BLOCKED_*` | `PASS` |
| No secret/token/hash/JWT/password fixture in DOM | `PASS` |
| Cleanup fixture | `PASS` |

Comando:

```bash
npm run test:shop-admin-auth-smoke
```

Risultato verificato: `2 passed`.

Dataset sintetico creato nel test e poi cancellato:

- auth user temporaneo `task035-*.example.invalid`;
- `profiles`;
- shop autorizzato `TASK035_SHOP_*`;
- shop non autorizzato `TASK035_BLOCKED_*`;
- membership owner solo sullo shop autorizzato;
- mapping `shop_inventory_sources`;
- supplier/category/product `TASK035_*`;
- staff `TASK035_STAFF_*`;
- device `TASK035_DEVICE_*`.

Cleanup verificato:

- Test harness: `cleanupErrors = []`, `userDeleted = true`, `residualRows = 0`.
- Probe DB post-smoke: `shops=0`, `profiles=0`, `products=0`, `categories=0`, `suppliers=0`, `staff=0`, `devices=0`, `shop_members=0`, `inventory_sources=0`, `audit=0`, `auth_users=0`.

Screenshot evidence:

- `docs/TASKS/EVIDENCE/TASK-035/browser-shop-devices-auth-required.png`
- `docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png`

Verdict completion: `READY_FOR_DONE_CONFIRMATION`.

## Check review/fix 2026-06-03

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs` | `PASS_AFTER_RED` | Primo run rosso sul guardrail mancante; dopo fix `tests 2`, `pass 2`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 159`, `pass 159`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` e `tsc --noEmit` completati. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Next.js `16.2.6` build completata; warning noto `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passano; warning noto `[DEP0205]`. |
| `npm run test:shop-admin-auth-smoke` | `PASS` | `2 passed`; guardia non-auth e smoke autenticato locale passano con cleanup zero. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git status --short --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Worktree dirty documentato; include solo file TASK-035/evidence modificati in questa completion. |
| `git diff --cached --name-status` | `PASS` | Nessun file staged. |

## Fuori scope confermato

- VM/UTM/Win7 live E2E.
- Sales sync runtime.
- Dashboard vendite fake.
- Vercel Production come staging.
- Vercel Git Integration.
- Nuove migration Supabase non necessarie.
- Login Google/Apple/WeChat.
- Modifiche Android/iOS.
- Dati reali.
- Secret.
- Commit/push/stage fino alla conferma `DONE`; commit e push autorizzati esplicitamente il 2026-06-03.

## Gate futuri

| Gate | Stato apertura | Note |
| --- | --- | --- |
| `npm run security:scan` | `NOT_RUN_PLANNING_ONLY` | Da eseguire in execution/review TASK-035. |
| `npm run test:foundation` | `NOT_RUN_PLANNING_ONLY` | Da eseguire in execution/review TASK-035. |
| `npm run typecheck` | `NOT_RUN_PLANNING_ONLY` | Da eseguire in execution/review TASK-035. |
| `npm run lint` | `NOT_RUN_PLANNING_ONLY` | Da eseguire in execution/review TASK-035. |
| `npm run build` | `NOT_RUN_PLANNING_ONLY` | Da eseguire in execution/review TASK-035. |
| `npm run verify` | `NOT_RUN_PLANNING_ONLY` | Da eseguire in execution/review TASK-035. |
| Smoke UI autenticato | `NOT_RUN_PLANNING_ONLY` | Dipende da harness/sessione sicura. |
| Cleanup dataset sintetico | `NOT_RUN_PLANNING_ONLY` | Nessun dataset creato in planning. |
| `git diff --check` | `NOT_RUN_PLANNING_ONLY` | Da eseguire nei check finali del turno. |

## Check execution TASK-035

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs` | `PASS_AFTER_RED` | Primo run rosso atteso per harness mancante; dopo implementazione `tests 2`, `pass 2`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 159`, `pass 159`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` e `tsc --noEmit` completati. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Next.js `16.2.6` build completata; warning noto `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passano; warning noto `[DEP0205]`. |
| `npm run test:shop-admin-auth-smoke` | `PASS` | `2 passed`; guardia non-auth e smoke autenticato locale passano con cleanup zero. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git status --short --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Worktree dirty documentato; include solo file TASK-035/evidence modificati in questa completion. |
| `git diff --cached --name-status` | `PASS` | Nessun file staged. |

## Check apertura/reconciliation del turno

Questi check sono stati eseguiti per validare la reconciliation TASK-034 e la creazione planning-only TASK-035; non equivalgono allo smoke autenticato TASK-035, che resta futuro.

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 158`, `pass 158`, `fail 0`; include test planning TASK-035. |
| `npm run typecheck` | `PASS` | `next typegen` e `tsc --noEmit` completati. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Build Next.js `16.2.6` passa con solo warning noto `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan` e `build` passano; solo warning noto `[DEP0205]`. |
| `git diff --check` | `PASS` | Nessun whitespace error. |

## Rischi iniziali

- Auth live potrebbe restare `BLOCKED_NO_AUTH_SESSION` se non esiste una sessione test sicura.
- Dataset sintetico richiede cleanup robusto per evitare residui attivi.
- Supabase migration history divergence `20260601160000` resta nota da task precedenti e non deve essere peggiorata.
- Vercel Preview/non-production resta bloccato e fuori scope per TASK-035.

## Rischi residui execution

- Lo stack locale usato e `MerchandiseControlSupabase`; `supabase status` dal repo resta non allineato al `project_id` del config, quindi le key locali sono state passate solo come env di processo e non persistite.
- `audit_logs` resta append-only: il harness non crea audit sintetici per non introdurre righe non ripulibili, ma verifica comunque la route audit autenticata e conteggia eventuali residui audit.
- Supabase migration history divergence remota `20260601160000` resta nota e non e stata toccata.
- Warning `[DEP0205]` resta osservato nei comandi Playwright/build/verify.

## Chiusura DONE 2026-06-03

Conferma esplicita utente ricevuta il 2026-06-03: `Metti in DONE e poi fai commit e push`.

Review finale TASK-035: `DONE_READY`.

Scope finale confermato:

- gate autenticato Shop Admin passato su Supabase locale/non-production;
- dataset sintetico `TASK035_*` creato solo nel test e ripulito;
- probe DB post-smoke a `total_residuals=0`;
- screenshot autenticato utile e senza secret visibili;
- nessuna migration, nuova dipendenza, dato reale, Vercel Production, Android/iOS/POS o sales sync runtime;
- commit e push richiesti dall'utente dopo chiusura a `DONE`.

## Verdict

`DONE`.

TASK-035 e chiuso a `DONE` su conferma esplicita dell'utente dopo review positiva e gate verificati.

## Stato apertura storico

TASK-035 e planning-only. Nessuna implementazione, migration, smoke autenticato, dataset o cleanup runtime e stata eseguita.
