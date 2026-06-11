# TASK-053 - Authorization architecture and staff safe read boundary fix

## Informazioni generali

- ID: `TASK-053`
- Titolo: `Authorization architecture and staff safe read boundary fix`
- Stato: `DONE`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-11`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-053/README.md`

## Contesto

TASK-052 ha separato il polish UI della Admin Console dal problema residuo reale: `/shop/staff` restava in `Read blocked` per account personale autenticato. La review finale ha isolato il problema su `staff_accounts_safe` con `security_invoker=true`: la view selezionava `web_access_revoked_at`, ma `authenticated` non aveva il grant colonnare corrispondente sulla base table `staff_accounts`.

## Scopo

- Documentare il modello autorizzativo ideale per Master Console, Admin Console account personale e staff manager POS.
- Correggere il safe read boundary staff senza esporre credenziali o introdurre service-role nel browser.
- Ripristinare `/shop/staff` per owner/manager personali.
- Far passare lo smoke autenticato Shop Admin TASK-035 3/3.
- Confermare che POS/Staff resta modulo interno della Admin Console.

## Soluzione scelta

Soluzione A: `grants/view`.

Motivazione:
- `staff_accounts_safe` non seleziona `credential_hash`.
- Le colonne selezionate dalla view sono safe DTO fields già usati dalla UI.
- `staff_accounts` ha RLS abilitata.
- La policy SELECT limita le righe a owner/manager attivi dello shop tramite `app_private.is_active_shop_staff_admin_member(shop_id)`.
- Il problema era un grant colonnare mancante per una colonna safe già nella view.

## Implementazione

- Architettura: `docs/ARCHITECTURE/AUTHORIZATION-MODEL.md`.
- Migration additiva locale/non-production: `supabase/migrations/20260611153437_task_053_staff_safe_read_boundary.sql`.
- Grant aggiunto: `SELECT(web_access_revoked_at)` su `public.staff_accounts` a `authenticated`.
- Nessun grant su `credential_hash`.
- Nessun grant mutativo a `authenticated` sulla base table.
- Nessun accesso ad `anon`.
- `staff_accounts_safe` resta `security_invoker=true`.
- Nessun service-role lato browser.

## Criteri di accettazione

| CA | Descrizione | Stato |
| --- | --- | --- |
| CA-01 | Documento architettura autorizzativa creato. | `PASS` |
| CA-02 | Bug `staff_accounts_safe` riprodotto con fixture locale. | `PASS` |
| CA-03 | Migration grant-only additiva creata e applicata solo localmente. | `PASS` |
| CA-04 | Owner vede staff safe del proprio shop. | `PENDING_FINAL_EVIDENCE` |
| CA-05 | Owner non vede staff di altri shop. | `PENDING_FINAL_EVIDENCE` |
| CA-06 | Viewer senza policy owner/manager non legge staff safe. | `PENDING_FINAL_EVIDENCE` |
| CA-07 | `credential_hash` non compare nella view/DTO e non diventa selezionabile. | `PENDING_FINAL_EVIDENCE` |
| CA-08 | TASK-035 authenticated Shop Admin smoke passa 3/3. | `PENDING_FINAL_EVIDENCE` |
| CA-09 | Browser laterale verifica Master -> Admin account -> Shop code/staff code. | `PENDING_FINAL_EVIDENCE` |
| CA-10 | Cleanup locale completato. | `PENDING_FINAL_EVIDENCE` |

## Fuori scope

- Nessuna console POS separata.
- Nessun merge tra account personale e staff POS.
- Nessuna modifica a Win7POS, Android, iOS o Cash Register.
- Nessun apply cloud/production.
- Nessun commit, push o stage.
- Nessun secret, PIN, password o token in repository/evidence.

## Handoff

TASK-053 resta in `REVIEW` fino al completamento dei check finali e della conferma utente. Codex non marca il task come `DONE`.

## Final handoff - 2026-06-11

Verdict: `READY_FOR_REVIEW`.

The TASK-053 code and documentation scope is complete for user/reviewer confirmation. The task is not marked `DONE` by Codex.

Summary:

- Fixed the staff safe read failure with a narrow local migration that grants `authenticated` only `SELECT(web_access_revoked_at)` on `public.staff_accounts`.
- Preserved `staff_accounts_safe` as `security_invoker=true` and kept `credential_hash` out of the safe view and grants.
- Documented the authorization model and the web/POS principal boundary.
- Added static foundation guardrails and security scan coverage for the grant, view, and architecture constraints.
- Completed authenticated in-app browser QA for Master provisioning, owner Admin Console, staff manager Admin Console, platform denial, and emergency recovery.
- Cleaned local synthetic users/profiles/shops and temporary credential fixture files.

Checks: see `docs/TASKS/EVIDENCE/TASK-053/README.md` for command-level evidence.

## Final professional review gate - 2026-06-11

Verdict: `DONE`.

TASK-053 is ready for user confirmation. Migration and grant boundary are verified locally, browser QA passed, cleanup completed, and no P0/P1 findings remain open. The task is not marked `DONE` by Codex.
