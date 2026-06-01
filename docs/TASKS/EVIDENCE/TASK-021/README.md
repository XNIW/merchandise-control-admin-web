# TASK-021 Evidence

## Stato corrente

- Task: `TASK-021 - POS backend session/device endpoints`
- Stato task: `DONE`
- Fase: `DONE_RECONCILED`
- Data apertura: `2026-06-01`
- Data review finale: `2026-06-01`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_RUN_USER_REQUESTED_NO_STAGE`
- Verdict corrente: `DONE_RECONCILED`

## Decisione tecnica

- Boundary scelto: Route Handler Next.js + moduli `server-only`.
- Service-role solo server-side: previsto in `src/lib/supabase/admin.ts`, mai nel client/browser.
- RPC Supabase pubbliche per POS auth: `NOT_USED`.
- Motivazione: la verifica credential `scrypt-v1` esistente e Node-side, quindi first login deve restare nel backend Next.js server-side.
- Token: trusted device token hash e session token hash, mai token raw nel database.
- No sales sync: confermato fuori scope TASK-021.

## Letture obbligatorie

| Fonte | Esito | Note |
| --- | --- | --- |
| `AGENTS.md` | `PASS` | Protocollo italiano, Master Plan/task/codice prima delle modifiche, no scope creep. |
| `CLAUDE.md` | `PASS` | Codex executor/fixer, handoff a review, mai `DONE` senza conferma utente. |
| `README.md` | `PASS` | Stack, env template, limiti POS attuali. |
| `docs/MASTER-PLAN.md` | `PASS` | TASK-020 DONE_RECONCILED, TASK-021 candidato. |
| `docs/TASKS/TASK-020-win7pos-integration-planning.md` | `PASS` | Scope TASK-021 confermato: session/device only, no sales sync. |
| `docs/TASKS/EVIDENCE/TASK-020/README.md` | `PASS` | Gap POS session/token/heartbeat confermati. |
| `supabase/migrations/*` | `PASS` | Scan completo DDL/policy/funzioni e lettura mirata migration Admin Web/POS. |
| `src/lib/supabase/database.types.ts` | `PASS` | Tipi correnti non includono `pos_device_credentials` o `pos_sessions`. |
| Codice staff/device/audit/shop/platform | `PASS` | Lettura mirata read model/mutation staff, devices, audit, platform emergency revoke. |
| `scripts/security-checks.mjs` | `PASS` | Scanner TASK-020/TASK-019 blocca POS endpoint; da aggiornare per TASK-021. |
| Test TASK-014/TASK-018/TASK-020 | `PASS` | Test esistenti letti per aggiornare harness senza rompere governance. |

## Schema discovery

| Area | Stato | Evidence |
| --- | --- | --- |
| Shop status | `FOUND` | `public.shops.shop_status`. |
| Staff status | `FOUND` | `public.staff_accounts.status`. |
| Staff credential hash | `FOUND_SERVER_ONLY` | `credential_hash` nel base table, non nella safe view. |
| Staff credential metadata | `FOUND` | `credential_status`, `credential_version`, `session_invalidated_at`. |
| Device registry | `FOUND` | `public.shop_devices.status`, `last_seen_at`, revoke/reactivate. |
| Audit log | `FOUND` | `public.audit_logs` append-only. |
| POS device token runtime | `NOT_FOUND` | Richiede migration TASK-021. |
| POS sessions runtime | `NOT_FOUND` | Richiede migration TASK-021. |
| Sales sync | `NOT_FOUND_BY_SCOPE` | Non implementato in TASK-021. |

## TDD evidence

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/task-021-pos-backend-session-device.test.mjs` | `FAIL_EXPECTED_RED` | `tests 4`, `pass 0`, `fail 4`; fallimenti attesi per documenti/migration/route/scanner TASK-021 mancanti. |
| `node --test tests/foundation/task-021-pos-backend-session-device.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`. |
| `node --test tests/foundation/task-021-pos-backend-session-device.test.mjs` review hardening | `FAIL_EXPECTED_RED` | Nuovo test su lockout/audit/token cleanup fallito prima della correzione su `MAX_CREDENTIAL_LENGTH` mancante. |
| `node --test tests/foundation/task-021-pos-backend-session-device.test.mjs` review hardening | `PASS` | `tests 5`, `pass 5`, `fail 0`. |

## Check finali

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 109`, `pass 109`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` completato; `tsc --noEmit` exit 0. |
| `npm run lint` | `PASS` | `eslint` exit 0. |
| `npm run build` | `PASS_WITH_WARNING` | Build completata; warning Node `[DEP0205] module.register()` da toolchain. Route POS risultano dinamiche: `/api/pos/auth/first-login`, `/api/pos/session/heartbeat`. |
| `npm run verify` | `PASS_WITH_WARNING` | lint, typecheck, security scan e build passati; stesso warning Node `[DEP0205]`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --stat` | `PASS` | Stat mostra 8 file tracciati modificati; gli untracked TASK-020/TASK-021 sono visibili in `git status --short`. |
| `git diff --cached --name-status` | `PASS` | Nessun output; nessun file staged. |
| `git status --short` | `PASS_WITH_EXPECTED_CHANGES` | Worktree sporco con file TASK-021 attesi e file TASK-020 preesistenti non tracciati/modificati; nessun commit/push eseguito. |
| `supabase db push --linked --dry-run` prima apply | `PASS` | Pending migration rilevata: `20260601120000_task_021_pos_sessions_devices.sql`. |
| `supabase db push --linked` | `PASS_WITH_NOTICE` | Applicata migration `20260601120000_task_021_pos_sessions_devices.sql`; notice atteso: trigger precedente non esistente al primo deploy. |
| `supabase gen types typescript --linked --schema public,app_private,graphql_public > src/lib/supabase/database.types.ts` | `PASS` | Tipi rigenerati da schema remoto includendo `pos_device_credentials`, `pos_sessions` e mantenendo `graphql_public`. |
| `supabase migration list --linked` | `PASS` | Local e remote allineati fino a `20260601120000`. |
| `supabase db push --linked --dry-run` dopo apply | `PASS` | `Remote database is up to date.` |
| `supabase gen types ... > tmp && diff -q src/lib/supabase/database.types.ts tmp` | `PASS` | Nessun output dal diff; `database.types.ts` coerente con schema remoto. |
| Supabase linked check parallelo | `PASS_WITH_NOTES` | Un tentativo parallelo di dry-run/typegen ha generato `ECIRCUITBREAKER`; i comandi sono stati rilanciati in sequenza e sono passati. |
| Cleanup file temporanei | `PASS` | Rimossi `.DS_Store`; scan finale temp/log/backup locali senza output. |

## Review/reconciliation finale

Review finale eseguita su richiesta esplicita dell'utente tramite allegato del 2026-06-01.

Bug/problemi trovati:

- `LOCKOUT_EXPIRY_STUCK`: il servizio richiedeva `credential_status = 'active'`; un account bloccato con `locked_until` scaduto poteva non rientrare mai senza intervento admin.
- `FIRST_LOGIN_PARTIAL_STATE`: se la sessione o gli audit success fallivano dopo la creazione della credential device, potevano restare artefatti POS attivi anche se l'endpoint rispondeva errore.
- `TRUSTED_DEVICE_AUDIT_NOT_REQUIRED`: `pos.device.trusted` veniva scritto ma non verificato come requisito di successo.
- `HEARTBEAT_TOKEN_MISMATCH_DOS`: un token heartbeat errato poteva marcare la sessione `blocked`; ora il deny non revoca la sessione solo per mismatch del token.
- `INPUT_LENGTH_LIMITS`: mancavano limiti espliciti su credential e token POS.

Correzioni applicate:

- Aggiunti `MAX_CREDENTIAL_LENGTH` e `MAX_POS_SECRET_LENGTH`.
- Aggiunta gestione lockout scaduto e reset `credential_status: "active"` dopo credential valida.
- `auditedDenied` ora fallisce chiuso se l'audit richiesto non viene scritto.
- First login richiede audit `pos.device.trusted` e `pos.auth.first_login.success`.
- Aggiunto cleanup compensativo `cleanupFailedFirstLogin` per revocare sessione/credential create prima di failure session/audit.
- Heartbeat distingue token mismatch da runtime invalid state; sessioni valide non vengono bloccate solo per token errato.
- Security scanner e test foundation rafforzati per coprire questi punti.

## Conferme fuori scope

- Nessuna dashboard TASK-022: `CONFIRMED`.
- Nessuna modifica Win7POS: `CONFIRMED`.
- Nessun client HTTP Win7POS: `CONFIRMED`.
- Nessun sales sync: `CONFIRMED`.
- Nessun dato finto/seed: `CONFIRMED`.
- Nessun commit: `CONFIRMED_NOT_RUN`.
- Nessun push: `CONFIRMED_NOT_RUN`.
- Nessuno stage: `CONFIRMED_NOT_RUN`.

## File modificati

- `.env.example`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-021-pos-backend-session-device-endpoints.md`
- `docs/TASKS/EVIDENCE/TASK-021/README.md`
- `scripts/security-checks.mjs`
- `src/app/api/pos/auth/first-login/route.ts`
- `src/app/api/pos/session/heartbeat/route.ts`
- `src/lib/supabase/admin.ts`
- `src/lib/supabase/database.types.ts`
- `src/server/pos-auth/service.ts`
- `src/server/pos-auth/tokens.ts`
- `supabase/migrations/20260601120000_task_021_pos_sessions_devices.sql`
- `tests/foundation/admin-web-ui-polish.test.mjs`
- `tests/foundation/task-014-pos-staff-foundation.test.mjs`
- `tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs`
- `tests/foundation/task-020-win7pos-integration-planning.test.mjs`
- `tests/foundation/task-021-pos-backend-session-device.test.mjs`

## Tabelle/colonne coinvolte

- Esistenti lette/enforced: `shops.shop_code`, `shops.shop_status`, `staff_accounts.staff_code`, `staff_accounts.status`, `staff_accounts.credential_hash`, `staff_accounts.credential_status`, `staff_accounts.credential_version`, `staff_accounts.locked_until`, `staff_accounts.session_invalidated_at`, `shop_devices.status`, `shop_devices.last_seen_at`, `audit_logs`.
- Nuove: `pos_device_credentials`, `pos_sessions`.
- Trigger: `app_private.revoke_pos_auth_on_shop_device_revoked` su `shop_devices`.

## Endpoint creati

- `POST /api/pos/auth/first-login`
- `POST /api/pos/session/heartbeat`

## Misure sicurezza implementate

- `SUPABASE_SERVICE_ROLE_KEY` previsto solo in helper `server-only` e template vuoto.
- Route Handler senza service-role, `credential_hash` o logica privilegiata inline.
- Token device/session random restituiti al POS una sola volta; database salva solo `sha256:<hex>`.
- RLS attiva e forzata su tabelle POS runtime; nessun grant diretto ad `anon` o `authenticated`.
- First login e heartbeat falliscono chiuso su shop/staff/device/session invalidi.
- Lockout staff aggiornato su credential errata, con scadenza rispettata e ritorno ad `active` dopo credential valida.
- Audit redatto e richiesto per first login, device trusted, heartbeat e revoked enforcement.
- Cleanup compensativo revoca credential/sessione POS create se first-login non puo completare sessione o audit.
- Scanner aggiornato per bloccare secret client-side, token raw e sales sync.

## Rischi residui

- Endpoint POS richiedono configurazione deployment server `SUPABASE_SERVICE_ROLE_KEY`; senza env tornano `not_configured`.
- Le scritture multi-step restano nel DAL Next.js/PostgREST, ma first-login ora ha cleanup compensativo e fallisce chiuso; una RPC transazionale resta follow-up non bloccante se il flusso POS cresce.
- Rate limiting edge/applicativo resta follow-up infrastrutturale non bloccante: TASK-021 usa limiti input, errori generici e lockout staff server-side senza introdurre dipendenze.
- Win7POS TLS 1.2, DPAPI token storage e client HTTP restano TASK-023.
- Sales sync e dashboard restano TASK-022/TASK-024.

## Prossimo task consigliato

`TASK-022 - Admin Web POS live dashboard`, oppure `TASK-023 - Win7POS first login/trusted device client` se si vuole validare prima il client Windows 7.
