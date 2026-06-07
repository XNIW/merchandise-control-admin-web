# Cloudflare hosting migration

## Stato

- Stato corrente: `BLOCKED_CLOUDFLARE_STAGING_IDENTITY_AND_TARGETS_NOT_VERIFIED`.
- Vercel: parcheggiato; `vercel.json` mantiene `git.deploymentEnabled=false`.
- OpenNext locale: gia preparato da `TASK-041`.
- Cloudflare staging remoto: `NOT_RUN_BLOCKED`, mancano autenticazione
  Cloudflare, account/zone verificati, target Supabase staging confermato e
  secret staging configurati.
- Cloudflare production: `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Custom domain/DNS: `BLOCKED_DOMAIN_UNKNOWN_AND_ZONE_NOT_VERIFIED`.
- Supabase Auth URL alignment: `BLOCKED_SUPABASE_AUTH_URLS_MANUAL_STEP`.
- WAF/rate limit/Access rules: `BLOCKED_CLOUDFLARE_ZONE_PERMISSION_REQUIRED`.
- GitHub environments: `BLOCKED_GITHUB_CLOUDFLARE_ENVIRONMENTS_NOT_FOUND`.

## Decisioni operative vincolanti 2026-06-07

- Prima fase obbligatoria: completare solo Cloudflare staging remoto.
- Production deploy e DNS cutover sono consentiti solo dopo tutti i gate
  staging `PASS` e nuova conferma esplicita dell'utente.
- Se permessi Cloudflare, GitHub o Supabase mancano, non tentare workaround:
  fermarsi e aggiornare la checklist `BLOCKED`.
- Dominio staging desiderato: `UNKNOWN`.
- Dominio production desiderato: `UNKNOWN`.
- Cloudflare account/zone: usare solo account/zone gia configurati e
  verificati; se non identificabili, fermarsi.
- Supabase staging project: `UNKNOWN_FOR_THIS_TASK`. Storicamente
  `merchandisecontrol-dev` / `jpgoimipbothfgkokyvm` e stato verificato come
  non-production, ma va confermato esplicitamente come target staging di questa
  migrazione prima di configurare secret Cloudflare.
- Supabase production project: non usare ne modificare senza conferma
  esplicita.
- CI/CD production: workflow preparato con `workflow_dispatch`, environment
  `cloudflare-production` e conferme manuali; la protezione GitHub environment
  con required reviewers resta da configurare/verificare.
- Obiettivo minimo corrente: `BLOCKED_CLOUDFLARE_STAGING_READY_PREREQUISITES`.

## Checklist BLOCKED corrente

| Gate | Stato | Evidence |
| --- | --- | --- |
| Cloudflare token locale | `BLOCKED_CLOUDFLARE_API_TOKEN_REQUIRED` | `CLOUDFLARE_API_TOKEN=MISSING`; `npx wrangler whoami` non autenticato. |
| Cloudflare account id | `BLOCKED_CLOUDFLARE_ACCOUNT_ID_REQUIRED` | `CLOUDFLARE_ACCOUNT_ID=MISSING`; `wrangler.jsonc` non contiene `account_id`. |
| Cloudflare zone/domain | `BLOCKED_CLOUDFLARE_ZONE_NOT_VERIFIED` | Nessuna route/custom domain in `wrangler.jsonc`; dominio staging e production `UNKNOWN`. |
| GitHub staging environment | `BLOCKED_GITHUB_ENVIRONMENT_NOT_FOUND` | `gh api repos/XNIW/merchandise-control-admin-web/environments/cloudflare-staging` restituisce `404`. |
| GitHub production approval | `BLOCKED_GITHUB_PRODUCTION_ENVIRONMENT_APPROVAL_NOT_VERIFIED` | `cloudflare-production` restituisce `404`; required reviewers non verificabili dal repo. |
| Supabase staging target | `BLOCKED_SUPABASE_STAGING_TARGET_NOT_CONFIRMED` | Nessun `SUPABASE_PROJECT_REF` nel processo; target storico dev va confermato per staging. |
| Supabase staging secret | `BLOCKED_CLOUDFLARE_STAGING_SECRETS_NOT_CONFIGURED` | Env richieste mancanti nel processo; secret Worker remoto non verificabili senza Cloudflare auth. |
| Staging deploy remoto | `NOT_RUN_BLOCKED_BY_PREREQUISITES` | Nessun deploy tentato. |
| Staging smoke remoto | `NOT_RUN_BLOCKED_NO_REMOTE_STAGING_URL` | `PLAYWRIGHT_BASE_URL=MISSING`. |

## Config repo

- `wrangler.jsonc` contiene:
  - worker production: `merchandise-control-admin-web`;
  - worker staging: `merchandise-control-admin-web-staging`;
  - `main = .open-next/worker.js`;
  - assets da `.open-next/assets`;
  - `nodejs_compat` e `global_fetch_strictly_public`;
  - `observability.enabled = true`;
  - ambienti `staging` e `production`.
- `.github/workflows/cloudflare.yml` contiene:
  - build Cloudflare su PR, `main`, `staging` e `workflow_dispatch`;
  - deploy staging solo da branch `staging` o `workflow_dispatch target=staging`;
  - deploy production solo da `workflow_dispatch target=production`, conferme
    `confirm_staging_gates_passed=true` e
    `confirm_user_approved_production=true`, con environment
    `cloudflare-production`.

## Variabili e secret

Non salvare valori reali in repository, log, evidence o screenshot.

| Nome | Classificazione | Dove configurare | Note |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public safe, environment-specific | Cloudflare Worker env/secret per `staging` e `production`; GitHub environment se serve al build | Non usare production Supabase per staging senza conferma. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public safe, environment-specific | Cloudflare Worker env/secret per `staging` e `production`; GitHub environment se serve al build | Publishable, ma non hardcodare nel repo. |
| `SUPABASE_PROJECT_REF` | server config, non secret | Cloudflare Worker env/secret per `staging` e `production` | Serve per diagnostica/target guardrails. |
| `SUPABASE_SERVICE_ROLE_KEY` | server secret | Cloudflare Worker secret per `staging` e `production` | Vietato nel client/browser e in GitHub Actions salvo decisione esplicita. |
| `CLOUDFLARE_ACCOUNT_ID` | deploy secret/config | GitHub Secret | Richiesto dalla CI Cloudflare. |
| `CLOUDFLARE_API_TOKEN` | deploy secret | GitHub Secret o processo locale | Richiesto per deploy non interattivo. |

Comandi manuali ammessi per impostare secret Cloudflare staging, da eseguire
senza stampare i valori:

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL --env staging
npx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --env staging
npx wrangler secret put SUPABASE_PROJECT_REF --env staging
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
```

Comandi production futuri, vietati nella prima fase e ammessi solo dopo gate
staging `PASS` piu conferma esplicita dell'utente:

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL --env production
npx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --env production
npx wrangler secret put SUPABASE_PROJECT_REF --env production
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
```

## Staging deploy

Prerequisiti:

1. `CLOUDFLARE_API_TOKEN` disponibile nel processo o login Wrangler
   interattivo.
2. `CLOUDFLARE_ACCOUNT_ID` configurato e account verificato.
3. Zone/domain staging identificato se si vuole usare custom domain; altrimenti
   usare solo URL `workers.dev` generato dal deploy.
4. Secret staging configurati sul Worker
   `merchandise-control-admin-web-staging`.
5. Supabase staging/dev non-production confermato esplicitamente per questa
   migrazione.
6. GitHub environment `cloudflare-staging` configurato se si usa deploy da CI.

Comandi:

```bash
npm run security:scan
npm run test:foundation
npm run typecheck
npm run lint
npm run build
npm run cf:build
npx wrangler deploy --env staging
```

Smoke remoto staging, solo dopo URL Cloudflare reale:

```bash
PLAYWRIGHT_BASE_URL="https://<staging-host>" \
ALLOW_STAGING_E2E=yes \
CONFIRM_STAGING_E2E=yes \
npm run smoke:staging
```

Smoke curl read-only:

```bash
curl -i "https://<staging-host>/"
curl -i "https://<staging-host>/auth/login?next=/shop"
curl -i "https://<staging-host>/auth/login?next=/platform"
curl -i "https://<staging-host>/shop"
curl -i "https://<staging-host>/platform"
curl -i "https://<staging-host>/api/pos/sales/sync"
```

Aspettative:

- nessun `500`;
- nessuno stack trace;
- nessun secret nel body/header;
- auth guard visibile dove manca sessione;
- endpoint POS/API con metodo/status controllato.

## Production deploy

Non eseguire production finche non sono veri tutti questi gate:

- staging deploy remoto: `PASS`;
- staging smoke remoto: `PASS`;
- secrets production configurati;
- Supabase production target chiarito e confermato;
- dominio production confermato;
- GitHub environment `cloudflare-production` configurato con required reviewers
  o approvazione equivalente verificata;
- rollback plan pronto;
- conferma esplicita utente per production deploy e DNS cutover.

Comandi solo dopo conferma e fuori dalla prima fase staging:

```bash
npm run cf:build
npx wrangler deploy --env production
```

DNS cutover production resta separato dal deploy Worker e richiede conferma
esplicita.

## Custom domain e DNS

Dominio richiesto ma non confermato:

- staging: `UNKNOWN`;
- production: `UNKNOWN`.

Se il dominio e in una zona Cloudflare controllata, configurare custom domain con `routes` e `custom_domain: true` o dashboard Workers > Settings > Domains & Routes.

Non aggiungere route/domain in `wrangler.jsonc` finche il dominio reale non e confermato.

## Supabase Auth URL alignment

Aggiornare manualmente Supabase Auth URL Configuration:

- Site URL staging: URL staging Cloudflare confermata.
- Redirect URLs staging:
  - `https://<staging-host>/auth/callback`;
  - `https://<staging-host>/**` solo se serve durante preview/staging controllata.
- Site URL production: dominio production confermato.
- Redirect URLs production:
  - `https://<production-host>/auth/callback`;
  - preferire URL esatti in produzione.

Non usare production Supabase per staging senza conferma esplicita.

## WAF, rate limit e Access

Regole minime da applicare dopo dominio/zona:

- rate limit su `/auth/*`;
- rate limit su `/shop/staff-login`;
- rate limit su `/api/pos/*`;
- log-first per nuove soglie, poi challenge/block dopo validazione;
- non proteggere tutto `/auth/login` con Cloudflare Access se impedisce ai clienti Shop Admin di entrare;
- valutare Cloudflare Access solo per Master Console su path/domain dedicato.

Stato corrente: `BLOCKED_CLOUDFLARE_ZONE_PERMISSION_REQUIRED`.

## Evidence da registrare

Per ogni deploy remoto salvare solo:

- worker name;
- URL workers.dev o custom domain;
- deployment/version id, se disponibile;
- timestamp;
- output redatto;
- smoke result;
- blocker residui.

Non salvare secret, token, key, password, PIN, JWT o valori `.env`.
