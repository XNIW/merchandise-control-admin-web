# Production readiness checklist

## Stato

- TASK-036 non dichiara production-ready globale.
- Questa checklist prepara i gate operativi mancanti per un futuro go-live.
- Vercel Production non e usata come staging.
- Cloudflared Quick Tunnel resta solo HTTPS temporaneo/non-production.

## Env

- [x] `.env.example` contiene solo nomi variabile senza valori.
- [x] `SUPABASE_SERVICE_ROLE_KEY` documentata come server-side only.
- [ ] Separare env dev, staging e prod con ownership chiara.
- [ ] Rotazione secret documentata e provata. Stato parziale: token CI
  Cloudflare TASK-058 ruotato e revocato correttamente; rotazione completa
  Supabase runtime secret resta non eseguita.
- [ ] Smoke anti-leak su ogni deployment non-production.

## Deploy controllato

- [x] `vercel.json` mantiene `git.deploymentEnabled=false`.
- [x] Vercel resta parcheggiato finche non esiste Preview/non-production sicura.
- [x] Runbook Cloudflared temporaneo disponibile.
- [x] Config Cloudflare/OpenNext con ambienti `staging` e `production`.
- [x] Workflow Cloudflare separato con build su PR/main e deploy production solo
  da `workflow_dispatch` con conferme manuali.
- [x] Runbook Cloudflare migration/rollback disponibili.
- [x] Smoke Cloudflare/OpenNext locale disponibile come
  `npm run smoke:cloudflare:local`.
- [ ] Staging stabile HTTPS non-production con rollback. Stato:
  workers.dev staging deployato e smoke `PASS`; GitHub Actions staging deploy
  e smoke `PASS` nella run post-rotazione `27450388578`; rollback reale resta
  `ROLLBACK_STAGING_NOT_RUN_NO_PREVIOUS_SAFE_DEPLOYMENT`.
- [x] Policy CI esplicita per promozione production: workflow production solo
  `workflow_dispatch` con conferme manuali e GitHub environment
  `cloudflare-production` con `required_reviewers`.

## Database

- [x] Supabase local/dev runbook disponibile.
- [x] Migration locali inventariate senza reset distruttivi in TASK-036.
- [ ] Backup/restore testato su ambiente non-production.
- [ ] RLS review periodica con checklist dedicata.
- [ ] Query performance review su liste Shop Admin principali.

## Route sensibili

- [x] POS Route Handler storici usano guardrail `no-store` e validazioni payload dai task precedenti.
- [x] TASK-036 aggiunge motivo obbligatorio per archive/restore catalogo lato UI e server boundary.
- [x] Runbook WAF/rate-limit Cloudflare disponibile in
  `docs/DEPLOYMENT/CLOUDFLARE-WAF-RATE-LIMIT.md`.
- [ ] Rate limit infrastrutturale su login, POS API e mutazioni Shop Admin.
  Stato Cloudflare: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`; WAF/rate limit
  remoto non attivo.
- [ ] Body limit verificato su ogni route upload/import.
- [ ] Content-Type guard verificato su ogni endpoint mutativo custom.

## Logging e monitoring

- [x] Security scan vieta log server-side sensibili nei boundary principali.
- [ ] Logging server-side strutturato e redatto.
- [ ] Error reporting con provider approvato.
- [ ] Monitor uptime e alert per route critiche.
- [ ] Dashboard incident/audit separata dai dati cliente.

## Test

- [x] `security:scan`, `test:foundation`, `typecheck`, `lint`, `build`, `verify` restano gate richiesti.
- [x] Smoke autenticato Shop Admin esiste come `npm run test:shop-admin-auth-smoke`.
- [x] Smoke OpenNext/Workers locale esiste come `npm run smoke:cloudflare:local`.
- [ ] Smoke autenticato completo su staging stabile. Smoke auth-boundary
  read-only su workers.dev staging: `PASS`.
- [ ] Browser QA multi-viewport autenticata su tutte le route Shop Admin.
- [ ] Win7POS live E2E ripreso quando l'ambiente Windows e disponibile.

## Rollback e incident

- [x] Runbook rollback deploy Cloudflare creato.
- [ ] Runbook restore DB.
- [ ] Procedura revoca device/staff compromessi.
- [ ] Procedura rotazione service-role e publishable key.
- [ ] Template incident report con timeline e audit evidence.

## Rischi residui

- Vercel Preview/non-production resta bloccato/parcheggiato.
- Cloudflared e effimero e non va trattato come staging stabile.
- Cloudflare workers.dev staging e deployato, ma custom domain/zone mancano.
- Rate limit/WAF e monitoring richiedono una zona Cloudflare o provider
  esterno; stato `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.
- Win7POS live E2E resta parcheggiato per disponibilita ambiente.
- TASK-024 Sales Sync resta `DEFERRED`; nessun runtime vendite e stato introdotto.
