# Evidence TASK-059

Verdict corrente: `DONE_RECONCILED_WITH_NOTES`.

TASK-059 e stato aperto dopo il merge TASK-058 su `main` (`b93a6e4`) per
cleanup documentale, verifica Supabase staging read-only e readiness
Cloudflare custom domain/WAF. Nessun deploy production, deploy staging,
Supabase migration/apply, reset, dump o modifica dati remoti e stato eseguito.

Final review 2026-06-13: TASK-059 e stato riconciliato a
`DONE_RECONCILED_WITH_NOTES` su conferma esplicita dell'utente dopo PR #1
mergeata su `main` con commit `d15e461`.

## Fonti lette

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-058-cloudflare-opennext-staging-hardening.md`
- `docs/TASKS/EVIDENCE/TASK-058/README.md`
- `.github/workflows/cloudflare.yml`
- `.github/workflows/ci.yml`
- `package.json`
- `wrangler.jsonc`
- `.env.example`
- `docs/DEPLOYMENT/CLOUDFLARE-MIGRATION.md`
- `docs/DEPLOYMENT/CLOUDFLARE-ROLLBACK.md`
- `docs/DEPLOYMENT/CLOUDFLARE-WAF-RATE-LIMIT.md`
- `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md`
- `docs/DEVELOPMENT/SUPABASE-LOCAL-DEV.md`
- `scripts/db/staging-status.mjs`
- `scripts/testing/target-guardrails.mjs`
- Supabase changelog/docs index consultato per reminder su CLI e breaking
  changes; nessuna feature Supabase nuova implementata.

## Branch

- Base branch: `main`
- Branch TASK-059: `codex/task-059-post-merge-supabase-readiness`
- Stato iniziale: `main` allineato a `origin/main` prima della creazione
  branch.

## Cleanup TASK-058

- Chiarito che `Edit Cloudflare Workers` era il nome/template dei token
  precedenti/storici creati durante TASK-058.
- Chiarito che il token corrente e il nuovo token CI
  `TASK-058 GitHub Actions Cloudflare deploy 2026-06-13`.
- Mantenuta l'evidence della causa reale auth: secret copiato inizialmente come
  comando `curl` wrapper invece del token puro.
- Mantenuta l'evidence della rotazione/revoca: vecchi token revocati `2/2`,
  secret GitHub staging/production aggiornati per nome, valori mai stampati.
- TASK-058 resta `REVIEW_WITH_EXTERNAL_BLOCKERS`, non `DONE`.
- Aggiornata una whitelist foundation legacy TASK-035 per accettare
  `TASK-057` come ultimo task completato dopo l'apertura di TASK-059; nessun
  runtime o workflow deploy modificato.

## Supabase staging read-only

| Check | Esito |
| --- | --- |
| `npx supabase --version` | `PASS`, `2.106.0` |
| GitHub `cloudflare-staging` vars metadata | `PASS`, nomi presenti: `CLOUDFLARE_STAGING_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_PROJECT_REF`, `ALLOWED_STAGING_SUPABASE_PROJECT_REFS`; valori non letti |
| `.env.local` metadata locale | `PASS_METADATA`, file presente, URL shape `https://*.supabase.co`, `SUPABASE_PROJECT_REF` shape valida, valori non stampati |
| `npm run db:staging:status` con env process-only | `PASS`, guardrail staging, URL Supabase cloud, project ref allowlistato e non production |
| `npx supabase projects list --output-format json` con timeout 20s | `PARTIAL_TIMEOUT`, nessun stdout/stderr prima del timeout |

Verdict Supabase staging: `PARTIAL_TIMEOUT`.

Non sono stati usati service-role key, token Supabase, query SQL, migration,
reset DB, dump o comandi production.

## Cloudflare WAF/custom domain read-only

| Check | Esito |
| --- | --- |
| `npx wrangler whoami` | `PASS`, account utente verificato via OAuth; nessun secret stampato |
| Cloudflare dashboard API read-only `zones` | `PASS`, `zonesCount=0` |
| Cloudflare dashboard API read-only Workers domains | `PASS`, `workersDomainsCount=0` |
| `wrangler.jsonc` route/custom domain scan | `PASS`, `routes=false`, `customDomain=false`, `workers_dev=true` per staging/production |

Verdict Cloudflare WAF/custom domain:
`BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.

Nessuna zona, DNS, custom domain, WAF o rate-limit remoto e stato creato o
modificato.

## Deploy status

- Production deploy: `NOT_RUN`.
- Staging deploy: `NOT_RUN` in TASK-059.
- Ultima run staging verificata resta TASK-058 post-rotazione `27450388578`
  (`PASS`), ma non e stata rilanciata in TASK-059.

## Check locali

| Check | Esito |
| --- | --- |
| `git diff --check` | `PASS` |
| `npm run security:scan` | `PASS` |
| `node --test tests/foundation/task-058-cloudflare-opennext-staging-hardening.test.mjs` | `PASS`, `6/6` |
| `node --test tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS`, `23/23` dopo fix whitelist TASK-035 |
| `npm run test:foundation` | `PASS`, `284/284` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning noti Next `middleware` -> `proxy` e Node `DEP0205` |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning noti |
| `CF_SMOKE_SKIP_BUILD=1 npm run smoke:cloudflare:local` | `PASS`, route guard/auth/POS/import-export no-store verificate |
| `git status --short --branch` | `PASS`, branch TASK-059 con sole modifiche documentali/test previste |

## Check finali DONE reconciliation 2026-06-13

| Check | Esito |
| --- | --- |
| `git fetch origin && git checkout main && git pull --ff-only origin main` | `PASS`, `main` allineato a `origin/main` |
| `gh pr view 1 --repo XNIW/merchandise-control-admin-web` | `PASS`, PR #1 `MERGED`, merge commit `d15e461` |
| `git show --stat d15e461` | `PASS`, solo file documentali/runbook/evidence e guardrail TASK-035 mirato |
| `git diff --check` | `PASS` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `node --test tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs tests/foundation/task-054-shop-admin-auth-navigation.test.mjs tests/foundation/task-055-shop-admin-ui-polish.test.mjs` | `PASS`, `25/25` dopo update mirato delle whitelist governance |
| `npm run test:foundation` | `PASS`, `284/284` |
| `npm run typecheck` | `PASS`, `next typegen && tsc --noEmit` |
| `npm run lint` | `PASS`, `eslint` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning noti Next `middleware` -> `proxy` e Node `DEP0205` |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning noti nel build interno |
| `CF_SMOKE_SKIP_BUILD=1 npm run smoke:cloudflare:local` | `PASS`, route guard, POS guard/method guard e import/export guard |
| `git status --short --branch` | `PASS_PRE_COMMIT`, solo modifiche reconciliation TASK-059 previste |

## File modificati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-059-post-merge-supabase-staging-readiness.md`
- `docs/TASKS/EVIDENCE/TASK-059/README.md`
- `docs/TASKS/EVIDENCE/TASK-058/README.md`
- `docs/DEPLOYMENT/CLOUDFLARE-MIGRATION.md`
- `docs/DEPLOYMENT/CLOUDFLARE-WAF-RATE-LIMIT.md`
- `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md`
- `docs/DEPLOYMENT/STAGING.md`
- `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs`

File toccati nella reconciliation finale:

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-059-post-merge-supabase-staging-readiness.md`
- `docs/TASKS/EVIDENCE/TASK-059/README.md`
- `tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs`
- `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs`
- `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`
- `tests/foundation/task-055-shop-admin-ui-polish.test.mjs`

## PR

- PR verso `main`: https://github.com/XNIW/merchandise-control-admin-web/pull/1
- Stato PR: `MERGED`.
- Merge commit: `d15e461`.

## DONE reconciliation

- Stato finale TASK-059: `DONE_RECONCILED_WITH_NOTES`.
- `PARTIAL_TIMEOUT` Supabase non blocca TASK-059 perche lo scope era
  classificare/verificare read-only con timeout, non sbloccare la CLI creando
  token o usando production.
- `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED` non blocca TASK-059 perche lo scope
  era readiness read-only, non creare zona, DNS, custom domain, WAF o
  rate-limit.
- TASK-058 resta `REVIEW_WITH_EXTERNAL_BLOCKERS`.
- Production deploy resta `NOT_RUN`.

## Rischi residui

- Supabase remote verification non e pienamente verificata per timeout CLI.
- Cloudflare WAF/rate-limit resta bloccato finche non esistono zone/custom
  domain.
- Rollback staging reale resta non eseguito.
- Production resta vietata senza nuova conferma esplicita e approval.
