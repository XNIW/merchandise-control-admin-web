# Evidence TASK-055

Verdict corrente: `DONE_RECONCILED`.

## Scope

- Shop Admin Console UI polish per menu, header shop, filtri/products,
  categories cards, import/export cards e copy roles.
- Nessun schema, migration, RPC, RLS, role editor, nuovo CRUD, nuova
  dipendenza, deploy production, commit o push.

## RED

- `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`:
  `FAIL` atteso, 1/6 PASS e 5/6 FAIL prima delle modifiche codice.
- Failure attese:
  - `companyRut` non presente nella shell/header.
  - staff manager shell shop non arricchito con nome/RUT da `shops`.
  - products filter bar senza placeholder e classi di allineamento dedicate.
  - catalog/import-export cards senza helper/layout anti-overflow richiesti.
  - Roles ancora con `Role editing: Blocked`.

## RED review-fix 2026-06-11

- `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`:
  `FAIL` atteso, 5/7 PASS e 2/7 FAIL prima del review-fix.
- Failure attese:
  - `TASK-055 Shop shell header shows real shop context and compact sidebar guardrails`:
    mancava `formatCompanyRut`, il topbar usava ancora `RUT: ... · Shop code: ...`
    e poteva costruire `Shop ${shopCode}`.
  - `TASK-055 review fix keeps Settings read-only and fail-closed to Master Console`:
    Settings esponeva ancora form, `updateShopSettingsAction`,
    confirmation `SETTINGS` e mutation aggiornabile.
- RED aggiuntivo da screenshot utente:
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`:
    `FAIL` atteso, 6/7 PASS e 1/7 FAIL.
  - Root cause: `src/app/shop/layout.tsx` per `pos_staff_manager` ricostruiva
    `availableShops` da `principal.shop`, impostando `shopName` uguale a
    `shopCode` e senza `companyRut`; Settings usava invece il read model
    completo, quindi mostrava correttamente `COMERCIALIZADORA TEST 1` e
    `12.345.678-9`.

## RED review-fix 2 2026-06-11

- `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`:
  `FAIL` atteso, 7/10 PASS e 3/10 FAIL.
- Failure attese:
  - `TASK-055 review fix 2 aligns Sync filters without changing server filters`:
    mancavano classi dedicate, input/select `h-10`, `min-w-0` e placeholder
    richiesti nella filter bar Sync.
  - `TASK-055 review fix 2 aligns Devices action cards like catalog cards`:
    Devices usava card/form `grid` semplici senza card flex, input full-width
    stabili o bottoni `mt-auto`.
  - `TASK-055 review fix 2 aligns Members action cards like catalog cards`:
    Members aveva lo stesso problema e il select role non aveva altezza
    allineata agli input.

## RED review-fix 3 2026-06-11

- `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`:
  `FAIL` atteso, 10/11 PASS e 1/11 FAIL.
- Failure attesa:
  - `TASK-055 review fix 3 keeps Shop Admin surfaces on one shared content frame`:
    mancava `src/components/shop/shopLayout.ts` e quindi non esisteva ancora
    un frame condiviso `SHOP_ADMIN_CONTENT_FRAME_CLASS`.

## GREEN / Check finali

- `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
  dopo review-fix 3: `PASS`, 11/11.
- `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`:
  `PASS`, 4/4.
- `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs`:
  `PASS`, 6/6.
- `node --test tests/foundation/task-014-design-system.test.mjs tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`:
  `PASS`, 13/13.
- `npm run lint`: `PASS`.
- `npm run typecheck`: `PASS`.
- `npm run security:scan`: `PASS`.
- `npm run test:foundation`: `PASS`, 257/257 dopo aggiornamento tracking DONE gate.
- `npm run build`: `PASS_WITH_WARNINGS`, exit code 0.
  - Warning noti: Next `middleware` deprecation verso `proxy`; Node
    `[DEP0205] module.register()`.
- `npm run verify`: `PASS_WITH_WARNINGS`, exit code 0 dopo rerun seriale.
  - Stessi warning noti di build.
  - Primo tentativo non valido: `Another next build process is already running`
    per build lanciato in parallelo.
- `npm run test:shop-admin-auth-smoke` con env Supabase locale mappato da
  Supabase CLI senza stampare segreti: `PASS`, 4/4.
- `rg -n "mx-auto|max-w-7xl|max-w-6xl" src/app/shop src/components/shop`:
  `PASS`, solo `src/components/shop/shopLayout.ts`.
- Browser in-app su `http://127.0.0.1:3037/shop/settings`: `PASS`, route
  locale raggiungibile e guard `Admin Console access required` visibile senza
  sessione.
- Visual check: screenshot autenticato generato dallo smoke e aperto con
  `view_image`; PageHeader, metriche 4-colonne `xl`, tabella, header e sidebar
  risultano coerenti e senza sovrapposizioni evidenti.

## Note ambientali

- Browser in-app usato per una verifica locale non autenticata del guard; la
  visuale autenticata resta coperta dallo screenshot Playwright dello smoke.
- Nessun check richiesto rimasto `NOT_RUN`.

## Review-fix summary

- Header `SHOP WORKSPACE`:
  - title: nome shop reale quando disponibile, senza fallback `Shop ${shopCode}`;
  - subtitle: `Company RUT: 12.345.678-9` con helper RUT cileno no-dependency;
  - `company_rut` mancante: `Company RUT: Not configured`;
  - nessun `Shop code:` nel topbar/header.
- Staff manager header:
  - `ShopLayout` passa ora `[access.selectedShop]` allo shell staff, quindi usa
    lo shop gia arricchito da `loadStaffShellShop` con `shop_name` e
    `company_rut`.
- Settings:
  - form `Shop name` / `Reason` / `Type SETTINGS as confirmation` rimosso;
  - submit `Update settings` rimosso;
  - copy visibile: `Shop profile and fiscal identity are managed by Master Console. Admin Console can view these fields but cannot edit them.`;
  - metric aggiornata a `Profile updates` / `Master Console only`;
  - `updateShopSettingsAction` rimossa da `src/app/shop/actions.ts`;
  - `settings-mutations.ts` fallisce chiusa con
    `SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE` e non aggiorna `shops`.
- Sync Center:
  - filter bar con classi dedicate, griglia desktop
    `Search` largo, `Domain`/`Source` medi, `Status` compatto e bottone a
    destra;
  - input/select `h-10`, `w-full`, `min-w-0`;
  - placeholder `Search sync events`, `Domain`, `Device or source`;
  - query param e `syncFilters` server-side invariati.
- Devices:
  - action cards `Register/Rename/Revoke/Reactivate device` in card flex
    min-width safe;
  - input full-width `h-10`;
  - bottoni `mt-auto` allineati in basso;
  - action, reason e confirmation invariati.
- Members:
  - action cards `Invite member/Update role/Remove member` allineate allo
    stesso pattern;
  - select role `h-10` come gli input;
  - `Remove member` resta amber/danger;
  - autorizzazioni, action e campi invariati.
- Frame centrale Shop Admin:
  - aggiunto `SHOP_ADMIN_CONTENT_FRAME_CLASS = "mx-auto w-full max-w-7xl"` in
    `src/components/shop/shopLayout.ts`;
  - `ShopSectionPage` usa il frame condiviso per PageHeader, metriche e
    SectionCard/table;
  - metriche a 4+ item usano `md:grid-cols-2 xl:grid-cols-4`, mentre 3 item
    restano a `md:grid-cols-3`;
  - Products/Categories/Suppliers, Sync, Audit, Settings, ActionResultBanner,
    CatalogActionPanel, ImportExportActionPanel, DeviceActionPanel,
    MemberActionPanel e StaffActionPanel usano il frame condiviso;
  - `rg -n "mx-auto|max-w-7xl|max-w-6xl" src/app/shop src/components/shop`
    trova solo la costante condivisa.
- Stato task: `DONE_RECONCILED` dopo final review / DONE gate 2026-06-11.

## Final review / DONE gate 2026-06-11

- Verdict: `DONE_RECONCILED`.
- Conferma utente: il brief allegato autorizza la chiusura a DONE solo con gate reali passati.
- Check aggiuntivi rieseguiti durante la review finale:
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`: `PASS`, 11/11.
  - `npm run security:scan`: `PASS`.
  - `npm run test:foundation`: `PASS`, 257/257.
  - `npm run lint`: `PASS`.
  - `npm run typecheck`: `PASS`.
  - `npm run build`: `PASS_WITH_WARNINGS`, solo warning noti Next `middleware` -> `proxy` e Node `[DEP0205]`.
  - `npm run verify`: `PASS_WITH_WARNINGS`, stessi warning.
  - `npm run test:shop-admin-auth-smoke` con Supabase locale process-only: `PASS`, 4/4.
  - `git diff --check`: `PASS`.
- Note:
  - `npm run db:local:status`: `FAIL_CLOSED` atteso per `.env.local` puntato a `supabase_cloud`; container locale e status redatto confermati.
  - Nessuna migration/schema/RLS/RPC introdotta da TASK-055.
  - Nessun service-role nel client/browser; Settings resta read-only e la mutation residua fallisce chiusa.
  - Screenshot TASK-035 rigenerati dallo smoke autenticato e mantenuti come evidence.
  - Nessun commit, push o stage finale.
