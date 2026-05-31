# TASK-010 - Shop Read Model Real Data

## Informazioni generali

- ID: `TASK-010`
- Titolo: Shop Read Model Real Data
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / REVIEW`
- Data apertura: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-010/README.md`
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Scopo

Mostrare nella Shop Admin Console il primo read model reale, autorizzato e shop-scoped per il negozio selezionato, senza CRUD e senza dati finti.

## Non scope

- Nessun CRUD.
- Nessuna migration Supabase.
- Nessuna nuova dipendenza.
- Nessun prodotto/categoria/fornitore reale finche lo schema business non viene verificato.
- Nessun import/export Excel.
- Nessun POS staff, PIN/password o dispositivo reale.
- Nessun service-role key nel client/browser.
- Nessun uso di `user_metadata` o `raw_user_meta_data` per autorizzazione.
- Nessun commit o push.

## Letture obbligatorie completate

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-007-auth-routing-route-protection.md`
- `docs/TASKS/TASK-008-shop-admin-console-shell.md`
- `docs/TASKS/TASK-009-shop-switcher.md`
- `docs/TASKS/EVIDENCE/TASK-009/README.md`
- `src/server/auth/admin-routing.ts`
- `src/server/shop-admin/shop-access.ts`
- `src/app/shop/layout.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/components/shop/shopSections.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql`
- `supabase/migrations/20260530120000_task_006_platform_admin_controlled_actions.sql`
- Next.js locale:
  - `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`

## Piano execution

1. Creare test RED per read model e security gate TASK-010.
2. Implementare `src/server/shop-admin/read-model.ts` come DAL `server-only`.
3. Selezionare il negozio solo dalla lista `availableShops` gia verificata server-side.
4. Leggere `shops`, `shop_members` e `audit_logs` con filtro obbligatorio `shop_id = selectedShop.shopId`.
5. Collegare `/shop`, `/shop/overview`, `/shop/members` e `/shop/audit` a sezioni server-rendered.
6. Lasciare prodotti/categorie/fornitori/import-export/ruoli/staff/devices/settings come placeholder dichiarati.
7. Aggiornare foundation/security/smoke se necessario.
8. Eseguire check reali e aggiornare evidence.

## Criteri di accettazione

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | Read model server-only usa solo Supabase server-side | `PASS` |
| CA-02 | Shop selezionato deriva da membership verificata server-side | `PASS` |
| CA-03 | `shop_id` query param non e fonte di autorizzazione | `PASS` |
| CA-04 | Query `shops`, `shop_members`, `audit_logs` filtrano per `shop_id` | `PASS` |
| CA-05 | Stati `not_configured`, `unauthorized`, `empty`, `error` gestiti | `PASS` |
| CA-06 | Overview mostra dati reali base del negozio selezionato | `PASS` |
| CA-07 | Members mostra righe reali `shop_members` se disponibili | `PASS` |
| CA-08 | Audit mostra ultimi `audit_logs` shop-scoped se disponibili | `PASS` |
| CA-09 | Altre sezioni restano placeholder dichiarati | `PASS` |
| CA-10 | Nessun service-role client/browser, nessun auth metadata per authz | `PASS` |
| CA-11 | Check richiesti eseguiti con evidence reale | `PASS` |

## Implementazione

- Creato `src/server/shop-admin/read-model.ts`.
- Creato `src/server/shop-admin/shop-section-data.ts`.
- Esteso `ShopSectionPage` per renderizzare una tabella live o uno stato empty dichiarato.
- Esteso `shopSections.ts` con tipi opzionali per live data senza cambiare le sezioni placeholder.
- Aggiornate le pagine:
  - `/shop`
  - `/shop/overview`
  - `/shop/members`
  - `/shop/audit`
- Aggiornata `ShopShell` per indicare lo stato read-only invece di shell-only.
- Aggiornati harness:
  - `tests/foundation/shop-read-model.test.mjs`
  - `tests/foundation/shop-admin-shell.test.mjs`
  - `scripts/security-checks.mjs`

## Dati reali mostrati

- Overview:
  - `shop_name`
  - `shop_code`
  - `shop_status`
  - ruolo corrente verificato (`shop_owner` / `shop_manager`)
  - timestamp reali del negozio (`created_at`, `updated_at`, `status_changed_at`)
- Members:
  - righe `shop_members` filtrate per il negozio selezionato;
  - `profile_id` abbreviato;
  - `role_key`;
  - `membership_status`;
  - timestamp reali membership.
- Audit:
  - ultimi eventi `audit_logs` con `scope = 'shop'`;
  - filtro `shop_id`;
  - event key, attore abbreviato, severity, result, target e timestamp.

## Dati lasciati placeholder

- Products.
- Categories.
- Suppliers.
- Import / Export.
- Roles.
- POS / Staff.
- Devices.
- Settings.

Motivo: lo schema business reale per queste aree non e stato verificato nello scope TASK-010.

## Evidence check

Vedi `docs/TASKS/EVIDENCE/TASK-010/README.md`.

## Review finale / DONE reconciliation

- Data review: 2026-05-30
- Verdict finale: `DONE_RECONCILED`
- Stato finale: `DONE`
- Esito: `PASS_WITH_NOTES` non bloccanti.

### Fix applicati durante la review

- Rimossa dalla UI Shop Admin la copia interna legata a task/milestone (`TASK-008`, `TASK-010`, "server-only read model") e sostituita con testo prodotto leggibile.
- Aggiunta `rowKey` stabile alle righe tabellari live per evitare key derivate da valori visualizzati.
- Rafforzati `tests/foundation/shop-read-model.test.mjs`, `tests/foundation/shop-admin-shell.test.mjs` e `scripts/security-checks.mjs` per bloccare:
  - import server/Supabase nei componenti client;
  - uso autorizzativo diretto del query param `shop_id`;
  - query non filtrate per `selectedShop.shopId`;
  - task id o dati finti nella copia live Shop Admin.

### Review codice e sicurezza

- `src/server/shop-admin/read-model.ts` resta `server-only` e usa solo Supabase SSR.
- Il negozio corrente deriva da `resolveCurrentShopAdminShellAccess`, quindi da membership attive verificate server-side.
- `shop_id` in query string resta solo stato di navigazione: viene accettato solo se presente in `availableShops`.
- Le query live filtrano sempre con `selectedShop.shopId`.
- `audit_logs` aggiunge anche `scope = 'shop'`.
- Nessuna query `.select("*")`, nessun CRUD, nessuna Server Action mutativa, nessuna RPC nuova.
- Nessun `user_metadata` / `raw_user_meta_data` per autorizzazione.
- Nessun service-role nel client/browser e nessun secret introdotto.
- I profili membro non vengono joinati: la UI mostra `profile_id` abbreviato per evitare query profilo non shop-scoped nello scope corrente.

### Review UI/UX/accessibilita/performance

- `/shop` e `/shop/overview` mostrano overview reale del negozio selezionato o empty/error state dichiarati.
- `/shop/members` mostra membri reali filtrati per shop o empty state dichiarato.
- `/shop/audit` mostra audit reali shop-scoped o empty state dichiarato.
- Products, categories, suppliers, import/export, roles, POS/staff, devices e settings restano placeholder dichiarati.
- Tabelle con header semantici, `scope="col"`, overflow orizzontale e contenuto abbreviato dove utile.
- Query limitate: membership `limit(100)`, audit `limit(25)`, shop singolo con `maybeSingle()`.
- Nessuna N+1 evidente e nessun fetch globale business shop-scoped.

### Check finali

La matrice completa e in `docs/TASKS/EVIDENCE/TASK-010/README.md`.

- `git diff --check`: `PASS`.
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`.
- `npm run test:foundation`: `PASS`, 36 test.
- `npm run security:scan`: `PASS`.
- `npm run build`: `PASS_WITH_WARNINGS`, warning Node `DEP0205` non bloccante.
- `npm run verify`: `PASS_WITH_WARNINGS`, stesso warning non bloccante.
- `npm run test:ui-smoke`: `PASS_WITH_WARNINGS`, 44 test, warning non bloccanti.

### Supabase e live browser

- `supabase migration list --linked`: `PASS`, local/remoto allineati fino a `20260530120000`.
- `supabase db push --linked --dry-run`: `PASS`, remote database up to date.
- `supabase db lint --linked --schema public,app_private --level error --fail-on error`: `PASS`, no schema errors.
- `supabase db advisors --linked --type security --level error --fail-on error`: `PASS`, no issues found. La password database fornita dall'utente e stata usata solo come variabile di processo, senza salvarla o stamparla.
- Browser live autenticato come `shop_owner` / `shop_manager`: `NOT_RUN`, non esiste ancora una fixture sicura dedicata nel repo.
- Query live dirette TASK-010 con fixture shop admin: `NOT_RUN`, stesso motivo.

### Cleanup e piattaforme fuori scope

- Nessun dato test creato da TASK-010, quindi nessun cleanup necessario.
- Nessun audit log cancellato.
- Nessun hard delete.
- iOS build: `NOT_APPLICABLE / NOT_RUN`, TASK-010 riguarda solo Admin Web.
- Android build: `NOT_APPLICABLE / NOT_RUN`, TASK-010 riguarda solo Admin Web.
- POS/Win7/Cash Register: `NOT_APPLICABLE / NOT_RUN`.

## Rischi residui

- Nessun test browser live con vero utente `shop_owner` / `shop_manager`; richiede fixture Supabase sicura dedicata.
- I nomi profilo dei membri non vengono mostrati: TASK-010 evita una query non shop-scoped a `profiles` e mostra identificatori abbreviati.
- Audit puo essere vuoto anche con shop valido; viene trattato come empty state reale.
- La selezione resta URL/query-param e non viene persistita in cookie o database.

## Handoff finale

TASK-010 e stato riconciliato a `DONE_RECONCILED` su autorizzazione esplicita dell'utente nel prompt di review finale. Nessun commit e nessun push eseguiti. Il prossimo passo deve essere un task separato, non aperto qui: `TASK-011`, da decidere tra Shop Members / Permissions oppure Shop Products Read Model.
