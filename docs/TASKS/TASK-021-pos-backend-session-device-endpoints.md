# TASK-021 - POS backend session/device endpoints

## Stato

- Stato: `DONE`
- Fase: `DONE_RECONCILED`
- Responsabile corrente: `CODEX_FINAL_REVIEW`
- Execution: `COMPLETED`
- Review: `COMPLETED`
- Verdict corrente: `DONE_RECONCILED`
- Data apertura: `2026-06-01`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-021/README.md`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Git push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_RUN_USER_REQUESTED_NO_STAGE`

TASK-021 implementa solo la foundation backend server-side per first login POS, trusted device token, sessione POS, heartbeat/refresh e revoca enforcement. Non implementa dashboard, client Win7POS, client HTTP Win7POS o sales sync.

## Obiettivo

Creare una base piccola, server-side e verificabile per:

- first login POS con `shop_code + staff_code + PIN/password`;
- registrazione device fidato;
- token trusted device salvato backend solo come hash;
- sessione POS breve con heartbeat/refresh;
- revoca device e deny quando shop, staff, device, credential o sessione non sono validi;
- audit log redatto per azioni sensibili.

## Scope incluso

- Discovery schema Supabase reale gia presente.
- Migration minima per `pos_device_credentials` e `pos_sessions`.
- Trigger DB per invalidare credential/sessioni POS quando `shop_devices.status` passa a `revoked`.
- Route Handler Next.js:
  - `POST /api/pos/auth/first-login`;
  - `POST /api/pos/session/heartbeat`.
- Moduli `server-only` per service-role solo server-side, token hashing e workflow POS auth.
- Enforcement server-side su:
  - `shops.shop_status = 'active'`;
  - `staff_accounts.status = 'active'`;
  - `staff_accounts.credential_status = 'active'`;
  - `staff_accounts.locked_until`;
  - `staff_accounts.session_invalidated_at`;
  - `shop_devices.status = 'active'`;
  - credential/session token hash validi.
- Test foundation/security TASK-021.
- Aggiornamento evidence e Master Plan con check reali.

## Fuori scope

- Non implementare TASK-022 dashboard.
- Non modificare Win7POS.
- Non implementare client HTTP Win7POS.
- Non implementare sales sync.
- Non creare `pos_sales`, `pos_sale_payments`, `pos_sync_batches` o route sales.
- Non creare dati finti o seed.
- Non introdurre dipendenze nuove.
- Non usare service-role key lato client/browser.
- Non salvare PIN/password/token in chiaro.
- Non esporre `credential_hash`, token hash o service-role in DTO/UI/client.
- Non fare commit.
- Non fare push.
- Non dichiarare production-ready globale.

## Discovery schema reale

Schema/tabelle gia presenti prima di TASK-021:

| Area | Esito | Evidence |
| --- | --- | --- |
| Shop root | `FOUND` | `public.shops` con `shop_code` e `shop_status in ('active','pending_setup','suspended','archived')`. |
| Staff POS | `FOUND` | `public.staff_accounts` con `staff_code`, `status`, `credential_hash`, lockout e metadata credential. |
| Staff safe view | `FOUND` | `public.staff_accounts_safe` non espone `credential_hash`. |
| Staff runtime metadata | `FOUND` | `credential_version`, `credential_status`, `session_invalidated_at` da TASK-019. |
| Device registry | `FOUND` | `public.shop_devices` con `device_identifier`, `device_type`, `status`, `last_seen_at`, revoke/reactivate. |
| Audit | `FOUND` | `public.audit_logs` append-only con metadata redatti. |
| Permessi web shop | `FOUND` | `shop_members` e helper `app_private.is_active_shop_staff_admin_member`. |
| POS device token runtime | `NOT_FOUND` | Nessuna tabella esistente per trusted device token hash. |
| POS sessions runtime | `NOT_FOUND` | Nessuna tabella esistente per sessioni POS/heartbeat. |
| POS sales sync | `NOT_FOUND_BY_SCOPE` | Fuori scope TASK-021. |

## Decisione tecnica

TASK-021 usa una combinazione minima:

- Route Handler Next.js per gli endpoint consumabili in futuro da Win7POS, perche Win7POS non e un client Supabase Auth e non puo usare cookie SSR.
- Data access layer `server-only` in `src/server/pos-auth/`.
- Supabase service-role solo server-side in un helper dedicato `src/lib/supabase/admin.ts`, mai importato da client/browser.
- Migration SQL solo per storage runtime POS e trigger di revoca.

RPC Supabase pubbliche non sono usate per first login, perche la verifica credential `scrypt-v1` esistente vive in Node (`src/server/shop-admin/staff-credentials.ts`). Spostare la verifica in RPC richiederebbe cambiare schema/hash o esporre lookup pericolosi; TASK-021 evita entrambe le cose.

## Piano di implementazione

1. Scrivere test foundation/security TASK-021 e verificarli in RED.
2. Aggiungere migration `*_task_021_pos_sessions_devices.sql`.
3. Aggiornare `src/lib/supabase/database.types.ts`.
4. Aggiungere client service-role server-only.
5. Aggiungere token helper server-only con token random e hash `sha256`.
6. Aggiungere service POS auth server-only.
7. Aggiungere i due Route Handler `POST`.
8. Aggiornare security scanner e test legacy TASK-019/TASK-020 per consentire solo gli endpoint TASK-021.
9. Eseguire check richiesti e aggiornare evidence.

## Criteri di accettazione

- First login verifica shop/staff/credential e registra trusted device.
- Device token e session token sono restituiti una sola volta e salvati nel backend solo come hash.
- Heartbeat verifica sessione, device token, session token, shop/staff/device status e invalidation metadata.
- Revoca device Admin Web invalida credential/sessioni POS tramite trigger DB e heartbeat deny.
- Audit redatto presente per successi/fallimenti sensibili.
- Endpoint POS sono Route Handler server-side, senza service-role client/browser.
- Foundation test coprono no secret client-side, no token raw, endpoint server-side, audit richiesto e no sales sync.
- Check richiesti eseguiti o motivati in evidence.

## Rischi residui previsti

- Serve configurazione runtime server `SUPABASE_SERVICE_ROLE_KEY` nel deployment; il valore non entra nel repository.
- Rate limiting edge/app-level resta un follow-up infrastrutturale non bloccante: TASK-021 applica validazione dimensioni input, errori generici e lockout staff server-side con scadenza.
- Win7POS dovra validare TLS 1.2 e storage locale DPAPI in TASK-023.
- Offline grace e sales quarantine restano fuori scope fino ai task successivi.

## Review/reconciliation finale

Review finale eseguita da Codex su richiesta esplicita dell'utente tramite allegato del 2026-06-01.

Problemi reali trovati e corretti nello scope:

- lockout staff POS: una credential con `credential_status = 'locked'` poteva restare inutilizzabile anche dopo scadenza di `locked_until`; il servizio ora considera riutilizzabile solo il lockout scaduto e riporta `credential_status` ad `active` dopo credential valida;
- hardening brute-force/input: aggiunti limiti espliciti a credential e token POS;
- audit required: i deny auditati falliscono chiuso se l'audit non viene scritto, e il first-login richiede sia audit `pos.device.trusted` sia `pos.auth.first_login.success`;
- consistenza first-login: se creazione sessione o audit success falliscono dopo creazione credential/sessione, il servizio revoca in modo compensativo gli artefatti POS appena creati;
- heartbeat: un token errato nega la richiesta e scrive audit, ma non blocca permanentemente una sessione valida solo per mismatch del token.

Stato finale: `DONE_RECONCILED`, con scope TASK-021 completato e nessun commit, push o stage.
