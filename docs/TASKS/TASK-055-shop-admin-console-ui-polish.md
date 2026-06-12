# TASK-055 - Shop Admin Console UI polish: menu, header shop e catalog cards

## Informazioni generali

- ID: `TASK-055`
- Titolo: `Shop Admin Console UI polish: menu, header shop e catalog cards`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `REVIEWER_DONE_GATE`
- Data apertura: `2026-06-11`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-055/README.md`

## Dipendenze

- Documenti letti:
  - `AGENTS.md`
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-054-shop-admin-auth-navigation-sidebar-diagnostics.md`
  - guide Next.js locali in `node_modules/next/dist/docs/`
- Task precedenti:
  - `TASK-052`
  - `TASK-053`
  - `TASK-054`
- Decisioni rilevanti:
  - `POS/Staff` resta modulo interno della `Shop Admin Console`.
  - `company_rut` e `shop_code` restano separati.
  - Account personale e staff POS restano separati.
- Dipendenze tecniche:
  - Next.js App Router
  - TypeScript
  - Tailwind CSS
  - Supabase SSR/server-only gia presente

## Scopo

Migliorare la qualita visiva e la chiarezza della `Shop Admin Console` per
menu laterale, header shop, filtri catalogo, card categorie, pannelli
import/export e copy ruoli, senza introdurre nuove feature, schema, migration,
ruoli granulari o CRUD extra.

## Contesto

Dopo `TASK-054`, la navigazione Shop Admin e stabile, ma il menu resta piu
pesante della Master Console, l'header puo mostrare uno shop code come nome,
alcuni form catalogo hanno allineamenti deboli, Import/Export e troppo stretto
in quattro colonne, e la pagina Roles usa wording troppo definitivo per un
editor ruoli che non esiste.

## Non incluso

- Nessuna nuova migration, RPC, RLS o modifica schema.
- Nessuna nuova dipendenza.
- Nessun role editor, CRUD ruoli o modello permessi granulare.
- Nessuna console POS separata.
- Nessun cambio a Win7POS, Android, iOS o Cash Register.
- Nessun dato finto/dashboard inventata.
- Nessun secret, service-role client/browser, token o credenziale hardcoded.
- Nessun commit, push, stage finale o deploy production.
- Nessuna modifica Platform Admin oltre al confronto gia letto.

## File potenzialmente coinvolti

- Documentazione:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-055-shop-admin-console-ui-polish.md`
  - `docs/TASKS/EVIDENCE/TASK-055/README.md`
- Codice:
  - `src/components/shop/ShopShell.tsx`
  - `src/components/shop/shopLayout.ts`
  - `src/components/shop/shopSections.ts`
  - `src/app/shop/settings/page.tsx`
  - `src/app/shop/actions.ts`
  - `src/server/shop-admin/action-context.ts`
  - `src/server/shop-admin/shop-access.ts`
  - `src/server/shop-admin/data-access.ts`
  - `src/server/shop-admin/settings-mutations.ts`
  - `src/server/shop-admin/shop-section-data.ts`
  - `src/app/shop/products/page.tsx`
  - `src/app/shop/categories/page.tsx`
  - `src/app/shop/import-export/page.tsx`
  - `src/app/shop/sync/page.tsx`
  - `src/app/shop/devices/page.tsx`
  - `src/app/shop/members/page.tsx`
  - `src/app/shop/roles/page.tsx`
  - `src/app/shop/_components/ActionResultBanner.tsx`
  - `src/app/shop/_components/CatalogActionPanel.tsx`
  - `src/app/shop/_components/ImportExportActionPanel.tsx`
  - `src/app/shop/_components/DeviceActionPanel.tsx`
  - `src/app/shop/_components/MemberActionPanel.tsx`
  - `src/app/shop/_components/StaffActionPanel.tsx`
- Test:
  - `tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
  - test foundation esistenti da allineare se necessario

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Sidebar Shop piu compatta, leggibile, con active state chiaro e guardrail meno ingombranti. | Test foundation + review codice/UI | `PASS` |
| CA-02 | Header mostra nome shop reale in evidenza e dettaglio `Company RUT: 12.345.678-9` quando disponibile, senza `Shop code:` nel topbar/header. | Test foundation + review codice/UI | `PASS` |
| CA-03 | Flusso staff manager propaga nome shop/RUT server-side quando disponibili, senza service-role client. | Test foundation + review codice | `PASS` |
| CA-04 | Filtri Products allineano input e pulsanti, mantengono query params/server logic e usano placeholder richiesto. | Test foundation + review codice/UI | `PASS` |
| CA-05 | Card Categories create/update/archive sono piu bilanciate, con input e bottoni allineati. | Test foundation + review codice/UI | `PASS` |
| CA-06 | Import/Export evita overflow, usa colonne leggibili e controlli contenuti. | Test foundation + review codice/UI | `PASS` |
| CA-07 | Roles usa copy `Granular editing: Not available yet` e resta matrice read-only senza editor/schema/CRUD. | Test foundation + review codice | `PASS` |
| CA-08 | Settings Shop Admin mostra profilo/fiscal identity read-only e non espone form o Server Action di update; la mutation residua fallisce chiusa con `SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE`. | Test foundation + review codice | `PASS` |
| CA-09 | Sync filters e action cards Devices/Members sono allineati a Suppliers/Categories con input/select `h-10`, `min-w-0`, card flex e bottoni in basso, senza cambiare action o logica. | Test foundation + smoke auth | `PASS` |
| CA-10 | PageHeader, metriche, tabelle/card, filter bar, banner e action panel Shop Admin usano un unico frame centrale `mx-auto w-full max-w-7xl`; le metriche evitano il layout desktop 3+1 usando quattro colonne a `xl` quando ci sono 4+ metriche. | Test foundation + review codice/UI | `PASS` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|---|
| CA-01 | Foundation/UI | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` + screenshot/review locale se disponibile | `PASS` | README evidence |
| CA-02 | Foundation/UI | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | `PASS` | README evidence |
| CA-03 | Foundation/code | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | `PASS` | README evidence |
| CA-04 | Foundation/UI | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | `PASS` | README evidence |
| CA-05 | Foundation/UI | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | `PASS` | README evidence |
| CA-06 | Foundation/UI | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | `PASS` | README evidence |
| CA-07 | Foundation/code | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | `PASS` | README evidence |
| CA-08 | Foundation/code | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | `PASS` | README evidence |
| CA-09 | Foundation/UI | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` + smoke auth se Supabase locale disponibile | `PASS` | README evidence |
| CA-10 | Foundation/UI | `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` + `rg` frame locali | `PASS` | README evidence |

## Matrice test/check

| Test | Tipo | Quando eseguirlo | PASS | FAIL | BLOCKED | NOT_RUN |
|---|---|---|---|---|---|---|
| `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | Targeted | Prima RED e dopo fix | Aspettative UI passano | Regressione contratto TASK-055 | - | - |
| `npm run test:foundation` | Regression | Dopo fix | Suite foundation passa | Regressione foundation | - | - |
| `npm run lint` | Static | Dopo fix | Nessun errore lint | Errore lint | - | - |
| `npm run typecheck` | Static | Dopo fix | TypeScript passa | Errore typecheck | - | - |
| `npm run build` | Build | Dopo fix | Build exit 0 | Build fallita | - | - |
| `npm run verify` | Regression | Dopo fix, se tempo/ambiente | Verify exit 0 o warning noti | Verify fallita | Ambientes mancanti | Motivo documentato |
| `npm run test:shop-admin-auth-smoke` | Smoke auth | Se Supabase locale disponibile | Smoke passa | Regressione auth | Supabase locale non disponibile | Motivo documentato |
| `git diff --check` | Git hygiene | Prima handoff | Nessun whitespace error | Whitespace error | - | - |
| `git status --short` | Git hygiene | Prima handoff | Diff atteso | Diff inatteso | - | - |

## Decisioni

- Decisioni gia prese:
  - Il task e solo UI/polish con un piccolo arricchimento server-side del
    contesto shop gia disponibile.
  - Staff manager puo usare il resolver server-side esistente per leggere nome
    shop/RUT, senza esporre service-role al client.
- Alternative escluse:
  - Role editor o schema permessi granulare.
  - Nuove tabelle/migration.
  - Refactor ampio del read model.
- Rischi accettati:
  - La verifica visuale dipende dalla disponibilita di server locale/browser.

## Planning

- Obiettivo compreso:
  - Rendere Shop Admin piu leggibile e coerente con Master Console senza
    cambiare capability o confini auth.
- Piano minimo:
  - Aggiungere test foundation RED.
  - Aggiornare shell/header/server context.
  - Sistemare form catalog/import e copy roles.
  - Eseguire check e documentare evidence.
- Safety gates:
  - No service-role client/browser.
  - No secret.
  - No migration/schema/RLS.
  - No DONE senza review/conferma utente.
- Follow-up candidati separati:
  - Eventuale redesign piu profondo con Figma.
  - Ruoli granulari solo con task schema/permissions dedicato.

## Execution

- File controllati:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-054-shop-admin-auth-navigation-sidebar-diagnostics.md`
  - guide Next.js locali in `node_modules/next/dist/docs/`
  - `src/components/platform/AppShell.tsx`
  - `src/components/platform/PlatformSidebarNav.tsx`
  - `src/components/platform/platformData.ts`
  - `src/components/shop/ShopShell.tsx`
  - `src/components/shop/shopSections.ts`
  - `src/server/shop-admin/shop-access.ts`
  - `src/server/shop-admin/data-access.ts`
  - `src/server/shop-admin/read-model.ts`
  - `src/server/shop-admin/permissions.ts`
  - `src/server/shop-admin/shop-section-data.ts`
  - `src/app/shop/products/page.tsx`
  - `src/app/shop/categories/page.tsx`
  - `src/app/shop/import-export/page.tsx`
  - `src/app/shop/roles/page.tsx`
  - `src/app/shop/_components/CatalogActionPanel.tsx`
  - `src/app/shop/_components/ImportExportActionPanel.tsx`
  - `src/components/admin/PageHeader.tsx`
  - `src/components/admin/SectionCard.tsx`
  - `src/components/admin/AdminDataTable.tsx`
  - `src/components/admin/GuardrailNotice.tsx`
  - `src/components/shop/ShopSectionPage.tsx`
  - test foundation correlati
- Modifiche fatte:
  - Aperto tracking `TASK-055` e test foundation RED/GREEN.
  - Sidebar Shop resa piu compatta con active state a bordo sinistro,
    scroll verticale contenuto e guardrail collassati in `details`.
  - Header Shop aggiornato con nome shop normalizzato e riga
    `Company RUT: ...` formattata quando il RUT e disponibile, senza
    `Shop code:` nel topbar/header.
  - Accesso shell personale esteso a `company_rut`; accesso staff manager
    arricchito server-side da `shops` con fallback sicuro.
  - Products filter bar riallineata con input/pulsanti `h-10`, `min-w-0` e
    placeholder richiesto.
  - Card CatalogActionPanel rese flex/min-width safe con bottoni allineati.
  - ImportExportActionPanel portato a due colonne leggibili, input/file input
    full-width e testo anti-overflow.
  - Roles aggiornata a `Granular editing: Not available yet` con matrice
    read-only invariata.
  - Security/test foundation storici riallineati ai nuovi helper e al blocco
    safety compatto.
- Check eseguiti:
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
    RED: `FAIL` atteso 1/6 PASS, 5/6 FAIL.
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
    GREEN: `PASS`, 6/6.
  - `node --test tests/foundation/task-014-design-system.test.mjs tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`:
    `PASS`, 13/13.
  - `npm run lint`: `PASS`.
  - `npm run typecheck`: `PASS`.
  - `npm run security:scan`: `PASS`.
  - `npm run test:foundation`: `PASS`, 247/247.
  - `npm run build`: `PASS_WITH_WARNINGS`, exit code 0; warning noti Next
    `middleware` deprecation e Node `[DEP0205]`.
  - `npm run verify`: `PASS_WITH_WARNINGS`, exit code 0; stessi warning.
  - `npm run test:shop-admin-auth-smoke` con env Supabase locale mappato da
    Supabase CLI senza stampare segreti: `PASS`, 4/4.
  - Visual check: screenshot autenticato dello smoke aperto e verificato
    visivamente; sidebar/header non sovrapposti e safety compatto.
- Rischi rimasti:
  - Browser MCP diretto non era esposto dal tool discovery; verifica visuale
    fatta via Playwright smoke screenshot e `view_image`.
  - Il warning framework `middleware` -> `proxy` resta follow-up separato.
  - Nessun test Safari reale rieseguito in questo task; coperto da `TASK-054`.
- Handoff:
  - Superato DONE gate finale 2026-06-11; task riconciliato a `DONE_RECONCILED`.

## Review

- Decisione: `DONE_RECONCILED`
- Conferma utente: richiesta `Final Review / DONE Gate - TASK-055 + TASK-056 Admin Web` del 2026-06-11.
- Evidence verificata:
  - Foundation mirato `TASK-055`: `PASS`, 11/11.
  - Shop Admin auth smoke con Supabase locale process-only: `PASS`, 4/4.
  - Suite foundation completa post-tracking: `PASS`, 257/257.
  - `lint`, `typecheck`, `security:scan`, `build`, `verify`: `PASS` / `PASS_WITH_WARNINGS` solo per warning toolchain noti.
- Problemi:
  - Nessun blocker prodotto o sicurezza residuo nello scope TASK-055.
  - Warning non bloccanti: Next `middleware` deprecato verso `proxy`, Node `[DEP0205]`.
- Condizioni per passare a `DONE`:
  - Soddisfatte; nessun commit, push o stage finale.

## Fix

- Richieste di fix ricevute:
  - Review-fix 2026-06-11: header Shop deve mostrare il nome shop reale e
    `Company RUT` formattato senza fallback allo shop code; Settings deve
    diventare completamente read-only in Admin Console, con gestione profilo e
    fiscal identity solo da Master Console.
  - Review-fix 2 2026-06-11: Sync Center ha filter bar disallineata; Devices
    e Members hanno action card inferiori con input/bottoni non allineati
    rispetto allo stile gia corretto di Suppliers/Categories.
  - Review-fix 3 2026-06-11: le superfici Shop Admin non condividono un frame
    centrale uniforme; PageHeader/metriche/tabelle, filtri, banner e action
    panel possono partire/finire su assi diversi, e le metriche a 4 item
    rischiano un layout desktop 3+1.
- Correzioni fatte:
  - Aggiunto helper RUT cileno no-dependency per `company_rut` / `Company RUT`
    (`123456789` -> `12.345.678-9`, DV `K/k` supportato).
  - Header `SHOP WORKSPACE` usa il nome shop reale quando presente, non
    costruisce piu `Shop ${shopCode}` e mostra `Company RUT: Not configured`
    se manca `company_rut`, senza fallback allo shop code.
  - Fix screenshot review: `src/app/shop/layout.tsx` per staff manager passa
    ora `access.selectedShop` allo shell, evitando il vecchio fallback
    `shopName: principal.shop.shopCode` che causava `Shop name not configured`
    / `Company RUT: Not configured` anche quando Settings aveva dati completi.
  - Rimossi form, confirmation `SETTINGS`, submit `Update settings`, banner
    action e preflight `settings.write` dalla pagina Settings.
  - `updateShopSettingsAction` non e piu esportata da `src/app/shop/actions.ts`.
  - `settings-mutations.ts` resta server-only ma fallisce chiusa con
    `SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE`, senza update su `shops`.
  - Metric/copy Settings aggiornati a `Profile updates` /
    `Master Console only`.
  - Sync Center filter bar aggiornata con classi dedicate, input/select `h-10`,
    `w-full`, `min-w-0`, placeholder brevi e bottone `Apply filters`
    allineato; query param e `syncFilters` invariati.
  - Devices action cards aggiornate a card flex/min-width safe, input full
    width `h-10`, griglia responsive `md:grid-cols-2` / `xl:grid-cols-4` e
    bottoni `mt-auto` in basso; action e campi invariati.
  - Members action cards aggiornate con lo stesso pattern, compreso select
    ruolo `h-10`; `Remove member` resta amber/danger e action/campi invariati.
  - Aggiunto `SHOP_ADMIN_CONTENT_FRAME_CLASS = "mx-auto w-full max-w-7xl"` in
    `src/components/shop/shopLayout.ts` come frame condiviso Shop Admin.
  - `ShopSectionPage` usa il frame condiviso per PageHeader, metriche e
    SectionCard/table; la griglia metriche resta a 3 colonne per 3 metriche e
    passa a `md:grid-cols-2 xl:grid-cols-4` per 4+ metriche, evitando il 3+1
    desktop.
  - Products/Categories/Suppliers, Sync, Audit, Settings, ActionResultBanner,
    CatalogActionPanel, ImportExportActionPanel, DeviceActionPanel,
    MemberActionPanel e StaffActionPanel usano il frame condiviso invece di
    stringhe locali `mx-auto` / `max-w-7xl`.
  - Controllo statico `rg -n "mx-auto|max-w-7xl|max-w-6xl" src/app/shop src/components/shop`:
    resta solo la costante condivisa.
- Check rieseguiti:
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
    RED review-fix: `FAIL` atteso, 5/7 PASS e 2/7 FAIL.
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
    RED layout staff: `FAIL` atteso, 6/7 PASS e 1/7 FAIL.
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
    RED review-fix 2: `FAIL` atteso, 7/10 PASS e 3/10 FAIL.
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`:
    RED review-fix 3: `FAIL` atteso, 10/11 PASS e 1/11 FAIL per assenza del
    modulo `src/components/shop/shopLayout.ts`.
  - `node --test tests/foundation/task-055-shop-admin-ui-polish.test.mjs`:
    `PASS`, 11/11.
  - `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`:
    `PASS`, 4/4.
  - `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs`:
    `PASS`, 6/6.
  - `npm run test:foundation`: `PASS`, 257/257 post DONE-gate tracking.
  - `npm run lint`: `PASS`.
  - `npm run typecheck`: `PASS`.
  - `npm run security:scan`: `PASS`.
  - `npm run build`: `PASS_WITH_WARNINGS`, exit code 0; warning noti Next
    `middleware` deprecation e Node `[DEP0205]`.
  - `npm run verify`: `PASS_WITH_WARNINGS`, exit code 0; stessi warning.
    Primo tentativo non valido per build parallelo concorrente; rerun seriale
    riuscito.
  - `npm run test:shop-admin-auth-smoke` con env Supabase locale mappato da
    Supabase CLI senza stampare segreti: `PASS`, 4/4.
  - `rg -n "mx-auto|max-w-7xl|max-w-6xl" src/app/shop src/components/shop`:
    `PASS`, solo `src/components/shop/shopLayout.ts`.
  - Browser in-app su `http://127.0.0.1:3037/shop/settings`: `PASS`, route
    locale raggiungibile e guard `Admin Console access required` visibile senza
    sessione.
  - Visual check autenticato: screenshot prodotto dallo smoke e aperto con
    `view_image`; PageHeader, metriche 4-colonne `xl` e tabella risultano
    allineati allo stesso frame centrale.

## Chiusura

- Stato finale: `DONE_RECONCILED`.
- Conferma utente: `Final Review / DONE Gate - TASK-055 + TASK-056 Admin Web`.
- Data chiusura: `2026-06-11`.
- Follow-up aperti:
  - Migrazione framework `middleware` -> `proxy` resta task separato.
  - Vercel/Cloudflare production, Win7POS live e Sales Sync live restano parcheggiati/non promossi.
  - Nessun commit, push o stage finale eseguito.
