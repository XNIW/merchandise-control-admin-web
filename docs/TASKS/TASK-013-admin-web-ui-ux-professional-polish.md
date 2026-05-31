# TASK-013 - Admin Web UI/UX Professional Audit & Polish

## Informazioni generali

- ID: `TASK-013`
- Titolo: Admin Web UI/UX Professional Audit & Polish
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / DONE_RECONCILIATION`
- Data apertura: 2026-05-31
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-013/README.md`
- Figma: `USED` - <https://www.figma.com/design/nw9wx6Q7jutwLGPHatGlWq>
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Scopo

Eseguire un audit repo-grounded della UI/UX esistente di `Platform Admin Console` e `Shop Admin Console`, poi applicare solo polish sicuri e verificabili.

Il task non aggiunge funzionalita business, CRUD, import/export, login POS, staff account, migration Supabase o nuove dipendenze.

## Letture completate

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/admin-dashboard.md`
- `docs/TASKS/TASK-006-platform-admin-controlled-actions.md`
- `docs/TASKS/TASK-007-auth-routing-route-protection.md`
- `docs/TASKS/TASK-008-shop-admin-console-shell.md`
- `docs/TASKS/TASK-009-shop-switcher.md`
- `docs/TASKS/TASK-010-shop-read-model-real-data.md`
- `docs/TASKS/TASK-011-shop-onboarding-live-gate.md`
- `docs/TASKS/TASK-012-pos-staff-credential-planning.md`
- `docs/TASKS/EVIDENCE/TASK-012/README.md`
- `src/app`
- `src/components`
- `src/components/platform`
- `src/components/shop`
- `src/server/auth`
- `src/server/shop-admin`
- `tests`
- `scripts/security-checks.mjs`
- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`
- `node_modules/next/dist/docs/03-architecture/accessibility.md`

## Pre-flight

| Check | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree gia sporco da TASK-012: `docs/MASTER-PLAN.md`, `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`, `scripts/security-checks.mjs`, `docs/TASKS/TASK-012...`, `docs/TASKS/EVIDENCE/TASK-012/`, `tests/foundation/pos-staff-credential-planning.test.mjs`. |
| Branch corrente | `PASS_WITH_NOTES` | `codex/task-012-pos-staff-credential-planning`; nessun branch nuovo creato. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff iniziale gia presente su documenti TASK-012 e security script. |
| `git diff --check` | `PASS` | Nessun whitespace error nel pre-flight. |

## Review finale / DONE reconciliation

Review richiesta esplicitamente dall'utente il 2026-05-31 con autorizzazione a portare `TASK-013` a `DONE_RECONCILED / DONE` solo se i gate critici passano.

Esito review:

- Qualita codice: `PASS`
  - modifiche UI scoped, nessun refactor ampio;
  - nessun `any` introdotto;
  - nessun import inutilizzato o codice morto rilevato dai gate.
- Architettura Next.js / React: `PASS`
  - App Router e routing esistente preservati;
  - nessun nuovo Server Action, Route Handler o bypass auth;
  - `ShopShell` resta Client Component solo per pathname/router/search params.
- Sicurezza: `PASS`
  - nessun secret, token, service-role, credential POS o dato reale introdotto;
  - nessuna esposizione cross-shop o staff credential runtime;
  - nessun dato finto presentato come live.
- Coerenza prodotto: `PASS`
  - Platform Admin resta globale;
  - Shop Admin resta shop-scoped;
  - POS/Staff resta placeholder interno Shop Admin, non terza console.
- UI/UX: `PASS`
  - selected shop context piu evidente;
  - nav mobile/tablet scrollabile e desktop grid preservata;
  - tabelle e placeholder piu chiari.
- Accessibilita: `PASS_WITH_NOTES`
  - skip link e focus visibile preservati;
  - context group Shop Admin reso semanticamente esplicito con `role="group"` e `aria-labelledby`;
  - QA autenticata completa resta limitata senza fixture/sessione sicura.
- Performance: `PASS`
  - nessuna query o bundle client aggiuntivo significativo;
  - nessuna nuova dipendenza;
  - nessun loop/render pesante introdotto.
- Testabilita/harness: `PASS`
  - gate TASK-013 aggiornato da `REVIEW` a `DONE_RECONCILED`;
  - `security:scan` resta severo e verifica stato finale.

Fix applicati durante la reconciliation:

- `src/components/shop/ShopShell.tsx`
  - selected shop context da `aria-label` su `div` generico a gruppo semantico con `role="group"` e `aria-labelledby`;
  - link nav con `whitespace-nowrap` per evitare wrap in scroll orizzontale mobile/tablet.
- `src/components/platform/AppShell.tsx`
  - link nav con `whitespace-nowrap`.
- `tests/foundation/admin-web-ui-polish.test.mjs`
  - aspettative aggiornate allo stato `DONE_RECONCILED / DONE`.
- `scripts/security-checks.mjs`
  - gate TASK-013 aggiornato per Master Plan `IDLE`, `Task attivo: NONE` e task finale `DONE`.
- `docs/MASTER-PLAN.md`
  - tracking corrente riconciliato a `IDLE`.
- `docs/TASKS/EVIDENCE/TASK-013/README.md`
  - evidence aggiornata con review finale, browser smoke e check.

## Route inventariate

- `/`
- `/auth/login`
- `/platform`
- `/platform/users`
- `/platform/shops`
- `/platform/audit`
- `/platform/system`
- `/platform/operations`
- `/shop`
- `/shop/overview`
- `/shop/products`
- `/shop/categories`
- `/shop/suppliers`
- `/shop/import-export`
- `/shop/members`
- `/shop/roles`
- `/shop/staff`
- `/shop/devices`
- `/shop/settings`
- `/shop/audit`

## UI/UX audit matrix

| Severita | Area | Problema | Evidence repo | Esito |
| --- | --- | --- | --- | --- |
| `HIGH` | Shop Admin topbar | Lo shop selezionato era disponibile nel select ma non abbastanza evidente come contesto operativo persistente. | `src/components/shop/ShopShell.tsx` mostrava solo testo generico `Current shop...`. | Fix: aggiunto summary `selected-shop-summary` con nome e codice shop. |
| `MEDIUM` | Shop/Admin mobile nav | Sidebar mobile restava una lista verticale lunga, pesante per route Shop Admin e Platform Admin. | `ShopShell` e `AppShell` usavano `grid gap-1` anche sotto desktop. | Fix: nav mobile a scorrimento orizzontale, desktop resta grid. |
| `MEDIUM` | Tables | Valori lunghi potevano allargare celle o peggiorare leggibilita su tablet/mobile. | `DataTable.tsx` e `ShopSectionPage.tsx` non avevano wrapping esplicito. | Fix: `break-words` e empty row esplicita Platform. |
| `MEDIUM` | Platform Operations copy | La UI esponeva copia interna `TASK006_TEST_` nella warning bar e placeholder. | `src/app/platform/operations/page.tsx`. | Fix: copy prodotto `development-safe test shops` e placeholder non task-specific. |
| `LOW` | Shop placeholder pages | Il titolo `Section status` era generico e meno chiaro per pagine non operative. | `src/components/shop/ShopSectionPage.tsx`. | Fix: titolo `Planned state`; copy guardrail reso piu leggibile come safety rules. |
| `LOW` | Metadata | Descrizione root ancora legata alla vecchia shell statica Platform. | `src/app/layout.tsx`. | Fix: descrizione aggiornata a Platform e Shop consoles. |
| `POLISH` | Platform page card copy | `table` e copy boundary erano tecnici e ridondanti. | `src/components/platform/PlatformPage.tsx`. | Fix: copy piu breve e operativo. |

## Figma / design direction

- Figma autenticato come `Min Xiang`.
- Ricerca design system nel nuovo file: nessun componente/stile/variabile disponibile.
- File creato: <https://www.figma.com/design/nw9wx6Q7jutwLGPHatGlWq>
- Board creata: `MerchandiseControl Admin Web TASK-013 UI UX Audit Board`
- Contenuti creati:
  - information architecture;
  - route inventory;
  - token direction;
  - Platform Admin wireframe;
  - Shop Admin wireframe;
  - state language;
  - polish target.

## Fix applicati

- `src/components/shop/ShopShell.tsx`
  - selected shop context esplicito con nome e codice;
  - nav Shop Admin mobile orizzontale scrollabile;
  - mantenimento `shop_id` nei link esistente preservato.
- `src/components/platform/AppShell.tsx`
  - nav Platform Admin mobile orizzontale scrollabile.
- `src/components/shop/ShopSectionPage.tsx`
  - `Planned state` per placeholder;
  - tabella live piu robusta con `break-words`;
  - safety rules copy piu comprensibile.
- `src/components/shop/shopSections.ts`
  - metriche e guardrail placeholder meno tecnici.
- `src/components/platform/components/DataTable.tsx`
  - wrapping per valori lunghi;
  - empty row esplicita quando non arrivano righe dal server boundary.
- `src/components/platform/PlatformPage.tsx`
  - copy tabella/read state piu pulito.
- `src/app/platform/operations/page.tsx`
  - rimossa copia interna `TASK006_TEST_` dalla UI.
- `src/app/layout.tsx`
  - metadata description aggiornata.
- `tests/foundation/admin-web-ui-polish.test.mjs`
  - gate statico TASK-013.
- `tests/foundation/pos-staff-credential-planning.test.mjs`
  - test TASK-012 aggiornato per non impedire task successivi.
- `scripts/security-checks.mjs`
  - gate TASK-013 e TASK-012 non legato a `Task attivo: NONE`.

## Criteri di accettazione

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | Audit UI/UX repo-grounded prodotto | `PASS` |
| CA-02 | Figma usato o fallback documentato | `PASS` |
| CA-03 | Nessuna nuova funzionalita business | `PASS` |
| CA-04 | Nessun dato finto spacciato per reale | `PASS` |
| CA-05 | Platform e Shop Admin piu chiare | `PASS` |
| CA-06 | Placeholder dichiarati meglio | `PASS` |
| CA-07 | Responsive migliorato o verificato | `PASS_WITH_NOTES` |
| CA-08 | Accessibilita base migliorata | `PASS_WITH_NOTES` |
| CA-09 | Check locali eseguiti o classificati | `PASS` |
| CA-10 | Evidence completa | `PASS` |
| CA-11 | Master Plan aggiornato con DONE solo dopo conferma utente | `PASS` |

## Check

La matrice finale dei check e in `docs/TASKS/EVIDENCE/TASK-013/README.md`.

## Supabase

Nessuna migration, nessuna scrittura e nessuna modifica schema. I check linked Supabase sono classificati in evidence.

## Rischi residui

- Le superfici autenticate Shop Admin e Platform Admin richiedono sessioni reali per QA visuale completo.
- Le pagine catalog/staff/devices/settings restano placeholder dichiarati.
- Non e stato introdotto un design system completo; il polish resta intenzionalmente leggero.

## Handoff

- Verdict finale: `DONE_RECONCILED`
- Stato finale: `DONE`
- Prossima fase: nessun task attivo; il progetto torna a `IDLE`.
- Nessun commit.
- Nessun push.
