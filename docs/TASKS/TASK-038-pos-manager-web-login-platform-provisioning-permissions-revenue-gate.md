# TASK-038 - POS manager web login, Platform provisioning, permissions and revenue gate

## Informazioni generali

- ID: `TASK-038`
- Titolo: `POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-04`
- Branch Admin Web: `main`
- Evidence: `docs/TASKS/EVIDENCE/TASK-038/README.md`
- Migration: `20260604035308_task_038_pos_manager_web_login.sql` creata e applicata su Supabase locale non-production
- Commit: `REQUESTED_IN_FINALIZATION`
- Push: `REQUESTED_IN_FINALIZATION`
- Verdict corrente: `DONE`

## Prerequisito TASK-037

TASK-038 parte solo dopo TASK-037 chiuso:

- `docs/MASTER-PLAN.md` registra TASK-037 `DONE`.
- `docs/TASKS/TASK-037-shop-admin-dual-access-model.md` registra `Stato: DONE`.
- `docs/TASKS/EVIDENCE/TASK-037/README.md` registra `Commit: COMMITTED_BY_USER_REQUEST` e `Push: PUSHED_BY_USER_REQUEST`.
- `git log --oneline -5` mostra `0b54d09 chore: finalize TASK-037 shop admin dual access model`.

## Obiettivo

Trasformare la foundation dual access in un flusso verificabile, senza fondere account personali e staff POS:

1. login runtime Shop Admin web per `pos_staff_manager`;
2. provisioning Platform Admin di shop/staff manager web;
3. role/permission tree shop-scoped per staff/ruoli;
4. dashboard incassi solo con dati vendite reali gia verificati, altrimenti gate esplicito senza fake data.

## Principi vincolanti

- `personal_account` resta multi-shop via `shop_members`.
- `pos_staff_manager` deve essere single-shop.
- `cashier`, `operator`, `viewer` e staff ordinario non accedono alla Shop Admin web.
- Staff manager web non accede alla Platform Admin.
- `shop_id` query param non e mai autorizzazione.
- Sessione staff web separata da Supabase Auth personale e da `pos_sessions` device.
- Nessun raw credential/token/hash persistito in UI, log, audit metadata o URL; il provisioning puo mostrare una credential one-time solo nella risposta immediata dell'action.
- No Sales Sync.
- No Win7POS/Android/iOS/Cash Register changes.
- No Supabase production.
- No Vercel Production.

## Discovery iniziale

### Pre-flight

- Branch: `main`.
- Repo iniziale: `## main...origin/main`.
- `git diff --check`: `PASS`.
- TASK-037: `DONE`, committato e pushato.
- `npm run dev:db:check`: `PASS_FAIL_CLOSED`, per `.env.local` marcato `supabase_cloud` e container locale mismatch.

### Schema statico gia verificato

- Presenti:
  - `profiles`;
  - `shops`;
  - `shop_members`;
  - `staff_accounts`;
  - `staff_accounts_safe`;
  - `shop_devices`;
  - `pos_device_credentials`;
  - `pos_sessions`;
  - `audit_logs`;
  - `sync_events`.
- Staff credential:
  - `credential_hash` server-side;
  - `credential_status`;
  - `failed_attempts`;
  - `locked_until`;
  - `must_change_credential`;
  - `session_invalidated_at`.
- `staff_accounts.role_key` corrente: `cashier`, `manager`, `viewer`.
- `admin` staff role: `NOT_PRESENT_IN_SCHEMA`.
- Storage esplicito per `shop_admin.full_access`: creato in `staff_role_permissions`.
- Staff web browser session table: creata in `staff_web_sessions`.
- Tabelle vendite/incassi reali: `NOT_FOUND_STATICALLY`.

## Decisioni di implementazione

- `pos_sessions` non va riusata per browser web staff: e legata a `shop_device_id` e `pos_device_credential_id`, quindi resta sessione POS device.
- Migration additiva creata per `staff_web_sessions` con token hash e cookie HTTP-only.
- Migration additiva creata per `staff_web_login_attempts` con chiave hash e lockout server-side.
- Migration additiva creata per `staff_role_permissions` come permission tree role/shop-scoped per `shop_admin.full_access` e permessi correlati.
- Runtime server-only creato per login/logout staff manager web con cookie HTTP-only, token hash, lockout, verifica credential e audit login/logout.
- Route login creata in route group `src/app/(staff-auth)/shop/staff-login` per evitare eredita del layout protetto `/shop`.
- `/shop` ora risolve principal espliciti `personal_account` e `pos_staff_manager` nella shell e nei read model server-side tramite `resolveShopAdminDataAccess`.
- Le mutazioni Shop Admin esistenti restano personal-account-only e bloccano esplicitamente `pos_staff_manager`, perche gli RPC correnti dipendono da `auth.uid()` e `shop_members`.
- Platform Admin provisioning staff manager e implementato con boundary server-only, credential lunga generata server-side, insert `staff_accounts`, upsert `staff_role_permissions` e audit redatto.
- Dashboard incassi resta `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA` finche non esistono tabelle vendite reali o Sales Sync verificato.
- Revenue dashboard requires real sales sync data; in assenza di dati reali verificati non vengono mostrati incassi, trend o valori dimostrativi.

## Fasi

| Fase | Stato | Note |
| --- | --- | --- |
| 0 - Pre-flight | `PASS` | TASK-037 DONE, repo pulito, no stage/commit/push. |
| 1 - Discovery schema/boundary | `PASS_STATIC` | Static schema letto; target Supabase locale fail-closed. |
| 2 - Schema/sessione staff web | `PASS_LOCAL_APPLIED` | Migration applicata su Supabase locale non-production; typegen reale rigenerato da DB locale. |
| 3 - Staff manager web login runtime | `PASS` | Login/logout server-only implementati; smoke locale copre sessione staff web/cashier denial e manual smoke verifica form reale, logout revoca, viewer denied e wrong credential generic. |
| 4 - Dual principal Shop Admin | `PASS_WITH_GUARDRAIL` | Shell e read model supportano personal/staff; mutazioni staff web bloccate esplicitamente. |
| 5 - Platform provisioning | `PASS_WITH_NOTES` | Provisioning staff manager web implementato in Platform Admin server-only; one-time value mostrato solo nella risposta action. |
| 6 - Role/permission tree | `PASS_MVP` | `staff_role_permissions` abilita `shop_admin.full_access` role/shop-scoped per `manager`. |
| 7 - Revenue dashboard gate | `PASS` | No fake metrics; gate esplicito se dati reali assenti. |
| 8 - Test/smoke/cleanup | `PASS` | Smoke locale passa `3/3`; manual staff form smoke passa; cleanup verificato zero residui `TASK035_*` e `TASK038_*`. |
| 9 - DONE finalization | `PASS` | Conferma esplicita utente ricevuta; task marcato `DONE`. |

## Criteri di accettazione

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | TASK-037 verificato DONE prima di TASK-038 | `PASS` |
| CA-02 | TASK/evidence TASK-038 creati | `PASS` |
| CA-03 | Discovery schema reale e boundary completata | `PASS_STATIC` |
| CA-04 | Staff web session separata e sicura | `PASS_LOCAL_APPLIED` |
| CA-05 | Staff manager web login runtime | `PASS` |
| CA-06 | Cashier/operator/viewer denied | `PASS` |
| CA-07 | Platform provisioning staff manager | `PASS_WITH_NOTES` |
| CA-08 | Permission tree MVP/enforcement | `PASS_MVP` |
| CA-09 | Revenue dashboard no fake gate | `PASS` |
| CA-10 | Check finali eseguiti | `PASS_WITH_NOTES_FINAL_REVIEW` |

## Review finale 2026-06-04

- Finding corretto: audit failure staff web reso meno informativo rimuovendo flag `shop_resolved` / `staff_resolved` da metadata redatti.
- Finding corretto: Platform provisioning panel ora disabilita il submit durante pending e chiarisce che la credenziale one-time e mostrata una sola volta nella risposta.
- Finding corretto: task/evidence/architettura/Master Plan allineati al manual smoke reale su `/shop/staff-login` e `/shop/staff-logout`.
- Nessun secret, token raw, hash o credenziale persistita in UI/log/audit metadata.
- Conferma esplicita utente ricevuta; task marcato `DONE`.

## Conferme negative

- Commit/push richiesti nella finalizzazione esplicita TASK-038.
- No Sales Sync.
- No dashboard vendite placeholder.
- No Win7POS/Android/iOS/Cash Register changes.
- No Supabase production.
- No Vercel Production.
- No secret/service-role lato client/browser.
- No fusione `profiles` / `staff_accounts`.

## Handoff corrente

- Stato: `DONE`.
- Verdict corrente: `DONE`.
- Prossima azione: follow-up dedicato per rendere mutazioni Shop Admin staff-aware con RPC dedicate oppure mantenere esplicitamente il boundary read-only staff web.
