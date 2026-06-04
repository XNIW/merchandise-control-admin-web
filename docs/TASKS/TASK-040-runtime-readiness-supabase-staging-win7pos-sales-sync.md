# TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation

## Informazioni generali

- ID: `TASK-040`
- Titolo: `Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`
- Stato: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase attuale: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-04`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-040/README.md`
- Branch Admin Web: `main`
- Milestone interna corrente: `PARTIAL_PASS_WITH_BLOCKERS`
- Verdict corrente: `PARTIAL_PASS_WITH_BLOCKERS`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage: `NOT_STAGED`

## Obiettivo

Assorbire in un unico task runtime i follow-up lasciati separati da TASK-039 e i gap storici collegati a staging, Supabase apply, Win7POS live E2E e Sales Sync reale.

TASK-040 non dichiara production readiness, staging stabile, Win7POS live E2E PASS o Sales Sync pronta. I gate esterni rimasti bloccati sono documentati come blocker reali.

## Scope

- Chiusura formale di TASK-039 dopo conferma utente e check freschi.
- Supabase local/non-production apply validation per la migration TASK-039.
- Verifica staging stabile non-production senza usare Vercel Production come staging.
- Discovery e check Win7POS senza sovrascrivere modifiche preesistenti.
- Discovery Sales Sync Admin Web e Win7POS.
- Riconciliazione gap storici: `TASK-029`, `TASK-031`, `TASK-032`, `TASK-033`, `TASK-022_023`.

## Follow-up folded

- ex TASK-046: Supabase local/apply validation -> `FOLDED_INTO_TASK-040`.
- ex TASK-043: staging stabile non-production -> `FOLDED_INTO_TASK-040`.
- ex TASK-044: Win7POS live E2E -> `FOLDED_INTO_TASK-040`.
- ex TASK-045: Sales Sync reale POS -> Admin Web -> `FOLDED_INTO_TASK-040`.

Non aprire TASK-043/044/045/046 come task attivi separati. La tracciabilita resta in TASK-040.

## Letture obbligatorie completate

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md`
- `docs/TASKS/EVIDENCE/TASK-039/README.md`
- `docs/DEPLOYMENT/STAGING.md`
- `docs/DEPLOYMENT/CLOUDFLARED-NON-PRODUCTION.md`
- `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md`
- `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md`
- `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`
- `docs/TASKS/TASK-022-023-pos-dashboard-win7pos-client.md`
- `docs/TASKS/TASK-029-production-path-staging-win7pos-bootstrap.md`
- `docs/TASKS/TASK-031-vercel-preview-retry.md`
- `docs/TASKS/TASK-032-full-project-progression-mega-task.md`
- `docs/TASKS/TASK-033-controlled-task-032-review-https-pos-sales.md`
- Supabase changelog/docs correnti, con attenzione ai breaking change su Data API/GraphQL exposure e al flusso CLI locale.
- Skill Vercel CLI prima delle verifiche read-only Vercel.
- Repo Win7POS `/Users/minxiang/Projects/Win7POS` in modalita read-only.

## Baseline git

### Admin Web

- `git status --short --branch`: `main...origin/main`, dirty/untracked TASK-039 gia presente.
- `git diff --check`: `PASS`.
- `git diff --cached --name-status`: output vuoto.
- `git status --short --branch --untracked-files=all`: dirty expected, no staged files.

### Win7POS

- `git status --short --branch`: `main...origin/main`, dirty preesistente su `.gitignore`, `docs/dev/`, `scripts/win7pos/`.
- `git diff --check`: `PASS`.
- Nessuna modifica Win7POS eseguita da TASK-040.

## Fase 0 - TASK-039 formal closure

La conferma esplicita utente e stata ricevuta nell'allegato TASK-040: se i check freschi confermano lo stato gia documentato, TASK-039 puo essere marcato `DONE` per il suo code scope.

Check freschi eseguiti:

| Comando | Esito |
| --- | --- |
| `git diff --check` | `PASS` |
| `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` | `PASS`, `4/4` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `179/179` |
| `npm run typecheck` | `PASS`, `next typegen` completato |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_TOOLCHAIN_WARNING`, warning noto `[DEP0205]` |
| `npm run verify` | `PASS_WITH_TOOLCHAIN_WARNING`, warning noto `[DEP0205]` |

Decisione: TASK-039 passa da `REVIEW` / `READY_FOR_DONE_CONFIRMATION` a `DONE` / `DONE_RECONCILED` per il solo code scope. Non implica Supabase apply, staging stabile, Win7POS live E2E o Sales Sync.

## Review/fix finale 2026-06-04

Review repo-grounded richiesta dall'allegato finale eseguita senza commit, push o stage.

Problemi repo-controllabili trovati e corretti:

- `src/server/shop-admin/settings-mutations.ts`: path personal account senza guard esplicito `adminConfig.status !== "configured"` prima della creazione admin client.
- `src/server/shop-admin/settings-mutations.ts`: audit settings scritto con client SSR/RLS del context invece dello stesso admin client server-side usato per l'update shop.

Fix applicati:

- `updateShopSettings` fallisce `not_configured` quando la admin env non e configurata.
- `writeSettingsAudit` riceve `adminClient` e scrive `audit_logs` con il boundary server-side coerente.
- `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` e `scripts/security-checks.mjs` bloccano regressioni su entrambi i punti.

Check freschi:

- `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`: `PASS`, `4/4`;
- `npm run security:scan`: `PASS`;
- `npm run test:foundation`: `PASS`, `179/179`;
- `npm run typecheck`: `PASS`;
- `npm run lint`: `PASS`;
- `npm run build`: `PASS_WITH_TOOLCHAIN_WARNING`, warning noto `[DEP0205]`;
- `npm run verify`: `PASS_WITH_TOOLCHAIN_WARNING`, warning noto `[DEP0205]`;
- `npm run test:shop-admin-auth-smoke`: `PASS_WITH_SKIPS`, `1 passed`, `2 skipped`;
- Browser in-app locale: `/account/profile`, `/shop/staff-login` e `/shop/settings` render/gate `PASS`, console error `0`;
- iOS/Android discovery locale: `NOT_PRESENT_IN_CURRENT_WORKSPACE`;
- Codex Security diff scan: report `/tmp/codex-security-scans/merchandise-control-admin-web/localpatch_20260604145545/report.md` e `.html`, 0 finding reportable aperti dopo fix.

Decisione: TASK-040 resta `REVIEW_WITH_EXTERNAL_BLOCKERS` / `PARTIAL_PASS_WITH_BLOCKERS`. I fix chiudono solo problemi repo-controllabili; non sbloccano Supabase apply, staging stabile, Win7POS live E2E o Sales Sync reale.

## Fase 2 - Supabase local/non-production apply validation

### Environment discovery

- `.env.local`: file presente.
- Classificazione: `supabase_cloud`.
- `NEXT_PUBLIC_SUPABASE_URL`: `present_redacted`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: `present_redacted`.
- `SUPABASE_PROJECT_REF`: `missing_or_empty`.
- `SUPABASE_SERVICE_ROLE_KEY`: `missing_or_empty`.
- `supabase/config.toml`: `project_id = "merchandise-control-admin-web"`.
- Docker locale: stack attivo `supabase_db_MerchandiseControlSupabase`.
- Container atteso dallo script locale: `supabase_db_merchandise-control-admin-web`.
- Stato: `BLOCKED_LOCAL_SUPABASE_ENV` / `BLOCKED_SUPABASE_CONTAINER_MISMATCH`.

### CLI e migration status

- Prima run parallela `supabase --version`: `FAIL_CLI_TELEMETRY_RACE`, errore `FileSystem.rename ... telemetry.json.tmp`.
- Rerun seriale con `SUPABASE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 supabase --version`: `2.104.0`.
- `npm run dev:db:status`: exit `2`, fail-closed su `.env.local` cloud, service-role assente, container mismatch e `supabase status` non completato.
- `supabase status -o json` redatto: `FAIL`, container `supabase_db_merchandise-control-admin-web` assente.
- `supabase migration list --local`: `20260604120000` local presente, remote/history vuota -> `MIGRATION_PENDING_NOT_APPLIED`.
- `supabase db lint --local --schema public,app_private --fail-on error`: `PASS`, `No schema errors found`.

### Migration TASK-039

Migration verificata: `supabase/migrations/20260604120000_task_039_staff_aware_shop_admin.sql`.

Caratteristiche:

- additiva su `public.audit_logs.actor_staff_id`;
- additiva su `public.staff_accounts.web_access_revoked_*`;
- indici condizionali per `actor_staff_id` e `web_access_revoked_at`;
- `create or replace view public.staff_accounts_safe with (security_invoker = true)`;
- revoke/grant su view safe;
- `app_private.write_staff_shop_admin_audit`;
- revoke della function da `public`, `anon`, `authenticated`;
- `notify pgrst, 'reload schema'`.

Apply status: `APPLY_NOT_RUN_BLOCKED_ENV_MISMATCH`.

Types status: `src/lib/supabase/database.types.ts` contiene `actor_staff_id`, `web_access_revoked_at`, `web_access_revoked_by_staff_id`, `web_access_revoked_reason` e `write_staff_shop_admin_audit`; typegen live post-apply non eseguito per blocker env.

## Fase 3 - Staging stabile non-production

Verifiche read-only:

- `vercel --version`: `Vercel CLI 54.7.1`.
- `vercel whoami`: account autenticato verificato.
- `.vercel/project.json`: project `merchandise-control-admin-web`, framework `nextjs`, Node Vercel `24.x`.
- `vercel.json`: `git.deploymentEnabled=false`.
- `vercel ls --scope xniw97-9857s-projects`: `No deployments found`.
- `vercel alias ls --scope xniw97-9857s-projects`: nessun alias attivo.

Nessun deploy eseguito. I percorsi storici CLI/REST/branch non-main sono gia documentati come producer di `Production`; ripeterli violerebbe il vincolo no-production.

Staging status: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`.

Cloudflared resta possibile solo come debug/tunnel effimero e non viene dichiarato staging stabile.

## Fase 4 - Win7POS live E2E

Repo atteso: `/Users/minxiang/Projects/Win7POS`.

Discovery:

- `pwsh`: presente.
- `dotnet --version`: `10.0.300`.
- Modello vendite locale presente: `sales`, `sale_lines`, `Sale`, `SaleLine`, `SaleKind`, `SaleRepository`, refund/void.
- Config online Admin Web presente: `WIN7POS_ADMIN_WEB_BASE_URL`, `pos-admin-web.config`, `PosAdminWebClient`, first-login, heartbeat, catalog pull, trusted device store.

Check eseguiti:

| Comando | Esito |
| --- | --- |
| `pwsh -NoProfile -File scripts/check-dialog-standards.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -File scripts/check-pos-online-client.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `RESULT: ALL PASS` |
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS`, `Win7POS.Wpf -> .../net48/Win7POS.Wpf.exe`, `Avvisi: 0`, `Errori: 0` |

Runtime live:

- Host: `Darwin ... RELEASE_ARM64_T6031 arm64`.
- `wine`: `NOT_FOUND`.
- `mono`: `NOT_FOUND`.
- `qemu-system-x86_64`: `NOT_FOUND`.

Win7POS E2E: `BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE`.

## Fase 5 - Sales Sync reale POS -> Admin Web

Admin Web discovery:

- `src/app/api/pos/sales`: `NOT_FOUND`.
- Migration runtime `pos_sales` / `pos_sale_lines`: `NOT_FOUND`.
- Route Shop Admin presenti: `/shop/pos` e `/shop/sync`; nessuna dashboard vendite reale.
- Scanner sicurezza vieta ancora `pos_sales_sync`, `src/app/api/pos/sales`, `pos_sales` runtime fuori dai task approvati.

Win7POS discovery:

- modello vendite locale reale presente (`sales`, `sale_lines`, `SaleRepository`, refund/void);
- identificatori online staff/device/session disponibili dal bootstrap/catalog foundation;
- offline sales queue/idempotency sync non implementati.

Decisione: Sales Sync foundation non implementata in TASK-040. Mancano schema Admin Web, apply Supabase coerente, staging stabile e Win7POS live E2E.

Sales Sync: `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA` / `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`.

## Fase 6 - Riconciliazione gap storici

| Gap | Stato TASK-040 | Note |
| --- | --- | --- |
| `TASK-029` | `STILL_BLOCKED` | Staging pubblico HTTPS non-production e smoke/E2E staging ancora mancanti. |
| `TASK-031` | `STILL_BLOCKED` | Vercel continua classificato come `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`. |
| `TASK-032` | `STILL_BLOCKED` | Fase HTTPS stabile e reconciliation live non superate. |
| `TASK-033` | `STILL_BLOCKED` | Win7POS live E2E ancora bloccato da runtime Windows/WPF assente. |
| `TASK-022_023` | `STILL_PARKED` | `PARKED_E2E_PENDING`, scanner/build non sostituiscono live E2E. |
| ex `TASK-043` | `FOLDED_INTO_TASK-040` | Staging stabile non-production. |
| ex `TASK-044` | `FOLDED_INTO_TASK-040` | Win7POS live E2E. |
| ex `TASK-045` | `FOLDED_INTO_TASK-040` | Sales Sync foundation reale. |
| ex `TASK-046` | `FOLDED_INTO_TASK-040` | Supabase local/apply validation. |

Nessun task storico viene marcato `DONE` da TASK-040.

## Criteri di accettazione

| CA | Descrizione | Stato |
| --- | --- | --- |
| CA-01 | Chiudere formalmente TASK-039 con check freschi e conferma utente | `PASS` |
| CA-02 | Aprire TASK-040 come unico task attivo | `PASS` |
| CA-03 | Fold formale ex TASK-043/044/045/046 in TASK-040 | `PASS` |
| CA-04 | Supabase discovery redatta senza secret | `PASS` |
| CA-05 | Migration TASK-039 lint/verifica additiva | `PASS_WITH_BLOCKER` |
| CA-06 | Apply Supabase local/non-production | `BLOCKED_LOCAL_SUPABASE_ENV` |
| CA-07 | Staging stabile non-production | `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION` |
| CA-08 | Win7POS scanner/build | `PASS_STATIC_BUILD_ONLY` |
| CA-09 | Win7POS live E2E | `BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE` |
| CA-10 | Sales Sync reale | `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA` |
| CA-11 | No fake dashboard/sales data | `PASS` |
| CA-12 | No commit/push/stage finale | `PASS_NOT_RUN` |

## Handoff

- Handoff: `REVIEW_WITH_EXTERNAL_BLOCKERS`.
- Verdict: `PARTIAL_PASS_WITH_BLOCKERS`.
- Prossima fase: review umana/Claude e decisione su blocker esterni.
- No commit eseguito.
- No push eseguito.
- No stage finale.
