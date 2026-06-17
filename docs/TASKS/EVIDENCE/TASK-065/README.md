# TASK-065 Evidence - Google OAuth redirect and auth boundary

- Data: 2026-06-17
- Stato: `REVIEW_WITH_SECURITY_BLOCKER`
- Fase: `BLOCKED_SECURITY`
- Target browser locale verificato: `http://127.0.0.1:3055`
- Target Supabase locale: `http://127.0.0.1:54321`

## Root Cause Corrente

Il caso locale riprodotto non era solo un problema di redirect Vercel. Il
Supabase Auth locale era senza provider Google abilitato e rispondeva prima del
login Google con:

```text
HTTP/1.1 400 Bad Request
X-Sb-Error-Code: validation_failed
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

Dopo aver aggiunto `[auth.external.google]`, il 400 `provider is not enabled`
non compare piu nel runtime locale. Nella review-fix iniziale Docker e Supabase
locale erano raggiungibili, ma il redirect locale verso Google conteneva ancora
il placeholder:

```text
client_id=env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)
```

Un tentativo di unblock locale del 2026-06-17 ha caricato correttamente il
Client ID Google reale in `.env` ignorato da git e, dopo restart Supabase, GoTrue
ha prodotto un redirect verso `accounts.google.com` con client ID
`*.apps.googleusercontent.com`. Il comando zsh usato per leggere il secret,
pero, non ha letto il valore (`read` ha trattato `-p` come coprocess) e
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` e rimasto non impostato. Nel
container GoTrue il secret Google e ancora placeholder.

L'unblock finale del 2026-06-17 ha scritto il Client Secret in `.env` locale
ignorato da git tramite prompt macOS nascosto, senza stampare il valore, e ha
riavviato Supabase con output silenziato per non esporre chiavi locali. La probe
runtime redatta conferma:

```text
.env: google_client_id=<set:redacted> google_client_id_expected=true google_secret=<set:redacted>
GoTrue Google client ID: <set:redacted>, placeholder=false, google_client_id_shape=true
GoTrue Google secret: <set:redacted>, placeholder=false
```

Il Google Cloud OAuth client ora autorizza il callback locale
`http://127.0.0.1:54321/auth/v1/callback`. `npm run smoke:oauth:local` passa e
la browser evidence finale arriva a una pagina Google login valida, non a
`/signin/oauth/error`.

## Fix Applicato

- `supabase/config.toml`:
  - aggiunto `[auth.external.google]`;
  - `enabled = true`;
  - `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`;
  - `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"`;
  - `skip_nonce_check = false`.
- `.env.example`:
  - aggiunte variabili Google OAuth vuote, senza valori.
- `src/app/auth/login/actions.ts`:
  - prima del redirect OAuth esegue una probe server-side con
    `redirect: "manual"`;
  - intercetta 400 `provider is not enabled`;
  - intercetta redirect Google con client ID mancante/placeholder;
  - torna a login con result gestiti (`oauth_provider_not_enabled` o
    `oauth_google_client_id_invalid`) invece di lasciare il browser su JSON
    Supabase o Google `invalid_client`.
- `src/lib/auth/oauth-redirect.ts`:
  - helper per riconoscere provider disabled e client ID Google placeholder.
- `src/i18n/dictionaries.ts`:
  - messaggi gestiti `oauth_provider_not_enabled`,
    `oauth_google_client_id_invalid` e `oauth_redirect_misconfigured`.
- `scripts/testing/task-065-oauth-local-provider-smoke.mjs`:
  - smoke locale anti-falso-PASS;
  - richiede 302 verso `accounts.google.com` con client ID reale
    `*.apps.googleusercontent.com`;
  - fallisce su provider disabled, placeholder, Vercel stale redirect o pagina
    errore Google/HTTP `>= 400`.

## Separazione Auth/Authz

Conferma esplicita: authentication comune, authorization separata.

- Google OAuth autentica solo l'account personale Supabase.
- Master Console usa solo guard platform:
  - `src/app/platform/layout.tsx`;
  - `src/server/auth/admin-routing.ts`;
  - `src/server/platform-admin/authz.ts`;
  - `src/server/platform-admin/shop-actions.ts`.
- Shop Admin Console usa solo guard shop-scoped:
  - `src/app/shop/layout.tsx`;
  - `src/server/shop-admin/shop-access.ts`;
  - `src/server/shop-admin/access-principal.ts`;
  - `src/server/shop-admin/data-access.ts`;
  - `src/server/shop-admin/action-context.ts`.
- `platform_admin` non bypassa Shop Admin: i guard shop non leggono
  `platform_admins` e non chiamano `resolveCurrentAdminRouteAccess`.
- `shop_owner`/`shop_manager` non bypassano Master Console:
  `src/app/platform/layout.tsx` accetta solo `access.status ===
  "platform_admin"`.
- Shop-code/staff login resta separato e non usa Google.

## Browser Evidence

Resume locale: `.env.local` risulta ancora puntato al Supabase remoto
`jpgoimipbothfgkokyvm.supabase.co`, quindi i browser/dev server senza env
process-only non sono prova OAuth locale. Per verificare il flusso locale reale
e stato avviato `next start` su `127.0.0.1:3055` con env Supabase locali
iniettate solo nel processo, senza stampare chiavi.

```text
Process-only local server: http://127.0.0.1:3055
NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
```

Master Console:

```text
URL: http://127.0.0.1:3055/auth/login?next=/platform
Continue with Google: 1
Google icon SVG: true
icon viewBox: 0 0 18 18
Click result:
  accounts.google.com/v3/signin/identifier
Vercel: false
Raw Supabase JSON: false
Google OAuth error page: false
```

Admin Console account mode:

```text
URL: http://127.0.0.1:3055/auth/login?next=/shop&mode=admin-account
Continue with Google: 1
Google icon SVG: true
icon viewBox: 0 0 18 18
Click result:
  accounts.google.com/v3/signin/identifier
Vercel: false
Raw Supabase JSON: false
Google OAuth error page: false
```

Shop-code mode:

```text
URL: http://127.0.0.1:3055/auth/login?next=/shop&mode=shop-code
Continue with Google: 0
Google icon SVG: false
Shop code field/copy: true
Staff code field/copy: true
```

Questa browser evidence conferma che, con Supabase locale e OAuth Google
configurato, Master Console e Admin Console account arrivano a Google OAuth
valido. Shop-code/staff resta separato e non mostra Google.

## Google Cloud OAuth Configurato

Non sono stati inseriti secret nel repository. Il Client Secret e stato scritto
solo in `.env` locale ignorato da git. Il secret e stato precedentemente
incollato in chat dall'utente: da ruotare fuori da questo task appena possibile.

Runtime locale completato:

- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`: presente in `.env`, redatto.
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`: presente in `.env`, redatto.
- Supabase locale riavviato dopo la scrittura del secret.
- GoTrue vede client ID e secret reali, non placeholder.
- Authorized redirect URI locale Google verificato tramite smoke/browser:
  `http://127.0.0.1:54321/auth/v1/callback`.

Redirect/Origins da verificare nel Google Cloud OAuth client:

- Authorized redirect URI Supabase cloud:
  `https://<project-ref>.supabase.co/auth/v1/callback`;
- Authorized redirect URI Supabase local:
  `http://127.0.0.1:54321/auth/v1/callback`;
- Authorized JavaScript origins locali coerenti con le porte usate:
  `http://127.0.0.1:3050`, `http://localhost:3050`,
  `http://127.0.0.1:3055`, `http://localhost:3055`;
- Authorized origin staging Cloudflare Workers quando si testa staging.

## Check

Run reali:

- `node --test tests/foundation/task-065-google-oauth-redirect.test.mjs`: PASS
  `10/10`.
- `npm run security:scan`: PASS.
- `npm run test:foundation`: PASS `342/342`.
- `npm run smoke:oauth:local`: PASS
  `local Supabase Google provider redirects to accounts.google.com for 2 app callback target(s)`.
- Unblock attempt 2026-06-17:
  - `.env`: Google client ID presente e atteso; Google secret non impostato.
  - GoTrue container: Google client ID risolto, `placeholder=false`,
    `google_client_id_shape=true`; Google secret ancora placeholder.
  - `npm run smoke:oauth:local`: `BLOCKED_EXTERNAL_CONFIG`, exit `3`,
    `GOOGLE_OAUTH_ERROR_PAGE`.
  - Probe Google redatta: local authorize `302`, host `accounts.google.com`,
    redirect URI `127.0.0.1:54321/auth/v1/callback`, final page class
    `redirect_uri_mismatch,error_400`.
- Final unblock 2026-06-17:
  - `.env`: Google client ID presente e atteso; Google secret presente, redatto.
  - GoTrue container: Google client ID risolto, `placeholder=false`,
    `google_client_id_shape=true`; Google secret `placeholder=false`.
  - `npm run smoke:oauth:local`: PASS.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS, route types generate correttamente.
- `npm run build`: PASS. Warning non bloccanti osservati:
  convenzione Next `middleware` deprecata verso `proxy` e deprecation Node
  `module.register()`.
- Browser headless su server process-only locale `127.0.0.1:3055`: Master e
  Admin account arrivano a `accounts.google.com/v3/signin/identifier`; shop-code
  non mostra Google e mostra shop code/staff code.
- `git diff --check`: PASS.
- `git status --short`: worktree dirty; include file TASK-065 e modifiche
  preesistenti/non attribuite a questo task.

## Final DONE Closure Security Gate

Run del 2026-06-17:

- Google Client Secret: `BLOCKED_SECURITY`.
  - Il secret Google e stato incollato in chat durante l'unblock.
  - `gcloud_available=false`, quindi non e possibile verificare da terminale
    rotazione/revoca del secret nel Google Cloud OAuth client.
  - La screenshot manuale non e sufficiente come prova machine-readable di revoca
    per promuovere il task a `DONE`.
- Supabase CLI token: `BLOCKED_SECURITY`.
  - `~/.supabase/access-token` era presente localmente.
  - `supabase logout` non ha rimosso il file per profilo CLI mancante /
    non-interactive.
  - Il file locale `~/.supabase/access-token` e stato rimosso manualmente e la
    verifica successiva riporta `supabase_cli_access_token_file=<absent>`.
  - La revoca remota del token Supabase non e verificabile da questo runtime.
- Check finali richiesti per DONE: `NOT_RUN_SECURITY_BLOCKED` in questa closure,
  perche il primo gate sicurezza e bloccante.
- Browser smoke finale richiesto per DONE: `NOT_RUN_SECURITY_BLOCKED` in questa
  closure. La browser evidence tecnica precedente resta valida per OAuth locale,
  ma non supera il blocker sicurezza.

## Stato Finale

`DONE`: no.

Il codice protegge UI e redirect da provider disabled, Vercel stale redirect,
client ID placeholder e pagine errore Google. OAuth locale e verificato end to
end fino alla pagina Google login valida. La chiusura finale resta bloccata da
`BLOCKED_SECURITY` finche non esiste prova verificabile di rotazione/revoca del
Google Client Secret esposto e del token Supabase CLI esposto.
