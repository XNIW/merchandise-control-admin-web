# Evidence TASK-041 - Runtime Completion

## Stato

- Task: `TASK-041 - Runtime Completion: Supabase, Cloudflare/OpenNext Staging, Sales Sync and Win7POS E2E`
- Stato task: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Milestone interna: `PASS_WITH_NOTES_AND_EXTERNAL_BLOCKERS`
- Verdict corrente: `PASS_WITH_NOTES_AND_EXTERNAL_BLOCKERS`
- Data: `2026-06-04`
- Branch Admin Web: `codex/task-041-runtime-completion`
- Final review/fix verdict: `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION_ADMIN_WEB_RUNTIME_ONLY`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage: `NOT_STAGED`

## Decisione TASK-040

- `TASK-040_SHOULD_REMAIN_REVIEW_WITH_EXTERNAL_BLOCKERS`
- `TASK-040_SUPERSEDED_BY_TASK-041`
- `SUPERSEDED_BY_TASK-041`

Motivazione: `TASK-041` sblocca parte dei blocker runtime ma non sostituisce la review umana ne la conferma utente richiesta per `DONE`. `TASK-040` resta storico con blocker esterni e non viene marcato `DONE`.

## Riconciliazione limitata TASK-045

- Data: `2026-06-05`.
- Platform Master Console: `PASS_AUTOMATED_PLATFORM_MASTER_CONSOLE`.
- Evidence: `docs/TASKS/EVIDENCE/TASK-045/README.md`.
- Stato `TASK-041`: resta `REVIEW_WITH_EXTERNAL_BLOCKERS`.
- Win7POS live E2E: `NOT_RUN`.
- Sales Sync live Win7POS -> Admin Web: `NOT_RUN`.
- Production deploy/apply: `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Nessun `PASS_LIVE` o `DONE` globale dichiarato per blocker esterni.

## Gate summary

| Gate | Stato | Evidence sintetica |
| --- | --- | --- |
| Governance e tracking | `PASS_WITH_NOTES` | TASK-041 attivo; TASK-040 resta `REVIEW_WITH_EXTERNAL_BLOCKERS / SUPERSEDED_BY_TASK-041`; nessun `DONE`. |
| Supabase safety/migration | `PASS_SUPABASE_DEV_APPLIED` / `PASS_LOCAL_CONTAINER_ALIGNMENT` | Local e linked dev allineati fino a `20260604214112`; `supabase status` PASS dopo allineamento `project_id`; lint local/linked PASS; typegen da linked dev PASS; production `NOT_RUN_PRODUCTION_FORBIDDEN`. |
| Cloudflare/OpenNext staging | `PASS_CLOUDFLARE_OPENNEXT_PREVIEW` | OpenNext/Wrangler configurati; local preview `127.0.0.1:8788` smoke PASS; no production deploy. |
| Sales Sync readiness | `PASS_SALES_SYNC_FOUNDATION` | Schema idempotente e route POST server-side implementati; RLS/grants verificati; no dashboard vendite fake. |
| Win7POS E2E | `PASS_WITH_MANUAL_WIN7_STEPS` | `WIN7POS_REPO_PATH` non impostato; host tool presenti; live Windows 7 non eseguibile da Codex in questo runtime. |
| Evidence e handoff | `REVIEW_WITH_EXTERNAL_BLOCKERS` | Evidence aggiornata; final checks freschi PASS/PASS_WITH_WARNINGS; `DONE` non dichiarato da Codex. |

## Supabase evidence

| Comando/check | Esito |
| --- | --- |
| `SUPABASE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 supabase --version` | `PASS`, CLI `2.104.0` |
| `supabase/config.toml` project id alignment | `PASS_LOCAL_CONTAINER_ALIGNMENT`, `project_id = "MerchandiseControlSupabase"` |
| `supabase status` post-alignment | `PASS`, stack locale `MerchandiseControlSupabase` ispezionabile dal repo |
| `scripts/dev-supabase-check.mjs` redaction hardening | `PASS_FIXED`, copre output tabellare CLI per `Publishable`, `Secret`, DB URL e S3 keys |
| `npm run dev:db:status` post-redaction | `PASS_REDACTED_WITH_FAIL_CLOSED_ENV`, container PASS e `supabase status` PASS; exit `2` solo per `.env.local` cloud in mode local |
| `node scripts/dev-supabase-check.mjs --mode=cloud` | `PASS`, env cloud classificato senza stampare valori; container locale saltato come previsto |
| `supabase projects list` | `PASS`, linked dev project `merchandisecontrol-dev` verificato come non-production |
| `supabase migration list --local` prima dello sblocco | `PASS_WITH_PENDING_MIGRATIONS`, TASK-039 non ancora applicata localmente |
| `supabase db push --local` | `PASS`, applicata `20260604120000_task_039_staff_aware_shop_admin.sql` |
| `supabase db push --linked --yes` | `PASS`, applicate su dev non-production `20260601160000`, `20260604035308`, `20260604120000` |
| `supabase migration new task_041_pos_sales_sync_foundation` | `PASS`, creato `20260604214112_task_041_pos_sales_sync_foundation.sql` |
| `supabase db push --local` per TASK-041 Sales Sync | `PASS`, applicata `20260604214112` localmente |
| `supabase db push --linked --yes` per TASK-041 Sales Sync | `PASS`, applicata `20260604214112` su linked dev |
| `supabase migration list --local` dopo apply | `PASS`, local allineato fino a `20260604214112` |
| `supabase migration list --linked` dopo apply | `PASS`, linked dev allineato fino a `20260604214112` |
| `supabase db push --local --dry-run` | `PASS`, database local up to date |
| `supabase db push --linked --dry-run` | `PASS`, database linked dev up to date; confermato anche dopo container alignment locale |
| `supabase migration list --linked` senza `SUPABASE_DB_PASSWORD` process-only nel final sweep | `BLOCKED_LINKED_PASSWORD_ENV_RETRY`, CLI richiede env password e ha attivato retry/circuit breaker; non indica drift schema perche linked dry-run e schema dump erano gia PASS |
| `supabase db lint --local --schema public,app_private --fail-on error` | `PASS`, `No schema errors found` |
| `supabase gen types typescript --local --schema public,app_private,graphql_public > /tmp/task041-local-database.types.ts` | `PASS`, 2388 righe generate in `/tmp`; file repo non sovrascritto |
| `supabase db lint --linked --schema public,app_private --fail-on error` | `PASS`, `No schema errors found`; password fornita via stdin/env process-only, non stampata/salvata |
| linked schema dump redatto `/tmp/task041-final-linked-schema.sql` | `PASS`, tabelle Sales Sync, RLS forced, grants, unique constraints e indici confermati |
| `supabase gen types typescript --linked --schema public,app_private,graphql_public` | `PASS`, `src/lib/supabase/database.types.ts` aggiornato |
| production migration apply | `NOT_RUN_PRODUCTION_FORBIDDEN` |

Schema TASK-039 verificato:

- `audit_logs.actor_staff_id` e colonne web access revoke presenti.
- RLS/force RLS confermate sulle tabelle staff web/session/role permission.
- `staff_accounts_safe` confermata come `security_invoker`.
- `app_private.write_staff_shop_admin_audit` confermata `security definer` con `search_path`.
- Grants verificati: accesso client limitato, `service_role` server-side.

Schema TASK-041 verificato:

- Tabelle: `pos_sales_sync_batches`, `pos_sales`, `pos_sale_lines`.
- RLS enabled e forced su tutte e tre.
- Grants revocati da `public`, `anon`, `authenticated`; grant a `service_role`.
- Unique/idempotency DB-level su batch e sale.
- Indici su shop, `shop_code`, device, staff, `client_sale_id`, `idempotency_key`, `created_at`/`occurred_at`.
- No payments/receipts runtime in v1.

Safety note: la password Supabase fornita dall'utente non e stata salvata o stampata in evidence. `.env.example` resta value-free.

## Cloudflare/OpenNext evidence

| Check | Esito |
| --- | --- |
| `@opennextjs/cloudflare` in `package.json` | `PASS`, dev dependency presente |
| `wrangler` in `package.json` | `PASS`, dev dependency presente |
| `open-next.config.ts` | `PASS`, `defineCloudflareConfig` |
| `wrangler.jsonc` | `PASS`, staging name e `nodejs_compat` |
| `src/proxy.ts` | `REMOVED_FOR_CLOUDFLARE_COMPATIBILITY` |
| `src/middleware.ts` | `PASS_WITH_DEPRECATION_NOTE`, conserva Supabase SSR guard |
| `npm run cf:build` | `PASS_WITH_WARNINGS`, Next build e OpenNext build completati; warning deprecation/copy non bloccanti |
| `npx opennextjs-cloudflare preview -- --ip 127.0.0.1 --port 8788` | `PASS`, Wrangler local preview pronto |
| `curl http://127.0.0.1:8788/` | `PASS`, HTTP `200` |
| `curl http://127.0.0.1:8788/shop` | `PASS`, HTTP `200` con auth guard |
| `curl http://127.0.0.1:8788/api/pos/sales/sync` | `PASS`, HTTP `405` atteso per GET su route POST-only |
| `npm run cf:build` finale | `PASS_WITH_WARNINGS`, OpenNext build complete; warning deprecation/copy non bloccanti |
| deploy production | `NOT_RUN_PRODUCTION_FORBIDDEN` |

## Sales Sync evidence

| Check | Esito |
| --- | --- |
| Migration `20260604214112_task_041_pos_sales_sync_foundation.sql` | `PASS`, additive only |
| `pos_sales_sync_batches` | `PASS`, batch idempotente con payload hash |
| `pos_sales` | `PASS`, sale idempotente con duplicate/conflict boundary |
| `pos_sale_lines` | `PASS`, linee shop-scoped |
| RLS/grants | `PASS`, forced RLS e service-role server-side |
| `POST /api/pos/sales/sync` | `PASS`, route implementata |
| Route runtime | `PASS`, `runtime = "nodejs"` |
| Body limit | `PASS`, `MAX_POS_SALES_SYNC_JSON_BODY_BYTES` |
| Auth POS | `PASS`, riusa session/device/staff/shop e `verifyPosSecret` |
| Duplicate handling | `PASS`, idempotency/payload hash |
| Conflict handling | `PASS`, risposta `409` su mismatch |
| Audit | `PASS`, `metadata_redacted` e `source: "TASK-041"` |
| Dashboard vendite fake | `NOT_CREATED_FORBIDDEN` |
| Win7POS live sale sync | `NOT_RUN_WIN7_RUNTIME_NOT_AVAILABLE` |

## Review/fix finale Sales Sync

Bug/fragilita corretti:

- `duplicate_client_sale_id_in_payload`: `clientSaleId` duplicati nello stesso batch ora vengono respinti prima del DB.
- `duplicate_idempotency_key_in_payload`: idempotency key duplicate nello stesso batch ora vengono respinte.
- `duplicate_sale_line_identity`: `clientLineId` e `linePosition` duplicati nella stessa vendita ora vengono respinti.
- `line_total_mismatch`: `lineTotal` deve combaciare con `quantity * unitPrice` con tolleranza centesimale.
- `sale_total_mismatch`: `subtotal - discountTotal + taxTotal` deve combaciare con `total`; la somma righe deve combaciare con `subtotal`.
- `invalid_business_date`: una `businessDate` presente ma non reale viene respinta invece di essere convertita a `null`.
- `fragile_numeric_string_parsing`: stringhe numeriche non decimali, hex o exponential vengono respinte.
- `control_char_text_persistence`: testo normalizzato con rimozione control characters.
- `partial_batch_after_downstream_failure`: se insert vendite/righe fallisce dopo il batch, il batch viene eliminato best-effort con cascade.
- `missing_success_audit_fail_closed`: success/duplicate audit ora fallisce chiuso se l'audit non e scrivibile.

Limite residuo: la cleanup e best-effort applicativa, non una singola stored procedure transazionale. Nessun stato parziale e emerso nei check; per hardening futuro si puo valutare RPC transazionale dedicata se Sales Sync cresce oltre la foundation v1.

## Win7POS evidence

| Check | Esito |
| --- | --- |
| `WIN7POS_REPO_PATH` policy | `PASS_DOCUMENTED` |
| `WIN7POS_REPO_PATH` runtime | `NOT_SET` |
| path hardcoded Win7POS nei nuovi artefatti TASK-041 | `PASS_NOT_FOUND` |
| `dotnet --version` | `PASS`, `10.0.300` |
| `pwsh --version` | `PASS`, `7.6.2` |
| host | `PASS_WITH_NOTES`, `Darwin arm64` |
| scanner PowerShell Win7POS | `NOT_RUN_NO_WIN7POS_REPO_PATH` |
| build WPF x86 | `NOT_RUN_NO_WIN7POS_REPO_PATH` |
| manual Windows 7 live run | `NOT_RUN_MANUAL_ENV_NOT_AVAILABLE` |
| sync Admin Web verification | `NOT_RUN_WIN7_RUNTIME_NOT_AVAILABLE` |

Checklist manuale live:

1. Impostare `WIN7POS_REPO_PATH`.
2. Eseguire scanner PowerShell Win7POS.
3. Costruire WPF Release x86.
4. Validare artefatto e log redatti.
5. Copiare artefatto tramite bridge/cartella condivisa.
6. Configurare URL Admin Web non-production.
7. Eseguire first login, heartbeat e catalog pull.
8. Creare vendita sintetica.
9. Eseguire Sales Sync.
10. Raccogliere log/screenshot redatti.
11. Verificare record `pos_sales_sync_batches`, `pos_sales`, `pos_sale_lines`.

## Final checks

| Comando | Esito |
| --- | --- |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 182`, `pass 182`, `fail 0` |
| `npm run typecheck` | `PASS`, `next typegen` e `tsc --noEmit` completati |
| `npm run lint` | `PASS`, exit `0` dopo ignore di `.open-next/**` e `.wrangler/**` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning Next `middleware` deprecation e Node `[DEP0205]`; exit `0` |
| `npm run verify` | `PASS_WITH_WARNINGS`, lint/typecheck/security/build exit `0`, stessi warning build |
| `npm run cf:build` | `PASS_WITH_WARNINGS`, OpenNext build complete, warning non bloccanti su copy pacchetti zip |
| `npm run verify` parallelo a `npm run build` | `FAIL_ORCHESTRATION_ONLY`, Next ha rilevato build concorrente; rerun sequenziale PASS |
| `git diff --check` | `PASS` |
| `git status --short --branch` | `PASS_WITH_DIRTY_WORKTREE_EXPECTED`, branch `codex/task-041-runtime-completion`, modifiche TASK-041 non staged |

## File modificati/creati

- `.gitignore`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md`
- `docs/TASKS/EVIDENCE/TASK-041/README.md`
- `eslint.config.mjs`
- `package.json`
- `package-lock.json`
- `open-next.config.ts`
- `wrangler.jsonc`
- `src/middleware.ts`
- `src/proxy.ts` rimosso
- `src/app/api/pos/_shared/pos-route-security.ts`
- `src/app/api/pos/sales/sync/route.ts`
- `src/server/pos-auth/sales-sync.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20260604214112_task_041_pos_sales_sync_foundation.sql`
- `scripts/dev-supabase-check.mjs`
- `scripts/security-checks.mjs`
- `tests/foundation/task-041-runtime-completion.test.mjs`
- foundation legacy tests aggiornati per TASK-041.

## Criteri di stato

- `PASS`: comando o gate eseguito con output reale e nessun blocker.
- `FAIL`: comando o gate fallito senza blocker esterno sufficiente.
- `BLOCKED`: prerequisito esterno mancante o target non autorizzato.
- `NOT_RUN`: comando vietato, non autorizzato o non applicabile.
- `PASS_WITH_NOTES`: check utile passato con limiti documentati.

## Rischi residui

- Win7POS live/manual E2E dipende da ambiente esterno e `WIN7POS_REPO_PATH`.
- Next 16 `middleware` e deprecato, ma resta necessario per compatibilita OpenNext Cloudflare in assenza di supporto Node Proxy.
- OpenNext build produce warning non bloccanti che vanno monitorati prima di staging persistente.
- Sales Sync foundation non e ancora validata da run fisico/VM Windows 7.
- Production Supabase e Cloudflare non sono stati toccati.

## Condizione precisa per DONE

`TASK-041` puo essere marcato `DONE` solo dopo conferma esplicita utente e una delle due condizioni:

1. Win7POS live/manual E2E passa con evidence su Windows 7 reale/VM, vendita sintetica, sync, log/screenshot redatti e cleanup.
2. La review accetta esplicitamente un `DONE` limitato a `Admin Web runtime completion`, mantenendo Win7POS live E2E come external/manual follow-up e senza dichiarare production-ready globale.

## Follow-up TASK-042

`TASK-042` e stato aperto come task attivo di review/bridge per chiudere i gate pratici rimasti da `TASK-041`.

Evidence aggiunta da `TASK-042`:

- `TASK-041_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS`.
- CI GitHub Actions finale `26983953492`: `success`.
- Job `Verify`: security scan, foundation tests, typecheck, lint, build, UI smoke e diff whitespace check `success`.
- Vecchio failure `26974280617`: errore su repo Win7POS locale mancante, dettagliato in `TASK-042`.
- Failure intermedio `26975644156`: foundation tests con 4 test Win7POS mancanti.
- Run successivo `26976116947`: `success`.
- Simulazioni locali:
  - `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run security:scan`: `PASS_WITH_SKIP`.
  - `REQUIRE_WIN7POS_REPO=1 WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run security:scan`: `FAIL_EXPECTED`.
  - `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run test:foundation`: `PASS_WITH_SKIPS`.
- Win7POS scanner: all `PASS`.
- Win7POS WPF Release x86 build: `PASS`, `Avvisi: 0`, `Errori: 0`.
- Pacchetto bridge: `Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038`.
- Runbook manuale e template risultato creati.

Stato ancora aperto:

- Windows 7 physical smoke: `NOT_RUN_MANUAL_WIN7_PENDING`.
- Login POS reale: `NOT_RUN_MANUAL_WIN7_PENDING`.
- Heartbeat reale: `NOT_RUN_MANUAL_WIN7_PENDING`.
- Catalog pull reale: `NOT_RUN_MANUAL_WIN7_PENDING`.
- Vendita sintetica Win7POS: `NOT_RUN_MANUAL_WIN7_PENDING`.
- Sales Sync live: `NOT_RUN_WIN7_MANUAL_PENDING`.
