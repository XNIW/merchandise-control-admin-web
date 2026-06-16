# Evidence TASK-064

Verdict corrente: `DONE_RECONCILED_REAL_ACCOUNT_VISIBLE`.

TASK-064 e stato riaperto il 2026-06-16 perche la verifica manuale reale ha
fallito: nel browser Master Console la ricerca `xniw...@...com` mostrava
`No matching rows`, mentre Supabase Dashboard mostrava lo stesso account Auth.
La root cause reale del nuovo fallimento e un target mismatch: il browser
aperto stava usando Supabase locale, mentre l'account reale esiste nel target
cloud `.env.local`.

TASK-064C e stato riconciliato con browser acceptance reale su runtime cloud
`127.0.0.1:3055`: target `cloud`, ref redatto `jpgo...yvm`, `Auth users=3`,
account `xniw...@...com` visibile con provider `google` e stato `Profile OK`.
Il redirect Vercel osservato in precedenza era configurazione storica da non
usare: Vercel non e hosting operativo per staging, login o callback.

## Pre-flight Reopen

- Brief utente: `TASK-064 REOPEN - Fix reale Master Console Users non trova
  account Android/iOS xniw97`.
- Stato precedente: `DONE` / `DONE_RECONCILED`.
- Stato riaperto: `CHANGES_REQUIRED` /
  `CHANGES_REQUIRED_TARGET_MISMATCH_FOUND`.
- Commit/push/stage: `NOT_RUN` per esplicito scope utente.

## Orchestrazione

Orchestratore reale usato nel reopen:

- Coordinator: Codex principale. Verdict finale:
  `DONE_RECONCILED_REAL_ACCOUNT_VISIBLE`.
- Runtime target investigator: verifica dedicata su processo/dev server e
  target runtime.
- Supabase cloud read-only reviewer: `PASS`; target cloud `.env.local` e
  mobile sullo stesso ref redatto, account reale presente.
- Platform Users read-model reviewer: `BLOCKER` su rischio high-cardinality
  Auth search. Corretto aumentando il limite per search esplicite e mantenendo
  warning `auth_identity_scan_truncated`.
- Security reviewer: `BLOCKER` intermedio su stato docs, script cloud/probe
  mancanti e ID subagent completi in evidence storica. Corretto nel reopen.
- Browser evidence reviewer: `BLOCKER` operativo solo per impossibilita di
  accedere alla tab del coordinator da subagent; evidence possibile dal
  coordinator.
- TASK-064C auth reviewer subagent: confermato in sola lettura che prima del
  fix il form non supportava Google OAuth, mentre `/auth/callback` era gia
  compatibile con `exchangeCodeForSession`.
- Coordinator TASK-064C: avvio runtime cloud su `3055`, login Google manuale
  nel browser laterale, browser acceptance, screenshot e gate minimi.
- Coordinator TASK-064C URL config correction: Vercel classificato come
  redirect storico non operativo; verifica reale finale confermata sul runtime
  cloud locale `127.0.0.1:3055`.

## Fonti Lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-064-master-console-auth-profile-parity.md`
- `docs/TASKS/EVIDENCE/TASK-064/README.md`
- `src/server/platform-admin/auth-identities.ts`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `src/app/platform/users/page.tsx`
- `src/components/platform/PlatformMasterDetail.tsx`
- `scripts/testing/run-playwright-target.mjs`
- `scripts/platform/local-dev-server.mjs`
- `package.json`
- `.env.local`, solo classificazione redatta e read-only cloud autorizzata
- Repo mobile read-only:
  `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView` e
  `/Users/minxiang/Desktop/iOSMerchandiseControl`
- Supabase docs URL Configuration e Management API Auth config, solo per
  confermare il requisito allow-list/permesso `auth_config_read`.

## Root Cause Reale

`TARGET_MISMATCH_FOUND`.

Il browser laterale Codex era autenticato su `http://127.0.0.1:3000` avviato
con `npm run platform:local:dev`. Quel comando carica runtime Supabase da
`supabase status --output env` e sovrascrive `.env.local` con il target locale.
Quindi la Master Console visualizzata legge `http://127.0.0.1:54321`, non il
project cloud dove Supabase Dashboard mostra l'account reale.

Confronto read-only, valori redatti:

| Target | Classe | Ref | Auth users | Profiles | Platform admins | Shop members | `xniw...@...com` |
|---|---:|---|---:|---:|---:|---:|---|
| Browser/runtime `platform:local:dev` | local | `127.0.0.1:54321` | 96 | 96 | 73 | 4 | absent |
| `.env.local` cloud | cloud | `jpgo...yvm` | 3 | 3 | 3 | 6 | present |

Parity cloud read-only:

- `profile_ok=3`
- `auth_only=0`
- `profile_only=0`
- `origin_unavailable=0`
- Account probe redatto: Auth `present`, provider `google`, profile
  `profile_ok`, profile status `active`, profile display name
  `Platform Admin`.

Target mobile parity:

- Admin Web `.env.local`: ref redatto `jpgo...yvm`.
- Android `local.properties`: stesso ref redatto `jpgo...yvm`.
- iOS `SupabaseConfig.plist`: stesso ref redatto `jpgo...yvm`.
- Nessun service-role nei config mobile osservati.

## Fix Del Reopen

- Aggiunto `scripts/platform/cloud-dev-server.mjs`.
  - Avvia Next contro `.env.local` cloud in modo esplicito.
  - Fallisce se il target e locale.
  - Verifica che `SUPABASE_PROJECT_REF` corrisponda al ref dell'URL.
  - Non usa `supabase status`, quindi non puo sovrascrivere su local.
- Aggiunto `scripts/platform/cloud-target-probe.mjs`.
  - Probe cloud read-only, gated da `CONFIRM_PLATFORM_CLOUD_READONLY=yes`.
  - Richiede `PLATFORM_CLOUD_PROBE_EMAIL` a runtime; nessuna email reale
    hardcoded nel repository.
  - Usa service-role solo in CLI/server process, mai nel browser.
  - Stampa solo ref/email/ID redatti e conteggi.
- Aggiunti script:
  - `npm run platform:cloud:dev`
  - `npm run platform:cloud:probe`
- Estesi security scanner e foundation test per garantire separazione local vs
  cloud e redazione del probe.
- Auth search esplicita: limite server-side aumentato rispetto alla vista
  generica (`authSearchMaxUsers`) e warning mantenuto se lo scan viene
  comunque troncato.
- UI zero-result: le sezioni con `serverSearch` restano su `PlatformMasterDetail`
  anche quando il server restituisce zero righe, cosi input, clear link,
  helper server-side e `No matching rows` restano visibili.
- Login Google Master Console:
  - aggiunto server action Supabase Auth OAuth provider `google`;
  - nessun client Supabase aggiunto al form;
  - primo flusso OAuth completato dopo scadenza state e tornato con
    `bad_oauth_state`; rigenerato flusso fresco e completato correttamente;
  - callback locale effettiva su `127.0.0.1:3055/auth/callback`.
- Diagnostica runtime target:
  - Users e Data espongono target class, ref redatto e runtime source;
  - Users mostra anche `Auth users` dal DTO server-side sicuro.

## Browser Evidence

Browser laterale Codex:

- URL app: `http://127.0.0.1:3000/platform/users`
- Dev server attivo: `npm run platform:local:dev`
- Runtime Supabase server-side effettivo: local Supabase
  `127.0.0.1:54321`
- Schermata autenticata: `Utenti / Profili`
- Search reale `xniw...@...com` su quel target locale: `No matching rows`
  atteso, perche il target locale non contiene l'account.
- Screenshot salvata:
  `docs/TASKS/EVIDENCE/TASK-064/browser-local-target-mismatch-xniw.png`.

Questa evidence dimostra il mismatch target iniziale. La chiusura reale e
avvenuta solo dopo avvio `platform:cloud:dev` e verifica browser cloud su
`127.0.0.1:3055`.

Browser laterale Codex, TASK-064C:

- Dev server attivo: `PLATFORM_CLOUD_DEV_PORT=3055 npm run platform:cloud:dev`.
- URL verificata: `http://127.0.0.1:3055/platform/users?q=xniw97`.
- Runtime target visibile nella pagina: `cloud`, ref `jpgo...yvm`,
  source `.env.local cloud`.
- Conteggi visibili nella pagina Users:
  - `Auth users=3`;
  - `Platform admins=3`;
  - `Profile OK=1` per la search `xniw97`.
- Riga reale visibile:
  - email redatta nei documenti come `xniw...@...com`;
  - provider `google`;
  - stato `Profile OK`;
  - accesso `Master admin`.
- Screenshot salvata:
  `docs/TASKS/EVIDENCE/TASK-064/browser-cloud-xniw-visible.png`.

## Nota Redirect Vercel

Stato corrente: `DONE_RECONCILED_REAL_ACCOUNT_VISIBLE`.

Il codice repo genera il `redirectTo` Google OAuth da origin runtime e, per
`127.0.0.1:3055`, punta a `/auth/callback` sullo stesso host. Non e stato
trovato un fallback Vercel nel codice Auth. Un redirect scaduto arrivato su
Vercel era dovuto a configurazione redirect storica/fallback da non usare.
Vercel non e hosting operativo per staging, login o callback.

La verifica reale finale e stata eseguita nel browser Master Console cloud: la
pagina mostra runtime target `cloud`, project `jpgo...yvm`, `Auth users=3` e
la riga `xniw...@...com` con provider `google` e `Profile OK`.

## Check Eseguiti Nel Reopen

| Comando / Metodo | Esito | Note |
|---|---|---|
| `ps -ax -o pid,ppid,command ...` | `PASS` | Processo attivo: `npm run platform:local:dev` -> `local-dev-server.mjs` -> `next dev`. |
| Query read-only runtime locale via `supabase status` | `PASS` | `authUsers=96`, `profiles=96`, `xniw...@...com absent`. |
| `CONFIRM_PLATFORM_CLOUD_READONLY=yes PLATFORM_CLOUD_PROBE_EMAIL=<runtime email> npm run platform:cloud:probe` | `PASS` | Target `jpgo...yvm`, `authUsers=3`, `profiles=3`, probe present, provider Google, auth display name `Min Xiang`, profile display name `Platform Admin`. |
| Mobile config read-only | `PASS` | Admin/Android/iOS stesso ref redatto `jpgo...yvm`. |
| `npm run platform:cloud:dev` | `PASS_READY_THEN_STOPPED` | Con local fermo: target ref `jpgo...yvm`, URL `127.0.0.1:3000`, `Ready`; processo fermato manualmente. |
| Browser in-app `http://127.0.0.1:3000/platform/users?q=xniw97` | `PASS_TARGET_MISMATCH_EVIDENCE` | Sessione locale autenticata, no guardia auth, `Auth users=96`, search input `xniw97`, helper server-side, `No matching rows`. |
| Targeted foundation TASK-064/TASK-047/TASK-049 | `PASS` | `15/15`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `327/327`. |
| `npm run typecheck` | `PASS` | `next typegen` + `tsc --noEmit`, exit `0`. |
| `npm run lint` | `PASS` | exit `0`. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build exit `0`; warning noti `middleware` deprecato e Node `DEP0205`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint, typecheck, security scan e build passati; stessi warning noti. |
| `npm run test:platform:local-users` | `PASS` | `1 passed`. |
| `npm run test:platform:local` | `PASS` | `1 passed`. |
| `npm run test:platform:local-login` | `PASS_WITH_SKIP` | Exit `0`, `1 skipped` per gate non opt-in. |
| Redaction grep | `PASS` | Nessuna email completa, ID subagent storico o UUID completo nei file TASK-064 toccati. |
| `git diff --check` | `PASS` | Nessun output. |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Branch `main...origin/main`; dirty preesistente fuori scope `docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png`. |

## Check Eseguiti TASK-064C

| Comando / Metodo | Esito | Note |
|---|---|---|
| Stop runtime locale | `PASS` | Fermato `platform:local:dev`; porte `3000` e `3055` libere prima del cloud dev. |
| `CONFIRM_PLATFORM_CLOUD_READONLY=yes PLATFORM_CLOUD_PROBE_EMAIL=<runtime email> npm run platform:cloud:probe` | `PASS` | Target `cloud` ref `jpgo...yvm`; `authUsers=3`, `profiles=3`, `platformAdmins=3`, `shopMembers=6`; probe `present`, provider `google`, profile `profile_ok`. |
| `PLATFORM_CLOUD_DEV_PORT=3055 npm run platform:cloud:dev` | `PASS_RUNNING` | Target `jpgo...yvm`, URL `http://127.0.0.1:3055`; lasciato attivo durante acceptance. |
| Browser in-app `http://127.0.0.1:3055/platform/users?q=xniw97` | `PASS_REAL_ACCOUNT_VISIBLE` | Target `cloud`, ref `jpgo...yvm`, `Auth users=3`, riga `xniw...@...com`, provider `google`, `Profile OK`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run typecheck` | `PASS` | `next typegen` + `tsc --noEmit`, exit `0`. |
| `npm run lint` | `PASS` | exit `0`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git status --short` | `PASS_WITH_DIRTY_WORKTREE` | Dirty worktree atteso; nessun stage/commit/push. |
| Supabase Auth URL Configuration Management API | `NOT_USED_FOR_FINAL_ACCEPTANCE` | Verifica finale confermata dal browser cloud; nessun secret stampato. |
| `supabase projects list --output json` | `NOT_USED_FOR_FINAL_ACCEPTANCE` | Verifica finale confermata dal browser cloud; nessun output sensibile stampato. |

## Check Eseguiti Dopo Stop Vercel OAuth

| Comando / Metodo | Esito | Note |
|---|---|---|
| `CONFIRM_PLATFORM_CLOUD_READONLY=yes PLATFORM_CLOUD_PROBE_EMAIL=<runtime email> npm run platform:cloud:probe` | `PASS` | Target `cloud` ref `jpgo...yvm`; `authUsers=3`, `profiles=3`, `platformAdmins=3`, `shopMembers=6`; probe redatto presente, provider `google`, profile `profile_ok`. |
| Browser in-app read-only `http://127.0.0.1:3055/platform/users?q=xniw97` | `PASS_REAL_ACCOUNT_VISIBLE` | Pagina corrente mostra target `cloud`, ref `jpgo...yvm`, `Auth users=3`, query `xniw97`, provider `google`, `Profile OK`; nessun `vercel.app`, `bad_oauth_state` o `not authorized` visibile. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run typecheck` | `PASS` | `next typegen` + `tsc --noEmit`, exit `0`. |
| `npm run lint` | `PASS` | exit `0`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_DIRTY_WORKTREE` | Worktree sporca attesa; nessun stage/commit/push. |
| Porta `3055` | `PASS_RUNNING` | `node` in ascolto su `127.0.0.1:3055`; `platform:cloud:dev` lasciato attivo. |

## Check Visuale Layout Users

Correzione UI applicata dopo review visuale browser laterale su
`http://127.0.0.1:3055/platform/users`.

- Il provider nella colonna `Origin` non viene piu spezzato in `googl` / `e`.
- Le colonne compatte `Origin`, `Access` e status brevi mantengono wrapping
  stabile.
- La nota lunga nello `State` puo andare a capo senza forzare overflow
  orizzontale inutile.
- La search toolbar ora tiene search input, submit, filtro `State` e filtro
  `Access` su una sola riga desktop.
- Il testo helper `Server search runs before the table filter.` e stato rimosso
  dalla UI corrente per recuperare spazio verticale.
- Screenshot di controllo aperto localmente da `/tmp/task064-users-toolbar-single-row.png`;
  non copiato in evidence repo per evitare duplicazione di dati account reali.
- Test mirato: `node --test tests/foundation/task-064-platform-users-auth-profile-parity.test.mjs`
  `PASS` (`7/7`).

## Stato Finale Corretto

`DONE_RECONCILED_REAL_ACCOUNT_VISIBLE`.

La browser acceptance cloud reale mostra la riga `xniw...@...com` in Master
Console su `127.0.0.1:3055`, target `cloud`, project `jpgo...yvm`,
`Auth users=3`, provider `google`, stato `Profile OK`. Android/iOS/Admin Web
risultano allineati sul target cloud redatto `jpgo...yvm`. Vercel resta
parcheggiato e non operativo per staging, login o callback.
