# TASK-036 Evidence

## Stato corrente

- Task: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`
- Stato task: `DONE`
- Fase: `DONE`
- Milestone interna: `TASK_036_DONE_CONFIRMED`
- Data apertura: `2026-06-03`
- Branch Admin Web: `main`
- Verdict corrente: `DONE`
- Stage: `STAGED_BY_USER_REQUEST`
- Commit: `COMMITTED_BY_USER_REQUEST`
- Push: `PUSHED_BY_USER_REQUEST`

## Pre-flight

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `git status --short --branch` | `PASS` | Stato iniziale `## main...origin/main`, worktree pulito. |
| `git log --oneline -5` | `PASS` | Ultimo commit `9586993 Finalize TASK-035 authenticated shop admin QA gate`. |
| `vercel.json` read-only | `PASS` | `git.deploymentEnabled=false`. |
| `docs/MASTER-PLAN.md` | `PASS_WITH_NOTES` | TASK-035 `DONE`; Tracking puntava ancora TASK-035 prima dell'apertura TASK-036. |

Conferme:

- TASK-035 e `DONE` e non viene riaperto.
- Win7POS live E2E resta parcheggiato per disponibilita ambiente.
- TASK-024 Sales Sync resta DEFERRED.
- TASK-029/TASK-031/Vercel restano parcheggiati; nessun deploy Vercel eseguito.

## Letture iniziali

| Fonte | Esito | Note |
| --- | --- | --- |
| `AGENTS.md` | `PASS` | Lingua italiana, no secret, no PASS inventati, handoff a REVIEW. |
| `README.md` | `PASS` | Stack e limiti attuali confermati. |
| `docs/MASTER-PLAN.md` | `PASS` | Stato task precedenti e tracking corrente letti. |
| `docs/TASKS/TASK-035-authenticated-admin-web-qa-shop-admin-smoke-harness.md` | `PASS` | TASK-035 chiuso a DONE dopo smoke autenticato locale. |
| `docs/TASKS/EVIDENCE/TASK-035/README.md` | `PASS` | Supabase local gate e cleanup TASK035_* letti. |
| `docs/TASKS/TASK-029-production-path-staging-win7pos-bootstrap.md` | `PASS` | Vercel Preview resta bloccato. |
| `docs/TASKS/TASK-031-vercel-preview-retry.md` | `PASS` | Vercel forza Production nei tentativi documentati. |
| `docs/TASKS/TASK-033-controlled-task-032-review-https-pos-sales.md` | `PASS` | Cloudflared Quick Tunnel gia validato come temporaneo. |
| `docs/TASKS/TASK-034-unified-project-progression.md` | `PASS` | Sales sync planning-only; Win7 live in pausa. |
| `docs/DEPLOYMENT/STAGING.md` | `PASS` | Non usare Vercel Production come staging. |
| `.env.example` | `PASS` | Template value-free. |
| `package.json` | `PASS` | Script correnti e Next 16.2.6 letti. |
| `supabase/config.toml` | `PASS` | `project_id = "merchandise-control-admin-web"`. |
| `src/app`, `src/server`, `src/lib/supabase`, `scripts`, `tests/foundation`, `tests/e2e`, `supabase/migrations` | `PASS` | Scope codice letto prima delle modifiche. |

Guide Next.js locali lette prima di cambiare codice App Router:

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/02-guides/deploying-to-platforms.md`

## Supabase local/dev evidence

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `command -v supabase` | `PASS` | `/opt/homebrew/bin/supabase`. |
| `supabase --version` | `PASS` | `2.104.0`. |
| `supabase status` con redaction | `PASS_WITH_NOTES` | Fallisce su `No such container: supabase_db_merchandise-control-admin-web`; nessun secret stampato. |
| `docker ps --format '{{.Names}}' ...` | `PASS_WITH_NOTES` | Stack attivo `MerchandiseControlSupabase`, incluso `supabase_db_MerchandiseControlSupabase`. |
| `supabase migration list --local` | `PASS` | Migration locali applicate fino a `20260601160000`. |
| Env presence processo | `PASS_WITH_NOTES` | Processo shell senza env Supabase. |
| Env file presence redatta | `PASS_WITH_NOTES` | `.env.local` contiene URL e publishable key come `present`; valori non letti/stampati. |

Limitazione: `.env.local` non viene riportato con valori e resta trattato come non idoneo se il target non e locale.

## Review finale hard gate - 2026-06-03

Pre-flight review finale:

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Branch `main...origin/main`; worktree dirty con modifiche TASK-036 non staged. |
| `git diff --stat` | `PASS` | Diff TASK-036 su docs, script, Shop Admin, Sync Center e foundation tests. |
| `git diff --name-status` | `PASS` | Nessun file staged; nuove docs/evidence/script/test TASK-036 untracked. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git log --oneline -5` | `PASS` | Ultimo commit `9586993 Finalize TASK-035 authenticated shop admin QA gate`. |

Findings corretti:

| Severita | Area | Finding | Correzione |
| --- | --- | --- | --- |
| `P2` | Sync Center | Query params filtrati server-side ma senza cap render-side; rischio HTML/payload inutile con input lungo. | `SYNC_FILTER_MAX_LENGTH = 160`, bounding lato pagina e server, status normalizzato. |
| `P2` | Catalog actions | Reason obbligatorio ma passato alla RPC non normalizzato. | `catalogReasonRequired` ora trimma e cappa a 240; RPC usa `p_reason: reason`. |
| `P3` | Supabase local/dev | Check CLI dipendeva da `which supabase`. | `dev-supabase-check.mjs` prova direttamente `supabase --version`. |
| `P3` | Shop Admin UX | Reason obbligatorio poco spiegato. | Hint UI `Required for the audit trail.` e `maxLength={240}`. |

Security diff-scan:

| Artefatto | Esito | Note |
| --- | --- | --- |
| `/tmp/codex-security-scans/merchandise-control-admin-web/9586993_20260603_task036/report.md` | `PASS_NO_FINDINGS` | Tutte le 6 righe source-like del diff hanno receipt in `work_ledger.jsonl`. |
| Secret scan mirato su TASK-036 | `PASS_WITH_NO_SECRET_VALUES` | Match solo su nomi env, guardrail e presenza redatta; nessun valore reale/JWT/token/password/DB URL con credenziali/Cloudflare token/Vercel token/Quick Tunnel URL permanente. |

Supabase locale e smoke autenticato:

| Comando/probe | Esito | Evidence sintetica |
| --- | --- | --- |
| `npm run dev:db:check` | `PASS_FAIL_CLOSED` | Exit `2`: `.env.local` target `supabase_cloud`; container mismatch `supabase_db_merchandise-control-admin-web` vs `supabase_db_MerchandiseControlSupabase`; nessun secret stampato. |
| Docker env-name probe | `PASS_REDACTED` | Container locali `supabase_*_MerchandiseControlSupabase` presenti; nomi env letti con valori redatti. |
| JWT locale da `PGRST_JWT_SECRET` | `EXPECTED_FAIL_DIAGNOSTIC` | Auth Admin probe fallisce `bad_jwt`/firma invalida; nessun dato creato. Root cause: secret Auth corretto e `GOTRUE_JWT_SECRET`. |
| JWT locale da `GOTRUE_JWT_SECRET` | `PASS_REDACTED` | Auth Admin probe crea/cancella user sintetico; PostgREST probe `shops` head count ok. Nessuna key stampata/salvata. |
| Build con env locali process-only | `PASS_WITH_WARNING` | Next build `16.2.6` passa con warning noto `[DEP0205]`; necessario per iniettare `NEXT_PUBLIC_*` locali nel bundle smoke. |
| `npm run test:shop-admin-auth-smoke` con env locali process-only | `PASS_AUTHENTICATED_LOCAL` | Playwright `2 passed`; guardia non-auth e ramo autenticato Shop Admin passano. |
| DB cleanup post-smoke | `PASS_ZERO_RESIDUALS` | `shops=0`, `profiles=0`, `products=0`, `categories=0`, `suppliers=0`, `staff=0`, `devices=0`, `auth_users=0` per prefissi TASK035. |

## Chiusura DONE - 2026-06-03

- Conferma esplicita utente ricevuta per chiudere TASK-036 a `DONE`.
- Verdict precedente: `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION`; dopo conferma passa a `DONE`.
- Cloudflared resta HTTPS temporaneo/non-production, non staging stabile.
- Vercel resta parcheggiato con `git.deploymentEnabled=false`.
- `dev:db:check` resta `PASS_FAIL_CLOSED` su `.env.local` cloud e mismatch container.
- Warning Node `[DEP0205]` resta non bloccante.
- Win7POS live E2E resta `PARKED_NOT_IN_SCOPE`.
- TASK-024 Sales Sync resta `DEFERRED`.
- Il progetto non e dichiarato production-ready globale.

## File toccati

| File | Tipo | Note |
| --- | --- | --- |
| `package.json` | `MODIFIED` | Script `dev:tunnel`, `dev:db:check`, `dev:db:status`. |
| `scripts/dev-supabase-check.mjs` | `ADDED` | Check Supabase local/dev redatto e fail-closed; CLI check senza `which`. |
| `src/app/shop/sync/page.tsx` | `MODIFIED` | Filtri server-rendered per Sync Center con cap render-side 160. |
| `src/server/shop-admin/shop-section-data.ts` | `MODIFIED` | Sync diagnostics/filters, cap server-side 160 e latest error. |
| `src/app/shop/_components/CatalogActionPanel.tsx` | `MODIFIED` | Reason obbligatoria sulle azioni catalog destructive, hint audit e cap 240. |
| `src/server/shop-admin/catalog-mutations.ts` | `MODIFIED` | Reason obbligatoria lato server boundary con trim/cap prima della RPC. |
| `scripts/security-checks.mjs` | `MODIFIED` | TASK-036 riconosciuto come task attivo valido. |
| `tests/foundation/*governance*.mjs` e task legacy correlati | `MODIFIED` | Whitelist task attivo estese a TASK-036 per mantenere `test:foundation` verde. |
| `tests/foundation/task-036-admin-web-readiness.test.mjs` | `ADDED` | Guardrail TASK-036 rafforzato per cap filtri/reason e script CLI. |
| `docs/DEPLOYMENT/CLOUDFLARED-NON-PRODUCTION.md` | `ADDED` | Runbook HTTPS temporaneo/non-production. |
| `docs/DEVELOPMENT/SUPABASE-LOCAL-DEV.md` | `ADDED` | Runbook Supabase local/dev. |
| `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md` | `ADDED` | Checklist readiness senza go-live claim. |
| `docs/TASKS/TASK-036-admin-web-web-readiness-local-dev-cloudflared-shop-sync-production-hardening.md` | `ADDED` | Task ufficiale TASK-036. |
| `docs/TASKS/EVIDENCE/TASK-036/README.md` | `ADDED` | Evidence TASK-036. |
| `docs/MASTER-PLAN.md` | `MODIFIED` | TASK-036 chiuso a DONE e tracking riportato a nessun task attivo. |
| `docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png` | `MODIFIED_BY_SMOKE` | Screenshot esistente aggiornato automaticamente dal harness `test:shop-admin-auth-smoke`; TASK-035 non riaperto. |

## Criteri di accettazione

- Cloudflared documentato come HTTPS temporaneo/non-production.
- Vercel resta parcheggiato con `git.deploymentEnabled=false`.
- Supabase local/dev flow documentato senza secret.
- Shop Admin polish completato senza refactor ampi.
- Sync Center migliorato usando solo dati reali gia disponibili.
- Nessun Sales Sync, endpoint vendite o dashboard vendite.
- Production readiness non dichiara production-ready globale.
- Check reali registrati sotto.

## Check finali

| Comando | Esito | Note |
| --- | --- | --- |
| `npm run dev:db:check` | `PASS_FAIL_CLOSED` | Exit `2`: `.env.local` target `supabase_cloud`; container mismatch atteso `supabase_db_merchandise-control-admin-web` vs `supabase_db_MerchandiseControlSupabase`; nessun secret stampato. |
| `node --test tests/foundation/task-036-admin-web-readiness.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 163`, `pass 163`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` e `tsc --noEmit` completati. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Build ordinario Next.js `16.2.6` completato; warning noto `[DEP0205]`. Eseguito anche dopo lo smoke per non lasciare `.next` costruita con env locali process-only. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan` e `build` passano; warning noto `[DEP0205]`. |
| `npm run test:shop-admin-auth-smoke` con env locali process-only | `PASS_AUTHENTICATED_LOCAL` | Build process-only locale + Playwright `2 passed`; nessuna key stampata/salvata. |
| DB cleanup post-smoke | `PASS_ZERO_RESIDUALS` | `shops=0`, `profiles=0`, `products=0`, `categories=0`, `suppliers=0`, `staff=0`, `devices=0`, `auth_users=0`. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNING` | `86 passed`; warning noti `[DEP0205]`, `NO_COLOR`/`FORCE_COLOR` e warning dev HMR cross-origin su `127.0.0.1`. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git diff --stat` | `PASS` | `19 files changed`, `392 insertions`, `41 deletions`; untracked TASK-036 docs/script/test visibili in status. |
| `git diff --cached --name-status` | `PASS` | Nessun file staged. |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Branch `main...origin/main`; modifiche TASK-036 non staged come richiesto; screenshot TASK-035 aggiornato dal harness smoke. |

## Rischi residui

- Cloudflared Quick Tunnel e effimero, non staging stabile.
- Supabase local/dev ha mismatch container/project id.
- `.env.local` non viene usato come evidence perche i valori sono secret/local config.
- Warning Node `[DEP0205]` resta non bloccante.
- Rate limit, monitoring, backup/restore e staging stabile restano da implementare in task futuri.
- Il check `dev:db:check` fallisce chiuso nel runtime corrente; e un guardrail intenzionale, non un bug applicativo.
- Smoke autenticato locale passa solo quando le env locali vengono passate come processo e il build viene eseguito con quelle env; `.env.local` resta cloud e non viene usato come target sicuro.
- Win7POS live E2E resta `PARKED_NOT_IN_SCOPE`.
- TASK-024 Sales Sync resta DEFERRED.
- Il progetto non e dichiarato production-ready globale.

## Handoff

- Prossima fase: `IDLE`.
- Verdict finale: `DONE`.
- TASK-036 e `DONE` su conferma esplicita dell'utente.
