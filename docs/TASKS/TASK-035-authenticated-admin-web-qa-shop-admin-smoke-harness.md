# TASK-035 - Authenticated Admin Web QA + Shop Admin smoke harness

## Informazioni generali

- ID: `TASK-035`
- Titolo: `Authenticated Admin Web QA + Shop Admin smoke harness`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Milestone interna: `AUTH_HARNESS_ADDED_BLOCKED_NO_AUTH_SESSION`
- Responsabile attuale: `USER_REVIEW`
- Data apertura: `2026-06-02`
- Branch Admin Web: `main`
- Evidence: `docs/TASKS/EVIDENCE/TASK-035/README.md`
- Stage: `NOT_STAGED`
- Commit: `NOT_COMMITTED`
- Push: `NOT_PUSHED`
- Verdict corrente: `BLOCKED_NO_AUTH_SESSION`

## Scopo

Sbloccare il residuo `BLOCKED_NO_AUTH_SESSION` creando o rafforzando un harness QA autenticato per Admin Web, con dati sintetici e cleanup, per testare le route principali Shop Admin senza dipendere da VM Win7.

## Obiettivi

- Creare o consolidare un flusso QA autenticato per Admin Web.
- Usare dataset sintetico con prefisso `TASK035_*`.
- Garantire cleanup verificabile.
- Testare le route principali Shop Admin.
- Verificare Shop Admin access guard.
- Verificare catalogo, import/export, staff, devices, audit e POS read-only dove possibile.
- Verificare reason obbligatoria per device revoke/reactivate.
- Verificare assenza di cross-shop leak.
- Verificare assenza di secret, PIN, password, token o hash in UI/log.
- Produrre screenshot/evidence ripetibili.

## Include

- Discovery harness auth esistente.
- Scelta della strategia auth test piu sicura.
- Dataset sintetico `TASK035_*`.
- Cleanup verificabile.
- Playwright o harness equivalente se gia presente.
- Smoke route Shop Admin autenticate.
- Fallback chiaro se auth live non e disponibile.
- Evidence screenshot/log.
- Aggiornamento test foundation/security se necessario.

## Non include

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
- Commit/push/stage.

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

## Gate futuri richiesti

- `npm run security:scan`
- `npm run test:foundation`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify`
- Smoke UI autenticato se harness disponibile.
- Cleanup dataset sintetico.
- `git diff --check`

## Execution TASK-035 - 2026-06-02

### Scope confermato

- QA autenticata Shop Admin.
- Harness smoke Playwright dedicato.
- Dataset sintetico con prefisso `TASK035_*`.
- Cleanup verificabile nel ramo autenticato.
- Nessun Win7POS.
- Nessun Vercel live/non-production.
- Nessun Supabase production.
- Nessun sales sync runtime.
- Nessuna migration, tabella, colonna o policy nuova.

### Discovery repo-grounded

- Route Shop Admin presenti:
  - `/shop`
  - `/shop/overview`
  - `/shop/products`
  - `/shop/products/[productId]`
  - `/shop/categories`
  - `/shop/categories/[categoryId]`
  - `/shop/suppliers`
  - `/shop/suppliers/[supplierId]`
  - `/shop/import-export`
  - `/shop/members`
  - `/shop/members/[memberId]`
  - `/shop/roles`
  - `/shop/staff`
  - `/shop/staff/[staffId]`
  - `/shop/devices`
  - `/shop/devices/[deviceId]`
  - `/shop/audit`
  - `/shop/audit/[eventId]`
  - `/shop/settings`
  - `/shop/history`
  - `/shop/history/[entryId]`
  - `/shop/pos`
  - `/shop/sync`
- Protezione Shop Admin:
  - `src/app/shop/layout.tsx` usa `resolveCurrentShopAdminShellAccess()`.
  - `src/server/shop-admin/shop-access.ts` autorizza solo `shop_owner` / `shop_manager` da `shop_members`, non da metadata auth.
  - `src/server/shop-admin/read-model.ts` seleziona `requestedShopId` solo tra `access.availableShops`.
  - `src/server/shop-admin/action-context.ts` risolve azioni tramite sessione SSR e membership autorizzata.
- Harness esistenti:
  - `tests/e2e/platform-admin.spec.ts` copre guardie non-auth.
  - `tests/e2e/platform-admin-live-auth.spec.ts` contiene un precedente live-auth TASK-014 gated e service-role solo Node-side.
  - `scripts/pos-local-e2e-harness.mjs` e fuori scope perche POS/Win7POS.
- Guide Next.js locali lette prima del codice:
  - `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`

### Implementazione

- Aggiunto `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`.
- Aggiunto script `npm run test:shop-admin-auth-smoke`.
- Rafforzato `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs`.

Il nuovo harness:

- conferma sempre la guardia non-auth su `/shop`, `/shop/products`, `/shop/import-export`, `/shop/devices`, `/shop/pos`;
- salva screenshot evidence non-auth in `docs/TASKS/EVIDENCE/TASK-035/browser-shop-devices-auth-required.png`;
- consente il ramo autenticato solo con Supabase locale, usando le variabili gia previste `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY`;
- rifiuta target cloud/remoti per non rischiare Supabase production;
- nel ramo autenticato locale crea solo dati `TASK035_*`, testa route Shop Admin, verifica no cross-shop leak e cancella/verifica residui.
- review/fix 2026-06-03: il ramo autenticato ora richiede esplicitamente anche `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e il cleanup registra errori per ogni delete/auth delete oltre a contare residui.

### Sessione auth e dataset

Nel runtime corrente non e stata ottenuta una sessione auth test sicura.

Classificazione redatta ambiente:

- `NEXT_PUBLIC_SUPABASE_URL`: presente.
- Target Supabase: `supabase_cloud`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: presente.
- `SUPABASE_SERVICE_ROLE_KEY`: mancante in env locale.
- `supabase/.temp/project-ref`: presente.
- `http://127.0.0.1:54321/rest/v1/`: raggiungibile con status `200`, ma non qualificato come stack locale di questo repo.
- `supabase status -o env`: `failed`, con `No such container: supabase_db_merchandise-control-admin-web`.

Decisione: il ramo autenticato TASK-035 e stato bloccato perche il target configurato e cloud/remoto e non e qualificabile come non-production dal repository. La porta Supabase locale raggiungibile non e stata usata perche lo stack locale del repo non risulta avviato/ispezionabile. Non e stata usata la Supabase CLI per recuperare una service-role key cloud. Nessun dataset `TASK035_*` e stato creato in questo turno; di conseguenza non c'erano dati runtime da pulire.

### Smoke eseguito

Comando:

```bash
npm run test:shop-admin-auth-smoke
```

Risultato:

- `PASS`: guardia non-auth Shop Admin su `/shop`, `/shop/products`, `/shop/import-export`, `/shop/devices`, `/shop/pos`.
- `SKIPPED/BLOCKED_NO_AUTH_SESSION`: smoke autenticato locale, per target Supabase `supabase_cloud`.
- Output sintetico: `1 passed`, `1 skipped`.
- Warning osservati: `[DEP0205]` noto e warning Node `NO_COLOR`/`FORCE_COLOR`.

### Dataset e cleanup

- Dataset creato: `NONE`.
- Prefisso consentito dal harness: `TASK035_*`.
- Cleanup eseguito: `NOT_RUN_NO_DATASET_CREATED`.
- Cleanup verificabile: implementato nel ramo locale autenticato; registra errori di cleanup, cancella le righe figlie shop-scoped e conteggia residui `TASK035_*` su shops/profile/inventory/audit/devices/staff/mapping/membership dopo cancellazione, richiedendo `0`.

### Review/fix TASK-035 - 2026-06-03

Review repo-grounded eseguita sull'harness e sulla strategia auth.

Fix applicati:

- `resolveRuntime()` ora richiede anche `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` prima di considerare eseguibile il ramo autenticato, perche login browser e sessione SSR dipendono da quella env pubblica gia prevista.
- `fixture.cleanup()` ora registra `cleanupErrors` per ogni delete e per `auth.admin.deleteUser()`.
- `countTask035ResidualRows()` ora fallisce su errori di count e include anche residui shop-scoped su audit, devices, staff, mapping e membership.
- I test finali del ramo autenticato richiedono `cleanupErrors = []`, `userDeleted = true` e `residualRows = 0`.

Probe sicuri 2026-06-03:

- Env runtime redatta: target `supabase_cloud`, publishable key presente, service-role key mancante.
- REST locale `127.0.0.1:54321` raggiungibile, ma `supabase status -o env` fallisce per container repo mancante; non viene quindi usato per creare dati.

Verdict dopo review/fix: `BLOCKED_NO_AUTH_SESSION`.

### Check review/fix TASK-035 - 2026-06-03

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs` | `PASS_AFTER_RED` | Primo run rosso sul guardrail mancante; dopo fix `tests 2`, `pass 2`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 159`, `pass 159`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` e `tsc --noEmit` completati. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Build Next.js `16.2.6` completata; warning noto `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passano; warning noto `[DEP0205]`. |
| `npm run test:shop-admin-auth-smoke` | `PASS_WITH_BLOCKED_AUTH` | `1 passed`, `1 skipped`; guardia non-auth PASS, autenticato SKIPPED per `BLOCKED_NO_AUTH_SESSION`. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git status --short --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Worktree dirty documentato; nessun revert. |
| `git diff --cached --name-status` | `PASS` | Nessun file staged. |

### Verdict execution

`BLOCKED_NO_AUTH_SESSION`.

Motivo: harness TASK-035 e disponibile e il smoke non-auth passa, ma il runtime corrente non offre una sessione test sicura per smoke autenticato senza rischio di toccare un target Supabase cloud/non qualificato.

### Check finali execution

| Comando | Esito | Note |
| --- | --- | --- |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 159`, `pass 159`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` e `tsc --noEmit` completati. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Solo warning noto `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | Solo warning noto `[DEP0205]`. |
| `npm run test:shop-admin-auth-smoke` | `PASS_WITH_BLOCKED_AUTH` | `1 passed`, `1 skipped`; autenticato bloccato. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git status --short --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Worktree dirty documentato, nessun revert. |
| `git diff --cached --name-status` | `PASS` | Nessun file staged. |

## Strategia planning iniziale

1. Fare discovery dei test e harness auth esistenti, inclusi Playwright live-auth, smoke UI e POS/local harness.
2. Scegliere la strategia piu sicura per ottenere una sessione autenticata senza salvare secret o dati reali.
3. Preparare dataset sintetico `TASK035_*` shop-scoped con owner/manager/viewer/staff/device/catalogo minimo.
4. Eseguire smoke Shop Admin autenticato sulle route candidate.
5. Verificare guardia accesso, no cross-shop leak, reason obbligatoria device e redaction UI/log.
6. Pulire il dataset sintetico e verificare zero residui attivi.
7. Salvare screenshot/log redatti in `docs/TASKS/EVIDENCE/TASK-035/`.

## Fallback se auth live non e disponibile

Se una sessione autenticata sicura non e disponibile, il task deve:

- classificare il gate UI come `BLOCKED_NO_AUTH_SESSION`;
- eseguire solo smoke non-auth per confermare access guard;
- non dichiarare PASS visuale autenticato;
- non creare dati reali o fixture persistenti fragili;
- lasciare evidence ripetibile del blocker.

## Verdict futuri ammessi

- `READY_FOR_EXECUTION_WITH_NOTES`
- `REVIEW`
- `PASS_WITH_NOTES_READY_FOR_REVIEW`
- `BLOCKED_NO_AUTH_SESSION`
- `READY_FOR_DONE_CONFIRMATION`

`DONE` non e ammesso senza conferma esplicita dell'utente.

## Stato apertura

TASK-035 e aperto solo come planning/skeleton. Nessuna implementazione runtime, migration, smoke autenticato o cleanup dataset e stata eseguita in questa apertura.

## Handoff verso REVIEW

TASK-035 e pronto per review con verdict `BLOCKED_NO_AUTH_SESSION`.

Non e `DONE` e non e production-ready: serve una configurazione Supabase locale/non-production esplicitamente sicura prima di eseguire il ramo autenticato con dataset `TASK035_*` e cleanup verificato.
