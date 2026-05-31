# TASK-018 - Infrastructure, Security Hardening and POS Foundation

## Stato

- Stato: `DONE`
- Fase: `DONE_RECONCILED`
- Responsabile corrente: `USER_CONFIRMED_RECONCILIATION / CODEX_REVIEW_FIX`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED`
- Verdict handoff Codex: `PASS_WITH_NOTES`
- Verdict finale: `DONE`
- Data apertura: `2026-05-31`
- Data handoff: `2026-05-31`
- Data reconciliation: `2026-05-31`

Il passaggio a `DONE_RECONCILED` e stato richiesto esplicitamente dall'utente nel task di final review del 2026-05-31 ed e stato applicato solo dopo review repo-grounded, fix scoped e gate critici passati.

## Obiettivo

Consolidare la base tecnica prima di nuove funzionalita business o integrazioni Android/iOS/POS tramite:

- CI/CD e repository hardening senza deploy automatico.
- Supabase security hardening mirato.
- Design di enforcement mobile/POS.
- Design della foundation per autenticazione POS futura.
- Consolidamento documentazione/evidence.

## Implementato

- GitHub Actions CI minimale e deterministica con security scan, foundation tests, typecheck, lint, build, smoke UI CI e `git diff --check`.
- Script `test:ui-smoke:ci` che usa `next start` su porta dedicata dopo build, con solo progetto desktop per contenere tempi CI.
- Migration TASK-018 non distruttiva per bloccare accesso client alle backup table legacy TASK-108.
- Migration TASK-018 non distruttiva per fissare il `search_path` della funzione trigger legacy `set_shared_sheet_sessions_updated_at`.
- Migration TASK-018 non distruttiva per pulire il warning lint storico `v_profile` in `shop_member_invite_profile` senza cambiare grants o autorizzazione.
- Security scanner aggiornato con gate TASK-018 su workflow, migration e documenti.
- Foundation test TASK-018 per lockare gli artefatti di hardening.
- Documentazione tecnica per enforcement mobile/POS e POS auth foundation.
- README aggiornato con prerequisiti, comandi, variabili e limiti attuali.
- MASTER-PLAN aggiornato per handoff a `REVIEW`.

## Supabase Security Audit

### Verificato

- RPC Admin Web recenti con `SECURITY DEFINER` usano `set search_path = public, app_private, pg_temp`.
- Execute grant sugli RPC sensibili e limitato a `authenticated`, con self-authorization interna.
- Mutazioni Shop/Platform passano da RPC auditabili o Server Actions autorizzate.
- `credential_hash` resta fuori dai read model UI e dalle viste safe.
- Cross-shop e cross-platform sono controllati da `shop_id`, membership attiva, ruolo e helper `app_private`.
- `platform_emergency_revoke_device` e platform-scoped, auditato e non richiede membership shop.

### Problema reale trovato

La migration legacy `20260514213110_task108_backup_20260514173049.sql` crea backup table nel namespace `public` via CTAS con un `owner_user_id` hardcoded. Anche senza prova di grant effettivo lato API, queste tabelle sono stato tecnico non necessario alla superficie client e violano la postura di hardening.

Gli advisors Supabase hanno inoltre segnalato `public.set_shared_sheet_sessions_updated_at` con `search_path` mutabile.

Il lint Supabase segnalava anche la variabile storica `v_profile` mai letta in `public.shop_member_invite_profile`.

### Fix applicato

Creata migration additiva `20260531234500_task_018_backup_table_lockdown.sql`:

- abilita RLS sulle sei backup table se presenti;
- forza RLS;
- revoca `public`, `anon` e `authenticated`;
- aggiunge commento operativo;
- non droppa, non tronca e non cancella dati.

Creata anche `20260531235000_task_018_trigger_search_path_hardening.sql`:

- ricrea `public.set_shared_sheet_sessions_updated_at` con `set search_path = public, pg_temp`;
- non modifica schema dati, trigger o contenuto tabelle.

Creata anche `20260531235500_task_018_member_invite_lint_cleanup.sql`:

- ricrea `public.shop_member_invite_profile` sostituendo `select into v_profile` con `perform 1`;
- mantiene helper owner-only, `SECURITY DEFINER`, `search_path`, revoke/grant e audit esistenti;
- non modifica schema dati o contenuto tabelle.

## Design prodotti

- `docs/ARCHITECTURE/MOBILE-POS-ENFORCEMENT-DESIGN.md`
- `docs/ARCHITECTURE/POS-AUTH-FOUNDATION.md`

Entrambi sono design-only: nessun endpoint, nessun login reale, nessun cambio Android/iOS/POS.

## Fuori scope

- Commit, push o stage finale.
- Deploy production o automatico.
- Email delivery.
- Sync reale.
- Android sync.
- iOS sync.
- POS sync.
- Autenticazione POS completa.
- Endpoint pubblici POS.
- Login Google, Apple o WeChat.
- Nuove dipendenze non necessarie.
- Schema Supabase inventato.
- Dichiarazione di progetto pronto per produzione.

## Criteri di accettazione

- `npm run security:scan`
- `npm run test:foundation`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify`
- `npm run test:ui-smoke`
- `npm run test:ui-smoke:ci`
- `git diff --check`
- `git status`
- Supabase linked checks se ambiente e CLI sono disponibili.

I risultati finali sono registrati in `docs/TASKS/EVIDENCE/TASK-018/README.md`.

## Rischi residui

- CI non include deploy e non deve essere trattata come release gate production.
- Client Android/iOS/POS non consumano ancora stati `shop_devices.status`/`staff_accounts.status`.
- Auth POS resta design-only.
- Session invalidation e offline grace non sono ancora specificate come implementazione.
- Supabase advisors continuano a segnalare RPC `SECURITY DEFINER` eseguibili da `authenticated`: non bloccante per TASK-018 perche sono RPC intenzionali, con self-authorization DB-side, `search_path` controllato e audit.
- Supabase Auth leaked-password protection resta configurazione esterna non repo e non e stata modificata.

## Prossima fase

`DONE_RECONCILED`: aprire task separati per enforcement mobile/POS implementativo, POS auth reale, email delivery o hardening Auth provider.
