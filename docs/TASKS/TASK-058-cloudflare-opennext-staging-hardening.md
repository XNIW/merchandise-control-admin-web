# TASK-058 - Cloudflare/OpenNext Staging Hardening and Deployment Governance

## Informazioni generali

- ID: `TASK-058`
- Titolo: `Cloudflare/OpenNext Staging Hardening and Deployment Governance`
- Stato: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase attuale: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Responsabile attuale: `REVIEWER`
- Branch previsto: `main`
- Data apertura: `2026-06-12`
- Ultimo unblock: `2026-06-12`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-058/README.md`
- Task precedente: `TASK-057`, riconciliato a `DONE_RECONCILED` dal prompt
  TASK-058 dopo preflight reale.

## Contesto

Il progetto ha gia spostato la traiettoria hosting da Vercel parcheggiato a
Cloudflare/OpenNext. TASK-058 rende questa traiettoria verificabile: build
locale OpenNext, smoke Workers locale, staging remoto governato, Supabase
staging separato, CI/CD con production manual-gated, rollback e WAF/rate-limit.

Il prompt unblock del 2026-06-12 ha autorizzato l'uso di Wrangler OAuth,
Cloudflare Dashboard/Safari, GitHub environments e configurazione staging. Dopo
lo sblocco sono verificati Wrangler, account Cloudflare, workers.dev staging,
GitHub environments/secrets, deploy staging e smoke staging. Restano esterni:
assenza di zone/custom domain Cloudflare per WAF/rate-limit remoto, verifica
Supabase CLI project-list non conclusa per hang, e rollback reale non eseguito
per mancanza di un precedente deployment safe noto.

Review finale mirata 2026-06-12: il deploy staging verificato e stato eseguito
via Wrangler locale, non tramite GitHub Actions. Il workflow remoto Cloudflare
e stato verificato in read-only, ma le modifiche correnti sono non committate e
non pushate; classificazione:
`GITHUB_ACTIONS_STAGING_DEPLOY_NOT_RUN_UNCOMMITTED_WORKFLOW`.

## Include

- Discovery Cloudflare/OpenNext esistente.
- Verifica Vercel disabilitato/parcheggiato.
- Verifica e hardening `open-next.config.ts`.
- Verifica e hardening `wrangler.jsonc`.
- Verifica e hardening `.github/workflows/cloudflare.yml`.
- Verifica `package.json` scripts Cloudflare.
- Local Cloudflare/OpenNext build + preview smoke.
- Staging remote readiness e deploy Workers remoto.
- Supabase staging readiness con guardrail non-production.
- GitHub environments `cloudflare-staging` e `cloudflare-production`.
- Production deploy manual-gated.
- Smoke post-deploy staging.
- Rollback runbook e verifica read-only deployments.
- WAF/rate-limit runbook/verifica, con remote apply bloccato da assenza zona.
- Redazione log/secrets.
- Evidence e test/harness.

## Non include

- Deploy production.
- DNS cutover production.
- Usare production come staging.
- Ricollegare Vercel Git Integration.
- Rimuovere `vercel.json` se serve come guardrail.
- Modifiche business UI non necessarie.
- Supabase production apply.
- Nuove migration non necessarie.
- Win7POS live E2E.
- Sales Sync live.
- Android/iOS/POS changes.
- Dati reali o secret in repository/evidence.
- Commit/stage/push.

## Criteri di accettazione

| CA | Descrizione | Stato |
| --- | --- | --- |
| CA-01 | TASK-057 chiuso o non bloccante prima di aprire TASK-058. | `PASS` |
| CA-02 | TASK-058 aperto con evidence dedicata e Master Plan aggiornato. | `PASS` |
| CA-03 | Vercel resta parcheggiato e non deploya automaticamente. | `PASS` |
| CA-04 | `wrangler.jsonc`, `open-next.config.ts` e package scripts sono coerenti con Cloudflare/OpenNext. | `PASS` |
| CA-05 | Workflow Cloudflare fa build/check e production solo manual-gated con environment approval. | `PASS_REPO_CONFIG_AND_GITHUB_ENVIRONMENTS`, `GITHUB_ACTIONS_STAGING_DEPLOY_NOT_RUN_UNCOMMITTED_WORKFLOW` |
| CA-06 | Smoke locale OpenNext/Workers copre route pubbliche, guard auth, POS API e import/export senza secret. | `PASS` |
| CA-07 | Route sensibili import/export e POS sono no-store/fail-closed dove applicabile. | `PASS` |
| CA-08 | Supabase staging separato e allowlistato, senza service-role client/browser. | `PASS_GUARDRAIL`, `SUPABASE_STAGING_VERIFICATION_PARTIAL` |
| CA-09 | Cloudflare staging remoto verificato o classificato `BLOCKED_*` senza inventare target. | `PASS_WORKERS_DEV_DEPLOY_AND_SMOKE` |
| CA-10 | WAF/rate-limit runbook pronto e rollback verificato come runbook o staging test sicuro. | `PASS_RUNBOOK_AND_DEPLOYMENTS_READ_ONLY`, `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`, `ROLLBACK_STAGING_NOT_RUN_NO_PREVIOUS_SAFE_DEPLOYMENT` |
| CA-11 | Test foundation/security/build/cf:build/smoke eseguiti con evidence reale o `NOT_RUN` motivato. | `PASS_WITH_WARNINGS_AND_EXTERNAL_BLOCKERS` |
| CA-12 | Handoff finale a REVIEW con file toccati, evidence, blocker e rischi residui. | `PASS` |

## Fonti obbligatorie lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`
- `docs/TASKS/EVIDENCE/TASK-057/README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `package.json`
- Guide Next locali in `node_modules/next/dist/docs/`:
  - Route Handlers;
  - route file convention;
  - Edge Runtime;
  - Proxy;
  - Deploying;
  - adapter configuration.
- Documentazione ufficiale Cloudflare Workers/OpenNext/Wrangler e GitHub
  Actions environments consultata durante TASK-058.
- Prompt ufficiale Cloudflare agent setup
  `https://developers.cloudflare.com/agent-setup/prompt.md`.

## Discovery e stato remoto

- `wrangler` installato: `4.98.0`.
- `@opennextjs/cloudflare`: `^1.19.11`.
- `next`: `16.2.6`.
- `react` / `react-dom`: `19.2.4`.
- `vercel.json` contiene `git.deploymentEnabled=false`.
- `wrangler.jsonc` contiene env distinti `staging` e `production`, senza route
  o custom domain hardcoded.
- `wrangler.jsonc` usa `compatibility_date` `2026-06-10`, massima data
  supportata dal workerd locale incluso in Wrangler `4.98.0` durante lo smoke.
- `.github/workflows/cloudflare.yml` contiene job separati build, staging e
  production manual-gated.
- `open-next.config.ts` usa `defineCloudflareConfig()`.
- Wrangler OAuth: `PASS`, `npx wrangler whoami` autenticato sull'account utente.
- Cloudflare workers.dev subdomain staging: `PASS`, URL pubblico
  `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`.
- Cloudflare zones/custom domains: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`
  perche l'account non contiene zone/domains.
- GitHub environments: `cloudflare-staging` creato; `cloudflare-production`
  creato con required reviewer.
- GitHub secrets: `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN` presenti in
  `cloudflare-staging` e `cloudflare-production`; valori mai stampati.
- GitHub Actions: workflow remoto `Cloudflare` attivo e verificato read-only;
  latest run su `main` ha eseguito `Cloudflare build` e ha saltato
  `Deploy staging`/`Deploy production`. Staging deploy reale TASK-058 e locale
  via Wrangler.
- Supabase staging: `.env.local` non tracciato contiene valori staging/dev
  necessari; guardrail staging PASS con env process-only; verifica remota
  Supabase CLI project-list `PARTIAL` per hang.

## Check eseguiti

| Check | Stato |
| --- | --- |
| `git status --short --branch --untracked-files=all` preflight | `PASS`, `## main...origin/main` |
| `git diff --check` preflight | `PASS` |
| `node --test tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` preflight | `PASS`, `21/21` |
| Targeted TASK-058/legacy iniziale | `PASS`, `65/65` |
| `node --check scripts/security-checks.mjs` | `PASS` |
| `node --test tests/foundation/task-058-cloudflare-opennext-staging-hardening.test.mjs` | `PASS`, `6/6` |
| `node --test tests/foundation/task-041-runtime-completion.test.mjs tests/foundation/task-058-cloudflare-opennext-staging-hardening.test.mjs` | `PASS`, `8/8` |
| `node --test tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS`, `21/21` |
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, `284/284` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning Next middleware/proxy e Node `DEP0205` |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning non bloccanti |
| `npm run cf:build` | `PASS_WITH_WARNINGS`, worker generato; warning OpenNext copia pacchetti zip |
| `CF_SMOKE_SKIP_BUILD=1 npm run smoke:cloudflare:local` | `PASS` |
| `npx wrangler deploy --dry-run --env staging` | `PASS_WITH_WARNINGS`, nessun upload/deploy |
| `npx wrangler whoami` | `PASS` |
| `npm run db:staging:status` con env process-only | `PASS` |
| `npx wrangler deploy --env staging --keep-vars` | `PASS`, staging workers.dev deployato |
| `npm run smoke:staging` con env process-only | `PASS`, `1/1` |
| `npx wrangler deployments list --env staging` | `PASS_READ_ONLY` |
| `npx wrangler deployments status --env staging` | `PASS_READ_ONLY` |
| `gh secret list --env cloudflare-staging` | `PASS`, nomi secret verificati |
| `gh secret list --env cloudflare-production` | `PASS`, nomi secret verificati |
| `gh api .../environments/cloudflare-production` | `PASS`, `required_reviewers` presente |
| `gh workflow view cloudflare.yml`, `gh run list`, `gh run view` | `PASS_READ_ONLY`, workflow attivo; deploy staging Actions `SKIPPED` sull'ultima run main; `GITHUB_ACTIONS_STAGING_DEPLOY_NOT_RUN_UNCOMMITTED_WORKFLOW` |
| Production deploy / DNS cutover | `NOT_RUN_PRODUCTION_FORBIDDEN` |

## Handoff

Codex ha completato la parte repo-controllabile e lo staging remoto workers.dev.
TASK-058 resta in `REVIEW_WITH_EXTERNAL_BLOCKERS`, non `DONE`, perche mancano
ancora zone/custom domain Cloudflare per applicare WAF/rate-limit reali, la
verifica Supabase remote project-list non e conclusa e non esiste un precedente
deployment staging safe su cui eseguire un rollback reale senza introdurre
rischio. Il task puo essere considerato `PASS_WITH_NOTES` solo per la parte
repo/staging workers.dev; il verdict formale resta `REVIEW_WITH_EXTERNAL_BLOCKERS`.

## Stop condition

- Non eseguire production deploy.
- Non fare DNS cutover.
- Non stampare secret.
- Non applicare migration/cloud apply production.
- Non dichiarare architettura ideale completa se WAF/rate-limit remoto,
  Supabase staging remoto e rollback reale non sono verificati davvero.
