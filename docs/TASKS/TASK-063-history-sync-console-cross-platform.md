# TASK-063 - History Sync Console cross-platform diagnostics

## Informazioni generali

- ID: `TASK-063`
- Titolo: `History Sync Console cross-platform diagnostics`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED_INTEGRATION`
- Responsabile attuale: `NONE`
- Verdict tecnico: `HISTORY_SYNC_ALREADY_MERGED`
- Data normalizzazione tracking: `2026-06-15`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence primaria: `docs/TASKS/EVIDENCE/history-sync-cross-platform-contract.md`

## Contesto

La History Sync Console era gia presente su `main`, ma il tracking non aveva un
file task numerato dedicato. Questo file normalizza solo la governance e
collega l'implementazione gia mergeata all'evidence esistente, senza modificare
logica, UI, migration, seed o test.

La superficie Admin Console legge history mobile da `shared_sheet_sessions` e
attivita tecnica correlata da `sync_events`, mantenendole distinte dagli
`audit_logs` amministrativi.

## Scope di normalizzazione

- Confermare che History Sync Console e gia presente su `main`.
- Creare un task file ufficiale numerato per la feature gia mergeata.
- Collegare il task all'evidence cross-platform esistente.
- Aggiornare `docs/MASTER-PLAN.md` per sostituire il blocco non numerato con
  `TASK-063`.
- Documentare i file implementativi, migration, seed, test ed evidence gia
  inclusi nel repository.

## Non incluso

- Nessuna modifica a logica runtime.
- Nessuna modifica UI.
- Nessuna modifica migration/schema/RLS/RPC.
- Nessuna modifica seed.
- Nessuna modifica test.
- Nessuna nuova dipendenza.
- Nessun dato reale, secret, token, password, PIN o service-role key nel
  repository.

## File implementativi gia presenti

- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/components/shop/shopSections.ts`
- `src/app/shop/history/page.tsx`
- `src/lib/supabase/database.types.ts`
- `src/i18n/dictionaries.ts`

## Migration gia presenti

- `supabase/migrations/20260612015644_task_057_shop_scoped_mobile_history.sql`
- `supabase/migrations/20260615093000_history_session_diagnostics_view.sql`
- `supabase/migrations/20260615094000_history_legacy_mapped_member_rls.sql`

## Seed e script gia presenti

- `scripts/platform/seed-history-sync-demo.mjs`
- `package.json`:
  - `platform:local:seed:history-demo`
  - `platform:local:cleanup:history-demo`

## Test gia presenti

- `tests/foundation/task-history-sync-console.test.mjs`
- `tests/foundation/task-015-history.test.mjs`

## Evidence

- `docs/TASKS/EVIDENCE/history-sync-cross-platform-contract.md`
- `docs/TASKS/EVIDENCE/TASK-062/README.md` registra il gate mirato:
  `node --test tests/foundation/task-history-sync-console.test.mjs tests/foundation/task-015-history.test.mjs`
  con esito `PASS`, `8/8`.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | History Sync Console presente su `main`, con `HEAD` allineato a `origin/main` prima della normalizzazione tracking. | `PASS` |
| CA-02 | File implementativi, migration, seed, test ed evidence risultano presenti nel repository. | `PASS` |
| CA-03 | Task file numerato ufficiale creato per la feature gia mergeata. | `PASS` |
| CA-04 | Master Plan aggiornato con riferimento a `TASK-063`. | `PASS` |
| CA-05 | Diff della normalizzazione limitato a documentazione/tracking. | `PASS` |

## Check documentali e foundation

| Comando / metodo | Stato | Note |
|---|---|---|
| `git fetch origin main --prune` | `PASS` | `main` locale verificato contro remoto. |
| `git rev-parse HEAD origin/main` | `PASS` | Prima della normalizzazione entrambi puntavano a `db763e10e2c02a386d81b5270273590df9e90727`. |
| `find docs/TASKS -maxdepth 1 -type f -name 'TASK-0*.md'` | `PASS` | `TASK-063` era libero; ultimo task numerato esistente `TASK-062`. |
| `rg` mirato History Sync | `PASS` | Trovati read model, pagina, migration, seed, test ed evidence. |
| `node --test tests/foundation/task-history-sync-console.test.mjs tests/foundation/task-015-history.test.mjs` | `PASS` | `8/8` pass. |
| `git diff --check` | `PASS` | Exit code `0`, nessun output. |
| `git diff --name-status` | `PASS_WITH_PREEXISTING_DIRTY_FILE` | Diff tracked: `docs/MASTER-PLAN.md` e PNG evidence TASK-035 gia dirty prima di questo task. Il commit di normalizzazione deve includere solo `docs/MASTER-PLAN.md` e questo task file. |

## Handoff

- Fase corrente: `DONE_RECONCILED_INTEGRATION`.
- Verdict richiesto: `HISTORY_SYNC_ALREADY_MERGED` e
  `TASK_TRACKING_NORMALIZED`.
- Rischio residuo: nessun rischio runtime introdotto da questo task, perche il
  diff e documentale/tracking.
