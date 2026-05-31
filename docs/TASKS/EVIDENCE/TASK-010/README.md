# Evidence - TASK-010 Shop Read Model Real Data

## Stato

- Task: `TASK-010 - Shop Read Model Real Data`
- Fase: `DONE_RECONCILED`
- Stato corrente: `DONE`
- Data: 2026-05-30
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Sintesi

TASK-010 introduce il primo read model reale per Shop Admin:

- DAL server-only in `src/server/shop-admin/read-model.ts`.
- Query Supabase SSR read-only.
- Selezione shop derivata da `resolveCurrentShopAdminShellAccess`, quindi da membership attive verificate server-side.
- `shop_id` in query string usato solo come stato di navigazione e confrontato con `availableShops`.
- Letture live solo per:
  - overview shop;
  - membri shop;
  - audit log shop-scoped.
- Altre sezioni Shop Admin lasciate placeholder dichiarati.

## TDD evidence

- RED:
  - Comando: `node --test tests/foundation/shop-read-model.test.mjs`
  - Risultato: `FAIL`, 0 pass / 4 fail.
  - Motivo atteso: mancavano `src/server/shop-admin/read-model.ts`, `src/server/shop-admin/shop-section-data.ts` e il gate security TASK-010.
- GREEN:
  - Comando: `node --test tests/foundation/shop-read-model.test.mjs`
  - Risultato: `PASS`, 4 test passati / 0 falliti.

## Fix durante execution e review finale

- `npm run typecheck` ha inizialmente fallito per mapper TypeScript tipizzati su righe complete mentre le query selezionavano DTO parziali.
- Fix: mapper aggiornati con `Pick<...>` dei soli campi realmente selezionati, senza allargare le query.
- Re-run: `npm run typecheck` `PASS`.
- `npm run test:foundation` ha inizialmente fallito per un test TASK-008 che assumeva pagine Shop Admin tutte placeholder statiche.
- Fix: test aggiornato per distinguere overview/members/audit live da sezioni rimaste placeholder.
- Re-run: `npm run test:foundation` `PASS`, 36 test passati / 0 falliti.
- Review finale:
  - Fix UI copy: rimossi riferimenti a task/milestone dalla UI Shop Admin e sostituiti con copy prodotto.
  - Fix stabilita React: aggiunto `rowKey` esplicito alle righe tabellari live.
  - Harness rafforzato per impedire task id in UI live, import server/Supabase nei client component, query non filtrate per `selectedShop.shopId`, `shop_id` query param come autorizzazione e dati finti presentati come live.
  - RED mirato: `node --test tests/foundation/shop-read-model.test.mjs tests/foundation/shop-admin-shell.test.mjs` fallito prima del fix copy/gate.
  - GREEN mirato: stesso comando `PASS`, 7 test passati / 0 falliti.

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-010-shop-read-model-real-data.md`
- `docs/TASKS/EVIDENCE/TASK-010/README.md`
- `src/server/shop-admin/read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/app/shop/page.tsx`
- `src/app/shop/overview/page.tsx`
- `src/app/shop/members/page.tsx`
- `src/app/shop/audit/page.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/components/shop/shopSections.ts`
- `scripts/security-checks.mjs`
- `tests/foundation/shop-admin-shell.test.mjs`
- `tests/foundation/shop-read-model.test.mjs`

## Dati reali mostrati

| Pagina | Dati live | Fonte |
| --- | --- | --- |
| `/shop`, `/shop/overview` | shop name, code, status, ruolo corrente, timestamp shop | `shops` filtrata con `shop_id = selectedShop.shopId` |
| `/shop/members` | profilo abbreviato, ruolo, stato membership, timestamp | `shop_members` filtrata con `shop_id = selectedShop.shopId` |
| `/shop/audit` | event key, attore abbreviato, severity, result, target, timestamp | `audit_logs` filtrata con `shop_id = selectedShop.shopId` e `scope = 'shop'` |

## Placeholder dichiarati

- `/shop/products`
- `/shop/categories`
- `/shop/suppliers`
- `/shop/import-export`
- `/shop/roles`
- `/shop/staff`
- `/shop/devices`
- `/shop/settings`

Motivo: schema business non verificato nello scope TASK-010.

## Check completi

| Comando | Risultato | Evidence sintetica |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Modifiche attese TASK-010; nessun commit. Include file modificati e nuovi file task/read-model/test/evidence. |
| `git diff --stat` | `PASS_WITH_NOTES` | 11 file tracciati modificati, 354 insertions / 51 deletions; i file nuovi non tracciati sono elencati separatamente da `git status --short`. |
| `git diff --check` | `PASS` | Exit code 0, nessun whitespace error. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; exit code 0 dopo fix mapper DTO parziali. |
| `npm run lint` | `PASS` | `eslint`; exit code 0. |
| `npm run test:foundation` | `PASS` | 36 test passati / 0 falliti. |
| `npm run security:scan` | `PASS` | Output `Security scan passed.` |
| `npm run build` | `PASS_WITH_WARNINGS` | Build Next completata; route `/shop`, `/shop/overview`, `/shop/members`, `/shop/audit` dynamic. Warning non bloccante Node `DEP0205`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint, typecheck, security scan e build completati; stesso warning non bloccante Node `DEP0205`. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | 44 test passati / 0 falliti. Warning non bloccanti: `DEP0205`, `NO_COLOR` ignorato con `FORCE_COLOR`, e avviso dev server su HMR cross-origin `127.0.0.1`. |

## Supabase/live checks

- `supabase --version`: `PASS`, CLI `2.102.0`.
- `supabase --help`, `supabase migration list --help`, `supabase db push --help`, `supabase db lint --help`, `supabase db advisors --help`: `PASS`, flag richiesti disponibili.
- `supabase migration list --linked`: `PASS`, local/remoto allineati fino a `20260530120000`.
- `supabase db push --linked --dry-run`: `PASS`, remote database up to date.
- `supabase db lint --linked --schema public,app_private --level error --fail-on error`: `PASS`, no schema errors.
- Primo `supabase db advisors --linked --type security --level error --fail-on error`: `BLOCKED_WITH_REASON`, autenticazione temporanea CLI fallita e circuit breaker Supabase ha richiesto `SUPABASE_DB_PASSWORD`.
- Re-run `supabase db advisors --linked --type security --level error --fail-on error` con password database fornita dall'utente solo come variabile di processo: `PASS`, output `No issues found`. La password non e stata salvata, stampata o scritta nei file.
- Query live dirette TASK-010 con fixture `shop_owner` / `shop_manager`: `NOT_RUN`. Motivo: non esiste fixture sicura dedicata nel repo e TASK-010 non deve inventare utenti/seeds.
- Browser live autenticato come Shop Admin: `NOT_RUN`, stesso motivo.
- Local smoke non autenticato: `PASS_WITH_WARNINGS`, 44 test passati.

## Review sicurezza Supabase

- RLS e grant rilevanti sono gia presenti in `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql`:
  - RLS abilitata su `shops`, `shop_members`, `audit_logs`;
  - policy select shop member/platform admin;
  - `anon` revocato;
  - `authenticated` ha solo `select` sulle tabelle rilevanti.
- TASK-010 non aggiunge migration, policy, grant o schema.
- TASK-010 non richiede service-role.
- `audit_logs` viene solo letto e filtrato per `shop_id` + `scope = 'shop'`.
- Nessun errore DB grezzo viene mostrato in UI: gli errori sono redatti nel read model.

## UI/UX/accessibilita/performance

- `/shop`, `/shop/overview`, `/shop/members`, `/shop/audit` hanno pagine dynamic e caricano sezioni via read model server-only.
- Le sezioni live mostrano titolo `Live shop data`, descrizione read-only e empty state dichiarati.
- Le sezioni non verificate restano placeholder dichiarati.
- Tabelle accessibili con header e `scope="col"`, overflow orizzontale e identificatori sensibili abbreviati.
- Query limitate e sequenziali: shop singolo, members `limit(100)`, audit `limit(25)` ordinato per `created_at desc`.
- Nessun N+1 introdotto.

## Piattaforme fuori scope

- iOS build: `NOT_APPLICABLE / NOT_RUN`, TASK-010 riguarda solo Admin Web.
- Android build: `NOT_APPLICABLE / NOT_RUN`, TASK-010 riguarda solo Admin Web.
- POS/Win7/Cash Register: `NOT_APPLICABLE / NOT_RUN`.

## Cleanup

- Nessun dato test creato da TASK-010.
- Nessun cleanup richiesto.
- Nessun audit log cancellato.
- Nessun hard delete.

## Rischi residui

- Nessun test live con utente reale shop admin.
- Members non mostra `profiles.display_name`, per evitare query profili non shop-scoped nello scope TASK-010.
- Audit puo essere vuoto per shop senza eventi; empty state reale.
- Nessuna persistenza della selezione shop oltre URL/query string.

## Handoff

- Stato finale: `DONE_RECONCILED`.
- Commit: `NOT_CREATED`.
- Push: `NOT_RUN`.
- Prossimo passo: pianificare `TASK-011` separato, probabilmente Shop Members / Permissions oppure Shop Products Read Model, da decidere dopo commit/push di questa tranche.
