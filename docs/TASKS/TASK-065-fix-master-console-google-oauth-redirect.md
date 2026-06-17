# TASK-065 - Fix Master Console Google OAuth redirect

- Stato: `REVIEW_WITH_SECURITY_BLOCKER`
- Fase: `BLOCKED_SECURITY`
- Evidence: `docs/TASKS/EVIDENCE/TASK-065/README.md`

## Obiettivo

Correggere il flusso Google OAuth della Master Console in modo che non possa
piu inviare l'utente verso deployment Vercel disattivati, preservi
`/auth/callback?next=/platform`, e mostri errori gestiti quando Supabase/Google
Auth sono configurati male.

## Scope

- Guard repo-side prima di seguire l'URL OAuth restituito da Supabase.
- Google OAuth disponibile sia per Master Console sia per Shop Admin Console
  nella sola modalita Admin account/email.
- Messaggi visibili su `/auth/login` per errori OAuth/callback gestiti.
- Intercetto locale `provider is not enabled` e client ID OAuth Google
  placeholder prima che il browser finisca su JSON Supabase o errore Google
  grezzo.
- Config locale Supabase Auth allineata a HTTP local dev e Cloudflare staging.
- Config locale Supabase Google OAuth con placeholder env, senza secret nel repo.
- Separazione esplicita tra autenticazione comune Google/Supabase e
  autorizzazione console-specifica.
- Bottone Google rifinito con icona inline locale nel componente condiviso
  `AuthForm`.
- Test foundation mirato TASK-065.

## Chiarimento critico prodotto/architettura

- Google OAuth autentica solo l'account personale Supabase.
- Master Console `/platform` resta autorizzata solo dal guard
  `platform_admin`.
- Admin Console `/shop`, in modalita account personale, resta autorizzata solo
  da profilo/membership/ruolo shop valido.
- `platform_admin` non e un bypass per Admin Console.
- `shop_owner`/`shop_manager` non sono un bypass per Master Console.
- Shop-code/staff login resta separato e non usa Google.

## Fuori Scope

- Nessun commit.
- Nessun secret, token o client secret nel repo.
- Nessun nuovo provider Google locale con secret finti.
- Nessuna modifica alla modalita Shop code / staff code / PIN.
- Nessun deploy production o Cloudflare production.
- Nessun ruolo universale valido ovunque.
- Nessuna membership shop assegnata automaticamente dopo Google login.
- Nessun merge tra account personale e staff POS/shop-code.
- Nessun asset esterno/CDN o nuova dipendenza per l'icona Google.

## Handoff

Codex ha applicato la correzione repo-side e ha riprodotto il blocker reale
locale.

- Il 400 Supabase locale `Unsupported provider: provider is not enabled` e stato
  riprodotto prima del fix su `127.0.0.1:54321/auth/v1/authorize`.
- Dopo `[auth.external.google]` e restart Supabase, il provider locale non torna
  piu 400. Nella review-fix iniziale il redirect Google conteneva ancora
  `client_id=env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)` per assenza di env
  locali reali.
- Un tentativo di unblock del 2026-06-17 ha caricato il Client ID Google reale
  in `.env` ignorato da git e GoTrue lo risolve correttamente, ma il secret e
  rimasto non impostato per errore di input zsh (`read -p` interpretato come
  coprocess). GoTrue ha ancora Google secret placeholder.
- La probe locale ora arriva a Google con redirect URI
  `http://127.0.0.1:54321/auth/v1/callback`, ma Google torna su
  `/signin/oauth/error` con classe `redirect_uri_mismatch` / `error_400`.
- L'unblock finale del 2026-06-17 ha scritto il Client Secret in `.env` locale
  ignorato da git tramite prompt macOS nascosto e ha riavviato Supabase con
  output silenziato. GoTrue ora risolve Client ID e secret reali, senza
  placeholder.
- `npm run smoke:oauth:local` passa e verifica due callback app
  (`/platform`, `/shop`) verso `accounts.google.com`.
- Browser headless su `127.0.0.1:3055` conferma:
  - Master Console Google -> `accounts.google.com/v3/signin/identifier`;
  - Admin Console account Google -> `accounts.google.com/v3/signin/identifier`;
  - shop-code senza bottone/icona Google e con shop code/staff code presenti.
- L'app ora mostra errori gestiti invece di lasciare l'utente su JSON Supabase o
  errore Google `invalid_client`:
  - `oauth_provider_not_enabled` per provider disabled;
  - `oauth_google_client_id_invalid` per client ID mancante/placeholder.
- `npm run smoke:oauth:local` falliva correttamente con
  `BLOCKED_EXTERNAL_CONFIG`; dopo secret reale, callback locale autorizzato e
  restart Supabase, passa.
- Review finale ha chiuso un bug repo-side aggiuntivo: `next` con backslash o
  control char viene rifiutato per evitare open redirect dopo callback.
- Lo smoke locale ora distingue `PASS`, `BLOCKED_EXTERNAL_CONFIG` e
  `FAIL_CODE_REGRESSION`, controlla sia callback `/platform` sia `/shop`, e
  blocca anche error page/HTTP error di Google invece di produrre falsi PASS.

Il task non e marcato `DONE`. Final DONE closure 2026-06-17 bloccata da gate
sicurezza: il Client Secret Google e stato incollato in chat dall'utente durante
l'unblock e non e stato possibile verificare da terminale la rotazione/revoca del
secret nel Google Cloud OAuth client (`gcloud` non disponibile, nessuna prova
machine-readable di revoca). Il file locale `~/.supabase/access-token` e stato
rimosso, ma la revoca remota del token Supabase CLI non e verificabile da questo
runtime. Verdict finale: `BLOCKED_SECURITY`.
