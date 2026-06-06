# TASK-049 - Master Console Admins UI/UX polish

## Stato

- Stato TASK-049: `DONE_RECONCILED`
- Fase TASK-049: `DONE_RECONCILED`
- Responsabile corrente: `USER_CONFIRMED_RECONCILIATION`
- Evidence: `docs/TASKS/EVIDENCE/TASK-049/README.md`
- Dipendenza: `TASK-048` resta in `REVIEW`.
- Commit durante execution: `NOT_RUN`; commit finale autorizzato il 2026-06-06
- Push durante execution: `NOT_RUN`; push finale autorizzato il 2026-06-06
- Repository handoff post-review: `COMMIT_PUSH_AUTHORIZED_BY_USER_2026-06-05`
- Stage finale prima dell'handoff git originario: `NOT_STAGED`; stage finale autorizzato il 2026-06-06

## Obiettivo

Polish piccolo e verificabile della Master Console, con priorita alla pagina
`/platform/admins`. La UI deve ridurre rumore visivo e rischio percepito senza
modificare backend, schema Supabase, RPC, RLS, permessi o azioni server.

Devices and Sync remain outside the primary Master Console sidebar.
`/platform/devices` e `/platform/sync` restano deep link diagnostici diretti con
titoli `Device Signals` e `Sync Signals`.

## Scope

- Admins: lista attiva piu compatta, summary area, controlli revoke dentro
  pannello espandibile per singolo admin.
- Audit: layout tabella piu robusto, con scroll orizzontale e date non spezzate.
- Provisioning: sezioni piu compatte e copy sul confine Platform Console / Shop Admin.
- Operations: card shop robuste con codici lunghi.
- Header Master Console: chip nello stesso ordine.
- Test foundation e smoke UI locali.
- Aggiornamento Master Plan ed evidence.

## Fuori Scope

- No schema changes.
- No RPC changes.
- No RLS changes.
- No nuove dipendenze.
- No nuove feature operative.
- No login/auth flow.
- No email reale o invio reale.
- No raw metadata, secret, token o service-role key nel client/browser.
- No ripristino Devices/Sync nella sidebar primaria.
- No commit/push/stage durante l'execution originaria.
- Commit/push finale su `main` autorizzati dall'utente il 2026-06-06.

## Implementazione

### Review fix visuale

- Date Admins/Audit mostrate in formato compatto UTC, con timestamp completo
  preservato in `title` dove la UI renderizza la cella.
- ID lunghi mostrati come short value leggibile, con full value preservato in
  `title` e stile monospace/wrapping robusto.
- Danger zone Admins resa piu sobria da chiusa: rosso forte solo nel pannello
  espanso e sul bottone finale.
- Diagnostics renderizzato come blocco collassato compatto quando non e il
  contenuto principale.
- System/Data mappano stati tecnici principali a label leggibili, mantenendo i
  codici tecnici nei dettagli diagnostici.
- Users/Shops detail separano titolo principale da profile ID/shop code.
- Provisioning ha placeholder piu chiari e risultato vicino alla form usata.
- Operations ha search/filter locale sui target shop e badge stato leggibili.
- Nessuna modifica a backend, schema, RPC, RLS, Server Actions o permessi.

### Admins

- Summary area con active admins, server-side audit boundary,
  self-lockout protection e metadata/redaction boundary.
- `Grant Platform Admin` resta una form singola e compatta.
- `Active Platform Admins` mostra status, grant date e identificatori lunghi con
  wrapping/truncation sicuri.
- Reason, `Type REVOKE to confirm` e pulsante rosso `Revoke admin` stanno dentro
  una danger zone espandibile.
- Copy preservata: `Server blocks self-lockout and last-admin removal.`

### Audit

- La tabella usa min-width e scroll orizzontale.
- Le colonne data non vanno a capo.
- Raw metadata non redatto resta non esposto.

### Provisioning

- Layout desktop piu compatto.
- Copy esplicita: Platform Console fa provisioning sicuro/auditato; la gestione
  quotidiana POS/staff resta in Shop Admin.
- Nessuna email reale, nuova RPC o auth flow.

### Operations

- Shop card con `min-w-0`, wrapping e title per valori lunghi.
- Copy TASK-048 su device revoke come eccezione globale resta visibile.

## Criteri di Accettazione

- Devices/Sync non sono nella sidebar primaria.
- `/platform/devices` e `/platform/sync` restano deep link diagnostici.
- Admins non mostra controlli distruttivi sempre aperti per ogni admin.
- Admins non mostra ISO timestamp completi o ID lunghi come testo principale.
- Admins conserva copy e protezione server-side self-lockout/last-admin.
- Audit non taglia colonne a destra.
- Audit mostra date compatte e conserva il timestamp completo nel title.
- System/Data mostrano label leggibili per stati tecnici principali.
- Users/Shops detail mantengono nome principale come titolo e ID/codici sotto.
- Provisioning resta auditato e non introduce operazioni fuori scope.
- Operations gestisce shop code lunghi senza scrollbar orizzontale locale.
- Task finale riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06.

## Check Richiesti

- `node --test tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs`
- `node --test tests/foundation/task-049-master-console-admins-ui-polish.test.mjs`
- `npm run security:scan`
- `npm run test:foundation`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify`
- `npm run test:ui-smoke:ci`
- `git diff --check`
- `git diff --cached --name-status`
- `git status --short --branch`

## Stato Finale Atteso

- Riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06.
- Durante l'execution TASK-049: nessun commit, nessun push, nessun file staged.
- Post-handoff: commit/push su `main` autorizzati dall'utente il 2026-06-05.

## Riconciliazione DONE 2026-06-06

- Conferma esplicita utente ricevuta: `Metti in DONE tutte quelle che si può e poi fai merge nella main e poi commit push`.
- Stato finale: `DONE_RECONCILED`.
- La chiusura non promuove Win7POS live E2E, POS online/catalog pull, Sales Sync live o staging stabile: restano gate separati non eseguiti quando applicabile.
- Commit/push finale su `main` autorizzati dall'utente il 2026-06-06.
