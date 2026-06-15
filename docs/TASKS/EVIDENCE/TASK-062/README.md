# Evidence TASK-062

Verdict corrente: `DONE`.

TASK-062 introduce il locale globale Admin Web e copre le superfici critiche
Shop/Platform, inclusi import/export, Database transfer e Catalog action panel.
Questa evidence contiene solo risultati di comandi eseguiti davvero nel worktree
di integrazione.

## Scope verificabile

- Cookie locale: `mc_admin_locale`.
- Locali supportati: `en`, `it`, `es`, `zh-CN`.
- Fallback: `en`.
- Language switcher client: cookie + `router.refresh()`.
- Layout globale: `html lang={locale}`.
- Shell Platform/Shop: navigazione e guardrail localizzati.
- Import/export: frasi critiche coperte da `dictionary.exact`.

## Check

| Comando / metodo | Stato | Note |
|---|---|---|
| `git diff --check` | `PASS` | Exit code `0`, nessun output. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; route types generate successfully. |
| `npm run lint` | `PASS` | `eslint` exit code `0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `314/314` pass dopo riallineamento assert statici a `t(...)`. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build exit code `0`; warning noti: `middleware` convention deprecata e `[DEP0205] module.register()`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Eseguito da solo dopo build; include lint, typecheck, security e build; stessi warning tooling. |
| `node --test tests/foundation/task-061-android-database-export-transfer.test.mjs tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS` | `22/22` pass. |
| `node --test tests/foundation/task-history-sync-console.test.mjs tests/foundation/task-015-history.test.mjs` | `PASS` | `8/8` pass. |
| `node --test tests/foundation/task-062-global-i18n-locale.test.mjs` | `PASS` | `3/3` pass. |
| `node scripts/i18n-hardcoded-ui-scan.mjs` | `PASS` | `checkedPhrases: 60`, `status: pass`. |
| `npx supabase --version && npx supabase migration up --local` | `PASS` | Supabase CLI `2.106.0`; local database up to date. |
| Browser QA route principali | `PASS_WITH_AUTH_RUNTIME_NOTE` | `next start` su `127.0.0.1:3062`; tutte le route richieste renderizzate senza crash. Route protette fail-closed per runtime/sessione Supabase non configurata nel browser locale. |

## Browser QA 2026-06-15

Server locale:

- `npm run start -- --hostname 127.0.0.1 --port 3062`

Route visitate nel browser in-app:

- `/auth/login?next=%2Fshop&mode=admin-account`
- `/shop/import-export`
- `/shop/history`
- `/shop/sync`
- `/shop/audit`
- `/shop/products`
- `/shop/categories`
- `/shop/suppliers`
- `/shop/members`
- `/shop/staff`
- `/shop/devices`
- `/shop/settings`
- `/platform`
- `/platform/admins`
- `/platform/operations`

Esito:

- Nessun crash text (`Application error`, `Unhandled Runtime Error`, `Internal
  Server Error`, `This page could not be found`) rilevato.
- `html lang` osservato: `zh-CN`, coerente con il cookie locale presente nel
  browser in-app.
- Login route renderizzata con copy localizzata.
- Route Shop/Platform protette renderizzate in stato fail-closed
  `runtime/auth not configured` sul server locale senza sessione Supabase
  browser.

## Safety

- Nessun `.env` o secret aggiunto.
- Nessun workbook reale aggiunto.
- Nessun dato business reale tradotto o hardcoded.
- Nessuna nuova dipendenza.

## Handoff

- Stato attuale: `DONE_RECONCILED`.
- Review richiesta prima del commit finale: Reviewer A/B/C read-only come da
  addendum utente.
