# MerchandiseControl Admin Web

Admin Web per MerchandiseControl, basato su Next.js App Router, TypeScript e Tailwind CSS.

Il prodotto distingue:

- `Master Console`: area globale per amministrare ecosistema, utenti, negozi, stato sistema e audit globale.
- `Admin Console`: area shop-scoped per proprietari/manager collegati tramite account personale e `shop_members`.
- `POS/Staff`: modulo shop-scoped separato dagli account personali, basato su staff/shop-code e non terza console autonoma.

Per governance e roadmap leggere `docs/MASTER-PLAN.md`.

## Prerequisiti

- Node.js 20.x.
- npm con lockfile `package-lock.json`.
- Chromium Playwright per gli smoke test UI (`npm run playwright:install` o install gestita dalla CI).
- Configurazione Supabase locale/linkata solo per check manuali Supabase; non e richiesta dalla CI base.

## Variabili ambiente

Usare `.env.example` come template. I nomi previsti sono:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY` solo per runtime server-side degli endpoint POS; mai nel client/browser.
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` per Supabase Auth Google OAuth locale/deploy.
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` per Supabase Auth Google OAuth locale/deploy.

Il repository non deve contenere valori reali, secret, service-role key, token o password.
Se durante una review vengono usate credenziali DB/Supabase reali in una shell
temporanea, ruotarle al termine della review e non salvarle in file, log o docs.

## Sviluppo locale

```bash
npm run dev
```

Aprire [http://localhost:3000](http://localhost:3000).

## Check progetto

```bash
npm run security:scan
npm run test:foundation
npm run check:pos-catalog-paging
npm run typecheck
npm run lint
npm run build
npm run verify
npm run test:ui-smoke
```

Per smoke test compatibile con CI, dopo `npm run build`:

```bash
npm run test:ui-smoke:ci
```

## Staging online

Staging pubblico verificato:

```text
https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
```

Check one-command per review staging, senza deploy:

```bash
npm run staging:check
```

Check piu piccoli:

```bash
npm run cf:check:staging
npm run cf:check:custom-domain
npm run supabase:check
```

`cf:check:custom-domain` restituisce `READY_TO_CONFIGURE` finche
`STAGING_CUSTOM_DOMAIN` non e definito. Se il dominio viene definito, il check
fallisce quando HTTPS/root/POS API non rispettano i contratti attesi.

## POS sync e harness

Architettura operativa, contratti e guardrail: `docs/POS_SYNC_ARCHITECTURE.md`.
Runbook debugging/correlazione errori: `docs/POS_SYNC_DEBUGGING_RUNBOOK.md`.

Il POS harness negativo non crea dati e verifica solo error contract/no-store:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3005
npm run test:pos-local-harness
```

Il positivo e disabilitato di default. Usarlo solo contro Supabase locale con
service-role in env server-side e dataset sintetico marcato `TASK032_*`:

```bash
TASK032_POS_E2E_ENABLE_POSITIVE=yes \
TASK032_POS_E2E_ALLOW_DATASET_SETUP=yes \
TASK032_POS_E2E_ALLOW_CLEANUP=yes \
TASK032_POS_E2E_TEST_RUN_ID=LOCAL01 \
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-only-in-test-shell> \
npm run test:pos-local-harness
```

Il flusso positivo crea shop/staff/device/prodotto sintetici, esegue first-login,
heartbeat, catalog pull, sales sync TASK-081, duplicate retry e conflict 409.
`TASK032_POS_E2E_TEST_RUN_ID` e un marker leggibile: lo script aggiunge un
suffisso breve per evitare collisioni su `shop_code` e idempotency key. Il
cleanup archivia le entita operative sintetiche shop-scoped. Le righe
append-only di sales/ledger/stock restano marcate `TASK032` come evidenza tecnica
e non sono cancellate. Non usarlo su produzione reale.

Dry-run staging, senza creare dati o inviare vendite:

```bash
TASK032_POS_E2E_STAGING_PROJECT_REF=<expected-ref> \
TASK032_POS_E2E_STAGING_HOST_ALLOWLIST=<staging-host> \
TASK032_POS_E2E_BASE_URL=https://<staging-host> \
TASK032_POS_E2E_TEST_RUN_ID=STAGE01 \
NEXT_PUBLIC_SUPABASE_URL=https://<expected-ref>.supabase.co \
npm run test:pos-staging-harness:dry-run
```

Forma esplicita equivalente:

```bash
TASK032_POS_E2E_STAGING_DRY_RUN=yes \
TASK032_POS_E2E_ENABLE_POSITIVE=yes \
TASK032_POS_E2E_ALLOW_DATASET_SETUP=yes \
TASK032_POS_E2E_ALLOW_CLEANUP=yes \
TASK032_POS_E2E_ALLOW_STAGING=yes \
TASK032_POS_E2E_STAGING_PROJECT_REF=<expected-ref> \
TASK032_POS_E2E_STAGING_HOST_ALLOWLIST=<staging-host> \
TASK032_POS_E2E_BASE_URL=https://<staging-host> \
TASK032_POS_E2E_TEST_RUN_ID=STAGE01 \
TASK032_POS_E2E_REQUIRE_TEST_MARKER=TASK032 \
NEXT_PUBLIC_SUPABASE_URL=https://<expected-ref>.supabase.co \
npm run test:pos-local-harness
```

Il positivo staging reale richiede gli stessi guardrail, piu service-role solo nel
processo test. Lo script rifiuta host non allowlisted, project ref non coerente,
host production-like, marker diverso da `TASK032`, cleanup non abilitato e dataset
senza prefix `TASK032_TEST_SHOP_`.

Staging online verificato il 2026-06-28:

- Admin Web pubblico: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`;
- deploy Cloudflare Workers staging: version ID `9e58a836-5ff6-4ead-aef3-464435418451`;
- Supabase remoto: project ref redatto `jpgo...kyvm`;
- migration remota TASK-081 applicata via `supabase db push --linked`;
- positive harness remoto: `PASS_STAGING_POS_E2E_WITH_CLEANUP`;
- positive harness locale: `PASS_LOCAL_POS_E2E_WITH_CLEANUP` con Supabase locale;
- cleanup: entita operative TASK032 archiviate/revocate, righe sales/ledger/stock append-only marcate TASK032 conservate;
- custom domain staging: `READY_TO_CONFIGURE`, dominio autorizzato non ancora presente; usare `docs/DEPLOYMENT/STAGING.md`.

Win7POS staging pubblico: usare il sample sicuro nella repo Win7POS
`samples/pos-admin-web.config.example` oppure la variabile
`WIN7POS_ADMIN_WEB_BASE_URL` con lo stesso URL workers.dev. Il gate hardware
Windows 7/stampante/scanner/rete reale resta esterno.

Comando staging reale:

```bash
TASK032_POS_E2E_STAGING_PROJECT_REF=<expected-ref> \
TASK032_POS_E2E_STAGING_HOST_ALLOWLIST=<staging-host> \
TASK032_POS_E2E_BASE_URL=https://<staging-host> \
TASK032_POS_E2E_TEST_RUN_ID=STAGE01 \
NEXT_PUBLIC_SUPABASE_URL=https://<expected-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-only-in-test-shell> \
npm run test:pos-staging-harness
```

`/shop/sync` include POS Sync Recovery con azioni append-only (`mark_reviewed`,
`add_note`, `request_pos_retry` audit-only). Queste azioni scrivono audit redatto
shop-scoped e non cancellano outbox, non modificano vendite, non muovono stock e
non forzano ack server.

## CI

La pipeline GitHub Actions in `.github/workflows/ci.yml` esegue:

- installazione dipendenze con `npm ci`;
- cache build Next.js;
- `security:scan`;
- foundation tests;
- typecheck;
- lint;
- build;
- smoke UI CI su Chromium desktop;
- `git diff --check`.

Non configura deploy automatici e non richiede secret.

## Limiti attuali

- Nessun deploy production configurato.
- Nessun email provider collegato.
- Sync Center include recovery read model e Recovery Actions append-only; non include force sync, stock repair o clear error server-side.
- Foundation backend POS per sessioni/dispositivi presente; Win7POS usa il bridge offline-first TASK-081 per sales sync quando configurato.
- Nessuna integrazione Android/iOS/POS fisica reale end-to-end verificata su hardware in questo repository.
- Sales sync POS disponibile via `/api/pos/sales/sync` e Win7POS outbox; deploy/apply production restano fuori scope.
- Google OAuth e predisposto repo-side e verificato in locale per account personali quando il runtime fornisce client ID/secret reali tramite env locali/deploy. I valori reali non devono stare nel repository. Apple e WeChat non sono operativi.

Per modifiche Next.js leggere prima le guide pertinenti in `node_modules/next/dist/docs/`, come richiesto da `AGENTS.md`.
