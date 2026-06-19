# TASK-068Z Evidence - CodeRabbit review, hardening and reconciliation

## Stato

- Stato corrente: `DONE`
- Verdict operativo Codex: `DONE`
- Data: 2026-06-19
- Commit/push/stage: `AUTHORIZED_AFTER_USER_DONE_CONFIRMATION`
- DB push/production apply/deploy: `NOT_RUN_BY_REQUEST`

## CodeRabbit

- Status: `RUN`
- CLI: `coderabbit 0.6.1`
- Auth: `authenticated`, provider GitHub
- Comando: `coderabbit review --agent -t uncommitted -c AGENTS.md`
- Issues trovati: `2 minor`
- Comments fixed: `2/2`
- False positives: `0`

Finding corretti:

| File | Severita | Esito |
|---|---:|---|
| `scripts/security-checks.mjs` | minor | `FIXED`, estrazione `buildPosLiveSection` non dipende piu da `buildStaffSection`. |
| `src/app/platform/shop-admins/[profileId]/page.tsx` | minor | `FIXED`, `backLabel` localizzato tramite dizionario. |

Hardening correlato:

- Localizzate anche le back label detail Users/Shops.
- Aggiunte traduzioni IT/ES/ZH per `Back to Shops`, `Back to Shop Admins`, `Back to Users`.
- Aggiornato test POS legacy per evitare la stessa dipendenza fragile dal nome della funzione successiva.

## Review locale equivalente

Subreview read-only:

| Area | Esito |
|---|---|
| Security/Supabase/RLS | `PASS`, nessun finding bloccante; 068E/068I staticamente coerenti; nessun service-role client/browser. |
| UI/UX | `PASS`, Products/sidebar/shop detail senza regressioni statiche bloccanti. |
| Tests/CI/i18n | `PASS_WITH_NOTE`, task/evidence TASK-068Z mancanti prima di questa review; creati in questo handoff. |
| Performance/Architecture | `FIXED_WITH_NOTES`, fan-out Platform ridotto; categorie/fornitori riusano read model; Products resta bounded ma ha ancora read model opzioni separato. |
| CodeRabbit comments | `FIXED`, entrambi i finding CodeRabbit risultano chiusi dopo patch. |

## Fix applicati

- `scripts/security-checks.mjs`: helper `extractExportedFunctionBlock` per limitare il controllo POS alla funzione target.
- `src/app/platform/shop-admins/[profileId]/page.tsx`: back label localizzata.
- `src/app/platform/users/[profileId]/page.tsx`: back label Users/Shop Admin localizzata.
- `src/app/platform/shops/[shopId]/page.tsx`: back label Shops localizzata.
- `src/i18n/dictionaries.ts`: chiavi back label aggiunte in IT/ES/ZH.
- `src/server/platform-admin/read-model.ts`: conteggi mobile inventory su owner visibili o richiesti, non su tutti i mapping.
- `src/server/platform-admin/platform-section-data.ts`: shop detail passa `mobileInventoryShopIds: [shopId]`.
- `src/server/shop-admin/shop-section-data.ts`: `inventoryReadModel` opzionale riusabile per sezioni catalogo.
- `src/app/shop/categories/page.tsx`: read model inventory caricato una volta e riusato.
- `src/app/shop/suppliers/page.tsx`: read model inventory caricato una volta e riusato.
- `tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs`: estrazione funzione POS meno fragile.
- `tests/foundation/task-068l-shop-detail-ui-polish.test.mjs`: guardie performance/detail aggiunte.
- `tests/foundation/task-068m-product-list-readability-icons.test.mjs`: guardia riuso read model categorie/fornitori aggiunta.

## Query read-only

Comando: script Node read-only con `@supabase/supabase-js`, caricando `.env.local`/`.env` solo nel processo.

Target Supabase letto dagli env locali: `jpgoimipbothfgkokyvm.supabase.co`.

Nota sicurezza: nessun `db push`, migration apply, deploy o mutation eseguiti; nessun secret, PIN, password o hash stampato. Il check sullo staff manager ha verificato solo presenza boolean del credential hash.

Risultati redatti:

| Area | Esito |
|---|---|
| Shop target | `TASK068E_260618231325` trovato, status `active`. |
| Mobile inventory bridge | mapping presente, tipo `mapped`, owner mobile risolto. |
| Owner auth/profile | email owner attesa presente; profilo owner `active`; membership `shop_owner` `active`. |
| Platform admin | profilo admin `active`. |
| Catalogo owner mobile | products totali `19708`; active `19704`; archived `4`. |
| Dimensioni catalogo | suppliers `66`; categories `35`; price history `41133`. |
| Storico mobile | sessions `97`; sync events `1886`. |
| Staff manager 1001 | riga target shop `1`; altre shop con stesso codice `0`; ruolo `manager`; status `active`; credential hash presente `true`, valore non stampato. |
| Permessi manager | template full access presente `1`. |
| Audit recovery/login | `platform.staff_manager.initial_recovery.success` count `2`; staff web login success count `1`. |

## Browser smoke

| Check | Comando | Esito |
|---|---|---|
| Shop Admin local smoke | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3068" PLAYWRIGHT_REUSE_SERVER=0 npm run test:shop:local` | `PASS`, 5/5. Copre guard, overview, products pagination/search/reset/sidebar icons, staff manager web session, cashier denial, import dialog. |
| Platform sidebar icons | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3070 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3070" PLAYWRIGHT_REUSE_SERVER=0 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-068m-platform-sidebar-icons.spec.ts --project=chromium-desktop` | `PASS`, 1/1. Copre `/platform`, `/users`, `/shop-admins`, `/shops`, `/provisioning`, `/admins`, `/audit`, `/system`, `/data`, `/history`, `/operations`, `/support`. |
| Platform shop profile detail | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3071 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3071" PLAYWRIGHT_REUSE_SERVER=0 npm run test:platform:local-shop-profile` | `PASS`, 1/1 dopo fix double-click e ripristino campi profilo/fiscal identity. |

## Check finali

| Check | Esito |
|---|---|
| `git diff --check` preflight | `PASS` |
| `node --test tests/foundation/task-068l-shop-detail-ui-polish.test.mjs` | `PASS`, 3/3 dopo fix |
| `node --test tests/foundation/task-068m-product-list-readability-icons.test.mjs` | `PASS`, 6/6 dopo fix |
| `node --test tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs` | `PASS`, 5/5 dopo fix |
| `node --test tests/foundation/shop-read-model.test.mjs tests/foundation/platform-admin-actions.test.mjs` | `PASS`, 14/14 |
| `npm run test:foundation` | `PASS`, 375/375 |
| `npm run security:scan` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run typecheck` | `PASS` dopo fix TS |
| `npm run build` | `PASS_WITH_WARNINGS`, warning noti: Next `middleware` deprecato verso `proxy`; Node `[DEP0205] module.register()` deprecato. |
| `npm run verify` | `PASS_WITH_WARNINGS`, stesso warning Next/Node durante build aggregata. |
| `git diff --check` finale | `PASS` |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_NOTES`, worktree gia ampio/sporco; nessuno stage/commit/push eseguito. |

## Rischi residui

- Worktree ampia e gia sporca prima del task; nessun reset/revert globale eseguito.
- Products page resta grande e usa ancora `getShopInventoryProductsPage` + read model opzioni/action contexts; carico bounded e testato, ma un loader opzioni dedicato sarebbe follow-up architetturale.
- No EXPLAIN/profiling DB su indici `ilike` prodotti; da fare solo in task performance separato.
- Target Supabase letto dagli env locali era cloud; solo query read-only e nessuna mutation/apply/deploy.
- Warning build/verify su `middleware` deprecato e Node `module.register()` preesistenti/non bloccanti.

## Chiusura

TASK-071 ha ricevuto conferma esplicita utente e ha riconciliato questo handoff
a `DONE`. Le note residue restano documentate come non bloccanti.
