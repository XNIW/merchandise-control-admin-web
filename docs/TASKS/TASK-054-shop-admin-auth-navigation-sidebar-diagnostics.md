# TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar/diagnostics

## Informazioni generali

- ID: `TASK-054`
- Titolo: `Stabilizzare Shop Admin auth navigation e ripulire sidebar/diagnostics`
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-11`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-054/README.md`

## Contesto

Nella Shop Admin Console l'account personale shop owner/manager poteva vedere
Overview corretta e poi, dopo navigazione tra sezioni, pagine come Products,
Categories, Suppliers, Staff, Devices o Audit potevano mostrare `Unauthorized`
e il motivo staff-web `No staff web session cookie is present.`.

Il problema non era una revoca reale del personal account. La risoluzione
Shop Admin mascherava failure/no-session del flusso account personale con il
fallback staff-web quando non era presente il cookie staff. In parallelo, la
sidebar Shop preservava tutti i query param tra sezioni, contaminando pagine
diverse con filtri non pertinenti, e ripeteva Diagnostics/guardrail sotto ogni
pagina.

## Scopo

- Stabilizzare la navigazione Shop Admin per account personali autenticati.
- Evitare che il fallback staff-web diventi il motivo primario per un flusso
  Admin account.
- Usare una validazione sessione server-side piu sicura nel proxy Supabase.
- Mantenere `shop_id` come navigation hint verificato server-side, senza
  propagare filtri pagina-specifici tra sezioni.
- Rendere la sidebar Shop piu compatta e vicina alla qualita della Master
  Console.
- Centralizzare i guardrail condivisi nella sidebar, rimuovendo Diagnostics
  ripetuti sotto ogni pagina.
- Aggiornare copy e stati UI per Excel live, roles baseline, POS Staff,
  mapping inventory e settings fiscal/boleta.
- Aggiungere test foundation/E2E che impediscano regressioni.
- Verificare esplicitamente il follow-up `TASK-054C` su Safari reale per
  `localhost` e `127.0.0.1`.

## Implementazione

- `src/lib/supabase/proxy.ts`
  - `supabase.auth.getSession()` sostituito con `supabase.auth.getClaims()`.
  - Sincronizzazione cookies request/response preservata.
- `src/server/shop-admin/data-access.ts`
  - Aggiunta cache request-scoped tramite `react/cache`.
  - Conservato il blocked access del personal account quando il fallback staff
    fallisce solo per cookie staff mancante.
  - Personal account valido continua a vincere sul fallback staff.
  - `strictRequestedShop` continua a fallire chiuso su shop non autorizzati.
- `src/server/shop-admin/staff-web-auth.ts`
  - Estratta costante `STAFF_WEB_SESSION_MISSING_REASON`.
- `src/app/shop/layout.tsx`
  - Layout Shop collegato a `resolveShopAdminDataAccess()`.
- `src/components/shop/ShopShell.tsx`
  - Active state ottimistico durante click/navigazione.
  - Link sidebar e cambio shop preservano solo `shop_id`.
  - Guardrail condivisi centralizzati nel box `Shop safety`.
- `src/components/shop/ShopSectionPage.tsx`
  - Rimosso il blocco Diagnostics per pagina.
- `src/components/shop/shopSections.ts`
  - `sharedShopGuardrails` esportato per il render centralizzato.
  - Copy aggiornato per Import/Export Excel, Roles baseline e POS Staff.
- `src/server/shop-admin/shop-section-data.ts`
  - Stati fallback inventory separano `Shop access verified` da `Mapping`.
- Test e guardrail aggiornati:
  - `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`
  - `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`
  - `scripts/security-checks.mjs`
  - test foundation storici allineati al resolver unico e a `getClaims()`.

## Criteri di accettazione

| CA | Descrizione | Stato |
| --- | --- | --- |
| CA-01 | Proxy Supabase non usa `getSession()` nel lifecycle server-side. | `PASS` |
| CA-02 | `getClaims()` viene usato mantenendo cookie sync request/response. | `PASS` |
| CA-03 | Personal account owner/manager valido non viene mascherato da staff-cookie missing. | `PASS` |
| CA-04 | Staff web fallback resta disponibile per Shop code login. | `PASS` |
| CA-05 | `shop_id` resta unico query param propagato dalla sidebar Shop. | `PASS` |
| CA-06 | Filtri pagina-specifici non contaminano sezioni diverse. | `PASS` |
| CA-07 | Diagnostics condivisi non sono ripetuti sotto ogni pagina. | `PASS` |
| CA-08 | Guardrail condivisi sono centralizzati nella sidebar. | `PASS` |
| CA-09 | Copy Import/Export, Roles, Staff/POS e mapping states allineato allo scope reale. | `PASS` |
| CA-10 | E2E locale copre navigazione account personale senza Unauthorized/staff-cookie missing. | `PASS` |
| CA-11 | Cloudflare/OpenNext build verificato senza deploy production. | `PASS_WITH_WARNINGS` |
| CA-12 | Commit/push finali autorizzati esplicitamente dall'utente; nessun migration o cloud/production apply. | `PASS` |
| CA-13 | Safari reale su `localhost` e `127.0.0.1` non perde la sessione durante la navigazione Shop Admin. | `PASS` |

## Final DONE reconciliation - 2026-06-11

Verdict finale: `DONE_WITH_NOTES`.

TASK-054 e stato portato a `DONE` dopo richiesta esplicita dell'utente. I
warning residui sono classificati non bloccanti:

- Next `middleware` deprecation verso `proxy`;
- Node `[DEP0205] module.register()`;
- OpenNext copy package warning per `compress-commons`, `crc32-stream`,
  `zip-stream`;
- `db:local:status` fail-closed per `.env.local` puntato a `supabase_cloud`,
  mentre i runner locali usano env Supabase CLI process-only;
- `db:staging:status` non configurato, senza uso di staging o production.

Gate finali freschi:

- `git diff --check`: `PASS`.
- `npm run security:scan`: `PASS`.
- `node --test tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`:
  `PASS`, 6/6 post-riconciliazione.
- `npm run test:foundation`: `PASS`, 241/241 post-riconciliazione.
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`.
- `npm run build`: `PASS_WITH_WARNINGS`, exit code 0.
- `npm run verify`: `PASS_WITH_WARNINGS`, exit code 0.
- `PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:shop:local`:
  `PASS`, 4/4.
- Safari reale via `safaridriver` su server dedicato `3059`: `PASS` su
  `localhost` e `127.0.0.1`, full flow Shop Admin, URL con solo `shop_id`,
  forbidden text assente e cleanup `{ cleanupErrors: [], residualRows: 0,
  userDeleted: true }`.
- `npm run cf:build`: `PASS_WITH_WARNINGS`, exit code 0.

Commit/push finali sono autorizzati dal prompt utente successivo alla
riconciliazione; nessun migration, schema/RLS/RPC change, deploy production o
dato reale.

## Final review correttiva - 2026-06-11

Verdict finale Codex: `PASS_WITH_NOTES`.

Correzione applicata durante la review finale:

- `src/components/shop/shopSections.ts`: `POS Live` ora usa
  `sharedShopGuardrails` come le altre sezioni.
- `sharedShopGuardrails` include anche il divieto esplicito di renderizzare
  credential hash, PIN, password e raw token.
- `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs` copre questa
  centralizzazione e impedisce il ritorno del guardrail custom POS-only.

Evidence fresca:

- `npm run test:shop:local` con server gia attivo e web server disabilitato:
  `PASS`, 4/4, cleanup sintetico a zero.
- Safari reale via `safaridriver` rieseguito su server dedicato `3058` con
  Supabase locale da `supabase status --output env`: `PASS` su `localhost` e
  `127.0.0.1`, flow `Products -> Categories -> Suppliers -> Import / Export
  -> Staff -> Devices -> Settings -> Overview`, solo `shop_id`, forbidden text
  assente, cleanup `{ cleanupErrors: [], residualRows: 0, userDeleted: true }`.
- `npm run verify`: `PASS_WITH_WARNINGS` per warning build gia noti.
- `npm run cf:build`: `PASS_WITH_WARNINGS`; exit code 0 e OpenNext complete,
  con warning/error non fatali di copy package gia tracciati.

Note non bloccanti:

- `npm run db:local:status` fallisce chiuso perche `.env.local` punta a
  `supabase_cloud`; i runner E2E locali usano invece env Supabase CLI locale.
- `npm run db:staging:status` resta `BLOCKED_NOT_CONFIGURED`, senza uso di
  staging o production.
- Warning Next `middleware` deprecation verso `proxy` resta follow-up framework
  separato.

## Follow-up TASK-054C - Safari localhost

Il follow-up `TASK-054C` ha riesaminato il caso riportato in Safari reale:

- Processi Next locali di questo repo trovati su `3000`, `3049`, `3052` e
  `3053`, poi fermati per evitare server stale.
- Server pulito avviato su `127.0.0.1:3054`.
- Verificati `200 OK` sia per `localhost:3054` sia per `127.0.0.1:3054`.
- Confermato che auth login, callback e sidebar non cambiano host e non usano
  link assoluti `localhost`/`127.0.0.1`.
- Safari reale autorizzato dall'utente per automazione, poi verificato via
  `safaridriver`.
- Flusso Safari eseguito con Supabase locale e account sintetico:
  - login separato su `localhost:3054`;
  - login separato su `127.0.0.1:3054`;
  - navigazione sidebar `Products -> Import / Export -> Overview`;
  - URL finali con solo `shop_id`;
  - assenti `Admin Console access required`, `No active session`,
    `No staff web session cookie is present` e `Unauthorized`;
  - cleanup fixture con `cleanupErrors: []`.

Nota: la verifica Safari non usa credenziali reali utente e non applica dati o
service-role su cloud/production.

## Fuori scope

- Nessuna console POS separata.
- Nessun merge tra account personale e staff POS.
- Nessuna modifica a Win7POS, Android, iOS o Cash Register.
- Nessuna nuova migration, RPC, RLS o modifica schema.
- Nessun deploy Cloudflare production.
- Nessuna rimozione di `vercel.json`; Vercel resta parcheggiato.
- Nessun secret, PIN, password o token in repository/evidence.
- Commit/push finali autorizzati esplicitamente dall'utente dopo la
  riconciliazione.

## Rischi residui

- `npm run cf:build` completa con exit code 0, ma OpenNext stampa warning/error
  non fatali di copy package per `compress-commons`, `crc32-stream` e
  `zip-stream`; da trattare come follow-up Cloudflare se ricompare in staging.
- Warning esistenti Next/Node restano non bloccanti:
  - convenzione `middleware` deprecata verso `proxy`;
  - Node `[DEP0205] module.register()`.
- TASK-054 non applica deploy remoto e non dichiara production-ready.

## Handoff

Verdict operativo: `DONE_WITH_NOTES`.

TASK-054 e chiuso a `DONE` con note non bloccanti. Check ed evidence
command-level sono registrati in
`docs/TASKS/EVIDENCE/TASK-054/README.md`.
