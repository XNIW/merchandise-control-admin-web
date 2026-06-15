# Evidence TASK-062

Verdict corrente: `DONE`.

TASK-062 introduce il locale globale Admin Web e copre le superfici critiche
Shop/Platform, inclusi import/export, Database transfer, Catalog action panel,
access gate e provisioning Platform. Questa evidence contiene solo risultati di
comandi eseguiti davvero nel worktree di integrazione.

## Scope verificabile

- Cookie locale: `mc_admin_locale`.
- Locali supportati: `en`, `it`, `es`, `zh-CN`.
- Fallback: `en`.
- Language switcher client: cookie + `router.refresh()`.
- Layout globale: `html lang={locale}`.
- Shell Platform/Shop: navigazione e guardrail localizzati.
- Import/export: frasi critiche coperte da `dictionary.exact`.
- Platform provisioning: form POS-first, owner setup, pending owner e recovery
  manager coperti da label i18n passate server-side ai componenti client.
- Access gate Shop/Platform: titolo, area e reason tradotti tramite
  `AccessState`.
- Corrective rendered audit: read model Shop/Platform, metriche, righe
  aggregate, badge tone e valori composti coperti da dizionario/translator.

## Check

| Comando / metodo | Stato | Note |
|---|---|---|
| `git diff --check` | `PASS` | Exit code `0`, nessun output. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; route types generate successfully. |
| `npm run lint` | `PASS` | `eslint` exit code `0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `315/315` pass. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build exit code `0`; warning noti: `middleware` convention deprecata e `[DEP0205] module.register()`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Eseguito da solo dopo build; include lint, typecheck, security e build; stessi warning tooling. |
| `node --test tests/foundation/task-061-android-database-export-transfer.test.mjs tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` | `PASS` | `22/22` pass. |
| `node --test tests/foundation/task-history-sync-console.test.mjs tests/foundation/task-015-history.test.mjs` | `PASS` | `8/8` pass. |
| `node --test tests/foundation/task-062-global-i18n-locale.test.mjs` | `PASS` | `4/4` pass; include regressioni rendered/read-model. |
| `node scripts/i18n-hardcoded-ui-scan.mjs` | `PASS` | `checkedPhrases: 260`, `status: pass`; include Shop read models, Platform overview/admins e provisioning. |
| `node scripts/i18n-rendered-text-scan.mjs --input /tmp/task062-rendered-i18n-after.json` | `PASS` | Snapshot browser `/tmp/task062-rendered-i18n-after.json`; `checkedPhrases: 85`, `checkedRoutes: 28`, `nonEnglishRecords: 28`, `status: pass`. |
| `npx supabase --version && npx supabase migration up --local` | `PASS` | Supabase CLI `2.106.0`; local database up to date. |
| Browser QA route principali | `PASS_WITH_AUTH_RUNTIME_NOTE` | `next start` su `127.0.0.1:3062`; tutte le route richieste renderizzate senza crash. Route protette fail-closed per runtime/sessione Supabase non configurata nel browser locale. |

## Corrective visual audit 2026-06-15

Contesto:

- Browser laterale gia aperto dall'utente su `http://127.0.0.1:3000/shop`.
- Sessione autenticata locale esistente; nessun secret letto o stampato.
- Locale verificato: `zh-CN`.

RED evidence iniziale:

- `/shop` mostrava copy inglese renderizzato in `zh-CN`: `Overview shop`,
  `Data status`, `Ready`, `Verified by active membership`,
  `Shop-scoped catalog rows loaded server-side...`,
  `No sync event`, `legacy owner fallback`.
- Sweep visuale estesa ha trovato residui su Shop read model e Platform
  overview/admins, inclusi `Company RUT`, `0 revoked`, `Active`,
  `Global Platform Admin overview...`, `Total shops`, `neutral/good/warning`
  e aggregati `active/suspended/archived`.

Fix applicato:

- `translate-sections.ts` ora traduce chiavi tabellari `group`, `label`,
  `summary`, `area`, `next`, `detail` e valori composti numerici/stato.
- `dictionaries.ts` aggiunge mappe correttive it/es/zh-CN cablate in
  `dictionary.exact`, senza tradurre dati business dinamici come nomi shop.
- `StatCard` usa `toneLabel` localizzato mantenendo `tone` tecnico per CSS.
- `/platform/admins` localizza lo status custom via `t(formatToken(...))`.
- Scanner statico ampliato a read model Shop, pagine Shop, Platform overview,
  admins e provisioning.
- Nuovo `scripts/i18n-rendered-text-scan.mjs` controlla snapshot testuali
  catturati dal browser.

GREEN evidence finale:

- Browser in-app su `http://127.0.0.1:3000/shop`, `lang=zh-CN`, selector
  `zh-CN`.
- Sweep browser: `28` route visitate (`/shop` + sezioni Shop principali +
  `/platform` + sezioni Platform principali incluse `users`, `shops`,
  `shops/new`, `system`, `data`, `devices`, `sync`, `history`, `operations`,
  `support` e `provisioning`).
- `node scripts/i18n-rendered-text-scan.mjs --input /tmp/task062-rendered-i18n-after.json`:
  `PASS`, `85` frasi rendered critiche, `28` record non inglesi.

## Browser QA 2026-06-15

Server locale:

- `npm run start -- --hostname 127.0.0.1 --port 3062`

Route visitate nel browser in-app per ciascun locale `en`, `it`, `es`,
`zh-CN` usando il selettore UI `#admin-locale`:

- `/auth/login?next=%2Fshop&mode=admin-account`
- `/shop`
- `/shop/products`
- `/shop/categories`
- `/shop/suppliers`
- `/shop/import-export`
- `/shop/members`
- `/shop/roles`
- `/shop/staff`
- `/shop/pos`
- `/shop/devices`
- `/shop/sync`
- `/shop/history`
- `/shop/audit`
- `/shop/settings`
- `/platform`
- `/platform/admins`
- `/platform/operations`
- `/platform/provisioning`

Esito:

- `76` visite totali (`19` route x `4` locali).
- Nessun `wrongLang`: `html lang` osservato in sequenza come `en`, `it`, `es`,
  `zh-CN`.
- Nessun crash text (`Application error`, `Unhandled Runtime Error`, `Internal
  Server Error`, `This page could not be found`) rilevato.
- Nessun hit inglese nelle frasi critiche scannerizzate durante la sweep.
- Nessun hit `Master Console` in `zh-CN` nelle superfici visitate.
- Login route, access gate e Platform provisioning renderizzati con copy
  localizzata.
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
- Closure finale autorizzata dal prompt utente: review read-only A/B/C, staging
  selettivo, commit e push su `main` dopo gate verdi.
