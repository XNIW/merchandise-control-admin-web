# Evidence TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar/diagnostics

## Stato

- Task: `TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar/diagnostics`
- Stato task: `DONE`
- Fase: `DONE`
- Data: `2026-06-11`
- Branch: `main`
- Commit finale: `AUTHORIZED_BY_USER_FINAL_STEP`
- Push finale: `AUTHORIZED_BY_USER_FINAL_STEP`
- Stage finale: `AUTHORIZED_BY_USER_FINAL_STEP`
- Cloud/production apply: `NOT_RUN`
- Migration/schema/RLS apply: `NOT_RUN`
- Verdict corrente: `DONE_WITH_NOTES`

## Letture e riferimenti

- `AGENTS.md`, `CLAUDE.md`, `README.md`: letti.
- `docs/MASTER-PLAN.md`: letto e allineato a TASK-054.
- Task recenti Shop/Admin auth: TASK-052 e TASK-053 letti.
- Next.js 16 local docs letti prima dei cambi framework:
  - `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
  - `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
- File deploy verificati: `package.json`, `wrangler.jsonc`,
  `open-next.config.ts`, `vercel.json`.

## Root cause

- `src/lib/supabase/proxy.ts` usava `auth.getSession()` nel proxy SSR.
- `resolveShopAdminDataAccess()` provava personal account e poi fallback
  staff-web; se il fallback staff falliva per cookie assente, quel motivo
  diventava il messaggio principale anche per il flusso Admin account.
- `src/app/shop/layout.tsx` duplicava logica personal/staff invece di usare il
  resolver dati unico.
- `ShopShell` propagava tutti i search params tra sezioni, quindi filtri di
  una pagina potevano entrare in altre.
- `ShopSectionPage` ripeteva Diagnostics/guardrail condivisi sotto ogni pagina.

## TDD / Regression

### RED

- `node --test tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`
  - Esito iniziale: `FAIL`, 5/5 failure attesi.
  - Failure coperti:
    - proxy senza `auth.getClaims()`;
    - masking personal account -> staff cookie missing;
    - sidebar che clona search params;
    - Diagnostics ancora in `ShopSectionPage`;
    - copy Shop Admin non allineato.

### GREEN

- `node --test tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`
  - Esito finale dopo TASK-054C docs alignment: `PASS`, 6/6.

## File modificati principali

- `src/lib/supabase/proxy.ts`
- `src/server/shop-admin/data-access.ts`
- `src/server/shop-admin/staff-web-auth.ts`
- `src/app/shop/layout.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/components/shop/shopSections.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`
- `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`
- `scripts/security-checks.mjs`

## Check automatici

| Check | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-054-shop-admin-auth-navigation.test.mjs` RED | `FAIL_EXPECTED` | 5/5 failure attesi prima del fix. |
| `node --test tests/foundation/task-054-shop-admin-auth-navigation.test.mjs` GREEN | `PASS` | 6/6 dopo TASK-054C docs alignment. |
| `npm run test:foundation` | `PASS` | 241/241 dopo whitelist TASK-054C. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run lint` | `PASS` | `eslint` senza errori. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build ok; warning Next `middleware` deprecation e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Lint/typecheck/security/build ok; stessi warning build. |
| `npm run test:shop:local` | `BLOCKED_FIRST_RUN` | Primo run bloccato da dev server gia attivo su `localhost:3000` PID `35447`. |
| `PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:shop:local` | `PASS` | 4/4, incluso nuovo flusso TASK-054. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3055 PLAYWRIGHT_REUSE_SERVER=0 npm run test:shop:local -- --project=chromium-desktop -g "TASK-054 preserves"` | `PASS` | 1/1 su host `localhost`, server/env Supabase locale avviati dal runner. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3056 PLAYWRIGHT_REUSE_SERVER=0 npm run test:shop:local -- --project=chromium-desktop -g "TASK-054 preserves"` | `PASS` | 1/1 su host `127.0.0.1`, server/env Supabase locale avviati dal runner. |
| Safari reale via `safaridriver` su `3054` | `PASS_WITH_NOTES` | Login e sidebar flow passati su `localhost` e `127.0.0.1` con fixture Supabase locale sintetica; cleanup `[]`. |
| `npm run cf:build` | `PASS_WITH_WARNINGS` | Exit code 0 e `OpenNext build complete`; warning/error non fatali di copy package. |
| `git diff --check` | `PASS` | Nessun whitespace/conflict marker. |

## Final review correttiva Codex - 2026-06-11

Verdict finale review: `PASS_WITH_NOTES`.

Bug trovato durante la review finale:

- `src/components/shop/shopSections.ts`: `POS Live` aveva ancora una lista
  guardrail custom mentre le altre sezioni usavano `sharedShopGuardrails`.
  Questo lasciava il guardrail POS fuori dalla centralizzazione `Shop safety`.

Fix applicato:

- `POS Live` ora usa `sharedShopGuardrails`.
- `sharedShopGuardrails` include anche: `Credential hashes, PINs, passwords and raw tokens must never be rendered.`
- `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs` verifica la
  centralizzazione e impedisce il ritorno della vecchia stringa custom
  `Token hashes and raw tokens must never be rendered`.

Check freschi eseguiti nella review finale:

| Check | Esito | Note |
| --- | --- | --- |
| `git diff --check` | `PASS` | Nessun output. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `node --test tests/foundation/task-054-shop-admin-auth-navigation.test.mjs` | `PASS` | 6/6 prima dell'aggiornamento documentale finale. |
| `npm run test:foundation` | `PASS` | 241/241 prima dell'aggiornamento documentale finale. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; route types generati. |
| `npm run lint` | `PASS` | `eslint` senza errori. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build ok; warning Next `middleware` deprecation e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Lint/typecheck/security/build ok; stessi warning build. |
| `npm run db:local:status` | `FAIL_CLOSED_ENV_NOTE` | Supabase CLI e container locali ok, ma `.env.local` punta a `supabase_cloud`; lo script local status fallisce chiuso. |
| `npm run db:staging:status` | `BLOCKED_NOT_CONFIGURED` | `BLOCKED_STAGING_SUPABASE_URL_REQUIRED`; nessun target staging autorizzato usato. |
| `npm run test:shop:local` | `BLOCKED_FIRST_RUN` | Playwright non ha avviato un secondo server perche un Next dev server dello stesso repo era gia in ascolto su `127.0.0.1:3000` PID `15861`. |
| `PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:shop:local` | `PASS` | 4/4: guard no-session, Shop Admin authenticated smoke, TASK-054 sidebar navigation, staff-manager/cashier denial; cleanup sintetico a zero. |
| Safari reale via `safaridriver` su `3058` | `PASS` | Rebuild locale con env Supabase CLI, server dedicato `127.0.0.1:3058`, login separati su `localhost` e `127.0.0.1`, flow `Products -> Categories -> Suppliers -> Import / Export -> Staff -> Devices -> Settings -> Overview`, solo `shop_id`, forbidden text assente, cleanup `{ cleanupErrors: [], residualRows: 0, userDeleted: true }`. |
| `npm run cf:build` | `PASS_WITH_WARNINGS` | Exit code 0 e `OpenNext build complete`; warning/error non fatali OpenNext copy package per `compress-commons`, `crc32-stream`, `zip-stream`. |

Note Supabase:

- `npm run db:local:status` legge `.env.local` e quindi segnala mismatch cloud.
- I test locali safe usano invece il wrapper `run-playwright-target.mjs local`,
  che carica `supabase status --output env` e supera i guardrail target locali.
- Nessun target production/cloud e stato usato per creare dati o applicare
  schema.

Note Safari finale:

- Il rerun finale non cancella dati globali Safari.
- Il test usa fixture temporanea `TASK054R_*` e service-role solo nel processo
  Node locale per setup/cleanup; nessun valore secret viene scritto in evidence.
- Evidence JSON aggiornata:
  `docs/TASKS/EVIDENCE/TASK-054/safari-localhost-127-webdriver.json`.

## Final DONE reconciliation - 2026-06-11

Verdict finale: `DONE_WITH_NOTES`.

TASK-054 e stato portato a `DONE` per richiesta esplicita dell'utente. I warning
noti restano non bloccanti perche non rompono build/test/runtime, non espongono
dati o secret e sono documentati:

- Next `middleware` deprecation verso `proxy`;
- Node `[DEP0205] module.register()`;
- OpenNext copy package warning per `compress-commons`, `crc32-stream`,
  `zip-stream`;
- `db:local:status` fail-closed per `.env.local` puntato a `supabase_cloud`,
  mentre i runner E2E locali caricano env Supabase CLI process-only;
- `db:staging:status` non configurato.

Check finali freschi post-riconciliazione:

| Check | Esito | Note |
| --- | --- | --- |
| `git diff --check` | `PASS` | Nessun output. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `node --test tests/foundation/task-054-shop-admin-auth-navigation.test.mjs` | `PASS` | 6/6 post-riconciliazione documentale e tracking. |
| `npm run test:foundation` | `PASS` | 241/241 post-riconciliazione documentale e tracking. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; route types generati. |
| `npm run lint` | `PASS` | `eslint` senza errori. |
| `npm run build` | `PASS_WITH_WARNINGS` | Exit code 0; warning Next `middleware` deprecation e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Exit code 0; lint/typecheck/security/build ok con gli stessi warning build. |
| `PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:shop:local` | `PASS` | 4/4; include guard no-session, smoke autenticato, TASK-054 sidebar navigation, staff-manager/cashier denial e cleanup sintetico a zero. |
| `npm run db:local:status` | `FAIL_CLOSED_ENV_NOTE` | Supabase CLI/container locali ok e output redatto; `.env.local` punta a `supabase_cloud`, quindi lo script local status fallisce chiuso. |
| `npm run db:staging:status` | `BLOCKED_NOT_CONFIGURED` | `BLOCKED_STAGING_SUPABASE_URL_REQUIRED`; nessun target staging/prod usato. |
| Safari reale via `safaridriver` su `3059` | `PASS` | Rebuild locale con env Supabase CLI, server dedicato `127.0.0.1:3059`, fixture temporanea `TASK054D_*`, login separati su `localhost` e `127.0.0.1`, flow `Products -> Categories -> Suppliers -> Import / Export -> Staff -> Devices -> Settings -> Overview`, solo `shop_id`, forbidden text assente, cleanup `{ cleanupErrors: [], residualRows: 0, userDeleted: true }`. |
| `npm run cf:build` | `PASS_WITH_WARNINGS` | Exit code 0 e `OpenNext build complete`; warning/error non fatali OpenNext copy package per `compress-commons`, `crc32-stream`, `zip-stream`. |

Posture finale:

- Commit finale: `AUTHORIZED_BY_USER_FINAL_STEP`.
- Push finale: `AUTHORIZED_BY_USER_FINAL_STEP`.
- Stage finale: `AUTHORIZED_BY_USER_FINAL_STEP`.
- Production/cloud apply: `NOT_RUN`.
- Migration/schema/RLS/RPC apply: `NOT_RUN`.
- Dati reali: `NO`.
- Secret/PIN/password/token in repo/evidence: `NO`.
- Service-role nel browser/client: `NO`.

## TASK-054C - Safari localhost / 127.0.0.1

Contesto: il browser laterale Chromium risultava gia positivo, ma il problema
era stato riportato in Safari reale su `localhost`.

Preflight processi:

- Trovati server Next di questo repo in ascolto su:
  - `127.0.0.1:3000` PID `35447`;
  - `127.0.0.1:3049` PID `87082`;
  - `127.0.0.1:3052` PID `2257`;
  - `127.0.0.1:3053` PID `34482`.
- Fermati solo i processi Next di questo repo.
- Verificato che `3000`, `3001`, `3036` e `3054` fossero libere prima del
  nuovo server.

Host/cookie diagnostics:

- Server pulito avviato su `npm run dev -- --hostname 127.0.0.1 --port 3054`.
- `curl` su `http://localhost:3054/auth/login?next=/shop&mode=admin-account`:
  `200 OK`.
- `curl` su `http://127.0.0.1:3054/auth/login?next=/shop&mode=admin-account`:
  `200 OK`.
- Nessun redirect o link assoluto trovato che converta `localhost` in
  `127.0.0.1` o viceversa; login e callback restano same-origin/relative.
- `localhost` e `127.0.0.1` sono stati trattati come host separati: la prova
  Safari ha eseguito login separato su ciascun host, senza assumere cookie
  condivisi.

Safari reale:

- Safari aperto su
  `http://localhost:3054/auth/login?next=/shop&mode=admin-account`.
- Prima prova Apple Events: bloccata da impostazione Safari.
- Dopo conferma utente dell'abilitazione impostazione:
  - Apple Events: `form-present:http://localhost:3054/...`;
  - `safaridriver` session: `200 OK`, Safari `26.5`.
- Prova end-to-end in Safari reale via `safaridriver`, con Supabase locale e
  account sintetico temporaneo:
  - `localhost:3054`: login account personale, click sidebar `Products`,
    `Import / Export`, `Overview`; ogni URL conserva solo `shop_id`.
  - `127.0.0.1:3054`: stesso flusso con login separato sullo stesso host.
  - Testo proibito assente in entrambi i flussi:
    `Admin Console access required`, `No active session`,
    `No staff web session cookie is present`, `Unauthorized`.
  - Cleanup fixture: `cleanupErrors: []`.

Evidence JSON:

- `docs/TASKS/EVIDENCE/TASK-054/safari-localhost-127-webdriver.json`

Nota diagnostica:

- Un tentativo Playwright contro il server `3054` avviato con `.env.local`
  cloud ha fallito il login sintetico per mismatch ambiente: il test creava
  dati su Supabase locale mentre il server puntava a Supabase cloud. Il run e
  stato classificato come `NOT_A_PRODUCT_FAILURE` e ripetuto correttamente con
  server/env Supabase locale allineati.

## Browser laterale

Target: `http://localhost:3000`.

Scenario verificato:
- Sessione Shop Admin locale gia valida nel browser laterale.
- Apertura `/shop/products` con query rumorose:
  - `query`
  - `category_id`
  - `supplier_id`
  - `status`
  - `event`
  - `target_id`
- Snapshot sidebar: tutti i link generavano URL con solo `shop_id`.
- Click reale `Products -> Categories`.

Esito:
- URL finale: `/shop/categories?shop_id=<redacted>`.
- Search params finali: solo `shop_id`.
- Heading pagina: `Categories`.
- Link `Categories` attivo.
- `No staff web session cookie is present`: assente.
- `Unauthorized`: assente.
- Diagnostics ripetuto sotto pagina: assente.
- Guardrail centralizzati in sidebar: presenti come `Shop safety` /
  `Shared guardrails`.

## Cloudflare / Vercel

- `wrangler.jsonc`: verificato come target Cloudflare/OpenNext.
- `open-next.config.ts`: verificato.
- `npm run cf:build`: `PASS_WITH_WARNINGS`.
- `vercel.json`: mantenuto; Vercel resta parcheggiato con
  `git.deploymentEnabled=false`.
- Deploy production: `NOT_RUN_PRODUCTION_FORBIDDEN`.

## Screenshot evidence

Il run Playwright TASK-035/TASK-054 ha aggiornato screenshot evidence esistenti:

- `docs/TASKS/EVIDENCE/TASK-035/browser-shop-devices-auth-required.png`
- `docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png`

Sono side effect intenzionali del test esistente, non screenshot nuovi specifici
TASK-054.

## Cleanup e sicurezza

- Fixture E2E TASK-035/TASK-054: cleanup verificato dal test con residual rows
  a zero.
- Secret/PIN/password/token in repo/evidence: `NO`.
- Service-role nel browser: `NO`.
- Dati reali hardcoded: `NO`.
- Commit finale: `AUTHORIZED_BY_USER_FINAL_STEP`.
- Push finale: `AUTHORIZED_BY_USER_FINAL_STEP`.
- Stage finale: `AUTHORIZED_BY_USER_FINAL_STEP`.

## Rischi residui

- `cf:build` stampa warning/error non fatali di copy per:
  - `compress-commons`
  - `crc32-stream`
  - `zip-stream`
- Warning build esistenti:
  - Next `middleware` deprecation verso `proxy`;
  - Node `[DEP0205] module.register()`.
- Nessuna verifica staging/production remota eseguita.

TASK-054 e riconciliato a `DONE_RECONCILED` con verdict `DONE_WITH_NOTES`;
non dichiara production-ready.
