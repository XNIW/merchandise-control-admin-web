# TASK-008 - Shop Admin Console Shell

## Informazioni generali

- ID: `TASK-008`
- Titolo: Shop Admin Console Shell
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / DONE_RECONCILIATION`
- Data apertura: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-008/README.md`
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Review finale / DONE reconciliation - 2026-05-30

- Verdict finale: `DONE_RECONCILED`.
- Fix applicati durante la review finale: nessun fix specifico TASK-008; confermata shell placeholder protetta e distinta da Platform Admin.
- Check freschi:
  - `npm run typecheck`: `PASS`.
  - `npm run lint`: `PASS`.
  - `npm run test:foundation`: `PASS`, 32 test passati.
  - `npm run security:scan`: `PASS`.
  - `npm run build`: `PASS_WITH_WARNINGS`, tutte le route `/shop/*` dynamic; solo warning Node `DEP0205` gia noto.
  - `npm run test:ui-smoke` con `next start` production su `127.0.0.1:3106`: `PASS_WITH_WARNINGS`, 44 test passati.
  - `git diff --check`: `PASS`.
- Supabase linked: migration list/dry-run/lint/advisors security `PASS`; nessuna migration nuova introdotta in TASK-008.
- Acceptance criteria finali: `PASS`; nessun blocker critico aperto.
- Rischi residui accettati: shell autorizzata non verificata con utente reale shop_owner/shop_manager; placeholder intenzionali e dichiarati.
- Non fatto: nessun read model shop-scoped reale, nessun CRUD/import/export/staff POS/devices reali, nessun commit, nessun push, nessun TASK-010 aperto.

## Scopo

Creare la base navigabile della `Shop Admin Console`, protetta server-side da `TASK-007`, con layout professionale e route placeholder dichiarate.

Route candidate:

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

## Non scope

- Nessun read model shop-scoped reale.
- Nessun CRUD prodotti/categorie/fornitori.
- Nessun import/export reale.
- Nessuna gestione membri/ruoli/permessi reale.
- Nessun POS login, PIN/password o hashing credenziali staff.
- Nessuna gestione dispositivi reale.
- Nessuna migration Supabase.
- Nessuna nuova dipendenza.
- Nessun dato finto spacciato per live.

## Piano execution

1. Leggere docs Next.js locali per layout/page route App Router.
2. Creare componenti shell Shop Admin dedicati.
3. Aggiungere layout `/shop` protetto, riusando il resolver TASK-007.
4. Aggiungere pagine placeholder dichiarate per le sezioni Shop Admin.
5. Aggiornare harness foundation/security/e2e.
6. Eseguire check reali e aggiornare evidence.

## Criteri di accettazione

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | `/shop` usa un layout Shop Admin dedicato e protetto server-side | `PASS` |
| CA-02 | Sidebar/topbar Shop Admin sono distinte da Platform Admin | `PASS` |
| CA-03 | Tutte le route candidate esistono e renderizzano placeholder dichiarati | `PASS` |
| CA-04 | Nessun dato placeholder viene presentato come live | `PASS` |
| CA-05 | Nessun import `@/server` in componenti client | `PASS` |
| CA-06 | Route Shop Admin auth-scoped restano dynamic | `PASS` |
| CA-07 | Check locali eseguiti con evidence reale | `PASS` |

## Implementazione

- Aggiunto layout protetto `src/app/shop/layout.tsx`.
- Aggiunta shell dedicata `src/components/shop/ShopShell.tsx` con navigazione Shop Admin, skip link, topbar e status.
- Aggiunta configurazione sezioni `src/components/shop/shopSections.ts`.
- Aggiunta pagina comune `src/components/shop/ShopSectionPage.tsx` con placeholder dichiarati.
- Aggiunte route:
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
- Aggiornati harness foundation, security scan e Playwright smoke.

## Evidence check

Vedi `docs/TASKS/EVIDENCE/TASK-008/README.md`.

Risultati principali:

- `node --test tests/foundation/shop-admin-shell.test.mjs`: `PASS`, 3 test passati.
- `npm run typecheck`: `PASS`
- `npm run lint`: `PASS`
- `npm run test:foundation`: `PASS`, 28 test passati
- `npm run security:scan`: `PASS`
- `npm run build`: `PASS`, tutte le route `/shop/*` dynamic
- `npm run verify`: `PASS`
- `npm run test:ui-smoke` via `next start` su `127.0.0.1:3004`: `PASS`, 44 test passati

## Rischi residui

- La shell autorizzata non e stata verificata con una vera sessione `shop_owner` / `shop_manager`: manca una fixture live sicura dedicata.
- Le pagine Shop Admin sono placeholder dichiarati; read model, switcher, CRUD, import/export, membri, staff, devices, settings e audit reale restano fuori scope.
- Nessuna migration Supabase introdotta in questo task.

## Handoff finale

TASK-008 e chiuso a `DONE` nella reconciliation finale autorizzata dall'utente. Prossimo passo consigliato: aprire `TASK-010 - Shop Read Model Real Data` come task separato.
