# TASK-048 - Master Console secondary sections clarity and UX polish

## Stato

- Stato: `DONE_RECONCILED`
- Fase: `DONE_RECONCILED`
- Responsabile corrente: `USER_CONFIRMED_RECONCILIATION`
- Evidence: `docs/TASKS/EVIDENCE/TASK-048/README.md`
- Dipendenza: `TASK-047` resta in `REVIEW`.
- Nota governance: TASK-047 remains in REVIEW and is a dependency, not automatically DONE.
- Commit durante execution: `NOT_RUN`; commit finale autorizzato il 2026-06-06
- Push durante execution: `NOT_RUN`; push finale autorizzato il 2026-06-06
- Repository handoff post-review: `COMMIT_PUSH_AUTHORIZED_BY_USER_2026-06-05`
- Stage finale prima dell'handoff git originario: `NOT_STAGED`; stage finale autorizzato il 2026-06-06

## Obiettivo

Polish UX mirato delle schede secondarie della Master Console:

- `/platform/devices`
- `/platform/sync`
- `/platform/history`
- `/platform/support`
- `/platform/operations`

La UI deve chiarire cosa mostra ogni pagina, quando usarla, cosa non include,
perche una tabella puo essere vuota e quale pagina usare come prossimo passo.

Decisione review/fix: Devices and Sync are not top-level Master Console sidebar entries.
`/platform/devices` and `/platform/sync` remain internal read-only diagnostics/deep links.

## Scope

- Copy e layout delle schede secondarie Master Console.
- Pattern comune con scopo pagina, metriche leggibili, empty state umano,
  diagnostics secondaria e next action.
- Sidebar primaria Master Console senza Devices e Sync; le route restano
  disponibili come diagnostiche interne/deep link.
- Operations riorganizzata come scelta target shop, scelta azione, reason,
  conferma shop code e submit.
- Test foundation e smoke UI locali.
- Aggiornamento Master Plan ed evidence.

## Fuori Scope

- No schema changes.
- No mock rows.
- No migration Supabase.
- No nuove dipendenze.
- No dati reali, secret, token, password, PIN o credential nel repository.
- No Sales Sync live claim.
- No Win7POS live E2E claim.
- No impersonation.
- No azioni mutative da Support.
- No spostamento della gestione quotidiana shop/staff/prodotti nella Master Console.
- No rimozione di reason, confirmation o audit da Operations.
- No commit/push/stage durante l'execution originaria.
- Commit/push finale su `main` autorizzati dall'utente il 2026-06-06.

## Implementazione

### Pattern comune pagine secondarie

- `PlatformSection` espone purpose items, next links e priorita diagnostics.
- `PlatformPage` renderizza il blocco `Use this page to`, metriche,
  tabella/empty state, diagnostics secondaria e `Next action`.
- Il fallback tecnico `No rows returned through the server boundary` non viene
  usato dalle pagine polishate.

### Devices

- `Device Signals` resta diagnostica interna read-only di copertura device e
  segnali supporto.
- La tabella non viene popolata con righe di `sync_events`.
- `source_device_id` viene presentato solo come attribuzione sync/history.
- Empty state: `No device signals visible`.
- Copy esplicita che la gestione quotidiana device appartiene ad Admin Console.
- Next action verso Shops, Support e Operations solo per emergency device action.

### Sync

- `Sync Signals` mostra segnali sync globali quando disponibili.
- Copy chiarisce che non e audit amministrativo.
- Copy chiarisce che la Sales Sync foundation esiste, ma Win7POS sales sync live
  non e verificato.
- Empty state: `No sync signals visible`.
- Copy esplicita che il troubleshooting sync shop-level appartiene ad Admin Console.
- Link verso Data, Support e Audit.

### History

- `Global History` viene distinta da Sync e Audit.
- History = mobile/inventory history e high-level sync history.
- Empty state: `No history events visible`.
- Link verso Sync e Audit.

### Support

- Support diventa diagnostica read-only, non tabella tecnica generica.
- Colonne: `Subject`, `Signal`, `State`, `Suggested next step`.
- Metriche: profiles checked, shops checked, access issues,
  impersonation out of scope.
- Next action verso Users, Shops, Data, Provisioning e Operations.
- Nessuna impersonation o azione mutativa.

### Operations

- Operations viene ricomposta con workflow selezionato:
  target shop, azione, reason, shop code confirmation, submit.
- Le Server Actions esistenti restano il boundary mutativo.
- Reason e conferma restano obbligatorie.
- Disabled states spiegano perche un'azione non e disponibile.
- Warning su development-safe test shops resta visibile.
- Copy esplicita: `Device emergency operations are global exceptions. Daily device management belongs to Admin Console.`

## Criteri di Accettazione

- Devices non confonde device registry con sync source attribution.
- Devices e Sync non sono voci top-level della sidebar Master Console.
- `/platform/devices` e `/platform/sync` restano raggiungibili come deep link
  diagnostici read-only.
- Sync non dichiara Sales Sync live o Win7POS production-ready.
- History non sembra duplicare Sync e indirizza verso Sync/Audit.
- Support e read-only, diagnostico e con next step.
- Operations non ripete reason/confirmation per ogni azione visibile.
- Diagnostics non domina quando la pagina funziona normalmente.
- Users/Shops non vengono rifatte o cambiate pesantemente.
- Sidebar sticky resta preservata.
- Nessun dato inventato.
- Task finale riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06.

## Check Richiesti

- `npm run security:scan`
- `npm run test:foundation`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify`
- smoke Playwright locale su `/platform/devices`, `/platform/sync`,
  `/platform/history`, `/platform/support`, `/platform/operations`
- `git diff --check`
- `git status --short --branch`
- `git diff --cached --name-status`

## Stato Finale Atteso

- Riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06.
- Durante l'execution TASK-048: nessun commit, nessun push, nessun file staged.
- Post-handoff: commit/push su `main` autorizzati dall'utente il 2026-06-05.

## Riconciliazione DONE 2026-06-06

- Conferma esplicita utente ricevuta: `Metti in DONE tutte quelle che si può e poi fai merge nella main e poi commit push`.
- Stato finale: `DONE_RECONCILED`.
- La chiusura non promuove Win7POS live E2E, POS online/catalog pull, Sales Sync live o staging stabile: restano gate separati non eseguiti quando applicabile.
- Commit/push finale su `main` autorizzati dall'utente il 2026-06-06.
