# Evidence - TASK-049 Master Console Admins UI/UX polish

## Sintesi

TASK-049 applica un polish UI/UX piccolo e verificabile alla Master Console, con
priorita alla pagina Admins e micro-fix layout per Audit, Provisioning e
Operations.

Devices and Sync remain outside the primary Master Console sidebar.
`/platform/devices` e `/platform/sync` restano deep link diagnostici diretti con
titoli `Device Signals` e `Sync Signals`.

## File Toccati

### Runtime UI

- `src/app/platform/admins/page.tsx`
- `src/app/platform/provisioning/page.tsx`
- `src/components/admin/AdminDataTable.tsx`
- `src/components/platform/displayFormat.ts`
- `src/components/platform/AppShell.tsx`
- `src/components/platform/PlatformMasterDetail.tsx`
- `src/components/platform/PlatformPage.tsx`
- `src/components/platform/operations/ControlledOperationsWorkflow.tsx`
- `src/server/platform-admin/platform-section-data.ts`

### Governance e Tracking

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-049-master-console-admins-ui-ux-polish.md`
- `docs/TASKS/EVIDENCE/TASK-049/README.md`

### Harness e Guardrail

- `scripts/security-checks.mjs`
- `tests/foundation/admin-web-ui-polish.test.mjs`
- `tests/foundation/task-014-pos-staff-foundation.test.mjs`
- `tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs`
- `tests/foundation/task-020-win7pos-integration-planning.test.mjs`
- `tests/foundation/task-021-pos-backend-session-device.test.mjs`
- `tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs`
- `tests/foundation/task-027-catalog-pull-delta-sync.test.mjs`
- `tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs`
- `tests/foundation/task-032-permissions-hardening.test.mjs`
- `tests/foundation/task-033-https-pos-sales-mega-task.test.mjs`
- `tests/foundation/task-034-unified-project-progression.test.mjs`
- `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs`
- `tests/foundation/task-038-pos-manager-web-login.test.mjs`
- `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`
- `tests/foundation/task-040-runtime-readiness.test.mjs`
- `tests/foundation/task-041-runtime-completion.test.mjs`
- `tests/foundation/task-042-review-ci-win7pos-bridge.test.mjs`
- `tests/foundation/task-047-master-admin-access-model.test.mjs`
- `tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs`
- `tests/foundation/task-049-master-console-admins-ui-polish.test.mjs`

## Migliorie

### Admins

- Summary area con active admins, server-side audit boundary,
  self-lockout protection e metadata/redaction boundary.
- `Grant Platform Admin` piu compatta e non stirata dalla lista admin.
- `Active Platform Admins` piu leggibile con status, granted date e identifier
  lunghi wrappati.
- Reason, `Type REVOKE to confirm` e `Revoke admin` dentro danger zone
  espandibile.
- Copy: `Server blocks self-lockout and last-admin removal.`

### Audit

- Tabella con min-width e scroll orizzontale.
- Date mantenute su una riga quando possibile.
- Nessun raw metadata non redatto esposto.

### Provisioning

- Layout desktop piu compatto.
- Copy sul confine Platform Console / Shop Admin.
- Nessuna email reale, nuova RPC o auth flow.

### Operations

- Shop card robuste con codici lunghi.
- Copy device emergency di TASK-048 preservata.

## Review Fix Visuale

- Date Admins/Audit mostrate come `YYYY-MM-DD HH:mm UTC`; valore completo
  preservato in `title` sui punti renderizzati dalla tabella/UI.
- Grant ID, Profile ID, Shop ID e codici lunghi accorciati nel testo principale,
  con full value in `title` e wrapping/monospace.
- Admins mantiene `Server blocks self-lockout and last-admin removal.` e rende
  i controlli revoke piu sobri da chiusi.
- Diagnostics collassato in modo compatto quando non e contenuto principale.
- System/Data mappano `42501`, `NOT_RUN` e `PASS_WITH_NOTES` a label leggibili,
  lasciando i codici tecnici nei dettagli.
- Users/Shops detail mostrano nome principale come titolo e ID/codici sotto.
- Provisioning ha placeholder piu chiari e banner risultato vicino alla form
  corrispondente.
- Operations ha search/filter locale sui target shop e badge stato leggibili.

## Cosa NON e Cambiato

- No schema changes.
- No RPC changes.
- No RLS changes.
- No nuove dipendenze.
- No nuove feature operative.
- No raw metadata, secret, token o service-role key nel client/browser.
- No ripristino Devices/Sync nella sidebar primaria.
- No commit durante l'execution TASK-049.
- No push durante l'execution TASK-049.
- No final stage durante l'execution TASK-049.
- Commit/push su `main` autorizzati dall'utente il 2026-06-05 come azione
  repository post-handoff, senza cambiare lo stato `REVIEW`.

## Check

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-049-master-console-admins-ui-polish.test.mjs` | `RED_CONFIRMED` | Prima run: `tests 4`, `pass 1`, `fail 3`; mancavano Admins compact/danger zone, layout micro-UI e docs TASK-049. |
| `node --test tests/foundation/task-049-master-console-admins-ui-polish.test.mjs` review-fix | `RED_CONFIRMED` | Prima run review-fix: `tests 5`, `pass 2`, `fail 3`; mancavano helper date/ID/status, diagnostics compatte e search Operations. |
| `node --test tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs` | `PASS` | `tests 3`, `pass 3`; regressione TASK-048 preservata. |
| `node --test tests/foundation/task-049-master-console-admins-ui-polish.test.mjs` | `PASS` | `tests 5`, `pass 5`; review-fix visuale verificato. |
| `npm run security:scan` | `PASS` | Nessun secret, service-role client o raw metadata fuori policy rilevato dallo scanner statico. |
| `npm run test:foundation` | `PASS` | `tests 210`, `pass 210`. |
| `npm run typecheck` | `PASS` | `next typegen` e `tsc --noEmit` completati. |
| `npm run lint` | `PASS` | `eslint` completato senza errori. |
| `npm run build` | `PASS_WITH_WARNING` | Exit 0; warning noti: convenzione Next `middleware` deprecata verso `proxy`, Node `[DEP0205] module.register()`. |
| `npm run verify` | `PASS_WITH_WARNING` | Exit 0; stessi warning build noti. |
| `npm run test:ui-smoke:ci` | `PASS_WITH_WARNING` | `43 passed`; protected-route smoke locale, con warning Node `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `git diff --check` | `PASS` | Nessun whitespace error nel diff. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Nessun file staged. |
| `git status --short --branch` | `PASS_WITH_DIRTY_WORKTREE` | Worktree sporco atteso per TASK-048/TASK-049; nessun commit/push/stage finale. |
| Fresh pre-commit rerun 2026-06-05 | `PASS_WITH_WARNING` | `TASK-048` targeted `3/3`, `TASK-049` targeted `4/4`, `security:scan`, `test:foundation` `209/209`, `verify` e `test:ui-smoke:ci` `43 passed`; warning noti Next `middleware` -> `proxy`, Node `[DEP0205]` e Playwright `NO_COLOR`/`FORCE_COLOR`. |
| Fresh review-fix rerun | `PASS_WITH_WARNING` | `TASK-048` targeted `3/3`, `TASK-049` targeted `5/5`, `security:scan`, `test:foundation` `210/210`, `typecheck`, `lint`, `build`, `verify` e `test:ui-smoke:ci` `43 passed`; warning noti Next `middleware` -> `proxy`, Node `[DEP0205]` e Playwright `NO_COLOR`/`FORCE_COLOR`. |

## Stato

- Stato task: `DONE_RECONCILED`
- Durante l'execution TASK-049: nessun commit, nessun push, nessun file staged.
- Post-handoff repository action: commit/push su `main` autorizzati dall'utente
  il 2026-06-05 dopo check freschi.

## Rischi Residui

- Review visuale autenticata delle pagine Master Console resta consigliata.
- Il polish non cambia i controlli server-side, che restano la protezione reale.

## Riconciliazione DONE 2026-06-06

- Conferma esplicita utente ricevuta: `Metti in DONE tutte quelle che si può e poi fai merge nella main e poi commit push`.
- Stato finale: `DONE_RECONCILED`.
- La chiusura non promuove Win7POS live E2E, POS online/catalog pull, Sales Sync live o staging stabile: restano gate separati non eseguiti quando applicabile.
- Commit/push finale su `main` autorizzati dall'utente il 2026-06-06.
