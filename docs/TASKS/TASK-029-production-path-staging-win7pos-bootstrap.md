# TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening

## Informazioni generali

- ID: `TASK-029`
- Titolo: `Production path: close TASK-028, Supabase fresh reset, staging deploy, Win7POS online bootstrap, POS API hardening`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `USER_REVIEW`
- Data apertura: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review/fix: `COMPLETED_BY_CODEX`
- Verdict corrente: `BLOCKED_VERCEL_PREVIEW_DEPLOY_REQUIRES_NON_PRODUCTION_PATH`
- Commit: `NOT_REQUESTED`
- Git push: `NOT_REQUESTED`
- Stage: `NOT_REQUESTED`

## Scope

TASK-029 chiude TASK-028 su conferma utente, corregge il drift fresh reset TASK-110, prepara staging, implementa il bootstrap online Win7POS fresh install e rafforza le API POS Admin Web.

Architettura mantenuta:

```text
Win7POS -> Admin Web POS API HTTPS -> Supabase server-side
```

Win7POS non comunica direttamente con Supabase e non contiene URL Supabase, anon key, service-role o token hardcoded.

## TASK-028

TASK-028 e stato chiuso a `DONE_RECONCILED_WITH_NOTES` su conferma esplicita dell'utente dopo verifica live PASS. Note residue mantenute:

- drift storico TASK-110 trattato in TASK-029;
- `.xls` legacy fuori scope;
- Android/iOS non toccati;
- TASK-024 sales sync deferred;
- nessuna dichiarazione di readiness globale.

## Supabase fresh reset

Problema: su fresh reset non patchato la migration storica `20260515161500_task110_history_tombstone_grants.sql` falliva prima di TASK-028 per `revoke all on table public.product_prices from anon` quando `public.product_prices` non esiste.

Fix: patch minima e idempotente nella migration storica, con `to_regclass('public.product_prices')` prima del `REVOKE`. Nessuna migration cancellata e nessun cambio schema fuori scope.

## Staging

Stato: `BLOCKED_VERCEL_PREVIEW_DEPLOY_REQUIRES_NON_PRODUCTION_PATH`.

Evidence:

- CLI `vercel`: installata e autenticata;
- progetto Vercel linkato: `xniw97-9857s-projects/merchandise-control-admin-web`;
- GitHub collegato: `XNIW/merchandise-control-admin-web`, production branch `main`;
- env Vercel Preview configurate solo per nome/target: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
- Supabase dev/staging remoto identificato: `merchandisecontrol-dev`;
- RPC restore TASK-028 applicata/verificata sul remoto dev con `to_regprocedure('public.shop_catalog_restore_product(uuid, uuid, text)') = true`;
- `.vercel/`: presente localmente dopo link ed esclusa da git;
- `vercel.json`: assente;
- `netlify.toml`: assente;
- nessuna URL HTTPS reale prodotta.

Tentativi deploy Vercel CLI 2026-06-01:

- `vercel --yes --scope xniw97-9857s-projects`;
- `vercel deploy --yes --target=preview --scope xniw97-9857s-projects`;
- retry da branch locale temporaneo `codex/task-029b-staging-preview` dopo GitHub connection.

Tutti i tentativi hanno prodotto deployment `target: production` e alias production, quindi sono stati cancellati subito. Stato finale Vercel: nessun deployment attivo elencato dal progetto. No staging URL valida, smoke staging e Win7POS staging E2E non eseguiti.

Documentazione operativa aggiornata in `docs/DEPLOYMENT/STAGING.md`. No production mantenuto come gate: i deployment production creati per errore sono stati rimossi e non usati come staging.

## Win7POS online bootstrap

Flusso implementato:

- DB SQLite locale vuoto;
- Win7POS mostra il bootstrap online prima del wizard locale;
- se manca l'Admin Web Base URL, il dialog consente di configurarlo;
- il dialog invia `shopCode`, `staffCode`, PIN/password e nome dispositivo a `/api/pos/auth/first-login`;
- il trusted device token e session token sono salvati con DPAPI in `pos-trusted-device.json`;
- il PIN/password remoto viene riusato solo per creare hash/salt locale tramite `PinHelper`, mai salvato in chiaro;
- viene creato/sincronizzato un operatore locale mirror dello staff remoto;
- viene tentato il catalog pull iniziale;
- il wizard `FirstRunSetupDialog` resta come recovery/dev.
- review/fix: copy bootstrap reso orientato a operatore negozio, PIN/password puliti in `finally`, popup di errore senza eccezioni grezze e response body HTTP Win7POS limitato.

Dati locali non segreti:

- `remote_staff_id`, `remote_staff_code`;
- `remote_shop_id`, `remote_shop_code`;
- `remote_role_key`;
- `remote_credential_version`;
- `remote_synced_at`;
- metadata shop/staff/device nello store trusted-device.

## API POS hardening

Hardening implementato sui Route Handler POS:

- `Content-Type` JSON obbligatorio;
- limite corpo JSON `MAX_POS_JSON_BODY_BYTES`;
- parsing stream con limite anche senza `Content-Length`;
- invalid JSON/Content-Type/body-too-large trattati come payload invalidi;
- `Cache-Control: no-store` centralizzato;
- runtime `nodejs` mantenuto;
- nessuna service-role o log sensibile nel browser/client.
- review/fix: test comportamentale del helper POS JSON aggiunto a TASK-029 foundation.

## Review/fix 2026-06-01

- TASK-028 closure ricontrollata in task doc, evidence e Master Plan: coerente con `DONE_RECONCILED_WITH_NOTES`, senza claim di readiness globale.
- TASK-110 ricontrollata con fresh reset Supabase isolato: ultima migration `20260601160000 task_028_catalog_restore_product`, `public.product_prices = NULL`, `inventory_product_prices` presente, RPC `shop_catalog_restore_product(uuid, uuid, text)` presente, schema POS endpoint completo.
- Staging ricontrollato: `.vercel/`, `vercel.json`, `netlify.toml` e CLI `vercel` ancora assenti. Nessuna URL HTTPS reale, nessun deploy.
- Win7POS review/fix: UI bootstrap/recovery piu chiara, nessun messaggio tecnico grezzo nei popup toccati, DPAPI invariato, mirror locale invariato, catalog pull iniziale best-effort invariato.
- Automazione: `scripts/check-pos-online-bootstrap.ps1` rafforzato e `tests/foundation/task-029-production-path-staging-win7pos-bootstrap.test.mjs` ampliato.

## TASK-029B update 2026-06-01

- Vercel CLI installata (`54.7.1`) e autenticata.
- Progetto Vercel creato/linkato e collegato al repository GitHub.
- Env Preview Vercel richieste configurate senza stampare o salvare valori.
- Supabase remoto dev/staging verificato come `merchandisecontrol-dev`; schema POS richiesto presente.
- Migration SQL TASK-028 restore applicata via `supabase db query --linked --file ...` dopo fallimenti temporanei CLI/pooler; RPC restore verificata presente.
- `supabase migration repair --linked --status applied 20260601160000` resta non completato per circuit breaker/login pooler; schema runtime remoto e comunque presente.
- Deploy manuali Vercel CLI non accettabili per TASK-029: anche con `--target=preview` e branch locale non-main risultano `target: production`.
- Deployment creati per errore: `dpl_EBv8HEroVsKQk5YaQrapyWZxqbGf`, `dpl_FVvS6QYv6FEiXutJrgLMJMM8qtz4`, `dpl_6bGHetzA2uduq4hy8zMdiYrV2XYJ`, `dpl_99aoNgtAJnCw3zTzKCcqQwBMP2ss`; tutti cancellati con `state=DELETED`.
- Stato finale: nessun deployment attivo, nessuna URL staging, nessun smoke staging, nessun Win7POS E2E staging.

## Check

I risultati finali sono registrati in `docs/TASKS/EVIDENCE/TASK-029/README.md`.

## Rischi residui

- Staging pubblico HTTPS non eseguito perche il percorso CLI locale genera deployment production; serve preview da branch Git non-main pushato/autorizzato o altro ambiente HTTPS non-production.
- Smoke staging e Win7POS contro staging pubblico non eseguiti per assenza URL.
- Dataset staging test non creato.
- TASK-024 sales sync resta deferred.
- Android/iOS non toccati.

## Handoff

- Prossima fase: `REVIEW`.
- Reviewer: verificare evidence, blocker staging e patch locali.
- TASK-029 non viene marcato `DONE` finche staging pubblico e smoke/E2E staging non sono realmente disponibili o esplicitamente declassati.
