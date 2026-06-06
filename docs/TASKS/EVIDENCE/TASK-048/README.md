# Evidence - TASK-048 Master Console secondary sections clarity and UX polish

## Sintesi

TASK-048 migliora la chiarezza delle schede secondarie della Master Console:
Devices, Sync, History, Support e Operations.

Review/fix decision: Devices and Sync are not top-level Master Console sidebar entries.
`/platform/devices` and `/platform/sync` remain internal read-only diagnostics/deep links.

TASK-047 remains in REVIEW and is a dependency, not automatically DONE.

## File Toccati

- `src/components/platform/platformData.ts`
- `src/components/platform/PlatformSidebarNav.tsx`
- `src/components/platform/PlatformPage.tsx`
- `src/server/platform-admin/platform-section-data.ts`
- `src/app/platform/devices/page.tsx`
- `src/app/platform/sync/page.tsx`
- `src/app/platform/operations/page.tsx`
- `src/components/platform/operations/ControlledOperationsWorkflow.tsx`
- `tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs`
- `tests/e2e/platform-admin.spec.ts`
- `tests/e2e/task-016-platform-admin-smoke.spec.ts`
- `tests/e2e/task-045-platform-master-console-final-review.spec.ts`
- `tests/foundation/*` active-task allowlist updates for `TASK-048`
- `scripts/security-checks.mjs`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-048-master-console-secondary-sections-ux-polish.md`
- `docs/TASKS/EVIDENCE/TASK-048/README.md`

## Migliorie per Scheda

### Devices

- `Device Signals` e una diagnostica interna read-only, non voce sidebar top-level.
- Empty state: `No device signals visible`.
- `source_device_id` e solo attribuzione sync/history.
- Next action verso Shops, Support e Operations solo per emergency device action.
- Copy esplicita che la gestione quotidiana device appartiene ad Admin Console.

### Sync

- `Sync Signals` e una diagnostica interna read-only, non voce sidebar top-level.
- Empty state: `No sync signals visible`.
- Nota esplicita: Sales Sync foundation exists, but live Win7POS sales sync is not verified yet.
- Non dichiara Sales Sync live.
- Next action verso Data, Support e Audit.
- Copy esplicita che il troubleshooting sync shop-level appartiene ad Admin Console.

### History

- Read-only history view per mobile/inventory history e high-level sync history.
- Empty state: `No history events visible`.
- Copy distingue History da Global Sync e Audit.

### Support

- Read-only diagnostic view per access, membership, shop setup, devices, sync e recent audit.
- Tabella con `Subject`, `Signal`, `State`, `Suggested next step`.
- `Impersonation: Out of scope`.
- Link verso Users, Shops, Data, Provisioning e Operations.
- Nessuna azione mutativa.

### Operations

- Workflow target shop -> action -> reason -> shop code confirmation -> submit.
- Warning visibile: development-safe test shops only.
- Copy esplicita: `Device emergency operations are global exceptions. Daily device management belongs to Admin Console.`
- Reason obbligatoria preservata.
- Confirmation shop code preservata.
- Server Actions esistenti usate come boundary mutativo.

## Prima / Dopo UX

| Area | Prima | Dopo |
| --- | --- | --- |
| Scopo pagina | Spesso implicito o tecnico | Blocco `Use this page to` con shows/use when/not included/empty state |
| Empty state | Fallback tecnico | Empty state umano per Devices, Sync, History, Support |
| Diagnostics | Dominanti su alcune pagine | Secondarie/collassate quando la lettura funziona |
| Sidebar | Devices/Sync visibili come sezioni primarie | Devices/Sync nascosti dalla sidebar primaria, route conservate come deep link diagnostici |
| Next action | Poco esplicita | Link verso Shops, Support, Data, Audit, Operations, Users, Provisioning |
| Operations layout | Form ripetuti per shop/action | Workflow con target e azione selezionati |

## Cosa NON e Cambiato

- No schema changes.
- No mock rows.
- No migration.
- No dati inventati.
- No service-role key lato browser/client.
- No Sales Sync live claim.
- No Win7POS live E2E claim.
- No impersonation.
- No Support mutativo.
- No rimozione reason/confirmation/audit.
- No commit durante l'execution TASK-048.
- No push durante l'execution TASK-048.
- No final stage durante l'execution TASK-048.
- Commit/push su `main` autorizzati dall'utente il 2026-06-05 come azione
  repository post-handoff, senza cambiare lo stato `REVIEW`.

## Check

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs` | `RED_CONFIRMED` | Prima run: `tests 3`, `fail 3`; mancavano tipi/copy, workflow Operations e docs. |
| `node --test tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs` | `PASS` | `tests 3`, `pass 3`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 205`, `pass 205`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` succeeded; `tsc --noEmit` exit `0`. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Exit `0`; warning noti Next `middleware` -> `proxy` e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati; stessi warning build. |
| `npm run test:ui-smoke:ci` | `PASS_WITH_WARNING` | Playwright protected-route smoke locale: `43 passed`, include `/platform/devices`, `/platform/sync`, `/platform/history`, `/platform/operations`, `/platform/support`; warning noti `NO_COLOR`/`FORCE_COLOR` e `[DEP0205]`. Non e una review autenticata delle tabelle Master Console. |
| Browser plugin in-app | `NOT_RUN_TOOL_UNAVAILABLE` | La ricerca strumenti ha esposto `node_repl`/Playwright, non il tool Browser dedicato. |
| `git diff --check` | `PASS` | Nessun output. |
| `git status --short --branch` | `PASS_WITH_DIRTY_WORKTREE` | Worktree sporco con modifiche TASK-048; branch `main...origin/main`. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Nessun output; nessun file staged. |

## Screenshot Consigliati

- `/platform/devices`
- `/platform/sync`
- `/platform/history`
- `/platform/support`
- `/platform/operations` in alto
- `/platform/operations` con shop/action selezionati

## Stato

- Stato task: `DONE_RECONCILED`
- Durante l'execution TASK-048: nessun commit, nessun push, nessun file staged.
- Post-handoff repository action: commit/push su `main` autorizzati dall'utente
  il 2026-06-05 dopo check freschi.

## Rischi Residui

- Il polish e source-backed solo dal read model esistente; se il read model non
  espone righe, la UI mostra empty state.
- Il smoke locale autenticato dipende dalla disponibilita di sessione/dev server
  locale sicuro.
- Sales Sync live e Win7POS live E2E restano non verificati.

## Prossimo Passo Consigliato

Review visiva delle cinque schede, poi conferma reviewer o fix puntuale.

## Riconciliazione DONE 2026-06-06

- Conferma esplicita utente ricevuta: `Metti in DONE tutte quelle che si può e poi fai merge nella main e poi commit push`.
- Stato finale: `DONE_RECONCILED`.
- La chiusura non promuove Win7POS live E2E, POS online/catalog pull, Sales Sync live o staging stabile: restano gate separati non eseguiti quando applicabile.
- Commit/push finale su `main` autorizzati dall'utente il 2026-06-06.
