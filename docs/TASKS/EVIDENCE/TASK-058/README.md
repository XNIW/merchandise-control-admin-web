# Evidence TASK-058

Verdict corrente: `REVIEW_WITH_EXTERNAL_BLOCKERS`.

Nessun commit, push, stage, deploy production, DNS cutover, Supabase production
apply o cloud production apply eseguito.

## Preflight TASK-057

Il prompt TASK-058 contiene conferma utente esplicita per riconciliare
TASK-057 se evidence e check confermano `READY_FOR_DONE_CONFIRMATION`.

| Check | Esito |
| --- | --- |
| `git status --short --branch --untracked-files=all` | `PASS`, `## main...origin/main` |
| `git diff --check` | `PASS`, nessun output |
| `node --test tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS`, `21/21` |

TASK-057 e stato quindi riconciliato a `DONE_RECONCILED` in modo minimale.

## Review finale mirata 2026-06-12

Verdict confermato: `REVIEW_WITH_EXTERNAL_BLOCKERS`.

- TASK-057: confermato `DONE_RECONCILED` in
  `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`,
  `docs/TASKS/EVIDENCE/TASK-057/README.md` e `docs/MASTER-PLAN.md`.
- GitHub Actions: workflow remoto `Cloudflare` verificato in read-only con
  `gh workflow view cloudflare.yml`, `gh run list --workflow cloudflare.yml` e
  `gh run view <latest>`. Latest run letta: evento `push`, branch `main`,
  job `Cloudflare build` `success`, job `Deploy staging` `skipped`, job
  `Deploy production` `skipped`.
- Staging deploy TASK-058: eseguito via Wrangler locale
  `npx wrangler deploy --env staging --keep-vars`, non tramite GitHub Actions.
  Stato: `GITHUB_ACTIONS_STAGING_DEPLOY_NOT_RUN_UNCOMMITTED_WORKFLOW`.
- Cloudflare token: creato in Dashboard con nome/template
  `Edit Cloudflare Workers`, scope risorse sull'account corrente e
  `All zones from an account` per lo stesso account; installato solo come
  GitHub secret nei due ambienti `cloudflare-staging` e
  `cloudflare-production`; valore mai stampato.
- Production approval: `cloudflare-production` verificato via GitHub API con
  protection rule `required_reviewers`. Deploy production resta
  `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Supabase staging: `npx supabase projects list` e rimasto in hang/no output;
  classificazione confermata `SUPABASE_STAGING_VERIFICATION_PARTIAL`, non
  remote verification pienamente verificata.
- Rollback: `ROLLBACK_READ_ONLY_VERIFIED` tramite
  `wrangler deployments list/status --env staging`; rollback reale non provato.
- WAF/rate-limit: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`; nessuna regola WAF
  attiva dichiarata.
- Evidence wording: nessuna dichiarazione di production-ready o architettura
  ideale completa per TASK-058; la checklist production mantiene i gate aperti.

## File letti

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`
- `docs/TASKS/EVIDENCE/TASK-057/README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `package.json`
- `open-next.config.ts`
- `wrangler.jsonc`
- `.github/workflows/cloudflare.yml`
- `vercel.json`
- `.github/workflows/ci.yml`
- `docs/DEPLOYMENT/CLOUDFLARE-MIGRATION.md`
- `docs/DEPLOYMENT/CLOUDFLARE-ROLLBACK.md`
- `docs/DEPLOYMENT/CLOUDFLARE-WAF-RATE-LIMIT.md`
- `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md`
- `docs/DEVELOPMENT/SUPABASE-LOCAL-DEV.md`
- `.env.example`
- `.env.local` solo per presenza/valori passati process-only a comandi
  autorizzati; nessun valore salvato in repo/evidence.
- `src/middleware.ts`
- Supabase SSR helpers in `src/lib/supabase/*`
- POS route handlers in `src/app/api/pos/**/route.ts`
- Import/export route handlers in `src/app/shop/import-export/**/route.ts`
- Foundation/e2e guardrail tests collegati a Cloudflare, Supabase staging e smoke.
- Guide Next locali in `node_modules/next/dist/docs/`.
- Wrangler schema locale `node_modules/wrangler/config-schema.json`.
- Help CLI locale `npx wrangler --version`, `deploy --help`,
  `rollback --help`, `deployments --help`, `dev --help`.
- Help CLI locale `npx opennextjs-cloudflare --help` e `preview --help`.
- Documentazione ufficiale Cloudflare Workers Next.js/OpenNext, Wrangler
  configuration/compatibility/Node compat, GitHub Actions environments.
- Prompt ufficiale Cloudflare agent setup
  `https://developers.cloudflare.com/agent-setup/prompt.md`.

## Discovery repo-grounded

- Vercel resta parcheggiato con `git.deploymentEnabled=false`.
- `package.json` contiene build/smoke/deploy Cloudflare dedicati.
- `wrangler.jsonc` ha env distinti `staging`/`production`, worker names
  separati e nessuna route/custom domain hardcoded.
- `wrangler.jsonc` non contiene secret; `account_id` non e hardcoded.
- `wrangler.jsonc` usa `compatibility_date` `2026-06-10`, perche il primo
  smoke con `2026-06-12` era oltre la data supportata dal workerd locale
  Wrangler `4.98.0`.
- `.github/workflows/cloudflare.yml` include build Cloudflare, smoke locale,
  deploy staging condizionato e deploy production solo `workflow_dispatch` con
  environment `cloudflare-production` e conferme manuali.
- Route POS sono `POST` only, `runtime = "nodejs"`, `dynamic = "force-dynamic"`
  e usano helper JSON con `Cache-Control: no-store`.
- Route import/export sono dinamiche, no-store e fail-closed dove applicabile.

## File modificati

- `.github/workflows/cloudflare.yml`
- `package.json`
- `wrangler.jsonc`
- `scripts/security-checks.mjs`
- `scripts/testing/cloudflare-local-smoke.mjs`
- `src/app/shop/import-export/preview/route.ts`
- `src/app/shop/import-export/apply/route.ts`
- `src/app/shop/import-export/export/route.ts`
- `src/app/shop/import-export/template/route.ts`
- `docs/DEPLOYMENT/CLOUDFLARE-MIGRATION.md`
- `docs/DEPLOYMENT/CLOUDFLARE-ROLLBACK.md`
- `docs/DEPLOYMENT/CLOUDFLARE-WAF-RATE-LIMIT.md`
- `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`
- `docs/TASKS/EVIDENCE/TASK-057/README.md`
- `docs/TASKS/TASK-058-cloudflare-opennext-staging-hardening.md`
- `docs/TASKS/EVIDENCE/TASK-058/README.md`
- `tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs`
- `tests/foundation/task-041-runtime-completion.test.mjs`
- `tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs`
- `tests/foundation/task-049-master-console-admins-ui-polish.test.mjs`
- `tests/foundation/task-050-review-done-reconciliation-task-040-049.test.mjs`
- `tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs`
- `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`
- `tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
- `tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`
- `tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs`
- `tests/foundation/task-058-cloudflare-opennext-staging-hardening.test.mjs`

## Decisioni

- Mantenere Vercel come guardrail/parcheggio, non rimuovere `vercel.json`.
- Non hardcodare `account_id`, zone, domini o Supabase project ref in repo.
- Usare `wrangler deploy --env staging --keep-vars` per non cancellare
  variabili configurate fuori repo.
- Production deploy resta solo `workflow_dispatch`, branch `main`,
  `cloudflare-production` e conferme manuali.
- GitHub Actions staging deploy non e stato eseguito per questa modifica non
  committata/non pushata:
  `GITHUB_ACTIONS_STAGING_DEPLOY_NOT_RUN_UNCOMMITTED_WORKFLOW`.
- Smoke locale usa `wrangler dev --local` su `127.0.0.1` e termina sempre il
  processo figlio.
- Il prompt unblock 2026-06-12 ha autorizzato configurazione Cloudflare/GitHub
  esterna. Secret e token sono stati passati solo via stdin/clipboard e poi
  redatti.

## Stato Cloudflare/OpenNext locale

- `npm run cf:build`: `PASS_WITH_WARNINGS`.
- Output rilevante: OpenNext ha generato `.open-next/worker.js` e completato
  la build. Ha stampato warning/error non bloccanti:
  - Next `middleware` file convention deprecata verso `proxy`;
  - Node `module.register()` deprecato;
  - OpenNext `Failed to copy` per `compress-commons`, `crc32-stream`,
    `zip-stream`.
- `CF_SMOKE_SKIP_BUILD=1 npm run smoke:cloudflare:local`: `PASS`.
- Smoke locale PASS:
  - `/` status `307`, no-store;
  - `/auth/login` status `200`, no-store;
  - `/platform`, `/shop`, `/shop/products` status `200`, no-store;
  - POS guard POST `/api/pos/auth/first-login`,
    `/api/pos/session/heartbeat`, `/api/pos/catalog/pull`,
    `/api/pos/sales/sync` status `400`, no-store;
  - POS method guard GET sugli stessi endpoint status `405`;
  - upload guard `/shop/import-export/preview` e `/apply` status `415`,
    no-store;
  - export guard status `400`, no-store;
  - template status `200`, no-store.
- `npx wrangler deploy --dry-run --env staging`: `PASS_WITH_WARNINGS`, nessun
  upload/deploy. Output rilevante: `--dry-run: exiting now`; binding staging
  `WORKER_SELF_REFERENCE (merchandise-control-admin-web-staging)` e `ASSETS`
  letti correttamente.

## Stato Cloudflare auth e account

- `npx wrangler login`: `PASS`, autorizzato via Cloudflare/Safari.
- `npx wrangler whoami`: `PASS`; account Cloudflare utente verificato.
- Cloudflare API read-only:
  - workers scripts iniziali: `0`;
  - zones: `0`;
  - workers domains/custom domains: `0`.
- Workers.dev subdomain creato/verificato: `merchandise-control-admin-web`.
- Staging URL pubblico:
  `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`.
- Cloudflare MCP:
  - `cloudflare-api` disponibile;
  - `cloudflare-docs`, `cloudflare-builds`, `cloudflare-observability`
    configurati;
  - `cloudflare-bindings` non autenticato dopo callback OAuth fallita.

## Stato Cloudflare API token CI

- Token creato da Cloudflare Dashboard usando template `Edit Cloudflare Workers`.
- Nome/template confermato senza valore token: `Edit Cloudflare Workers`.
- Scope risorse limitato all'account corrente e a `All zones from an account`
  per lo stesso account.
- Il valore one-time non e stato stampato, salvato o copiato in evidence.
- Clipboard svuotata dopo `gh secret set`.
- GitHub secrets verificati per nome:
  - `cloudflare-staging`: `CLOUDFLARE_ACCOUNT_ID`,
    `CLOUDFLARE_API_TOKEN`;
  - `cloudflare-production`: `CLOUDFLARE_ACCOUNT_ID`,
    `CLOUDFLARE_API_TOKEN`.

## Stato Cloudflare staging remoto

- `npx wrangler deploy --env staging --keep-vars`: `PASS`, eseguito via
  Wrangler locale.
- GitHub Actions staging deploy: `GITHUB_ACTIONS_STAGING_DEPLOY_NOT_RUN_UNCOMMITTED_WORKFLOW`.
- Deploy delegato a `opennextjs-cloudflare deploy`.
- Asset upload completato: `43` asset.
- Worker remoto: `merchandise-control-admin-web-staging`.
- URL remoto: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`.
- Version ID del deploy applicativo: `01053a54-aa17-4e74-bcff-4c0b6e02dd6b`.
- Dopo il deploy sono stati impostati secret/env Worker staging via
  `wrangler secret put` con stdin:
  - `NEXT_PUBLIC_SUPABASE_URL`;
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
  - `SUPABASE_PROJECT_REF`;
  - `SUPABASE_SERVICE_ROLE_KEY`.
- Cloudflare API ha verificato solo i nomi dei secret, non i valori.
- `wrangler deployments status --env staging` ha mostrato una versione attiva
  al 100% dopo le secret changes.
- Warning non bloccanti:
  - direct eval;
  - duplicate euro key;
  - Node `DEP0190`.

## Stato Cloudflare production

- `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Production deploy vietato in TASK-058.
- DNS cutover production vietato in TASK-058.
- Environment GitHub `cloudflare-production`: creato con `required_reviewers`.
- Production deploy da GitHub Actions richiede environment approval su
  `cloudflare-production` oltre alle conferme manuali del workflow.
- Nessun secret Supabase production impostato.

## Stato Supabase staging

- `.env.local` non e tracciato da git.
- Presenza locale verificata senza stampare valori:
  - `NEXT_PUBLIC_SUPABASE_URL`;
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
  - `SUPABASE_PROJECT_REF`;
  - `SUPABASE_SERVICE_ROLE_KEY`.
- `npm run db:staging:status` con env process-only: `PASS`.
  - `TEST_TARGET=staging`;
  - URL Supabase `https://*.supabase.co`;
  - project ref allowlistato e non production.
- Rerun finale post-documentazione:
  - senza allowlist process-only: `FAIL_CLOSED`
    `BLOCKED_STAGING_PROJECT_REF_NOT_ALLOWLISTED`;
  - con allowlist ma conferma sbagliata: `FAIL_CLOSED`
    `BLOCKED_STAGING_CONFIRMATION_REQUIRED`;
  - con `STAGING_SUPABASE_PROJECT_REF`,
    `ALLOWED_STAGING_SUPABASE_PROJECT_REFS`, `ALLOW_STAGING_E2E=yes` e
    `CONFIRM_STAGING_E2E=yes` process-only: `PASS`.
- `npx supabase projects list`: `SUPABASE_STAGING_VERIFICATION_PARTIAL`,
  comando terminato manualmente per hang/no output. Non viene dichiarato
  `PASS` remote project-list.
- `SUPABASE_SERVICE_ROLE_KEY` resta server-side/secret only; nessun valore e
  stato letto, stampato o salvato.

## Stato GitHub environments

- `gh --version`: `2.94.0`.
- `gh auth status`: `PASS`, account `XNIW`, token mascherato dal CLI.
- `gh repo view --json nameWithOwner,defaultBranchRef`: repo
  `XNIW/merchandise-control-admin-web`, default branch `main`.
- `gh workflow list`: `CI` active, `Cloudflare` active.
- `gh workflow view cloudflare.yml`: workflow remoto `Cloudflare`, ID
  `290788709`.
- `gh run list --workflow cloudflare.yml`: run recenti lette in read-only.
- `gh run view` su latest run: evento `push`, branch `main`,
  `Cloudflare build` `success`, `Deploy staging` `skipped`,
  `Deploy production` `skipped`.
- Staging deploy Actions non eseguito sulle modifiche correnti non committate:
  `GITHUB_ACTIONS_STAGING_DEPLOY_NOT_RUN_UNCOMMITTED_WORKFLOW`.
- Environment iniziali: solo `Production`.
- Environment creati/verificati:
  - `cloudflare-staging`;
  - `cloudflare-production`.
- `cloudflare-production` protection: `required_reviewers`.
- Secret configurati per nome in staging e production:
  - `CLOUDFLARE_ACCOUNT_ID`;
  - `CLOUDFLARE_API_TOKEN`.
- Variabili configurate per nome in `cloudflare-staging`:
  - `CLOUDFLARE_STAGING_URL`;
  - `NEXT_PUBLIC_SUPABASE_URL`;
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
  - `STAGING_SUPABASE_PROJECT_REF`;
  - `ALLOWED_STAGING_SUPABASE_PROJECT_REFS`.

## Stato WAF/rate-limit

- Runbook aggiornato: `docs/DEPLOYMENT/CLOUDFLARE-WAF-RATE-LIMIT.md`.
- Include safe operations `/platform/operations`, soglie, log-first e gestione
  false-positive.
- Cloudflare remote WAF/rate-limit: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.
- Motivo: account Cloudflare con `zones count 0` e `workers/domains count 0`;
  non esiste custom domain/zone su cui applicare regole WAF reali.
- Nessuna regola WAF/rate-limit remota e dichiarata attiva.

## Stato rollback

- Runbook Cloudflare aggiornato con comandi Wrangler 4.98 verificati da help.
- `npx wrangler deployments list --env staging`: `ROLLBACK_READ_ONLY_VERIFIED`.
- `npx wrangler deployments status --env staging`: `ROLLBACK_READ_ONLY_VERIFIED`.
- Rollback staging reale:
  `ROLLBACK_STAGING_NOT_RUN_NO_PREVIOUS_SAFE_DEPLOYMENT`.
- Motivo: esiste il deploy appena fatto e secret-change deployments, ma non un
  precedente deployment safe noto con la stessa configurazione staging.
- Rollback production reale: `NOT_RUN_PRODUCTION_FORBIDDEN`.

## Smoke staging remoto

- `npm run smoke:staging` con env process-only e `PLAYWRIGHT_BASE_URL` sullo
  staging workers.dev: `PASS`.
- Test eseguito: `staging Platform auth boundary responds without mutating data`.
- Risultato iniziale: `1/1` passed in circa `3.6s`.
- Rerun finale post-documentazione: primo tentativo `FAIL_CLOSED` senza
  allowlist process-only; secondo tentativo con allowlist/conferme corrette:
  `PASS`, `1/1` in circa `1.2s`.

## Check finali

| Check | Esito |
| --- | --- |
| `node --check scripts/security-checks.mjs` | `PASS` |
| `node --test tests/foundation/task-058-cloudflare-opennext-staging-hardening.test.mjs` | `PASS`, `6/6` |
| `node --test tests/foundation/task-041-runtime-completion.test.mjs tests/foundation/task-058-cloudflare-opennext-staging-hardening.test.mjs` | `PASS`, `8/8` |
| `npm run security:scan` | `PASS`; rerun post-documentazione `PASS` |
| `npm run test:foundation` | `PASS`, `284/284`; rerun post-documentazione `PASS`, `284/284` |
| `npm run typecheck` | `PASS`; incluso in `npm run verify` post-documentazione |
| `npm run lint` | `PASS`; incluso in `npm run verify` post-documentazione |
| `npm run build` | `PASS_WITH_WARNINGS`, warning Next/Node non bloccanti; incluso in `npm run verify` post-documentazione |
| `npm run verify` | `PASS_WITH_WARNINGS`, lint/typecheck/security/build pass; warning Next/Node non bloccanti |
| `npm run cf:build` | `PASS_WITH_WARNINGS`, worker generato; rerun post-documentazione `PASS_WITH_WARNINGS` |
| `CF_SMOKE_SKIP_BUILD=1 npm run smoke:cloudflare:local` | `PASS`; rerun post-documentazione `PASS` |
| `npx wrangler deploy --dry-run --env staging` | `PASS_WITH_WARNINGS`, nessun deploy; rerun post-documentazione `PASS_WITH_WARNINGS` |
| `npm run db:staging:status` con env process-only | `PASS`; due rerun fail-closed senza allowlist/conferma corretta, poi `PASS` |
| `npx wrangler deploy --env staging --keep-vars` | `PASS` |
| GitHub Actions staging deploy | `GITHUB_ACTIONS_STAGING_DEPLOY_NOT_RUN_UNCOMMITTED_WORKFLOW`; latest remote `main` run ha `Deploy staging` skipped |
| `npm run smoke:staging` con env process-only | `PASS`, `1/1`; rerun post-documentazione `PASS`, `1/1` |
| `npx wrangler deployments list --env staging` | `ROLLBACK_READ_ONLY_VERIFIED`, latest active after secret changes `7450051b-4b89-4b31-bb42-beb711d7969c` |
| `npx wrangler deployments status --env staging` | `ROLLBACK_READ_ONLY_VERIFIED`, active `7450051b-4b89-4b31-bb42-beb711d7969c` |
| `node --test tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS`, `21/21` |
| `gh secret list --env cloudflare-staging` | `PASS`, `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN` presenti per nome |
| `gh secret list --env cloudflare-production` | `PASS`, `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN` presenti per nome |
| `git diff --check` finale | `PASS` |

## Sicurezza e redazione

- Nessun token, API key, JWT, password, PIN, service-role key o valore `.env`
  salvato in repo/evidence.
- Output env e remote config registrati solo come `present/missing`, nomi o
  metadati redatti.
- Token Cloudflare CI copiato dalla UI solo per inviarlo con `gh secret set`;
  clipboard svuotata dopo la configurazione.
- Nessun service-role o chiave segreta aggiunta a client/browser.
- Nessun valore Supabase stampato; le variabili GitHub staging sono verificate
  solo per nome.

## Rischi residui

- Cloudflare WAF/rate-limit remoto non applicabile finche non esiste una zona o
  un custom domain nell'account.
- Supabase remote project-list non conclusa per hang CLI; il guardrail locale
  staging e passato, ma la verifica remota resta `PARTIAL`.
- Rollback reale non eseguito per assenza di precedente deployment safe noto.
- `cloudflare-bindings` MCP resta non autenticato; non blocca deploy/smoke
  perche `cloudflare-api` e Wrangler OAuth sono funzionanti.
- `npm run cf:build` stampa warning/error non bloccanti su pacchetti zip; lo
  smoke locale, dry-run e deploy staging passano, ma va monitorato in CI.
- `src/middleware.ts` resta su convenzione deprecata da Next 16; non e stato
  rinominato a `proxy.ts` per non introdurre scope creep in TASK-058.

## Prossimo passo

Review umana di TASK-058. Per arrivare a `DONE_RECONCILED`: aggiungere o
delegare una zona/custom domain Cloudflare staging per WAF/rate-limit reale,
risolvere la verifica Supabase project-list o approvare formalmente il target
staging/dev gia guardrailato, e definire un punto di rollback staging safe.
Production resta vietata senza nuova conferma esplicita.
