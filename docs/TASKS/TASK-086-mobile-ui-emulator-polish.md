# TASK-086 - Mobile UI Emulator Polish

## Informazioni generali

- ID: `TASK-086`
- Titolo: Mobile UI Emulator Polish
- Stato: `REVIEW_READY`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-25`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-086/README.md`
- Task collegati: `TASK-084`, `TASK-085`

## Scope

Eseguire QA mobile reale e ripetibile su Admin Web, correggendo solo problemi
UX mobile concreti senza cambiare logica auth, Supabase, POS API, read model o
Win7POS.

Superfici verificate:

- `/auth/login?mode=admin-account&next=/shop`
- tab login account personale
- tab shop-code/staff login
- entry point `Continue with Google`, fermandosi a Google/Supabase
- `/shop`
- `/shop/products`
- `/shop/staff`
- `/shop/pos`
- `/shop/devices`
- desktop sanity su login, `/shop`, `/shop/products`

## Non incluso

- Nessun production deploy.
- Nessun deploy staging eseguito in questo task.
- Nessuna modifica Supabase schema/migration/RLS.
- Nessuna modifica Android/iOS nativa.
- Nessuna modifica Win7POS.
- Nessuna nuova dipendenza.
- Nessun completamento Google reale con credenziali o 2FA.
- Nessun salvataggio di PIN, password, cookie, token, service-role o URL OAuth
  completi.

## Problemi mobile trovati

| Area | Problema | Severita | Esito |
|---|---|---:|---|
| Shop shell mobile | Sidebar/header occupavano troppo primo viewport; safety box e sezioni nav spingevano il contenuto sotto la piega. | P1 | Fixato |
| Shop nav mobile | Link nav da circa 32px e scroller divisi per sezione. | P1 | Fixato |
| Login mobile | Tab login e language switcher sotto target pratico 44px. | P2 | Fixato |
| Shop topbar | Switcher shop, single-shop badge e logout troppo piccoli su mobile. | P2 | Fixato |
| Products mobile | Filtri, toolbar, row actions e paginazione troppo compatti; First/Last rendevano la paginazione mobile affollata. | P1 | Fixato |
| Products mobile | Campo go-to-page sotto 44px. | P2 | Fixato |
| Staff mobile | Form staff con input/select/bottoni da 36-38px. | P2 | Fixato |
| Devices mobile | Filtri, search, details, accordion e azioni device sotto 44px. | P2 | Fixato |
| Platform mobile | Nav Platform e logout mobile con target compatti. | P2 | Fixato |
| Desktop | Layout desktop gia buono, da preservare. | Guardrail | Verificato |

## Implementazione

- Navigation Shop Admin mobile compressa in una singola riga orizzontale
  scrollabile, con link `min-h-11`; desktop resta sezionato sotto `lg`.
- Safety box ShopShell nascosto sotto `lg` per ridurre primo viewport mobile.
- Login tab e language switcher portati a 44px su mobile, ripristino compatto
  sopra breakpoint.
- Products:
  - input filtri `h-11` su mobile e `md:h-9` su desktop;
  - bottoni filtri `min-h-11` su mobile;
  - row actions full-width e 44px sotto `sm`, compatte sopra `sm`;
  - toolbar prodotti full-width mobile;
  - paginazione mobile su griglia, First/Last nascosti sotto `sm`;
  - go-to-page `h-11` mobile e `sm:h-10`.
- StaffActionPanel e DeviceActionPanel alzati a target mobile 44px, con
  ripristino `sm:h-10`/`sm:min-h-0`.
- DeviceRegistryView filtri, search, details link, accordion e action forms
  resi tappabili su mobile.
- Platform nav/logout mobile alzati a 44px con ripristino desktop.
- Foundation tests aggiornati per il nuovo contratto responsive mobile-first.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Repo sincronizzato con `origin/main`, no branch creato. | `PASS` |
| CA-02 | TASK-084/TASK-085 verificati in `REVIEW_READY` e non marcati `DONE`. | `PASS` |
| CA-03 | Android Emulator/Chrome reale verifica login admin, shop-code, OAuth entry point e products autenticato. | `PASS` |
| CA-04 | Playwright mobile Pixel/iPhone verifica login, `/shop`, products, staff, POS, devices. | `PASS` |
| CA-05 | Products mobile mostra totale esatto e range pagina, senza copy unavailable. | `PASS` |
| CA-06 | OAuth Google non logga URL completi e arriva a `accounts.google.com` in locale/Android. | `PASS` |
| CA-07 | Desktop sanity login, `/shop`, `/shop/products` senza overflow. | `PASS` |
| CA-08 | Gate locali richiesti passano. | `PASS` |
| CA-09 | `npm run smoke:task085:staging` su workers.dev resta verde. | `PASS_OAUTH_RETEST_PRODUCTS_AUTH_SKIPPED` |
| CA-10 | Handoff/evidence aggiornati senza secret. | `PASS` |

## File modificati

- `src/app/auth/login/page.tsx`
- `src/components/language-switcher.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/components/platform/AppShell.tsx`
- `src/components/platform/PlatformSidebarNav.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/_components/StaffActionPanel.tsx`
- `src/app/shop/_components/DeviceActionPanel.tsx`
- `src/app/shop/_components/DeviceRegistryView.tsx`
- `src/app/shop/_components/CopyDeviceIdentifierButton.tsx`
- `tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
- `tests/foundation/task-068m-product-list-readability-icons.test.mjs`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-086-mobile-ui-emulator-polish.md`
- `docs/TASKS/EVIDENCE/TASK-086/README.md`
- `docs/TASKS/TASK-084-admin-web-workers-dev-staging-auth-logout-win7pos-public-connection.md`
- `docs/TASKS/TASK-085-workers-dev-mobile-oauth-products-count-readiness.md`
- `docs/TASKS/EVIDENCE/TASK-084/README.md`
- `docs/TASKS/EVIDENCE/TASK-085/README.md`

## Verifiche

PASS:

- `npm run security:scan`
- `npm run test:foundation` (`463` pass)
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify`
- `npm run cf:build`
- Playwright mobile Pixel/iPhone locale, autenticato con sessione staff
  temporanea revocata in cleanup.
- Android Emulator/Chrome reale con `adb reverse` e CDP metrics.
- Desktop sanity login, `/shop`, `/shop/products`.

FAIL esterno:

- `npm run smoke:task085:staging` su
  `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`
  fallisce prima del click Google: login mobile workers.dev renderizza
  Cloudflare `Error 1102` / `Worker exceeded resource limits`.

Reviewer retest 2026-06-28:

- `PLAYWRIGHT_BASE_URL=https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev npm run smoke:task085:staging`
  termina `0`.
- OAuth mobile workers.dev: `PASS` 5/5 redirect a
  `accounts.google.com/v3/signin/identifier`.
- Products authenticated smoke: `SKIP` per assenza di
  `TASK085_SHOP_CODE`/`STAFF_CODE`/`STAFF_PIN` nella shell review.

## Stato TASK-084/TASK-085

TASK-084 e TASK-085 restano `REVIEW_READY`, non `DONE`. Il gate workers.dev
OAuth e tornato verde nel retest reviewer del 2026-06-28, ma Codex non marca
task `DONE` e il sub-smoke products autenticato non e stato rieseguito senza
credenziali staff dedicate.

Questo non annulla i fix locali e il codice TASK-085:

- la route/action OAuth non hanno probe provider server-side;
- products continua a usare exact count-only/head;
- Android/local Playwright arriva a `accounts.google.com` con URL redatto;
- products mobile autenticato mostra exact total e range.

## Rischi residui

- Staging workers.dev OAuth e verde nel retest del 2026-06-28; products
  authenticated staging smoke resta non eseguito in assenza di credenziali
  staff dedicate nella shell reviewer.
- Google completion reale con credenziali/2FA non eseguito.
- Windows 7 fisico/VM, catalog pull fisico e sales sync fisico restano fuori
  scope e non bloccano TASK-086.
- OpenNext `cf:build` termina `0` ma stampa warning di copia pacchetti
  `compress-commons`, `crc32-stream`, `zip-stream`, gia non bloccanti.
- Warning build noti: convenzione `middleware` deprecata verso `proxy`, Node
  `DEP0205 module.register`.

## Prossima fase

Review utente su TASK-086. Prima di chiudere TASK-084/TASK-085 a `DONE`,
rieseguire `smoke:task085:staging` su workers.dev dopo staging sano o redeploy
staging autorizzato.
