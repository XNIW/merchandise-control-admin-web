# Master Console local login

Runbook per aprire in browser la Master Console locale di MerchandiseControl Admin Web. Questo e il flusso ex Platform Master Console: la route tecnica resta `/platform`, ma il nome prodotto breve e `Master Console`.

Questo setup usa Supabase locale e non usa production. `.env.local non decide` il target: gli script leggono `supabase status --output env`, verificano `http://127.0.0.1:54321` e passano le env al processo Node/Next senza committare file locali.

## Prerequisiti

- Dipendenze installate con `npm install` o `npm ci`.
- Supabase CLI disponibile.
- Supabase locale avviato nel progetto.
- Chromium Playwright installato solo se vuoi eseguire lo smoke automatico.

## Avvio Supabase locale

```bash
supabase start
npm run db:local:status
```

`npm run db:local:status` puo fallire in modo atteso se `.env.local` punta a cloud, ma deve mostrare il target locale `http://127.0.0.1:54321` da `supabase status` con output redatto.

## Seed account Platform Admin locale

Imposta una password solo nella shell. Non committarla e non salvarla nel repository.

```bash
export DEV_PLATFORM_ADMIN_PASSWORD='scegli-una-password-locale-lunga'
npm run platform:local:seed
```

Account locale/non-production:

- email: `platform.local@example.test`
- password: valore della tua env `DEV_PLATFORM_ADMIN_PASSWORD`

Lo script crea o aggiorna solo dati sintetici locali:

- auth user `platform.local@example.test`;
- profilo personale `TASK046 Platform Local Login`;
- grant globale `platform_admin` attivo;
- audit append-only `task046.platform_local_login.seed`.

Non crea shop di default. Se userai la UI Provisioning manualmente, usa prefissi come `TASK046_` o `TASK046_TEST_SHOP`.

## Avvio Admin Web locale

```bash
npm run platform:local:dev
```

URL da aprire:

- login: `http://127.0.0.1:3000/auth/login?next=/platform`
- Master Console: `http://127.0.0.1:3000/platform`

Se la porta `3000` e gia occupata, il launcher locale sceglie automaticamente
la prima porta libera tra `3050`, `3051` e `3052` e stampa l'URL corretto.
Apri sempre l'URL stampato da `[platform-local-dev] URL ...`: quello e il
processo avviato con Supabase locale. Un server gia attivo su `3000` puo stare
usando `.env.local` cloud/staging e mostrare `Read blocked` anche se il seed
locale e corretto.

Se vuoi cambiare porta:

```bash
PLATFORM_LOCAL_DEV_PORT=3050 npm run platform:local:dev
```

Il launcher locale usa `next dev --webpack` per default per evitare loop di
compilazione Turbopack durante i test manuali della Master Console. Se vuoi
provare esplicitamente Turbopack:

```bash
PLATFORM_LOCAL_DEV_BUNDLER=turbopack npm run platform:local:dev
```

## Percorso manuale UI

1. Apri `http://127.0.0.1:3000/auth/login?next=/platform`.
2. Inserisci `platform.local@example.test`.
3. Inserisci la password da `DEV_PLATFORM_ADMIN_PASSWORD`.
4. Premi `Sign in`.
5. Dovresti arrivare a `http://127.0.0.1:3000/platform`.
6. Verifica la heading `Platform Overview`.
7. Naviga le sezioni Master Console:
   - `Provisioning`
   - `Users`
   - `Shops`
   - `Admins`
   - `Audit`
   - `System`
   - `Data`
   - `Devices`
   - `Sync`
   - `History`
   - `Operations`
   - `Support`

La Master Console e distinta dalla Admin Console. Lo staff POS e il POS manager non sono l'account personale `platform_admin` e non vanno fusi in questo flusso.

Per Admin Console shop-scoped usa:

- Admin account personale: `docs/RUNBOOKS/admin-console-personal-account-login.md`
- Shop code e Staff code: `docs/RUNBOOKS/admin-console-shop-code-login.md`

## Cosa e reale

- Auth reale Supabase SSR/browser.
- Role guard reale su `platform_admins`.
- Route reale `/platform`.
- Read model Platform reale lato server.
- Provisioning e Operations usano Server Actions e RPC esistenti.
- Audit e dati system/data/devices sono letture reali sulle tabelle disponibili.

## Cosa non e implementato o resta parziale

- Login social Google, Apple e WeChat non e collegato.
- `staff_accounts_safe` puo apparire come diagnostica non fatale se la grant/RLS non e completa.
- Win7POS live E2E e Sales Sync live restano fuori da questo runbook.
- Nessun deploy production viene eseguito.

## Smoke automatico opzionale

```bash
export DEV_PLATFORM_ADMIN_PASSWORD='scegli-una-password-locale-lunga'
CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes npm run test:platform:local-login
```

Lo smoke:

- usa Supabase locale;
- esegue il seed idempotente;
- apre il login;
- effettua sign-in;
- verifica `Platform Overview`;
- verifica link stabili come `Provisioning`, `Users` e `Audit`.

## Stato e cleanup

Controlla lo stato del seed:

```bash
npm run platform:local:status
```

Cleanup dati mutabili locali:

```bash
npm run platform:local:cleanup
```

Il cleanup revoca/disabilita o cancella l'auth user locale quando possibile. Le righe audit append-only restano per design e non vengono cancellate.

## Guardrail di sicurezza

- Non usare production.
- Non usare service-role key lato browser.
- Non committare `.env.local`.
- Non scrivere secret reali nel repository.
- Non hardcodare password nel codice.
- Non creare bypass auth disponibile in production.
- Gli script rifiutano Supabase non locale per questo runbook.
