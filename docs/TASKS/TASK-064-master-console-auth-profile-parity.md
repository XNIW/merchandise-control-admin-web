# TASK-064 - Master Console Auth/Profile Parity e ricerca utenti Android/iOS

## Informazioni generali

- ID: `TASK-064`
- Titolo: `Master Console Auth/Profile Parity e ricerca utenti Android/iOS`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `NONE`
- Verdict tecnico Codex: `DONE_RECONCILED`
- Data apertura execution: `2026-06-15`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-064/README.md`

## Contesto

In `Master Console > Users / Personal Accounts` gli account personali Supabase
Auth usati da Android/iOS potevano non essere trovabili perche la lista era
basata solo su `public.profiles` server-limited e la ricerca UI filtrava le
righe gia restituite. Email/provider/origin erano hardcoded come
`Not captured`.

Reopen 2026-06-16: la verifica manuale reale ha fallito per target mismatch.
Il browser Master Console aperto su `http://127.0.0.1:3000/platform/users` era
avviato con `npm run platform:local:dev`, quindi leggeva Supabase locale
`127.0.0.1:54321`. L'account reale `xniw...@...com` esiste invece nel target
cloud `.env.local` con ref redatto `jpgo...yvm`.

Android, iOS e Admin Web puntano allo stesso Supabase project/ref cloud redatto
`jpgo...yvm`; il mismatch osservato e tra runtime browser locale e target cloud,
non tra i repo mobile e Admin Web.

TASK-064C 2026-06-16: il runtime browser cloud reale e stato avviato su
`127.0.0.1:3055` con `npm run platform:cloud:dev`, autenticato con Google
Supabase Auth tramite login manuale nel browser laterale, e verificato su
`/platform/users?q=xniw97`.

Correzione TASK-064C 2026-06-16: un redirect OAuth scaduto era arrivato su un
host Vercel parcheggiato. Vercel non e hosting operativo per questo flusso:
resta solo configurazione storica da non usare. La verifica reale finale nel
browser Master Console cloud conferma target `cloud`, project `jpgo...yvm`,
`Auth users=3`, riga `xniw...@...com`, provider `google` e stato `Profile OK`.

## Scope completato

- `/platform/users` accetta `q` come query param e invia la search al read
  model server-side.
- Il read model Platform Admin fonde in DTO minimale:
  - `public.profiles`;
  - Supabase Auth identity summary server-only;
  - `shop_members`;
  - `platform_admins`.
- La UI mostra email/provider/provider type/profile sync state/shop access
  senza esporre token, sessioni, raw metadata, PIN, password o service-role key.
- La lista distingue:
  - `profile_ok`;
  - `auth_only`;
  - `profile_only`;
  - `origin_unavailable`.
- Aggiunta migration additiva locale-verificata per trigger
  `auth.users -> public.profiles` e backfill idempotente auth-only.
- Aggiunti security scanner, foundation test e E2E locale TASK-064.
- Verificata parity Admin Web/Android/iOS project ref in sola lettura, con
  valori redatti.
- Reopen 2026-06-16:
  - query read-only locale runtime: `authUsers=96`, `profiles=96`,
    account reale assente;
  - query read-only cloud `.env.local`: `authUsers=3`, `profiles=3`,
    account reale presente, provider Google, `profile_ok`;
  - aggiunti `platform:cloud:dev` e `platform:cloud:probe` per evitare di usare
    `platform:local:dev` come prova cloud;
  - search Auth esplicita rafforzata con limite dedicato piu alto e warning se
    lo scan viene troncato;
  - UI zero-result corretta per mantenere search form, clear link e
    `No matching rows` visibili anche quando la search server-side ritorna zero
    righe;
  - governance aggiornata a `CHANGES_REQUIRED_TARGET_MISMATCH_FOUND`.
- Review orchestrata finale 2026-06-16:
  - lookup profili collegati ad Auth corretto a batch per evitare falsi
    `auth_only` oltre 200 profili;
  - full detail/returnTo preserva `q` e `selected`;
  - E2E locale copre selected inspector e full detail;
  - cleanup E2E robusto contro fixture TASK064 di run interrotte.
- TASK-064C cloud runtime binding:
  - aggiunto submit Google server-side per avviare Supabase Auth OAuth senza
    client Supabase nel browser;
  - callback esistente `/auth/callback` usata per scambio code/sessione;
  - aggiunta diagnostica target runtime redatta su Users e Data:
    target class, ref redatto, runtime source, Auth users count e profiles count;
  - browser acceptance reale su `127.0.0.1:3055` mostra target `cloud`,
    ref `jpgo...yvm`, `Auth users=3`, riga `xniw...@...com`, provider
    `google`, stato `Profile OK`.
- TASK-064C OAuth URL config correction:
  - codice repo verificato: Google OAuth usa `redirectTo` basato sull'origin
    della richiesta, senza fallback Vercel;
  - Vercel confermato come hosting non operativo/parcheggiato per questo
    flusso, solo redirect storico da non usare;
  - verifica reale finale utente: browser Master Console cloud su
    `127.0.0.1:3055` mostra target `cloud`, project `jpgo...yvm`,
    `Auth users=3`, riga `xniw...@...com`, provider `google`,
    stato `Profile OK`.
- Final taxonomy review 2026-06-16:
  - `Users` e rinominata semanticamente a `Personal Accounts` e mostra per
    default account personali normali/non-admin o incompleti;
  - `Shop Admins` mostra account personali con membership `shop_owner` o
    `shop_manager` in `shop_members`, includendo contesto current,
    historical-only e disabled;
  - `Platform Admins` resta limitata ai grant globali in `platform_admins` e
    mostra identita sicura con email, provider, Profile ID, badge
    `Current account` e badge `Platform Admin`;
  - POS/Staff resta separato da `profiles` e dagli account personali;
  - il futuro claim `shop_code` deve produrre membership `shop_members`, non
    grant `platform_admin`;
  - UI layout review completata per Users, Shop Admins e Platform Admins, incluso
    il pannello `Advanced global access` aperto.

## Non incluso

- Nessun commit, push o stage finale.
- Nessuna migration applicata a cloud/production.
- Nessuna modifica Android/iOS.
- Nessuna query mutativa su account reale.
- Nessun dato reale, token, password, PIN, JWT, magic link, service-role key o
  raw auth metadata in evidence.
- Nessun merge tra account personali `profiles` e `staff_accounts`.
- Nessuna chiusura o promozione di TASK-065 OAuth redirect: resta fuori scope
  con blocker/config esterni dedicati.
- Nessuna chiusura o modifica di TASK-067 lifecycle/cleanup, schema, migration,
  RPC o RLS: il follow-up security su TASK-067 resta fuori scope non bloccante
  per questa tassonomia.

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-064-master-console-auth-profile-parity.md`
- `docs/TASKS/EVIDENCE/TASK-064/README.md`
- `package.json`
- `scripts/security-checks.mjs`
- `scripts/platform/cloud-dev-server.mjs`
- `scripts/platform/cloud-target-probe.mjs`
- `scripts/testing/run-playwright-target.mjs`
- `src/app/auth/login/actions.ts`
- `src/app/platform/admins/page.tsx`
- `src/app/platform/shop-admins/page.tsx`
- `src/app/platform/users/page.tsx`
- `src/components/auth/AuthForm.tsx`
- `src/components/platform/PlatformMasterDetail.tsx`
- `src/components/platform/PlatformPage.tsx`
- `src/components/platform/platformData.ts`
- `src/i18n/dictionaries.ts`
- `src/i18n/translate-sections.ts`
- `src/lib/supabase/server.ts`
- `src/server/platform-admin/auth-identities.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `src/server/platform-admin/read-model.ts`
- `supabase/migrations/20260615143000_task_064_auth_profile_parity.sql`
- `tests/e2e/task-064-platform-users-auth-profile-parity.spec.ts`
- `tests/foundation/task-047-master-admin-access-model.test.mjs`
- `tests/foundation/task-049-master-console-admins-ui-polish.test.mjs`
- `tests/foundation/task-064-platform-users-auth-profile-parity.test.mjs`

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Account Android/iOS trovabile in `/platform/users` quando Admin Web punta allo stesso Supabase target. | `PASS_BROWSER_CLOUD_REAL_ACCOUNT_VISIBLE` |
| CA-02 | Search email/UID/display name server-side, non solo filtro client sulle righe precaricate. | `PASS` |
| CA-03 | Email/provider/origin/state mostrati tramite DTO safe server-side. | `PASS` |
| CA-04 | Distinzione `profile_ok`, `auth_only`, `profile_only`, `origin_unavailable`. | `PASS` |
| CA-05 | Auth/profile consistency riparata se repo-controllabile. | `PASS_LOCAL_MIGRATION_VERIFIED` |
| CA-06 | `profiles`, `shop_members`, `staff_accounts` restano separati. | `PASS` |
| CA-07 | Nessun service-role lato client/browser. | `PASS` |
| CA-08 | Nessun token/PIN/password/raw auth metadata in UI/log/evidence. | `PASS` |
| CA-09 | Android/iOS/Admin Web Supabase target parity verificata o mismatch documentato. | `PASS_REAL_CLOUD_RUNTIME`: Users page mostra target `cloud` ref `jpgo...yvm` |
| CA-10 | Test/check reali documentati. | `PASS` |
| CA-11 | Users / Personal Accounts mostra per default solo account personali normali/non-admin o incompleti e spiega le viste dedicate. | `PASS` |
| CA-12 | Shop Admins deriva da `shop_members` owner/manager e include current, historical-only e disabled senza usare POS/staff come account personali. | `PASS` |
| CA-13 | Platform Admins mostra solo accesso globale Master Console e arricchisce identita con email/provider/profile/current account quando disponibile. | `PASS` |
| CA-14 | Visual QA Users, Shop Admins, Platform Admins senza overlap, con multi-shop compatto e dettagli completi in inspector/full detail. | `PASS` |
| CA-15 | `Advanced global access` resta collassato e, da aperto, non rompe il layout del box. | `PASS` |

## Handoff

- Fase corrente: `DONE_RECONCILED`.
- Browser cloud acceptance reale confermata su `127.0.0.1:3055`: target
  `cloud`, project `jpgo...yvm`, `Auth users=3`, riga `xniw...@...com`,
  provider `google`, stato `Profile OK`.
- Final review taxonomy 2026-06-16 riconciliata su conferma esplicita utente:
  Users/Personal Accounts, Shop Admins e Platform Admins hanno viste distinte,
  read model e UI aggiornati, historical Shop Admins visibili e Platform Admins
  identificabili.
- Root cause chiusa: `platform:local:dev` legge Supabase locale; il browser
  cloud deve usare `platform:cloud:dev`, che legge Supabase cloud `jpgo...yvm`.
- Android/iOS/Admin Web risultano allineati sul target cloud redatto
  `jpgo...yvm`.
- Vercel non e hosting operativo per staging/login/callback; era solo una
  configurazione redirect storica da non usare.
- Evidenza primaria:
  `docs/TASKS/EVIDENCE/TASK-064/browser-cloud-xniw-visible.png`.
- Evidenza visuale taxonomy:
  `docs/TASKS/EVIDENCE/TASK-064/task064-users-desktop.png`,
  `docs/TASKS/EVIDENCE/TASK-064/task064-users-tablet.png`,
  `docs/TASKS/EVIDENCE/TASK-064/task064-shop-admins-desktop.png`,
  `docs/TASKS/EVIDENCE/TASK-064/task064-shop-admins-tablet.png`,
  `docs/TASKS/EVIDENCE/TASK-064/task064-platform-admins-desktop.png`,
  `docs/TASKS/EVIDENCE/TASK-064/task064-platform-admins-tablet.png`,
  `docs/TASKS/EVIDENCE/TASK-064/task064-platform-admins-advanced-fixed.png`.
- Nessun commit/push/stage, nessuna migration cloud, nessun grant creato.
