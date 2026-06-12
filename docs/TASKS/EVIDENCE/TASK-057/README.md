# Evidence TASK-057

Verdict corrente: `READY_FOR_DONE_CONFIRMATION`.

TASK-057 resta in `REVIEW`, non `DONE`: la governance locale richiede conferma
utente esplicita per chiudere. Nessun commit, push o stage eseguito.

## Scope della FIX

- Separati i tre flussi catalogo in Products:
  - `Import supplier Excel`
  - `Export catalog Excel`
  - `Database transfer`
- Rimosso il rischio di navigazione raw JSON sulle route import/export: preview,
  apply ed export sono guidati da `fetch(..., { credentials: "same-origin" })`
  e gestiscono risposte JSON/non-JSON dentro la UI.
- Product form aggiornato con supplier/category creatable via datalist/input,
  con id/nome validati e risolti server-side nello shop corrente.
- Supplier Excel wizard in modale con preview metadata, colonne originali,
  colonne unmapped, previewRows bounded, summary, editing inline di
  `retailPrice` e `stockQuantity`, conferma `APPLY`, digest/token e row
  fingerprint.
- Apply richiede file originale, digest valido, conferma e `rowAdjustments`
  validati server-side; se restano righe blocked/error dopo re-parse, apply
  blocca l'intero import.
- Export catalog Excel usa fetch/blob e resta shop-scoped.
- Database transfer resta advanced/secondary, non distruttivo, con copy esplicito
  `Full database restore is not available yet`.

## File modificati

- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/actions.ts`
- `src/app/shop/import-export/apply/route.ts`
- `src/app/shop/import-export/preview/route.ts`
- `src/app/shop/products/page.tsx`
- `src/server/shop-admin/catalog-mutations.ts`
- `src/server/shop-admin/import-export-workbook.ts`
- `scripts/dev-supabase-check.mjs`
- `tests/foundation/task-036-admin-web-readiness.test.mjs`
- `tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs`
- `tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`
- `docs/TASKS/EVIDENCE/TASK-057/README.md`

## Browser live check

Server locale usato: `http://127.0.0.1:3050` con Supabase locale process-only.

Dataset sintetico browser: prefisso `TASK057_*`. Nessun dato reale salvato in
repo/evidence.

Verifiche visibili nel browser laterale Codex:

- `/shop/products` autenticato aperto con sessione shop owner sintetica.
- Toolbar Products mostra `New product`, `Import supplier Excel`,
  `Export catalog Excel`, `Database transfer`.
- `New product` mostra campi creatable `Existing supplier or new supplier name`
  e `Existing category or new category name`, piu hidden id server-validated.
- Creazione prodotto con supplier/category nuovi completata con redirect
  `action=success`; i filtri hanno mostrato le nuove entita create.
- `Import supplier Excel` apre wizard in modale, senza form action nativa verso
  JSON, con un solo file picker e CTA `Preview supplier workbook`.
- `Database transfer` apre modale separata con accordion advanced e CTA
  `Preview database workbook`.
- `Export catalog Excel` apre modale separata, usa CTA
  `Download catalog export`; il click non naviga via JSON e resta sulla pagina
  Products.

Nota browser upload: il runtime del browser laterale non espone `setInputFiles`
e Computer Use non puo controllare l'app Codex per safety. I file reali forniti
dall'utente sono quindi stati provati via route handler autenticato server-side,
con cookie session SSR reale e output redatto.

## QA Excel reale redatto

File forniti dall'utente:

- `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx`
- `/Users/minxiang/Downloads/Database_2026_06_04_19-09-08.xlsx`

Non e stato eseguito `APPLY` su questi file reali: apply scriverebbe dati del
workbook nel DB locale e richiede conferma esplicita separata. La preview e
stata eseguita con auth reale, same-origin headers e cookie session SSR.

### Supplier workbook

- File: `Vs20260519-456(Dingli).xlsx`
- Size: `14145` bytes
- Preview route: `HTTP 200`, `ok true`, `code success`
- Digest/token: presente
- Workbook metadata:
  - `selectedSheet`: `prodotti` (nome foglio originale redatto)
  - `headerRow`: `10`
  - `parsedRows`: `101`
  - `previewRowsLimit`: `500`
  - `previewRowsTruncated`: `false`
  - `totalRows`: `113`
- Summary redatto:
  - `products`: `101`
  - `suppliers`: `0`
  - `categories`: `0`
  - `errors`: `0`
  - `warnings`: `0`
- Preview row shape: row fingerprint presente; campi editabili
  `retailPrice` e `stockQuantity` presenti.

### Database workbook

- File: `Database_2026_06_04_19-09-08.xlsx`
- Size: `2572065` bytes
- Preview route: `HTTP 200`, `ok true`, `code success`
- Digest/token: presente
- Workbook metadata:
  - `sheetNames`: `Products`, `Suppliers`, `Categories`, `PriceHistory`
  - `selectedSheet`: `Products`
  - `headerRow`: `1`
  - `parsedRows`: `21181`
  - `previewRowsLimit`: `500`
  - `previewRowsTruncated`: `true`
  - `totalRows`: `21182`
- Summary redatto:
  - `products`: `21181`
  - `suppliers`: `59`
  - `categories`: `24`
  - `errors`: `0`
  - `warnings`: `188`

## Check finali

| Check | Esito |
|---|---|
| `node --test tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS`, `21/21` |
| `node --test tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS`, `27/27` |
| `node --test tests/foundation/task-036-admin-web-readiness.test.mjs` | `PASS`, `4/4` |
| `npm run test:foundation` | `PASS`, `278/278` |
| `npm run security:scan` | `PASS` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS` |
| `npm run verify` | `PASS_WITH_WARNINGS` |
| `npm run test:shop-admin-auth-smoke` | `PASS`, `4/4` |
| `npm run test:platform:local` | `PASS`, `1/1` |
| `npm run test:platform:local-login` | `PASS_WITH_SKIP`, `1 skipped`, gated da `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes` e password runtime |
| `npm run db:local:status` | `FAIL_CLOSED_EXPECTED`, `.env.local` punta `supabase_cloud`; status Supabase redatto |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase migration list --local` | `PASS` |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase migration up --local` | `PASS`, local database up to date |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --schema public,app_private --fail-on error` | `PASS`, no schema errors |
| `git diff --check` | `PASS` |
| `git status --short` | `PASS_WITH_UNCOMMITTED_CHANGES`, nessun stage/commit/push |

Warning noti non bloccanti:

- Next segnala convenzione `middleware` deprecata verso `proxy`.
- Node segnala `[DEP0205] module.register()` durante Next/Playwright.
- Playwright/Next mostrano warning `NO_COLOR` ignorato quando `FORCE_COLOR` e
  settato.

## Cleanup locale

- Prodotti/supplier/category/mapping/membership del dataset browser `TASK057_*`
  rimossi dal Supabase locale.
- `activeResidualRows`: `0` per mapping, membership e prodotti.
- `audit_logs` e append-only: non e stato bypassato il trigger.
- Lo shop/profilo sintetici del browser live sono stati archiviati/disabilitati
  e l'utente auth sintetico bannato localmente, per rispettare il vincolo audit
  append-only senza forzare delete fisica.
- Lo smoke auth TASK-035 ha eseguito il proprio cleanup.
- Screenshot TASK-035 generato dallo smoke e stato ripristinato per evitare
  modifiche fuori scope.

## Sicurezza e redazione

- Nessun secret, service role key, token o password e stato committato o scritto
  in evidence.
- I file Excel reali non sono stati copiati nel repo.
- I valori riga dei workbook reali non sono stati stampati in chat/evidence.
- ShopId, userId e credenziali sintetiche usate per browser live non sono
  richiesti per replay e sono trattati come dati runtime locali.
- Nessun service-role lato client/browser.
- Nessun bypass auth/RLS/server guards.
- `scripts/dev-supabase-check.mjs` redige anche output Supabase JSON/env con
  `ANON_KEY`, `PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY`, secret/JWT/DB URL e chiavi
  S3 prima di stampare `db:local:status`.

## Rischi residui

- `LOW`: il browser plugin non consente upload programmatico diretto nel file
  picker Codex; mitigato con route preview autenticata same-origin e UI wizard
  verificata nel browser.
- `LOW`: warning Next `middleware` deprecated e Node `[DEP0205]` preesistenti;
  non bloccano TASK-057.
- `MEDIUM`: apply su file reali non eseguito per evitare scritture non richieste
  di dati workbook; coperto da foundation/fixture sintetiche e contratto server.

## Prossimo passo

Passare a REVIEW utente. TASK-057 non deve essere marcato `DONE` da Codex senza
conferma esplicita dell'utente.
