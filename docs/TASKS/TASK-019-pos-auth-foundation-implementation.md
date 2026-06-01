# TASK-019 - POS Auth Foundation Implementation

## Stato

- Stato: `DONE`
- Fase: `DONE_RECONCILED`
- Responsabile corrente: `USER_CONFIRMED_RECONCILIATION / CODEX_REVIEW_FIX`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED`
- Verdict handoff Codex: `PASS_WITH_NOTES`
- Verdict finale: `DONE`
- Data apertura: `2026-05-31`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-019/README.md`
- Commit: `NOT_RUN_BY_REQUEST`
- Git push: `NOT_RUN_BY_REQUEST`

Il passaggio a `DONE_RECONCILED` e stato richiesto esplicitamente dall'utente nella final review del 2026-05-31 ed e stato applicato solo dopo review repo-grounded, fix scoped e gate critici passati.

## Obiettivo

Implementare una foundation sicura per credenziali POS staff e policy di sessione futura dentro Admin Web/Supabase, mantenendo separati:

- account personale web;
- staff POS;
- device registry;
- shop membership.

## Scope incluso

- Verifica schema reale `staff_accounts`, `staff_accounts_safe`, device registry, shop membership e audit helper esistenti.
- Migration additiva minima solo per campi mancanti necessari alla foundation credential/session policy.
- Estensione Shop Admin `/shop/staff` per gestione sicura di stato credenziale, reset, sospensione/riattivazione, force rotation e clear lockout se supportati.
- Server Actions e RPC server-side con validazione input, permission check shop-scoped, audit redatto e `search_path` controllato.
- Security scanner e foundation test dedicati TASK-019.
- Documentazione ed evidence con check reali.

## Fuori scope

- App Android POS login reale.
- App iOS POS login reale.
- Win7 POS login reale.
- Sync reale.
- Sessioni runtime POS complete.
- Email delivery.
- WeChat, Google o Apple login.
- Endpoint pubblico di login POS.
- Console POS separata.
- Modello `merchant -> stores`.
- Secret, service-role client/browser, PIN/password in chiaro o `credential_hash` in UI/DTO/read model safe.

## Criteri di accettazione

- Nessun `credential_hash` esposto in UI, DTO o read model safe.
- Nessun PIN/password raw in log, task o evidence.
- Reason obbligatoria per reset/suspend/force rotation/clear lockout e azioni sensibili equivalenti.
- RPC credential management autorizzate DB-side, con grants minimi e `search_path` controllato.
- Audit metadata redatto: reason raw non salvata, solo indicatori sicuri.
- POS Staff resta modulo Shop Admin; nessuna console o endpoint login POS pubblico.
- Check richiesti eseguiti con risultati reali o motivazione `NOT_RUN`/`BLOCKED`.

## Note execution iniziali

- TASK-018 ha prodotto design POS Auth e Mobile/POS enforcement, entrambi design-only.
- Discovery statica iniziale conferma che `staff_accounts`, `staff_accounts_safe`, `credential_hash`, `credential_kind`, `credential_updated_at`, `failed_attempts`, `locked_until`, `must_change_credential`, `last_login_at`, `shop_devices` e audit helper esistono gia.
- Mancano campi espliciti per credential version/status/session invalidation marker; questi sono candidati a migration additiva minima.

## Handoff Codex

- Migration Supabase creata e applicata su progetto linked: `20260531235900_task_019_pos_auth_foundation.sql`.
- Migration correttiva review creata e applicata su progetto linked: `20260601000500_task_019_staff_safe_view_grants.sql`.
- `staff_accounts` estesa in modo additivo con `credential_version`, `credential_status` e `session_invalidated_at`.
- `staff_accounts_safe` aggiornata senza esposizione di `credential_hash`.
- RPC staff credential management aggiornate con self-authorization DB-side, `search_path` controllato, reason obbligatoria per azioni sensibili e audit metadata redatto.
- Shop Admin `/shop/staff` esteso con stato credenziale safe, reset credenziale, suspend/reactivate/archive reasoned, force rotation e clear lockout.
- Scanner sicurezza e foundation test aggiornati per i vincoli TASK-019.
- Nessun endpoint pubblico login POS, nessuna console POS separata, nessuna modifica Android/iOS/POS client, nessuna sessione runtime POS completa.
- Commit, push e stage finale TASK-019: `NOT_RUN_BY_REQUEST`.

## Review finale / reconciliation

- Fix review: aggiunto grant colonnare `SELECT` sulle nuove colonne safe di `staff_accounts`, necessario per mantenere leggibile `staff_accounts_safe` con `security_invoker`.
- Fix review: riallineato `credential_status` a `locked` quando `locked_until` e ancora futuro durante reactivate/force rotation.
- Fix review: normalizzati `staffId` e `reason` server-side prima delle RPC per evitare errori fragili da whitespace.
- Fix review: rafforzati scanner e foundation test per grant safe view, no console POS separata, stato `DONE_RECONCILED` e lockout status.
- Stato finale: `DONE_RECONCILED` con TASK-015/016/017/018 lasciati invariati come `DONE`.
