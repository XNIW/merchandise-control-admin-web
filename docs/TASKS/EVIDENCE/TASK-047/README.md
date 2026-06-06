# Evidence - TASK-047 Align Master Console and Admin Console access model

## Sintesi

TASK-047 riallinea copy, naming e documentazione del modello di accesso:

- `Master Console` = console globale su route tecnica `/platform`;
- `Admin Console` = console shop-scoped su route tecnica `/shop`;
- accesso Admin Console con Admin account personale multi-shop oppure shop-code/staff-code single-shop;
- account personale e staff account restano distinti ma permission-equivalent nello stesso shop quando il permission tree lo consente.

## File toccati

- `src/app/page.tsx`
- `src/app/auth/login/page.tsx`
- `src/components/auth/AuthForm.tsx`
- `src/app/(staff-auth)/shop/staff-login/page.tsx`
- `src/app/platform/layout.tsx`
- `src/app/shop/layout.tsx`
- `src/components/platform/AppShell.tsx`
- `src/components/platform/PlatformMasterDetail.tsx`
- `src/components/platform/PlatformPage.tsx`
- `src/components/platform/platformData.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/shopSections.ts`
- `src/server/auth/admin-routing.ts`
- `src/server/shop-admin/shop-access.ts`
- `src/server/shop-admin/data-access.ts`
- `docs/MASTER-PLAN.md`
- `docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md`
- `docs/RUNBOOKS/platform-master-console-local-login.md`
- `docs/RUNBOOKS/admin-console-personal-account-login.md`
- `docs/RUNBOOKS/admin-console-shop-code-login.md`
- `tests/foundation/task-047-master-admin-access-model.test.mjs`
- `tests/foundation/*` active-task allowlist updates for `TASK-047`
- `tests/e2e/platform-admin.spec.ts` and related E2E heading expectations updated from old guard/login copy
- `scripts/security-checks.mjs`

## Copy prima/dopo

| Superficie | Prima | Dopo |
| --- | --- | --- |
| Root `/` | `Admin Web access required` | Console selection: Master Console, Admin Console Admin account, Admin Console Shop code |
| Account login | `Admin sign in`, `Return to Admin Web` | `Admin account sign in`, `Back to console selection`, `Use Shop code sign in` |
| Form success | `Signed in. Opening Admin Web.` | `Signed in. Opening requested console.` |
| Staff login | `POS manager sign in`, `Shop Admin Console` | `Shop code sign in`, `Admin Console`, `single-shop` |
| Platform guard | `Platform Admin access required` | `Master Console access required` |
| Shop guard | `Shop Admin access required` | `Admin Console access required` |

## Matrice auth attesa

| Caso | Route | Esito atteso |
| --- | --- | --- |
| `platform_admin` personale | `/platform` | apre Master Console |
| `shop_owner` / `shop_manager` personale | `/platform` | negato: account autorizzato per Admin Console, non Master Console |
| `shop_owner` / `shop_manager` personale | `/shop` | apre Admin Console, multi-shop se membership multiple |
| `viewer` personale | `/shop` | negato: viewer non apre Admin Console |
| Shop code + Staff code manager con `shop_admin.full_access` | `/shop/staff-login` -> `/shop` | apre Admin Console single-shop |
| Staff cashier/viewer o credenziale bloccata | `/shop/staff-login` | negato con messaggio generico |
| Win7POS | POS runtime | usa shop-code/staff-code, non personal account |
| Android/iOS | mobile app | usa personal account, non shop-code/staff-code |

## Guardrail

- no production;
- nessun service-role in browser;
- nessun secret o dato reale;
- nessun reset DB;
- route tecniche `/platform`, `/shop`, `/shop/staff-login` preservate;
- staff web usa `staff_accounts` e `staff_web_sessions`;
- Admin account usa `profiles` e `shop_members`.

## Miglioria liste Master Console 2026-06-05

Dopo il test manuale locale, le schermate `Users` e `Shops` erano leggibili ma
troppo piatte: nomi profilo duplicati senza ID visibile, owner singolo anche se
uno shop puo avere piu owner/membri, e nessun dettaglio contestuale.

Fix applicato:

- aggiunto `PlatformMasterDetail` come client component minimale per
  selezionare una riga e mostrare un pannello dettaglio accanto;
- mantenuta la query server-side: il client riceve solo DTO stringa gia
  filtrati dal boundary Master Console;
- `Users` mostra ID breve, stato, ruolo piattaforma, conteggio/accesso shop e
  `Origin = Not captured`;
- `Shops` mostra codice, riepilogo owner multipli, membership attive/totali,
  stato, health e dettaglio completo;
- il pannello dettaglio include link alle route gia esistenti
  `/platform/users/[profileId]` e `/platform/shops/[shopId]`;
- l'origine account non viene inventata: il provider Google/Apple/WeChat/email
  richiede una futura fonte server-side sicura, non dati auth segreti nel client.

### Correzione UX master-detail 2026-06-05

Feedback manuale utente dopo la prima versione:

- `Open full detail` apriva la pagina dettaglio senza un ritorno chiaro alla
  lista;
- browser/back o ritorno al dettaglio non preservava esplicitamente la riga
  selezionata;
- cliccando righe in basso, il pannello dettaglio risultava vuoto o fuori vista
  perche la colonna laterale era stirata all'altezza della tabella;
- `Shops` era troppo compresso dalla combinazione tabella + pannello dettaglio +
  colonna `Read state`.

Fix applicato:

- la riga selezionata viene sincronizzata nell'URL con `?selected=<rowId>`;
- `Open full detail` passa `returnTo` alla rotta dettaglio;
- le pagine `User Detail` e `Shop Detail` mostrano `Back to Users` /
  `Back to Shops` con ritorno sicuro solo a `/platform/users` o `/platform/shops`;
- tornando alla lista, il componente inizializza la selezione da `selected` e
  porta la riga in vista con `scrollIntoView`;
- il pannello dettaglio e `self-start` + sticky solo su layout ampio, evitando
  la colonna vuota durante lo scroll;
- le viste Users/Shops master-detail usano una larghezza piu ampia e spostano
  `Read state` sotto la tabella, cosi `Shops` non viene schiacciato.

### Follow-up polish Users/Shops 2026-06-05

Feedback manuale utente dopo il polish precedente:

- le tabelle Users/Shops risultavano ancora troppo tecniche/debug;
- l'inspector laterale ripeteva campi invece di organizzarli in sezioni;
- `Read state` / `Boundary status` occupava troppo peso visivo quando la
  lettura era OK;
- i badge `Active` / `Disabled` avevano lo stesso colore;
- aprendo `Open full detail` da una riga in basso, la pagina dettaglio restava
  alla posizione scrollata invece di partire in cima.

Fix applicato:

- Users usa colonne `Profile`, `Origin`, `Access`, `Shops`, `State` con search
  per nome/ID e filtri client-side su stato/accesso gia restituiti dal server;
- Shops usa colonne `Shop`, `Code`, `Owners`, `Members`, `Devices`, `Health`
  con search per nome/codice/ID e filtri su stato e owner status;
- le celle principali usano layout a piu righe controllato per nomi, ID e
  codici lunghi, senza troncare male;
- gli stati hanno badge differenziati: `Active` verde, `Disabled`/`Revoked`
  rosso, `Pending Setup`/`Review`/`Suspended` ambra, fallback neutro;
- lo shop code resta monospace e ha un piccolo `Copy` button quando il browser
  espone Clipboard API;
- l'inspector laterale e organizzato in sezioni:
  `Identity`, `Account origin`, `Access`, `Shop memberships`, `Recent audit`,
  `Diagnostics` per Users; `Overview`, `Owners & members`, `Devices`,
  `Sync & audit`, `Operations` per Shops;
- le pagine full detail usano sezioni chiare (`Overview`, `Owners & members`,
  `Devices`, `Sync/history`, `Audit`, `Operations boundary`) e mantengono il
  link `Back to Users` / `Back to Shops`;
- `Open full detail` non forza piu `scroll={false}`, quindi la pagina dettaglio
  apre in cima; il ritorno alla lista continua a preservare `?selected=<id>` e
  riporta in vista la riga selezionata;
- la diagnostica normale e stata ridotta a sezione `Diagnostics` collassata;
  gli stati bloccati/non configurati restano visibili;
- provider account, owner, membership, device, sync e audit non vengono
  inventati: quando il read model non espone righe, la UI mostra `Not captured`,
  `Unassigned`, `No devices visible`, `No sync visible` o copy di
  boundary esplicito.

### Final micro-polish Master Console 2026-06-05

Feedback manuale utente dopo il follow-up polish:

- durante scroll lunghi, la sidebar Master Console spariva insieme al contenuto;
- nell'inspector l'azione `Open full detail` poteva finire troppo in basso;
- alcuni copy erano ancora troppo tecnici (`No device rows visible`,
  `No sync rows visible`, `No member roles visible`);
- bisognava verificare che `Copy` dello shop code copiasse davvero;
- la riga selezionata doveva essere piu evidente senza usare solo colore.

Fix applicato:

- `AppShell` rende la sidebar sticky su desktop (`lg:sticky lg:top-0
  lg:h-screen lg:overflow-y-auto`) e la nav interna scrollabile se il menu
  cresce;
- `PlatformMasterDetail` mantiene header `Inspector` e footer action `Open full
  detail` sticky dentro il pannello laterale;
- la riga selezionata usa `aria-selected`, `aria-label`, background leggero e
  bordo sinistro sottile;
- lo shop code `Copy` mantiene label accessibile `Copy shop code ...`, feedback
  `Copied` e fallback sicuro se Clipboard API non e disponibile;
- copy UI sostituito: `No devices visible`, `No sync visible`, `No roles
  visible`, senza inventare device/sync/role;
- `Open full detail` continua ad aprire la pagina dettaglio in cima, mentre
  `Back to Users/Shops` conserva `?selected=<id>`.

## Fix runtime locale 2026-06-05

Durante il test manuale utente della Master Console locale, il terminale di
attivazione ha mostrato:

- Supabase locale avviato correttamente;
- `npm run db:local:status` con container locale `PASS`, ma `.env.local`
  classificato `supabase_cloud` e quindi `FAIL` atteso in modalita local;
- `npm run platform:local:dev` bloccato da `EADDRINUSE` su `127.0.0.1:3000`.

Root cause: la porta `3000` era gia occupata da un server Next precedente. Il
launcher locale corretto non e partito, quindi il browser poteva aprire il
server gia attivo, caricato con `.env.local` cloud/staging, e mostrare `Read
blocked` pur usando l'account locale `platform.local@example.test`.

Fix applicato: `scripts/platform/local-dev-server.mjs` ora sceglie
automaticamente la prima porta libera tra `3000`, `3050`, `3051` e `3052` quando
`PLATFORM_LOCAL_DEV_PORT` non e impostato. Se una porta e impostata
esplicitamente e risulta occupata, fallisce con messaggio actionable. Il runbook
Master Console locale ora dice di aprire sempre l'URL stampato dal launcher.

Follow-up nello stesso fix locale: il launcher usa `next dev --webpack` per
default. Il badge in basso a sinistra `Compiling` e il dev indicator di Next.js
in ambiente development; durante il run manuale il processo `next-server` su
`3050` era rimasto ad alta CPU con Turbopack. `--webpack` mantiene hot reload ed
error overlay, ma stabilizza il test manuale locale. Turbopack resta opt-in con
`PLATFORM_LOCAL_DEV_BUNDLER=turbopack`.

## Check

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `RED_CONFIRMED` | Prima run: `fail 2`, missing `Master Console` in root and docs TASK-047 assenti. |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `PASS` | Run green: `tests 3`, `pass 3`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 201`, `pass 201`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` succeeded, `tsc --noEmit` senza errori. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Exit `0`; warning noti `middleware` -> `proxy` e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati; stessi warning build. |
| `npm run test:ui-smoke:ci` | `PASS_WITH_WARNING` | Playwright non autenticato: `43 passed`; warning noti `NO_COLOR`/`FORCE_COLOR` e `[DEP0205]`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Nessun output, nessun file staged. |
| `git status --short --branch` | `PASS_WITH_DIRTY_WORKTREE` | Worktree gia ampio/sporco da task precedenti; TASK-047 non ha fatto commit, push o stage. |

### Check aggiuntivi fix runtime locale

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-046-platform-local-login-environment.test.mjs` | `RED_CONFIRMED` | Prima del fix mancava `resolveAvailablePort` nel launcher locale. |
| `node --test tests/foundation/task-046-platform-local-login-environment.test.mjs` | `PASS` | `tests 2`, `pass 2`, `fail 0`; regression aggiornata sul fallback porta. |
| `npm run platform:local:status` | `PASS` | Account locale `platform.local@example.test` presente, profilo active, grant `platform_admin` active. |
| `npm run platform:local:dev` con `3000` occupata | `PASS` | Prova controllata con stop automatico: `INFO port 3000 is busy; using http://127.0.0.1:3050`, Next `Ready`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 201`, `pass 201`, `fail 0`. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run typecheck` | `PASS` | `next typegen` succeeded, `tsc --noEmit` exit `0`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Nessun output, nessun file staged. |

### Check aggiuntivi miglioria Users/Shops

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`; aggiunto gate master-detail Users/Shops. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 202`, `pass 202`, `fail 0`. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run typecheck` | `PASS` | `next typegen` succeeded, `tsc --noEmit` exit `0`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Nessun output, nessun file staged. |
| `TMPDIR=/tmp "$PWCLI" -s=task047-md open http://127.0.0.1:3050/platform/users` + login locale sintetico + snapshot/click Users/Shops | `PASS` | Users: colonne `Origin`, ID breve, shop access e pannello `Selected row`; click su utente con membership aggiorna il dettaglio. Shops: colonne `Owners`/`Members`; click su `TASK043 Manual Smoke Shop` mostra owner e membership nel pannello. Console Playwright: `0 errors`; artefatti temporanei `.playwright-cli/` rimossi dopo lo smoke. |

### Check aggiuntivi correzione UX master-detail

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`; copre `selected`, `returnTo`, back link e sticky panel. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run typecheck` | `PASS` | `next typegen` succeeded, `tsc --noEmit` exit `0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 202`, `pass 202`, `fail 0`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Nessun output, nessun file staged. |
| Playwright CLI `task047-uxfix` su `http://127.0.0.1:3050` | `PASS` | Login locale sintetico; Users: click riga bassa -> URL `selected`, `Open full detail`, `Back to Users` ritorna alla stessa selezione. Shops: click `TASK043 Manual Smoke Shop` -> URL `selected`, owner visibile, `Open full detail`, `Back to Shops` ritorna alla stessa selezione. Console: `0 errors`; artefatti `.playwright-cli/` rimossi. |

### Check aggiuntivi follow-up polish Users/Shops

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `RED_CONFIRMED` | Prima run: mancante `RowDetailGroup` / struttura inspector polish. |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `RED_CONFIRMED` | Follow-up badge: mancante mapping `statusToneClassForSegment`. |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `RED_CONFIRMED` | Follow-up scroll: `scroll={false}` ancora presente su `Open full detail`. |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`; copre inspector, filtri/search, colori badge e apertura detail senza `scroll={false}`. |
| `npm run typecheck` | `PASS` | `next typegen` riuscito, `tsc --noEmit` senza errori. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 202`, `pass 202`, `fail 0`. |
| `npm run build` | `PASS_WITH_WARNING` | Exit `0`; warning noti `middleware` -> `proxy` e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati; stessi warning build. |
| `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes ... npx playwright test tests/e2e/task-046-platform-local-login.spec.ts --project=chromium-desktop` | `PASS_WITH_WARNING` | `1 passed`; password runtime generata e non stampata; warning noti `NO_COLOR`/`FORCE_COLOR` e `[DEP0205]`. |
| Playwright headless locale su `http://127.0.0.1:3050/platform/users` e `/platform/shops` | `PASS` | Users: badge `Active` verde e `Disabled` rosso, search e `Inspector` visibili. Shops: badge `Active` verde, search e `Inspector` visibili. |
| Playwright headless locale detail/back Shops | `PASS` | Da scroll lista `1786`, `Open full detail` apre con `detail_scroll=0`; `Back to Shops` torna a `?selected=<id>` e la riga selezionata resta visibile. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Nessun output, nessun file staged. |
| `git status --short --branch` | `PASS_WITH_DIRTY_WORKTREE` | Branch `codex/task-042-review-ci-win7pos-bridge`; worktree gia ampio/sporco da task precedenti; nessun commit, push o stage in questo follow-up. |

### Check aggiuntivi final micro-polish Master Console

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `RED_CONFIRMED` | Prima run: sidebar non conteneva `lg:sticky` / classi sticky desktop. |
| `node --test tests/foundation/task-047-master-admin-access-model.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`; copre sidebar sticky, inspector action, selected row, copy cleanup e regressioni detail/back. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 202`, `pass 202`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` riuscito, `tsc --noEmit` senza errori. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Exit `0`; warning noti `middleware` -> `proxy` e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati; stessi warning build. |
| Playwright headless locale su `http://127.0.0.1:3050/platform/shops` | `PASS` | Login locale sintetico; dopo scroll `sidebar_top=0`, copy shop code copia negli appunti, riga `aria-selected=true`, `Open full detail` visibile. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Nessun output, nessun file staged. |
| `git status --short --branch` | `PASS_WITH_DIRTY_WORKTREE` | Branch `codex/task-042-review-ci-win7pos-bridge`; worktree gia ampio/sporco da task precedenti; nessun commit, push o stage in questo micro-polish. |

## Stato

- Stato task: `DONE_RECONCILED`
- Fase: `DONE_RECONCILED`
- Commit/push finale su `main` autorizzati dall'utente il 2026-06-06; nessun file deve restare staged dopo il commit.

## Riconciliazione DONE 2026-06-06

- Conferma esplicita utente ricevuta: `Metti in DONE tutte quelle che si può e poi fai merge nella main e poi commit push`.
- Stato finale: `DONE_RECONCILED`.
- La chiusura non promuove Win7POS live E2E, POS online/catalog pull, Sales Sync live o staging stabile: restano gate separati non eseguiti quando applicabile.
- Commit/push finale su `main` autorizzati dall'utente il 2026-06-06.
