# TASK-016 - Complete Platform Admin Console: Users, Shops, Provisioning, Global Security, Audit and System Operations

## Informazioni generali

- ID: `TASK-016`
- Titolo: `Complete Platform Admin Console: Users, Shops, Provisioning, Global Security, Audit and System Operations`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `USER_CONFIRMED_RECONCILIATION`
- Data apertura planning: 2026-05-31
- File Master Plan: `docs/MASTER-PLAN.md`
- File task: `docs/TASKS/TASK-016-complete-platform-admin-console.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-016/README.md`
- Fonte brief: allegato utente `Testo incollato.txt`
- Branch execution previsto: `codex/task-016-complete-platform-admin-console`
- Commit: `NOT_ALLOWED_BY_TASK`
- Git push: `NOT_ALLOWED_BY_TASK`
- Stato massimo consentito a Codex: `DONE_RECONCILED`
- Execution: `COMPLETED`
- Review: `COMPLETED`
- Planning review repo-grounded integrata: 2026-05-31
- Verdict planning: `READY_FOR_EXECUTION_WITH_NOTES`
- Verdict execution: `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`
- Verdict finale: `DONE`

## Final reconciliation to DONE - 2026-05-31

Review finale richiesta esplicitamente dall'utente e completata da Codex sul worktree esistente, senza commit, push o stage.

Verdict finale: `DONE`.

Stato finale: `DONE_RECONCILED`.

Esito reconciliation:

- Platform Admin Console verificata come pannello globale separato da Shop Admin;
- read model Platform e azioni sensibili restano server-side, con check Platform Admin prima delle operazioni;
- grant/revoke Platform Admin usa RPC reali con reason obbligatoria, conferma forte, anti self-lockout, last-admin guard e audit;
- provisioning shop, pending owner invite, restore shop ed emergency device revoke restano auditati e non espongono token, magic link, PIN, password o credential hash;
- `/platform/history` resta presente in sidebar e distinto da audit globale;
- Supabase linked checks allineati: migration list, dry-run, lint e advisors security passati;
- non sono state create nuove migration durante questa reconciliation;
- `TASK-015` e `TASK-017` restano `DONE` e non sono stati chiusi/modificati da questa reconciliation.

Check fresh reconciliation:

- `npm run security:scan`: `PASS`;
- `npm run test:foundation`: `PASS` (`89/89`);
- subset foundation TASK-016: `PASS` (`14/14`);
- `npm run typecheck`: `PASS`;
- `npm run lint`: `PASS`;
- `npm run build`: `PASS_WITH_WARNINGS` per Node `DEP0205`;
- `npm run verify`: `PASS_WITH_WARNINGS` per Node `DEP0205`;
- `npm run test:ui-smoke`: `PASS_WITH_WARNINGS` (`86/86`, warning Node/Playwright colori non bloccanti);
- TASK-016 smoke dedicato: `PASS_WITH_WARNINGS` (`24/24`, warning Node/Playwright colori non bloccanti);
- live auth nominale documentato: `PASS_WITH_WARNINGS` (`2 passed`, `1 skipped`);
- Supabase linked checks: `PASS` (`migration list`, `db push --dry-run`, `db lint`, `db advisors`);
- `git diff --check`, `git status --short` e no-stage sono registrati in evidence.

Rischio residuo non bloccante:

- `PASS_WITH_NOTES_EMAIL_DELIVERY`: il pending owner invite e reale, redatto e auditato, ma il delivery email esterno resta fuori scope finche non viene configurato un provider.

## Final completion execution - 2026-05-31

Codex ha completato la fase finale di completion di `TASK-016` e ha portato il task a `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`, senza marcarlo `DONE`.

Implementato:

- overview globale Platform su `/platform` e `/platform/overview`;
- users/profiles globali con lista server-side, dettaglio profilo e membership summary;
- shops globali con lista, dettaglio, owner/members summary, data health, device summary, sync/history summary e audit summary;
- provisioning safe su `/platform/provisioning` e `/platform/shops/new`, con owner esistente via `platform_create_shop` e pending owner invite redatto via `platform_create_shop_with_pending_owner_invite`;
- Platform Admins read/write su `/platform/admins`, con `platform_grant_platform_admin` e `platform_revoke_platform_admin`, reason obbligatoria, conferma forte, anti self-lockout, last-admin guard e audit;
- audit globale con lista, detail, metadata redatti e filtri documentati;
- system/data health con stati `PASS`, `PASS_WITH_NOTES`, `NOT_RUN`, `BLOCKED` e `not_configured`;
- global devices overview read-only e RPC auditato `platform_emergency_revoke_device`;
- global sync/history overview distinta da `audit_logs`;
- Safe Operations Center con create shop, pending owner invite, lifecycle shop, restore shop, platform admin grant/revoke, emergency device action e diagnostics;
- support diagnostics read-only senza impersonation;
- migration additiva `20260531190000_task_016_platform_admin_console.sql`;
- migration additiva `20260531210000_task_016_platform_completion.sql`;
- tipi Supabase rigenerati dal remoto linked;
- harness TASK-016 foundation/e2e e security scanner dedicato.

Note non bloccanti per done confirmation:

- `PASS_WITH_NOTES_EMAIL_DELIVERY`: il flusso Admin Web crea shop pending setup e pending owner invite redatto/auditato; l'invio email esterno resta da collegare a provider delivery configurato, senza magic link o token salvati/esposti;
- operazioni quotidiane prodotti, import/export, staff e dispositivi ordinari restano Shop Admin / TASK-015;
- Android/iOS/POS resta fuori scope; il follow-up client `MOBILE_POS_ENFORCEMENT_FOLLOW_UP` resta legato a TASK-015.

Blocchi risolti:

- auth provisioning non resta bloccato: owner esistente e pending owner invite sono implementati server-side e auditati;
- grant/revoke Platform Admin non resta bloccato: RPC e UI reali sono abilitate con anti-lockout;
- restore shop e implementato via RPC auditato e conferma shop code;
- live auth nominale non dipende piu dal dev server su `localhost:3000`: `test:ui-live-auth` usa `next start` su `127.0.0.1:3002`.

Gate finali passati: security scan, foundation (`83/83`), typecheck, lint, build, verify, UI smoke (`70/70`), TASK-016 e2e smoke (`24/24`), live auth nominale con `next start` su porta 3002 (`2 passed`, `1 skipped`), git diff check e Supabase linked checks post-push. Nessun commit, push o stage finale.

## Final review/fix - 2026-05-31

Review/fix finale completata da Codex senza marcare `DONE`.

Verdict confermato: `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`.

Fix applicati durante la review:

- sidebar Platform aggiornata con link esplicito a `/platform/history`;
- copy generico `Platform Admins` e `Safe Operations Center` riallineato allo stato reale: grant/revoke Platform Admin e restore shop non sono piu descritti come `BLOCKED_SCHEMA`;
- fallback empty-state generico `Placeholder ready` sostituito con stato non ambiguo;
- harness `tests/foundation/task-016-platform-admins.test.mjs` rafforzato per bloccare regressioni testuali su grant/revoke Platform Admin.

Risultato review per aree critiche:

- Platform overview, users/profiles, shops, provisioning, pending owner invite, Platform admins grant/revoke, audit, system/data health, devices, sync/history, safe operations, support diagnostics, restore shop, emergency revoke device: `PASS`;
- auth provisioning nuovo owner: `PASS_WITH_NOTES_EMAIL_DELIVERY` per delivery email esterna non collegata a provider configurato;
- live auth nominale: `PASS_WITH_WARNINGS`, comando standard con `next start` su `127.0.0.1:3002`;
- warning non bloccanti: Node `DEP0205`, Playwright `NO_COLOR`/`FORCE_COLOR`;
- Android/iOS/POS e impersonation: fuori scope.

Check freschi review/fix passati: `npm run security:scan`, `npm run test:foundation` (`83/83`), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify`, `npm run test:ui-smoke` (`70/70`), `npx playwright test tests/e2e/task-016-platform-admin-smoke.spec.ts` (`24/24`), `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth` (`2 passed`, `1 skipped`), Supabase linked checks sequenziali, `git diff --check` e `git diff --cached --name-only`.

## Scopo

Completare la `Platform Admin Console` come pannello master globale dell'ecosistema 对货.

Dopo `TASK-015`, la `Shop Admin Console` gestira operativamente i dati del singolo negozio. `TASK-016` deve invece completare la parte platform:

1. utenti/profili globali;
2. shops globali;
3. creazione e provisioning iniziale shop;
4. assegnazione owner iniziale;
5. eventuale creazione credenziali iniziali POS admin, solo come bootstrap;
6. gestione stato shop;
7. overview globale dispositivi;
8. overview globale sync/history;
9. audit globale;
10. safe operations;
11. system health;
12. Supabase/data health;
13. platform roles/admins;
14. support diagnostics;
15. UI/UX professionale della Platform Admin Console;
16. test, harness, evidence e sicurezza.

## Principio prodotto

`Platform Admin Console` controlla l'ecosistema globale.

`Shop Admin Console` controlla il singolo negozio.

Quindi `TASK-016` **non deve duplicare** il lavoro di `TASK-015`.

La Platform Admin Console puo:

- creare shop;
- assegnare owner iniziale;
- sospendere/riattivare shop;
- vedere stato globale;
- vedere utenti globali;
- vedere audit globale;
- vedere health/sync/security overview;
- fare interventi di emergenza server-side e auditati.

La Platform Admin Console non deve diventare il posto normale dove il platform admin gestisce ogni giorno:

- prodotti di un negozio;
- categorie;
- fornitori;
- import/export Excel del singolo negozio;
- staff quotidiano;
- PIN/password cassieri;
- ruoli operativi shop;
- dispositivi ordinari del singolo negozio.

Queste parti restano Shop Admin e sono coperte da `TASK-015`.

## Review planning repo-grounded - 2026-05-31

Questa review rafforza il piano in modalita planning-only e read-only. Non sono stati eseguiti build, test runtime, Playwright runtime, Supabase live, migration, seed, cleanup, generation types, commit, push o stage.

### Esito planning

- Verdict: `READY_FOR_EXECUTION_WITH_NOTES`.
- Stato task: resta `DRAFT` / `PLANNING`.
- Execution: `NOT_STARTED`.
- Review: `NOT_STARTED`.
- Master Plan: resta `IDLE`, task attivo `NONE`; `TASK-015` resta candidato execution consigliato prima di `TASK-016`.

### Lacune individuate nel piano originale

- Mancava una sezione esplicita `Boundary con TASK-015` per evitare duplicazione fra Platform Admin globale e Shop Admin operativo.
- Mancavano finding statici repo-grounded sulle route Platform realmente presenti, sul read model Platform, sugli harness esistenti, su `sync_events`, `staff_accounts_safe` e assenza statica di una tabella dispositivi autorizzativa.
- Le regole di provisioning shop non erano ancora esplicite su `pending_owner`, owner ambiguo, doppio owner, `shop_code` duplicato e bootstrap POS bloccato se hashing/boundary non sono sicuri.
- Users/profiles non richiamava abbastanza protezione dati personali, redazione email/id in evidence, export utenti solo motivato e anti self-lockout per platform admin.
- Shops non richiedeva ancora in modo esplicito paginazione/filtri server-side, data/device/sync summary e audit per ogni operazione.
- Platform admins non richiedeva doppia conferma o motivo per revoke e fallback read-only se grant/revoke non sono supportati in modo sicuro.
- System/Data Health poteva sembrare una pagina "finta"; ora deve usare stati reali o `NOT_RUN_PLANNING` / `BLOCKED_SCHEMA` con motivo.
- Device Security doveva chiarire che `sync_events.source_device_id` non equivale a device authorization.
- Safe Operations doveva richiedere rollback/fallback non distruttivo o compensazione documentata per operazioni rischiose.
- Harness futuri mancavano per platform authorization, platform admins anti self-lockout, support diagnostics read-only, source_device/device authorization distinction, no `.select("*")` regressions e data test cleanup.
- Evidence non aveva ancora matrici specifiche per review planning, findings statici, route inventory reale, repo sibling, dati test e condizioni future `REVIEW` / `DONE`.

### Finding statici da verificare in execution

Questi finding derivano da lettura statica del repository e devono essere riverificati durante futura execution con discovery reale e, dove autorizzato, Supabase linked checks:

- Route Platform oggi presenti sotto `src/app/platform`: `/platform`, `/platform/users`, `/platform/shops`, `/platform/audit`, `/platform/system`, `/platform/operations`.
- Route Platform non presenti staticamente e da pianificare/creare o lasciare come follow-up safe: `/platform/users/[profileId]`, `/platform/shops/new`, `/platform/shops/[shopId]`, `/platform/provisioning`, `/platform/admins`, `/platform/data`, `/platform/devices`, `/platform/sync` o `/platform/history`, `/platform/support`.
- `src/server/platform-admin/read-model.ts` oggi legge `profiles`, `shops`, `shop_members`, `platform_admins`, `shop_inventory_sources` e `audit_logs` server-side, ma usa `.select("*")`; `TASK-016` deve sostituire con colonne esplicite o documentare una baseline temporanea da chiudere nello stesso task.
- `src/app/platform/layout.tsx` protegge le route con `resolveCurrentAdminRouteAccess()` e blocca account non `platform_admin`.
- `TASK-006` ha gia introdotto Controlled Operations per create shop, suspend, reactivate e soft delete tramite RPC `platform_*`, autorizzazione server-side, conferme e audit.
- `package.json` espone script esistenti `typecheck`, `lint`, `test:foundation`, `security:scan`, `build`, `verify`, `test:ui-smoke`, `test:ui-live-auth`; questi sono i gate base futuri.
- `scripts/security-checks.mjs` contiene gia gate estesi per client boundary, service-role, TASK-006, route dinamiche, bootstrap, live auth e TASK-014, ma non contiene ancora gate specifici `TASK-016`.
- `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql` definisce `profiles`, `shops`, `shop_members`, `platform_admins`, `shop_inventory_sources`, `audit_logs`, helper `app_private.is_platform_admin()` e RLS/grants read-oriented.
- `supabase/migrations/20260530120000_task_006_platform_admin_controlled_actions.sql` definisce RPC controlled actions e audit per create/suspend/reactivate/soft delete shop.
- `supabase/migrations/20260531050837_task_014_pos_staff_foundation.sql` definisce `staff_accounts`, `staff_accounts_safe`, RLS e grants safe view; non autorizza gestione quotidiana staff dalla Platform.
- `sync_events` esiste ed e owner-scoped con `store_id` e `source_device_id`; non e una tabella dispositivi autorizzativa.
- Non risulta staticamente una tabella device authorization dedicata; emergency revoke device deve restare `BLOCKED_SCHEMA` o `read-only activity` finche discovery non prova il contrario.
- `src/domain/platform-admin/types.ts` e ancora minimale; `TASK-016` deve estendere DTO UI senza esporre secret o raw rows.
- Repo sibling statici sotto `/Users/minxiang/Projects`: `Win7POS` disponibile; Android, iOS e Cash Register System non disponibili nella scan locale e vanno documentati `NOT_AVAILABLE` senza inventare dettagli.

### Boundary con TASK-015

`TASK-016` e Platform Admin globale. `TASK-015` e Shop Admin operativo.

Regole di confine:

- Platform puo leggere overview globali, data health, risk summary e audit summary.
- Platform puo fare provisioning iniziale, bootstrap owner, lifecycle shop e interventi emergenziali auditati.
- Platform non implementa CRUD prodotti, categorie, fornitori o prezzi.
- Platform non implementa import/export Excel ordinario del singolo shop.
- Platform non gestisce quotidianamente staff POS, PIN/password, cashier roles o permessi operativi shop.
- Platform non gestisce quotidianamente dispositivi del singolo shop; puo avere solo overview globale e emergency action se esiste schema autorizzativo reale.
- Se una capability dipende da schema Shop Admin non ancora completato da `TASK-015`, `TASK-016` deve mostrare `not_configured`, `read-only activity`, `blocked schema` o `follow-up`, non placeholder ambiguo spacciato per live.

### Condizioni future per `REVIEW`

`REVIEW` dopo futura execution e ammesso solo se:

- gate critici platform authorization/security passano;
- utenti non `platform_admin` sono bloccati server-side dalla Platform Console;
- users, shops, provisioning, audit, system/data health, safe operations e support diagnostics sono implementati oppure hanno blocker reali e fallback safe;
- device/sync/history overview sono read-only safe se lo schema non consente azioni;
- provisioning non crea shop senza owner salvo stato esplicito `pending_owner`;
- POS admin bootstrap e implementato solo se hashing/boundary/one-time credential sono sicuri, altrimenti resta `BLOCKED_AUTH_PROVISIONING`;
- nessuna password, PIN, token, magic link, device secret o `credential_hash` finisce in UI, log, audit metadata o evidence;
- service-role non finisce mai nel browser/client;
- evidence e aggiornata durante ogni milestone significativa;
- Master Plan viene aggiornato a `REVIEW`, non `DONE`;
- nessun commit, push o stage finale.

### Condizioni future per `DONE`

`DONE` futuro richiede:

- review positiva;
- check/evidence verificabili;
- blocker accettati come follow-up separati oppure risolti;
- conferma esplicita dell'utente;
- Codex non marca `DONE` autonomamente.

## Decisione importante: provisioning iniziale shop

Quando il Platform Admin crea un nuovo shop, puo generare un **pacchetto iniziale di onboarding**.

Pacchetto consigliato:

```text
Shop:
- shop_id
- shop_code
- shop_name
- status

Web owner:
- profile_id oppure invito/profilo creato
- role: shop_owner

POS bootstrap admin:
- staff_code iniziale, per esempio ADMIN01
- credential temporanea mostrata una sola volta, se implementata
- must_change_credential = true, se supportato
```

Regola tecnica:

- account web personale e staff POS restano separati;
- il web owner entra nel sito tramite account personale;
- il POS admin entra nel POS con `shop_code + staff_code + PIN/password`;
- il Platform Admin puo creare solo il bootstrap iniziale o fare emergenza;
- la gestione quotidiana staff resta nello Shop Admin.

Gate anti errore:

- no shop senza owner salvo stato esplicito `pending_owner` e UI/evidence che lo dichiara;
- no doppio owner ambiguo senza regola di cardinalita e vincolo/server check;
- no `shop_code` duplicato;
- no credenziali bootstrap se hashing, one-time display e boundary server-only non sono sicuri;
- no password/PIN/token/magic link in log, audit metadata persistente, screenshot, trace o evidence;
- no service-role nel browser.

## Da leggere prima

### Documentazione

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/admin-dashboard.md`
- `docs/SKILLS/supabase-security.md`
- `docs/TASKS/TASK-005G-supabase-end-to-end-execution.md`
- `docs/TASKS/TASK-005H-supabase-final-readiness-task-005-unblock.md`
- `docs/TASKS/TASK-005K-platform-admin-live-browser-gate-completion.md`
- `docs/TASKS/TASK-005L-global-review-done-reconciliation.md`
- `docs/TASKS/TASK-006-platform-admin-controlled-actions.md`
- `docs/TASKS/TASK-007-auth-routing-route-protection.md`
- `docs/TASKS/TASK-011-shop-onboarding-live-gate.md`
- `docs/TASKS/TASK-014-integrated-auth-qa-design-pos-staff-foundation.md`
- `docs/TASKS/TASK-015-complete-shop-admin-console.md`
- relative evidence dei task sopra.

### Codice

- `src/app/platform`
- `src/components/platform`
- `src/components/admin`
- `src/server/platform-admin`
- `src/server/shop-admin`
- `src/lib/supabase`
- `supabase/migrations`
- `tests`
- `scripts/security-checks.mjs`
- `package.json`
- Playwright config e test esistenti.

### Next.js docs locali

Prima di modificare App Router, Server Components, Server Actions, Route Handlers o data loading, leggere solo i file pertinenti in:

```text
node_modules/next/dist/docs/
```

Documentare in evidence quali file sono stati letti.

## Scope incluso

### 1. Platform Dashboard globale

Completare `/platform` o `/platform/overview`.

Deve mostrare:

- numero totale shop;
- shop attivi/sospesi/archiviati;
- utenti/profili totali;
- shop owner attivi;
- shop senza owner;
- ultimi shop creati;
- ultimi eventi audit;
- stato Supabase/data health;
- stato sync/history globale;
- dispositivi sospetti/revocati, se schema disponibile;
- warning di configurazione;
- safe operations pending/last run, se presenti.

Non mostrare dati sensibili o dettagli operativi inutili dei singoli shop.

### 2. Users / Profiles globali

Completare `/platform/users`.

Funzionalita:

- lista profili personali;
- paginazione server-side;
- ricerca per email/nome/id redatto;
- filtro stato;
- filtro ruolo globale/shop membership;
- dettaglio profilo;
- shops collegati;
- ruoli shop;
- eventuale platform role;
- audit collegato;
- stato auth sicuro, senza token;
- nessun accesso a password;
- nessun reset password arbitrario lato client.
- protezione dati personali e minimizzazione campi;
- redazione email/id in evidence quando non serve il valore completo;
- no export utenti senza motivazione esplicita, autorizzazione server-side e audit;
- anti self-lockout per azioni su platform admin.

Azioni ammesse solo se schema/policy lo permettono:

- sospensione profilo;
- riattivazione profilo;
- revoca accesso platform;
- grant/revoke platform admin, se previsto;
- gestione membership shop solo come operazione controllata e auditata.

Tutte le azioni devono essere server-side, autorizzate e audit log obbligatorio.

### 3. Shops globali

Completare `/platform/shops`.

Funzionalita:

- lista shop globale;
- paginazione server-side;
- ricerca per nome/shop_code;
- filtro stato;
- dettaglio shop;
- owner/members summary;
- stato dati shop;
- stato sync/history;
- dispositivi summary;
- audit summary;
- created_at/updated_at/deleted_at;
- azioni controllate:
  - crea shop;
  - assegna owner iniziale;
  - sospendi shop;
  - riattiva shop;
  - soft delete/logical delete;
  - eventuale restore se supportato;
  - modifica metadata shop sicuri.

Non deve gestire prodotti/categorie/fornitori dello shop: quelli restano Shop Admin.

### 4. Shop provisioning wizard

Aggiungere o migliorare flusso guidato Platform Admin per creare nuovo shop.

Route suggerita:

```text
/platform/shops/new
/platform/shops/[shopId]
/platform/provisioning
```

Funzionalita:

1. creare shop;
2. generare/validare `shop_code`;
3. assegnare owner iniziale;
4. scegliere se owner e profilo esistente o nuovo invito;
5. creare membership `shop_owner`;
6. opzionalmente creare primo POS admin bootstrap;
7. mostrare riepilogo onboarding;
8. scrivere audit completo.

Regole credenziali:

- nessuna password/PIN in log;
- nessuna password/PIN in evidence;
- nessuna password/PIN in audit metadata;
- credential temporanea mostrata una sola volta, se implementata;
- `must_change_credential = true`, se supportato;
- se auth invite/password creation non e sicura o non supportata, classificare `BLOCKED_AUTH_PROVISIONING` e mostrare fallback safe.

### 5. Platform roles / Platform admins

Completare o pianificare `/platform/admins` o sezione equivalente.

Funzionalita:

- lista platform admins attivi;
- grant platform_admin;
- revoke platform_admin;
- audit obbligatorio;
- protezione anti self-lockout;
- motivazione obbligatoria per revoke;
- conferma esplicita per revoca;
- doppia conferma per revoche sensibili o ultimo admin;
- server-side authorization;
- no gestione via auth metadata come fonte primaria se il progetto usa tabella server-side.

Se lo schema non supporta una gestione sicura, lasciare read-only e classificare `BLOCKED_SCHEMA`.

### 6. Global audit log

Completare `/platform/audit`.

Funzionalita:

- lista audit globale;
- filtri:
  - actor;
  - shop;
  - area;
  - action;
  - target;
  - data;
  - severity;
- dettaglio evento;
- metadata redatti;
- link al profilo/negozio correlato;
- export audit solo se sicuro e motivato;
- nessun secret/token/PIN/password/hash.

Deve distinguere:

- audit Platform;
- audit Shop Admin;
- eventi staff;
- safe operations;
- provisioning;
- device emergency actions;
- import/export shop, se visibili solo come summary globale.

### 7. System Health

Completare `/platform/system`.

Mostrare stato globale:

- env configuration redatta;
- Supabase connection health, se controllabile in modo sicuro;
- migration status, solo in execution autorizzata e verificata;
- RLS/grants status summary solo se verificato;
- last linked checks con timestamp/fonte e `NOT_RUN` se non eseguiti;
- auth SSR health;
- route protection health;
- test harness status summary;
- warning di configurazione.

Non leggere o stampare `.env` reali.

Non mostrare secret.

Se un check e solo manuale o non eseguito, usare `NOT_RUN` con motivo.

### 8. Data Health / Supabase Health

Aggiungere sezione o tab in `/platform/system` o `/platform/data`.

Funzionalita:

- shops senza owner;
- profili senza membership;
- membership orfane;
- shop sospesi con attivita recente;
- audit coverage summary;
- inventory mapping status;
- `owner_user_id` -> `shop_id` mapping status, se rilevante;
- sync/history mapping status;
- devices schema status;
- staff schema status;
- migration drift status, solo se verificato.

Le query devono essere server-side e redatte.

Durante planning-only ogni check che richiede Supabase live deve essere classificato `NOT_RUN_PLANNING`.

### 9. Global Device Security Overview

Aggiungere `/platform/devices` o tab security.

Questa non deve sostituire `/shop/devices`.

Platform puo vedere:

- conteggio dispositivi per shop;
- dispositivi sospetti;
- dispositivi revocati;
- ultimi accessi;
- versioni obsolete;
- device source summary da sync/history;
- eventuali device non associati;
- stato globale autorizzazioni device, se schema disponibile.

Distinzione obbligatoria:

- `sync_events.source_device_id` e un identificatore sorgente evento;
- una tabella device authorization reale deve avere stato autorizzativo verificabile prima di qualunque revoca/riattivazione.

Azioni Platform:

- read-only di default;
- emergency revoke solo se schema sicuro esiste;
- audit obbligatorio;
- motivazione obbligatoria;
- nessun token/device secret visibile.

Se non esiste tabella dispositivi autorizzativi, non inventare revoca: mostrare solo `read-only activity` o `BLOCKED_SCHEMA`.

### 10. Global Sync / Mobile History Overview

Aggiungere `/platform/sync` o `/platform/history`.

Funzionalita:

- riepilogo eventi sync/history per shop;
- filtro origine: Android/iOS/POS/Web/Unknown;
- filtro data/tipo/stato;
- errori sync;
- eventi recenti;
- shop con piu errori;
- detail redatto;
- link a shop interessato;
- nessun payload sensibile;
- raw JSON solo redatto e limitato.

Distinzione obbligatoria:

- `audit_logs` = azioni admin/server;
- `sync_events` / history mobile = eventi mobile/sync;
- non confondere le due cose.

### 11. Safe Operations Center

Completare `/platform/operations`.

Funzionalita:

- elenco operazioni sicure disponibili;
- crea shop;
- assegna owner;
- sospendi shop;
- riattiva shop;
- soft delete shop;
- grant/revoke platform admin se previsto;
- emergency revoke device se previsto;
- rebuild/check mapping se previsto;
- diagnostica data health read-only.

Ogni operazione deve avere:

- server-side authorization;
- form validation;
- conferma esplicita;
- motivazione obbligatoria per azioni sensibili;
- audit obbligatorio;
- risultato redatto;
- idempotency key o protezione doppio submit se necessario;
- rollback/fallback non distruttivo o compensazione documentata per operazioni rischiose;
- no secret in UI/log/evidence.

### 12. Support Diagnostics

Aggiungere o migliorare sezione support.

Route possibile:

```text
/platform/support
```

Funzionalita:

- cercare shop/profilo;
- vedere stato accesso;
- vedere membership;
- vedere ultimi audit redatti;
- vedere stato dispositivi/sync;
- vedere errori configurazione;
- suggerire azioni sicure.

Non implementare impersonation silenziosa.

Support diagnostics e read-only by default e non deve accedere silenziosamente a dati operativi shop oltre al minimo necessario per diagnosi redatta.

Se in futuro serve impersonation/support access, deve essere task separato con:

- autorizzazione forte;
- motivazione;
- audit;
- durata limitata;
- visibilita all'owner;
- policy esplicita.

### 13. UI/UX Platform Console

Migliorare UX Platform Admin.

Requisiti:

- sidebar chiara;
- overview utile;
- navigazione coerente;
- tabelle con ricerca/filtro/paginazione;
- detail pages leggibili;
- badge stato;
- empty/loading/error/not_configured/blocked state distinti;
- conferme per azioni sensibili;
- feedback post-azione redatto;
- responsive desktop/tablet;
- mobile accettabile;
- accessibilita minima:
  - label;
  - focus;
  - keyboard navigation;
  - contrasto.

Usare componenti condivisi:

- `PageHeader`
- `SectionCard`
- `EmptyState`
- `StatusBadge`
- `AdminDataTable`
- `GuardrailNotice`

Non introdurre design system parallelo.

### 14. Performance

Requisiti:

- paginazione server-side per users, shops, audit, devices, sync/history;
- filtri server-side;
- no query globali non filtrate su dataset grandi;
- no `.select("*")` nei nuovi read model; baseline esistenti in Platform Admin devono essere eliminate o documentate come eccezione temporanea con follow-up nello stesso task;
- no N+1 query;
- limiti per detail raw JSON;
- timeout/fallback per health checks;
- no caching per dati sensibili senza invalidazione chiara;
- query aggregate o view/RPC solo se sicure.

### 15. Security

Regole obbligatorie:

- `platform_admin` verificato server-side;
- nessun client-side-only guard;
- nessun service-role client/browser;
- nessun secret in UI/log/evidence;
- nessun token/magic link;
- nessun PIN/password;
- nessun `credential_hash`;
- nessun accesso cross-shop non auditato;
- azioni sensibili con audit;
- emergency operations tracciate;
- RLS/grants coerenti;
- no hard delete;
- no raw SQL fuori migration senza motivo forte;
- no `.env` reali stampati.
- metadata audit redatti;
- no emergency operation senza audit;
- no cross-shop access non auditato.

### 16. Migration Supabase

Usare schema esistente se possibile.

Creare migration solo se necessarie e additive.

Possibili aree schema, solo dopo discovery:

- platform admin management;
- support diagnostics;
- operation request log;
- device authorization global view;
- data health helper/view;
- provisioning helper/RPC;
- audit helper/RPC.

Ogni migration deve documentare:

- perche serve;
- cosa crea;
- impatto su schema esistente;
- impatto su `TASK-015` e Shop Admin;
- RLS;
- grants;
- rollback/fallback non distruttivo;
- Supabase lint/advisors;
- tipi rigenerati se applicata.

Comandi richiesti in execution:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase db lint --linked --schema public,app_private --level error --fail-on error
supabase db advisors --linked --type security --level error --fail-on error
```

Se viene applicata migration al linked dev:

```bash
supabase db push --linked
supabase migration list --linked
supabase db push --linked --dry-run
supabase db lint --linked --schema public,app_private --level error --fail-on error
supabase db advisors --linked --type security --level error --fail-on error
supabase gen types typescript --linked --schema public,app_private,graphql_public > src/lib/supabase/database.types.ts
```

## Piano execution

### Fase 0 - Planning file e tracking

Quando viene autorizzata la creazione planning:

1. creare:

```text
docs/TASKS/TASK-016-complete-platform-admin-console.md
docs/TASKS/EVIDENCE/TASK-016/README.md
```

2. aggiornare `docs/MASTER-PLAN.md` solo come task candidato/planned, non execution.

Stato consigliato:

```text
TASK-016: DRAFT / PLANNING
Execution: NOT_STARTED
Review: NOT_STARTED
```

Non aggiornare a `TASK_ACTIVE / EXECUTION` finche non autorizzi l'esecuzione.

### Fase 1 - Discovery

Verificare:

- schema `profiles`;
- schema `shops`;
- schema `shop_members`;
- schema `platform_admins`;
- schema `audit_logs`;
- eventuali `sync_events`;
- eventuali device tables;
- eventuali staff tables;
- safe operations gia esistenti;
- controlled actions TASK-006;
- auth routing TASK-007;
- onboarding live TASK-011;
- staff foundation TASK-014;
- relazione con futuri dati TASK-015.

Produrre matrice:

| Area | Oggetto reale | Gia implementato | Manca | Rischio | Azione |
| --- | --- | --- | --- | --- | --- |
| Users | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/create/adapt` |
| Shops | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/create/adapt` |
| Provisioning | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/create/adapt` |
| Platform admins | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/create/adapt` |
| Audit | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/create/adapt` |
| Devices | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/read-only/block` |
| Sync/history | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/read-only/block` |
| System health | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/create` |
| Safe ops | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `PLANNED_DISCOVERY` | `use/adapt` |

### Fase 2 - Platform domain types

Creare o aggiornare tipi:

- `PlatformProfile`
- `PlatformUserDetail`
- `PlatformShop`
- `PlatformShopDetail`
- `PlatformShopProvisioningDraft`
- `PlatformShopProvisioningResult`
- `PlatformAdmin`
- `PlatformAuditEvent`
- `PlatformDeviceOverview`
- `PlatformSyncOverview`
- `PlatformSystemHealth`
- `PlatformDataHealth`
- `PlatformSafeOperation`
- `PlatformSupportDiagnostic`

Regole:

- DTO UI separati da DB rows;
- niente `any` se evitabile;
- nessun secret;
- campi sensibili redatti;
- metadata raw limitati.

### Fase 3 - Platform overview

Completare dashboard globale.

Acceptance:

- mostra metriche reali o `not_configured`;
- nessun dato finto;
- query server-side;
- loading/error/empty state chiari;
- nessun segreto.

### Fase 4 - Users

Completare lista/dettaglio users.

Acceptance:

- `/platform/users` funzionale;
- `/platform/users/[profileId]` se utile;
- ricerca/filtro/paginazione;
- detail con memberships e audit;
- azioni sensibili solo se sicure;
- no auth secret.

### Fase 5 - Shops

Completare lista/dettaglio shops.

Acceptance:

- `/platform/shops` funzionale;
- `/platform/shops/[shopId]`;
- create/suspend/reactivate/soft delete gia presenti o migliorati;
- detail con owner, members summary, audit summary, data health;
- no gestione prodotti shop.

### Fase 6 - Provisioning wizard

Implementare o migliorare wizard creazione shop.

Acceptance:

- create shop;
- assign owner;
- optional bootstrap POS admin solo se sicuro;
- credential temporanea redatta;
- audit;
- result page chiara;
- no secret in evidence.

### Fase 7 - Platform admins

Gestire platform admin se schema supporta.

Acceptance:

- read list;
- grant/revoke se sicuro;
- anti self-lockout;
- audit;
- server-side only.

Se non sicuro: read-only + `BLOCKED_SCHEMA`.

### Fase 8 - Global audit

Completare audit globale.

Acceptance:

- filtri;
- detail;
- metadata redatti;
- pagination;
- no secret.

### Fase 9 - Devices global overview

Implementare global device overview.

Acceptance:

- summary per shop;
- suspicious/revoked/active;
- no confusione tra source device sync e device autorizzativo;
- emergency actions solo se schema sicuro;
- audit.

### Fase 10 - Sync/history global overview

Implementare overview sync/history.

Acceptance:

- summary eventi;
- errori;
- filtri;
- dettaglio redatto;
- no payload sensibile;
- no dati shop operativi non necessari.

### Fase 11 - System/Data Health

Implementare health console.

Acceptance:

- system health;
- data health;
- mapping health;
- warning;
- NOT_RUN/BLOCKED chiari;
- no env secret.

### Fase 12 - Safe Operations

Consolidare operazioni sicure.

Acceptance:

- operazioni controllate;
- conferma;
- motivo;
- idempotenza dove serve;
- audit;
- result redatto;
- test.

### Fase 13 - Support Diagnostics

Implementare diagnostica support read-only.

Acceptance:

- cerca profilo/shop;
- visualizza memberships, status, audit, config;
- nessuna impersonation;
- nessuna azione pericolosa senza safe operation.

### Fase 14 - UI/UX polish

Applicare componenti condivisi, migliorare navigazione e tabelle.

Acceptance:

- UX professionale;
- stati chiari;
- responsive;
- accessibilita minima;
- no placeholder ambiguo.

### Fase 15 - Harness e test

Aggiungere o rafforzare:

```text
tests/foundation/task-016-platform-boundary.test.mjs
tests/foundation/task-016-platform-authorization.test.mjs
tests/foundation/task-016-platform-provisioning.test.mjs
tests/foundation/task-016-platform-audit.test.mjs
tests/foundation/task-016-platform-admins.test.mjs
tests/foundation/task-016-platform-devices.test.mjs
tests/foundation/task-016-platform-health.test.mjs
tests/foundation/task-016-platform-safe-operations.test.mjs
tests/foundation/task-016-platform-support-diagnostics.test.mjs
tests/foundation/task-016-platform-security.test.mjs
tests/foundation/task-016-platform-test-data.test.mjs
tests/e2e/task-016-platform-admin-smoke.spec.ts
```

Aggiornare `scripts/security-checks.mjs` per TASK-016:

- no service-role client/browser;
- no secret evidence;
- no token/magic link;
- no credential hash;
- no platform client-only auth;
- no unsafe platform operations;
- no raw `.env`;
- no unredacted audit metadata;
- no emergency operation senza audit;
- no `.select("*")` regressions nei nuovi read model Platform;
- no device revoke se esiste solo `sync_events.source_device_id`;
- no support diagnostics mutativo o impersonation.

Harness futuri devono coprire:

- platform boundary e platform authorization;
- provisioning e `pending_owner` / duplicate owner / duplicate `shop_code`;
- platform audit e metadata redatti;
- platform admins anti self-lockout;
- devices overview vs `source_device_id`;
- health status reali, `NOT_RUN` e `BLOCKED`;
- safe operations con motivo, conferma, idempotenza e audit;
- support diagnostics read-only;
- no service-role client/browser;
- no secret evidence;
- no token/magic link;
- no credential hash;
- no raw `.env`;
- no client-only auth;
- no unsafe platform operation.

## Check richiesti in futura Execution

```bash
npm run typecheck
npm run lint
npm run test:foundation
npm run security:scan
npm run build
npm run verify
npm run test:ui-smoke
git diff --check
git status --short
```

Se disponibili e sicuri:

```bash
CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth
```

Supabase, solo se execution autorizzata:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase db lint --linked --schema public,app_private --level error --fail-on error
supabase db advisors --linked --type security --level error --fail-on error
```

## Strategia dati test

Regole:

- usare solo dati sintetici;
- prefisso dati `TASK016_TEST_`;
- nessun dato reale sensibile;
- nessuna password/PIN/token/magic link reale;
- cleanup plan scritto prima di creare dati;
- no hard delete su dati business reali;
- non cancellare audit log;
- cleanup verificabile e redatto;
- se cleanup fallisce, classificare `PASS_WITH_NOTES` o `BLOCKED_CLEANUP` con rischio residuo e righe sintetiche redatte;
- eventuali fixture live devono essere opt-in, process-only per secret e senza storage state persistente.

## Criteri di accettazione

| CA | Descrizione | Stato |
| --- | --- | --- |
| CA-01 | `/platform` dashboard mostra metriche reali o stati safe. | `PLANNED` |
| CA-02 | `/platform/users` lista e dettaglio utenti globali. | `PLANNED` |
| CA-03 | `/platform/shops` lista e dettaglio shops. | `PLANNED` |
| CA-04 | Create/suspend/reactivate/soft delete shop sono controllati e auditati. | `PLANNED` |
| CA-05 | Provisioning wizard crea shop + owner iniziale in modo sicuro. | `PLANNED` |
| CA-06 | POS admin bootstrap e implementato solo se credential flow e sicuro, altrimenti `BLOCKED`. | `PLANNED` |
| CA-07 | Platform admins gestiti o read-only con blocker documentato. | `PLANNED` |
| CA-08 | Global audit con filtri, detail e metadata redatti. | `PLANNED` |
| CA-09 | System/Data Health mostra stato reale o `NOT_RUN/BLOCKED`. | `PLANNED` |
| CA-10 | Device global overview non confonde sync source con authorization device. | `PLANNED` |
| CA-11 | Sync/history global overview redatta e sicura. | `PLANNED` |
| CA-12 | Safe Operations sono server-side, confermate e auditate. | `PLANNED` |
| CA-13 | Support diagnostics e read-only e senza impersonation. | `PLANNED` |
| CA-14 | Nessun secret/token/PIN/password/hash in UI/log/evidence. | `PLANNED` |
| CA-15 | Nessun service-role client/browser. | `PLANNED` |
| CA-16 | Non-platform users non accedono alla console. | `PLANNED` |
| CA-17 | Check locali e security scan passano. | `PLANNED` |
| CA-18 | Evidence completa. | `PLANNED` |
| CA-19 | Master Plan aggiornato a `REVIEW`, non `DONE`, dopo futura execution. | `PLANNED` |
| CA-20 | Dati test sono sintetici, prefissati `TASK016_TEST_`, redatti e con cleanup plan verificabile. | `PLANNED` |
| CA-21 | Nuovi read model Platform non introducono `.select("*")`; baseline esistenti sono corrette o documentate come eccezione da chiudere nello stesso task. | `PLANNED` |
| CA-22 | Platform route/detail mancanti sono implementate o classificate come `not_configured` / `BLOCKED_SCHEMA` / follow-up safe. | `PLANNED` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
| --- | --- | --- | --- | --- |
| CA-01 | Runtime/UI/server read model | `npm run test:foundation`, `npm run test:ui-smoke`, browser/live auth se sicuro | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Platform overview evidence, browser evidence |
| CA-02 | Runtime/UI/server read model | Test foundation + route smoke + live auth opt-in | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Users evidence |
| CA-03 | Runtime/UI/server read model | Test foundation + route smoke + live auth opt-in | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Shops evidence |
| CA-04 | Server actions/RPC/Supabase | Foundation tests, security scan, Supabase linked checks se autorizzati | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Safe operations evidence, Supabase evidence |
| CA-05 | Provisioning flow | Foundation tests, live auth opt-in se sicuro, audit verification | `PASS` / `PASS_WITH_NOTES` / `BLOCKED_AUTH_PROVISIONING` | Provisioning evidence |
| CA-06 | Credential boundary | Static security tests, runtime credential tests solo se implementati | `PASS` / `BLOCKED_AUTH_PROVISIONING` / `BLOCKED_SCHEMA` | Provisioning + security redaction evidence |
| CA-07 | Platform admin authz | Foundation tests, anti self-lockout test, Supabase checks se autorizzati | `PASS` / `PASS_WITH_NOTES` / `BLOCKED_SCHEMA` | Platform admins evidence |
| CA-08 | Audit read/action coverage | Foundation tests, security scan, Supabase checks se autorizzati | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Audit evidence |
| CA-09 | Health read model | Foundation tests and documented `NOT_RUN` / `BLOCKED` states | `PASS` / `PASS_WITH_NOTES` / `NOT_RUN` / `BLOCKED` | System/data health evidence |
| CA-10 | Device boundary | Static tests proving no revoke from `source_device_id` only | `PASS` / `PASS_WITH_NOTES` / `BLOCKED_SCHEMA` | Devices overview evidence |
| CA-11 | Sync/history redaction | Static/foundation tests, payload redaction checks | `PASS` / `PASS_WITH_NOTES` / `BLOCKED_SCHEMA` | Sync/history evidence |
| CA-12 | Controlled operations | Foundation tests, security scan, live opt-in if safe | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Safe operations evidence |
| CA-13 | Support diagnostics | Foundation tests and UI smoke | `PASS` / `PASS_WITH_NOTES` / `BLOCKED_SCHEMA` | Support diagnostics evidence |
| CA-14 | Secret redaction | `npm run security:scan`, targeted foundation tests, evidence scan | `PASS` / `FAIL` | Security redaction evidence |
| CA-15 | Client/server boundary | `npm run security:scan`, foundation boundary tests | `PASS` / `FAIL` | Security redaction evidence |
| CA-16 | Route protection | UI smoke, live auth opt-in, foundation auth tests | `PASS` / `FAIL` / `BLOCKED` | Browser/Playwright evidence |
| CA-17 | Local checks | Required npm/git checks in future execution | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `NOT_RUN` | Check finali |
| CA-18 | Documentation | Evidence review | `PASS` / `CHANGES_REQUIRED` | Final verdict |
| CA-19 | Governance | Master Plan review | `PASS` / `CHANGES_REQUIRED` | Final verdict |
| CA-20 | Test data | Test data strategy and cleanup evidence | `PASS` / `PASS_WITH_NOTES` / `BLOCKED_CLEANUP` | Test data strategy |
| CA-21 | Read model safety | Static tests and security scan | `PASS` / `PASS_WITH_NOTES` / `FAIL` | Security/tooling evidence |
| CA-22 | Route completeness | Route inventory + UI smoke | `PASS` / `PASS_WITH_NOTES` / `BLOCKED_SCHEMA` | Platform route inventory |

## Stop condition

Fermare o classificare `BLOCKED` se:

- schema richiesto non esiste e migration non e sicura;
- platform admin authorization non e verificabile server-side;
- service-role rischia di finire client/browser;
- provisioning owner non puo essere fatto senza password/token insicuri;
- POS admin bootstrap richiede esposizione credential non sicura;
- device revocation non ha tabella autorizzativa reale;
- data health richiede query non autorizzate;
- audit log non puo essere scritto per operazioni sensibili;
- migration history e divergente;
- security scan fallisce su secret/hash/token.

## Definizioni esiti

- `PASS`: verifica eseguita e superata con evidence.
- `PASS_WITH_NOTES`: verifica superata con warning non bloccante.
- `FAIL`: verifica fallita e da correggere.
- `BLOCKED`: prerequisito reale mancante.
- `NOT_RUN`: non eseguito perche fuori scope/non autorizzato/non disponibile.
- `CHANGES_REQUIRED`: task non pronto a review.
- `READY_FOR_EXECUTION`: piano pronto per execution futura senza doc fix richiesti.
- `READY_FOR_EXECUTION_WITH_NOTES`: piano pronto per execution futura con rischi residui noti e accettabili per partire.
- `READY_FOR_EXECUTION_WITH_REQUIRED_DOC_FIXES`: piano quasi pronto ma richiede fix documentali puntuali prima di execution.
- `BLOCKED_PLANNING`: planning bloccato da prerequisito documentale o decisione mancante.
- `BLOCKED_CLEANUP`: dati test sintetici o fixture non sono stati ripuliti in modo verificabile; richiede evidence redatta e decisione esplicita.
- `REVIEW`: massimo stato dopo futura execution.
- `DONE`: vietato a Codex senza review positiva e conferma esplicita utente.

## Non incluso

- Gestione quotidiana prodotti/categorie/fornitori/import Excel.
- Gestione quotidiana staff POS.
- Login POS completo.
- Modifiche Android/iOS/POS.
- Deploy Vercel.
- Hard delete.
- Impersonation.
- Commit.
- Push.
- Stage finale.
- Secret.
- Service-role client/browser.
- Dati mock spacciati per live.

## Evidence richiesta

Creare:

```text
docs/TASKS/EVIDENCE/TASK-016/README.md
```

Con sezioni:

- pre-flight;
- letture obbligatorie;
- discovery schema;
- platform route inventory;
- users evidence;
- shops evidence;
- provisioning evidence;
- platform admins evidence;
- audit evidence;
- system/data health evidence;
- devices overview evidence;
- sync/history evidence;
- safe operations evidence;
- support diagnostics evidence;
- security redaction evidence;
- test data strategy;
- Supabase evidence;
- browser/Playwright evidence;
- check finali;
- blocker;
- final verdict.

## Output finale richiesto a Codex dopo futura Execution

Codex deve rispondere con:

- branch corrente;
- file modificati;
- migration create/applicate;
- tabelle/view/RPC/helper toccati;
- funzionalita completate;
- funzionalita bloccate e motivo reale;
- check eseguiti e risultati;
- Supabase linked checks;
- browser/Playwright checks;
- rischi residui;
- cosa resta fuori scope;
- prossimo passo consigliato;
- conferma:
  - nessun commit;
  - nessun git push;
  - nessuno stage finale;
  - nessun secret esposto;
  - nessun service-role client/browser.

## Nota strategica

`TASK-015` completa la parte **Shop Admin operativa**.

`TASK-016` deve completare la parte **Platform Admin globale**.

Ordine consigliato:

1. tenere `TASK-015` come task Shop Admin completo;
2. creare `TASK-016` come planning Platform Admin completo;
3. eseguire prima `TASK-015` se vuoi finalizzare i dati shop;
4. eseguire `TASK-016` dopo o in parallelo solo se le parti dipendenti da devices/history/inventory restano in modalita overview/read-only fino a schema definitivo.

Il punto chiave e questo:

**Platform Admin vede e governa l'ecosistema. Shop Admin gestisce il negozio.**

Questa separazione va mantenuta anche se `TASK-016` diventa molto completo.
