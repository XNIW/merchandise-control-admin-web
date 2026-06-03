# TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening

## Informazioni generali

- ID: `TASK-036`
- Titolo: `Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`
- Stato: `DONE`
- Fase attuale: `DONE`
- Milestone interna: `TASK_036_DONE_CONFIRMED`
- Responsabile attuale: `COMPLETED`
- Data apertura: `2026-06-03`
- Branch Admin Web: `main`
- Evidence: `docs/TASKS/EVIDENCE/TASK-036/README.md`
- Stage: `STAGED_BY_USER_REQUEST`
- Commit: `COMMITTED_BY_USER_REQUEST`
- Push: `PUSHED_BY_USER_REQUEST`
- Verdict corrente: `DONE`

## Scopo

Migliorare la readiness del solo sito Admin Web senza dipendere da Win7, Vercel Production, Android/iOS o Sales Sync.

## Include

- Runbook HTTPS temporaneo/non-production con Cloudflared Quick Tunnel.
- Stabilizzazione operativa Supabase local/dev.
- Polish Shop Admin piccolo e verificabile.
- Sync Center web-side piu utile, read-only, senza Sales Sync.
- Production readiness checklist senza dichiarare production-ready globale.
- Foundation test e security guardrail aggiornati.

## Non include

- Commit, push o stage finale durante l'execution iniziale; finalizzazione autorizzata solo dopo conferma esplicita dell'utente il 2026-06-03.
- Vercel Production come staging.
- Ricollegare Vercel Git Integration.
- Supabase production.
- Nuove migration Supabase.
- Android/iOS/Win7POS/Cash Register.
- TASK-024 Sales Sync runtime.
- Dashboard vendite fake.
- Secret, dati reali, token, PIN o password hardcoded.

## Stato fasi

| Fase | Stato | Evidence sintetica |
| --- | --- | --- |
| 0 - Pre-flight | `PASS` | Repo iniziale pulito su `main...origin/main`; ultimi commit confermano TASK-035 pushato. |
| 1 - Cloudflared HTTPS non-production | `PASS_DOCS_WITH_SCRIPT` | Runbook `docs/DEPLOYMENT/CLOUDFLARED-NON-PRODUCTION.md`; script `npm run dev:tunnel`; Vercel resta parcheggiato. |
| 2 - Supabase local/dev | `PASS_WITH_NOTES_FAIL_CLOSED_AND_AUTH_SMOKE` | `dev:db:check` fallisce chiuso su `.env.local` cloud/mismatch; smoke autenticato eseguito con Supabase locale `127.0.0.1` e key process-only da container locali. |
| 3 - Shop Admin polish | `PASS_REVIEW_FIXED` | Catalog archive/restore richiedono reason in UI e server boundary; reason trim/cap lato server e hint audit UI. |
| 4 - Sync Center web-side | `PASS_READ_ONLY_REVIEW_FIXED` | Filtri server-side per query/domain/source/status con cap 160, diagnostica redatta su `sync_events`; nessun retry, endpoint o sales sync. |
| 5 - Production readiness | `PASS_DOCS_WITH_SMALL_HARDENING` | Checklist production readiness creata; rate limit/monitoring restano pianificati. |
| 6 - Harness/security/regression | `PASS_AUTHENTICATED_LOCAL` | Security diff-scan no findings; smoke Shop Admin autenticato locale `2 passed`; cleanup DB `TASK035_*` zero. |
| 7 - Handoff | `DONE` | Master Plan e evidence TASK-036 aggiornati su conferma esplicita dell'utente; TASK-036 chiuso senza dichiarare production-ready globale. |

## Implementazione

- Aggiunti script npm:
  - `npm run dev:tunnel`
  - `npm run dev:db:check`
  - `npm run dev:db:status`
- Aggiunto `scripts/dev-supabase-check.mjs` con output redatto e fail-closed su target cloud/remoto.
- Aggiunto runbook Cloudflared non-production.
- Aggiunto runbook Supabase local/dev.
- Aggiunta checklist production readiness.
- Migliorato `/shop/sync` con filtri server-rendered, query params e cap a 160 caratteri prima del render.
- Migliorato `buildSyncSection` con filtri normalizzati/cappati, diagnostica redatta, latest error, source count e conteggio filtri.
- Reso obbligatorio il reason per archive/restore catalogo in UI e server boundary, con trim/cap server-side e hint audit UI.
- Aggiunto foundation test `tests/foundation/task-036-admin-web-readiness.test.mjs`.
- Aggiornate le whitelist governance foundation per riconoscere TASK-036 come task attivo.

## Review finale e fix 2026-06-03

Findings corretti nello scope:

- `P2` Sync Center: i query params potevano essere renderizzati senza cap esplicito lato pagina e filtrati senza normalizzazione centralizzata. Corretto con `SYNC_FILTER_MAX_LENGTH = 160`, bounding lato pagina e server.
- `P2` catalog actions: il reason era obbligatorio ma veniva passato alla RPC non normalizzato. Corretto con trim/cap server-side e passaggio di `p_reason: reason`.
- `P3` Supabase local/dev: `dev-supabase-check.mjs` dipendeva da `which supabase`. Corretto usando direttamente `supabase --version`.
- `P3` Shop Admin UX: il reason obbligatorio non spiegava il motivo. Aggiunto hint "Required for the audit trail." e cap UI 240.

Security diff-scan TASK-036:

- Artefatti temporanei: `/tmp/codex-security-scans/merchandise-control-admin-web/9586993_20260603_task036/`.
- Esito: no reportable diff-scoped security findings.
- Secret scan: solo nomi variabile/guardrail/documentazione; nessun valore reale, JWT, token, password, DB URL con credenziali, Cloudflare token, Vercel token o URL Quick Tunnel permanente.

Smoke autenticato locale:

- Ambiente: Supabase locale/non-production `127.0.0.1:54321`, stack Docker `MerchandiseControlSupabase`.
- Key locali: generate solo come env di processo da `GOTRUE_JWT_SECRET` del container Auth locale; nessun valore stampato o salvato.
- Primo tentativo diagnostico con secret PostgREST: `bad_jwt`, firma invalida; nessun dato creato.
- Tentativo corretto con secret GoTrue/Auth: `npm run test:shop-admin-auth-smoke` passa `2 passed`.
- Cleanup DB post-smoke: `shops=0`, `profiles=0`, `products=0`, `categories=0`, `suppliers=0`, `staff=0`, `devices=0`, `auth_users=0`.

## Decisioni

- Cloudflared e solo HTTPS temporaneo/non-production. Nessuna URL `trycloudflare.com` viene salvata in config.
- Vercel resta parcheggiato con `git.deploymentEnabled=false`.
- Supabase local/dev viene trattato come sicuro solo se il target e locale. `.env.local` cloud/remoto fa fallire i check dev.
- Sync Center resta read-only. Retry e Sales Sync sono follow-up separati.
- Production readiness resta checklist, non dichiarazione di go-live.

## Chiusura DONE 2026-06-03

- Conferma utente esplicita ricevuta per marcare TASK-036 `DONE`.
- Il verdict precedente era `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION`; la chiusura mantiene le note non bloccanti come vincoli documentati.
- Cloudflared resta temporaneo/non-production e non sostituisce uno staging stabile.
- Vercel resta parcheggiato con `git.deploymentEnabled=false`; nessun uso di Vercel Production e nessun ricollegamento Git Integration.
- `dev:db:check` resta intenzionalmente fail-closed su `.env.local` cloud/mismatch container.
- Il warning Node `[DEP0205]` resta non bloccante.
- Win7POS live E2E resta `PARKED_NOT_IN_SCOPE`.
- TASK-024 Sales Sync resta `DEFERRED`.
- Il progetto non e dichiarato production-ready globale.

## Rischi residui

- Quick Tunnel non e staging stabile.
- Lo stack Supabase locale attivo usa container `MerchandiseControlSupabase`, mentre il repo dichiara `merchandise-control-admin-web`.
- `.env.local` contiene target Supabase non locale: `dev:db:check` continua a fallire chiuso. Lo smoke autenticato e stato eseguito solo con env locali di processo, non salvate.
- Warning Node `[DEP0205]` presente nei build/check resta non bloccante.
- Rate limit, monitoring, backup/restore e staging stabile richiedono decisioni/infrastruttura future.
- Win7POS live E2E resta `PARKED_NOT_IN_SCOPE`.
- TASK-024 Sales Sync resta `DEFERRED`.
- Il progetto non e dichiarato production-ready globale.

## Handoff

- Prossima fase: `IDLE`.
- TASK-036 chiuso a `DONE` su conferma esplicita dell'utente.
- Verdict finale: `DONE`.
