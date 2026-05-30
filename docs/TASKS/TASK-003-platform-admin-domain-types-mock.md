# TASK-003 - Platform Admin Domain Types + Mock

## Informazioni generali

- ID: `TASK-003`
- Titolo: Platform Admin Domain Types + Mock
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `USER / DONE CONFIRMED`
- Data apertura: `2026-05-30`
- File Master Plan: `docs/MASTER-PLAN.md`

## Dipendenze

- Documenti da leggere:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-TEMPLATE.md`
  - `docs/TASKS/TASK-002-platform-admin-ui-shell.md`
  - `docs/TASKS/EVIDENCE/TASK-002/README.md`
  - `package.json`
  - `tsconfig.json`
- Codice da leggere:
  - `src/app`
  - `src/components/platform`
  - `src/components/platform/platformData.ts`
- Task precedenti:
  - `TASK-001 - Bootstrap governance Admin Web`, chiuso in `DONE`.
  - `TASK-002 - Platform Admin UI Shell`, chiuso in `DONE`.
- Decisioni ADR rilevanti:
  - `shops` resta la root business/negozio.
  - I dati business appartengono a `shop_id` / `shop_code`.
  - Non introdurre gerarchia `merchant -> stores`.
  - Account personale e staff POS restano separati.
  - `POS/Staff` e modulo interno shop-scoped della `Shop Admin Console`, non console autonoma.
- Dipendenze tecniche:
  - Next.js App Router con codice sotto `src/app`.
  - Componenti platform sotto `src/components/platform`.
  - TypeScript `strict` attivo.
  - Alias `@/*` verso `./src/*`.
  - Nessuna nuova dipendenza prevista.
  - Prima di modificare codice Next.js, route, layout o convenzioni App Router, leggere la guida pertinente in `node_modules/next/dist/docs/`.

## Scopo

Definire tipi TypeScript e mock sintetici dichiarati per la `Platform Admin Console`, separando i dati di dominio dalla UI statica creata in `TASK-002`.

## Obiettivo

Preparare un modello minimo, leggibile e verificabile per:

- `Profile`
- `Shop`
- `ShopMember`
- `Role`
- `Permission`
- `AuditLog`
- `SystemStatus`
- dati mock sintetici, privacy-safe e separati dalla UI.

Il task deve creare una base futura per sostituire o alimentare i placeholder della shell platform senza introdurre Supabase, auth, API o azioni reali.

## Contesto

`TASK-002` ha creato una UI statica con placeholder locali in `src/components/platform/platformData.ts`. Quel file contiene tipi UI-oriented e righe sintetiche inline per supportare layout, route e smoke test.

`TASK-003` deve spostare il prossimo livello di dati verso un dominio platform dedicato, mantenendo distinta la responsabilita tra:

- tipi/dati business sintetici;
- componenti UI;
- future integrazioni reali, che restano fuori scope.

## Scope incluso

- Creare tipi TypeScript di dominio per `Platform Admin`.
- Creare mock data sintetici e dichiarati.
- Separare i mock business dalla UI.
- Mantenere naming coerente con `shop_id` e `shop_code`.
- Distinguere ID demo applicativi, scope ruolo globale/shop, stato shop sintetico, stato sistema sintetico e severity audit sintetica.
- Mantenere ruoli iniziali coerenti con il Master Plan: `platform_admin`, `shop_owner`, `shop_manager`, `cashier`, `viewer`.
- Documentare chiaramente che i mock sono fake/sintetici.
- Aggiornare la UI solo se strettamente necessario nella futura execution per consumare i mock senza cambiare comportamento visivo.
- Registrare evidence reale dei check eseguiti.

## Scope escluso

- Supabase reale.
- Login/auth.
- Database, migration, RLS o schema reale.
- CRUD.
- API reali o finte complesse.
- Server actions operative.
- Service-role key o qualunque chiave segreta.
- Dati personali reali, token, credenziali, password o riferimenti a clienti reali.
- Azioni amministrative reali.
- Nuove dipendenze.
- Refactor grandi della shell `TASK-002`.
- Shop Admin Console.
- Modulo POS/Staff operativo.
- Fusione tra account personali e staff POS.
- Nuove route o nuove dashboard finte.
- Repository pattern, factory complesse, data access layer o astrazioni premature.
- `any` non motivati.

## Struttura repo rilevata

- App Router sotto `src/app`.
- Shell e componenti platform sotto `src/components/platform`.
- Placeholder UI correnti in `src/components/platform/platformData.ts`.
- Non esistono ancora cartelle `src/domain`, `src/lib`, `src/types` o `src/data`.
- Evidence task sotto `docs/TASKS/EVIDENCE/TASK-*`.
- Script disponibili:
  - `npm run verify`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:ui-smoke`
  - `npm run verify:full`

## File potenzialmente coinvolti

- Documentazione:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-003-platform-admin-domain-types-mock.md`
  - `docs/TASKS/EVIDENCE/TASK-003/README.md`
- Codice candidato per futura execution:
  - `src/domain/platform-admin/types.ts`
  - `src/domain/platform-admin/mock.ts`
  - eventuale `src/domain/platform-admin/index.ts`
  - eventuale adattamento minimo di `src/components/platform/platformData.ts`
- Configurazione:
  - Nessuna modifica prevista.
- Evidence:
  - `docs/TASKS/EVIDENCE/TASK-003/README.md`

## Decisione struttura proposta

Struttura consigliata per futura execution:

- `src/domain/platform-admin/types.ts`
- `src/domain/platform-admin/mock.ts`
- eventuale `src/domain/platform-admin/index.ts`

Motivo: la repo non ha ancora una convenzione `lib`, `types` o `data`; una cartella `domain/platform-admin` separa il modello business dalla UI `src/components/platform`, senza introdurre dipendenze o layer applicativi prematuri.

`index.ts` resta opzionale: va creato solo se migliora la chiarezza degli import. Se aggiunge indirection inutile, usare import diretti da `types.ts` e `mock.ts`.

Alternative escluse per ora:

- `src/components/platform/platformData.ts` come sede principale dei mock business: troppo UI-oriented e gia nato per `TASK-002`.
- `src/lib/platform-admin/*`: possibile, ma meno esplicito sul confine di dominio.
- API route o server actions: fuori scope.

## Piano step-by-step

1. Confermare che `TASK-003` e l'unico task attivo nel Master Plan.
2. Leggere documentazione governance, evidence `TASK-002`, struttura `src/app` e `src/components/platform`.
3. Creare tipi dominio minimi in `src/domain/platform-admin/types.ts`.
4. Creare mock sintetici dichiarati in `src/domain/platform-admin/mock.ts`.
5. Esportare tipi/mock da un eventuale `src/domain/platform-admin/index.ts` se utile.
6. Valutare se `src/components/platform/platformData.ts` deve continuare a restare UI-only o importare/adattare i mock dominio con modifiche minime.
7. Verificare che nessun mock contenga dati personali reali o secret.
8. Eseguire check applicabili e registrare evidence.
9. Preparare handoff a `REVIEW`, senza marcare `DONE`.

## Linee guida tipi

- `Profile`: account personale web, non staff POS.
- `Shop`: root business/negozio con `shop_id` e `shop_code`.
- `ShopMember`: relazione tra `Profile`, `Shop` e ruoli shop-scoped.
- `Role`: ruolo globale o shop-scoped.
- `Permission`: permesso granulare dichiarato.
- `AuditLog`: evento sintetico per traccia futura di azioni sensibili.
- `SystemStatus`: stato sintetico di aree platform o servizi futuri.

I tipi devono restare semplici e dichiarativi. Non devono assumere tabelle Supabase reali, colonne definitive, enum DB o policy RLS.

Forma minima consigliata per la futura execution:

- `Profile`
  - `profile_id`: ID demo applicativo, esempio `demo_profile_001`.
  - `display_name`: label generica, esempio `Platform User A`.
  - `profile_status`: union semplice, per esempio `active | review | disabled`.
  - `created_at`: stringa ISO sintetica, se utile ai mock.
- `Shop`
  - `shop_id`: ID demo applicativo, esempio `demo_shop_001`.
  - `shop_code`: codice business demo, esempio `DEMO-001`.
  - `shop_name`: label generica, esempio `Demo Shop North`.
  - `shop_status`: union semplice, per esempio `active | pending_setup | suspended | archived`.
- `ShopMember`
  - `shop_member_id`: ID demo applicativo.
  - `profile_id`: riferimento demo a `Profile`.
  - `shop_id`: riferimento demo a `Shop`.
  - `role_id`: riferimento demo a `Role`.
  - `membership_status`: union semplice.
- `Role`
  - `role_id`: ID demo, esempio `demo_role_platform_admin`.
  - `role_key`: uno dei ruoli iniziali del Master Plan.
  - `scope`: `global | shop`.
  - `label`: label leggibile.
  - `permission_ids`: array di riferimenti demo a `Permission`.
- `Permission`
  - `permission_id`: ID demo applicativo.
  - `permission_key`: chiave dichiarativa, senza mappare policy DB reali.
  - `scope`: `global | shop`.
  - `description`: descrizione breve.
- `AuditLog`
  - `audit_log_id`: ID demo applicativo.
  - `actor_profile_id`: riferimento demo opzionale a `Profile`.
  - `scope`: `global | shop`.
  - `shop_id`: opzionale e presente solo per eventi shop-scoped.
  - `event`: label sintetica, esempio `System Event A`.
  - `severity`: `info | warning | critical`.
  - `result`: `success | blocked | simulated`.
  - `created_at`: stringa ISO sintetica.
- `SystemStatus`
  - `system_status_id`: ID demo applicativo.
  - `area`: area platform sintetica, esempio `database_planning`, `audit_surface`, `ui_shell`.
  - `status`: `operational | planned | degraded | blocked`.
  - `severity`: `info | warning | critical`.
  - `message`: messaggio sintetico.

Le union vanno mantenute piccole e locali al dominio. Evitare enum DB, `any`, tipi generici aperti o shape pensate come schema definitivo.

## Linee guida mock

- Tutti i mock devono essere chiaramente fake/sintetici.
- Usare label generiche come `Platform User A`, `Demo Shop North`, `System Event A`.
- Usare identificativi demo non realistici, per esempio `demo_profile_001`, `demo_shop_001`, `demo_role_platform_admin`.
- Non usare email, telefoni, indirizzi, nomi completi reali, token, password, secret, service-role key, anon key o credenziali.
- Non simulare Supabase, sessioni, auth o network.
- Non creare factory complesse o API finte.
- I mock devono essere costanti statiche importabili; nessun fetch, timer, randomizzazione o runtime cost inutile.
- Il dominio non deve importare componenti UI. Se la UI consuma i mock, la dipendenza deve andare da UI verso domain, mai al contrario.

## Redazione dati sensibili e dati test

- I dati test devono essere inventati, generici e non riconducibili a persone, negozi, clienti o business reali.
- Vietati: email reali, telefoni, indirizzi, nomi completi realistici, clienti reali, dati business reali, password, token, API key, Supabase anon key, Supabase service-role key, credenziali e secret.
- Consentiti: label sintetiche come `Platform User A`, `Demo Shop North`, `System Event A` e ID demo con prefisso `demo_`.
- Se un dato sembra plausibilmente reale o deriva da ambiente esterno, non inserirlo: sostituirlo con placeholder sintetico o fermare l'execution per review.
- Gli scan con `rg` su parole sensibili vanno interpretati manualmente: match documentali di policy non sono automaticamente failure, match in codice/mock runtime vanno trattati come blocker finche non rimossi o spiegati.

## Regole UI per futura execution

- La UI `TASK-002` non deve cambiare aspetto salvo adattamento minimo dei dati.
- Non aggiungere route, dashboard, sezioni navigazione o azioni cliccabili.
- Eventuali label visibili devono restare generiche, chiare e professionali.
- Le safe operations devono restare disabled/non operative.
- Se consumare i mock dominio richiede un refactor ampio di `src/components/platform/platformData.ts`, fermare l'execution e chiedere review.
- Se emerge bisogno di auth, Supabase, API, server actions o dati reali, fermare l'execution e spostare il tema a `TASK-004`, `TASK-005` o `TASK-006`.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | File task `TASK-003` creato con scope, non-scope, piano, check e handoff a `REVIEW`. | DOCUMENTALE | `PASS` |
| CA-02 | Master Plan aggiornato con `TASK-003` come unico task attivo in `PLANNING`/`REVIEW`. | DOCUMENTALE | `PASS` |
| CA-03 | Evidence iniziale ed execution `TASK-003` create con file letti, baseline e check reali. | DOCUMENTALE | `PASS` |
| CA-04 | Tipi dominio minimi creati per `Profile`, `Shop`, `ShopMember`, `Role`, `Permission`, `AuditLog`, `SystemStatus`. | STATIC/TYPECHECK | `PASS` |
| CA-05 | Mock sintetici separati dalla UI, dichiarati fake e privi di dati reali/secret. | STATIC/SECURITY | `PASS` |
| CA-06 | Nessun Supabase, auth, DB, CRUD, API reale o service-role key introdotto. | STATIC/SECURITY | `PASS_WITH_NOTES` |
| CA-07 | Check applicabili eseguiti o motivati come `NOT_RUN`/`NOT_APPLICABLE`. | TOOLING | `PASS_WITH_NOTES` |
| CA-08 | Handoff finale preparato a `REVIEW`, non `DONE`. | PROCESS | `PASS` |
| CA-09 | Nessuna regressione intenzionale della shell UI; nessuna nuova route o azione cliccabile introdotta. | STATIC/UI | `PASS_WITH_NOTES` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|---|
| CA-01 | DOCUMENTALE | Lettura file task | `PASS` / `FAIL` | Evidence `TASK-003` |
| CA-02 | DOCUMENTALE | Lettura `docs/MASTER-PLAN.md` | `PASS` / `FAIL` | Evidence `TASK-003` |
| CA-03 | DOCUMENTALE | Lettura evidence | `PASS` / `FAIL` | Evidence `TASK-003` |
| CA-04 | STATIC/TYPECHECK | `npm run typecheck` o `npm run verify` | `PASS` / `FAIL` / `NOT_RUN` | Evidence execution futura |
| CA-05 | STATIC/SECURITY | Scan mirato con `rg` e review manuale | `PASS` / `PASS_WITH_NOTES` / `FAIL` | Evidence execution futura |
| CA-06 | STATIC/SECURITY | `rg "supabase|createClient|service_role|anon|password|token" src package.json` con interpretazione | `PASS` / `PASS_WITH_NOTES` / `FAIL` | Evidence execution futura |
| CA-07 | TOOLING | `npm run verify`, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`, `git status` secondo applicabilita | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `NOT_RUN` | Evidence `TASK-003` |
| CA-08 | PROCESS | Handoff finale | `READY_FOR_REVIEW` / `BLOCKED` | Report finale |
| CA-09 | STATIC/UI | Review diff e, se UI/import runtime cambia, smoke/check opportuno in execution | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `NOT_RUN` | Evidence execution futura |

## Matrice test/check

| Test | Tipo | Quando eseguirlo | PASS | FAIL | BLOCKED | NOT_RUN |
|---|---|---|---|---|---|---|
| `npm run verify` | lint/type/build | Dopo modifiche codice o prima handoff execution | Exit code 0 | Exit code non 0 | Tooling non disponibile | Solo docs e motivato |
| `npm run typecheck` | TypeScript | Dopo tipi/mock | Exit code 0 | Exit code non 0 | Tooling non disponibile | Coperto da `verify` o motivato |
| `npm run lint` | lint | Dopo modifiche TS/TSX | Exit code 0 | Exit code non 0 | Tooling non disponibile | Coperto da `verify` o motivato |
| `npm run build` | build Next | Se UI/import runtime cambia | Exit code 0 | Exit code non 0 | Tooling non disponibile | Non opportuno per sole docs o motivato |
| `git diff --check` | whitespace | Sempre prima handoff | Exit code 0 | Output whitespace error | Git non disponibile | Non ammesso salvo blocker |
| `git status --short --untracked-files=all` | worktree | Sempre prima handoff | Stato riportato | N/A | Git non disponibile | Non ammesso salvo blocker |

## Stati evidence

- `PASS`: verifica eseguita davvero e risultato conforme.
- `PASS_WITH_NOTES`: verifica eseguita davvero e conforme, con warning o limite non bloccante spiegato.
- `FAIL`: verifica eseguita davvero e risultato non conforme.
- `BLOCKED`: verifica o step non completabile per impedimento concreto che richiede input utente o cambio stato esterno.
- `NOT_RUN`: verifica non eseguita; il motivo deve essere esplicito.
- `NOT_APPLICABLE`: verifica non pertinente allo scope del task.

Non usare `PASS` per intenzioni, assunzioni o check non eseguiti.

## Decisioni

- Decisioni gia prese:
  - Usare `shop_id` / `shop_code` come identita business nei tipi.
  - Tenere separati account personali e staff POS.
  - Non introdurre Supabase o schema reale in `TASK-003`.
  - Proporre `src/domain/platform-admin` come sede futura dei tipi/mock.
- Alternative escluse:
  - Mock business complessi dentro componenti UI.
  - API finte, fetch simulati o server actions.
  - Gerarchia `merchant -> stores`.
- Rischi accettati:
  - I tipi saranno una bozza applicativa, non schema DB definitivo.
  - Alcuni placeholder UI di `TASK-002` potrebbero restare duplicati finche la futura execution non decide un adattamento minimo.

## Planning

- Obiettivo compreso:
  - Inizializzare il task e preparare una execution piccola per tipi e mock sintetici platform.
- Piano minimo:
  - Documentazione task, tracking Master Plan, evidence iniziale, poi futura execution sui file dominio.
- Safety gates:
  - Nessun dato reale.
  - Nessuna chiave o secret.
  - Nessun Supabase/client DB.
  - Nessun Supabase live o migration.
  - Nessun DB schema inventato.
  - Nessuna API, route handler o server action.
  - Nessun auth/login.
  - Nessuna azione admin reale.
  - Nessuna nuova dipendenza.
  - Nessun refactor ampio.
  - Nessun commit.
  - Nessun `DONE` senza review positiva e conferma utente.
  - Check reali prima dell'handoff.
- Metodi di verifica:
  - Review manuale del diff.
  - `git diff --check`.
  - `git status --short --untracked-files=all`.
  - Scan mirato con `rg` su sorgenti e documenti modificati, interpretando i match documentali.
  - `npm run lint`, `npm run typecheck` e `npm run verify` solo nella futura execution o quando il reviewer autorizza check runtime/build.
- Mappa safety gate -> verifica:
  - No secret/dati reali/API key/credenziali: review manuale mock + scan mirato `rg "password|token|secret|service_role|service-role|anon|api key|credential|email|phone" src docs/TASKS/TASK-003-platform-admin-domain-types-mock.md docs/TASKS/EVIDENCE/TASK-003/README.md`.
  - No Supabase live, DB schema inventato, API, route handler, server action, auth/login: review manuale diff + scan mirato `rg "supabase|createClient|route handler|server action|auth|login|migration|rls" src docs`.
  - No nuove dipendenze o script: controllo diff su `package.json` e `package-lock.json`; questi file non dovrebbero cambiare in `TASK-003`.
  - No nuove route/dashboard/componenti o refactor ampio: controllo diff su `src/app` e `src/components/platform`; modifiche UI ammesse solo se minime e motivate.
  - No commit e no `DONE`: `git status --short --untracked-files=all`, review `docs/MASTER-PLAN.md`, review task/evidence.
- Follow-up candidati separati:
  - `TASK-004` per schema Supabase discovery/planning.
  - `TASK-005` per read-only data reali.
  - `TASK-006` per controlled actions server-side.

## Execution

- File controllati:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-003-platform-admin-domain-types-mock.md`
  - `docs/TASKS/EVIDENCE/TASK-003/README.md`
  - `docs/TASKS/TASK-002-platform-admin-ui-shell.md`
  - `docs/TASKS/EVIDENCE/TASK-002/README.md`
  - `package.json`
  - `tsconfig.json`
  - `src/app`
  - `src/components/platform`
  - `src/components/platform/platformData.ts`
- Modifiche fatte:
  - Creati tipi dominio in `src/domain/platform-admin/types.ts`.
  - Creati mock sintetici statici in `src/domain/platform-admin/mock.ts`.
  - Creato `src/domain/platform-admin/index.ts` per esportare chiaramente tipi e mock.
  - Creato contratto TypeScript compile-time `src/domain/platform-admin/domain-contract.test.ts`.
  - Adattato minimamente `src/components/platform/platformData.ts` per consumare mock domain mantenendo shape UI esistente.
  - Aggiornati Master Plan, task ed evidence per handoff a `REVIEW`.
- Check eseguiti:
  - `npm run typecheck`: `PASS` dopo implementazione; RED iniziale atteso falliva per moduli `./types` e `./mock` mancanti.
  - `npm run lint`: `PASS`.
  - `npm run test:ui-smoke`: `PASS_WITH_NOTES`; 20 test passati, warning Node/dev server non bloccanti.
  - `npm run build`: `PASS_WITH_NOTES`; build completata, warning Node `DEP0205` non bloccante.
  - `npm run verify`: `PASS_WITH_NOTES`; lint/typecheck/build passano, warning Node `DEP0205` non bloccante.
  - `npm run verify:full`: `PASS_WITH_NOTES`; verify e 20 test smoke passano, warning Node/dev server non bloccanti.
  - Scan sicurezza/Supabase: `PASS_WITH_NOTES`; match solo policy/docs e placeholder statici gia esistenti, nessun nuovo client/API/auth.
  - Scan dati sensibili: `PASS_WITH_NOTES`; match solo policy/docs, nessun dato reale nei mock.
  - Scan architetturali: `PASS_WITH_NOTES`; nessun `any`, nessun import domain -> UI, nessun runtime dinamico; unico match `merchant` e testo UI statico anti-gerarchia preesistente.
  - `git diff --check`: `PASS`.
  - `git status --short --untracked-files=all`: `PASS_WITH_NOTES`; mostra solo modifiche attese `TASK-003`.
- Rischi rimasti:
  - I tipi restano modello applicativo iniziale, non schema Supabase definitivo.
  - `platformData.ts` ora deriva alcuni valori visibili dai mock domain; smoke UI passa e la review/fix ha confermato che il cambio di valori sintetici e accettabile.
  - Warning non bloccanti `DEP0205`, `NO_COLOR`/`FORCE_COLOR` e `allowedDevOrigins` emersi durante build/smoke restano da trattare solo se diventano blocker in task futuri.
- Handoff:
  - `READY_FOR_REVIEW`, non `DONE`.

## Review

- Decisione: `APPROVED_FOR_DONE_CONFIRMATION`
- Evidence verificata:
  - `docs/TASKS/EVIDENCE/TASK-003/README.md`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run test:ui-smoke`
  - `npm run verify`
  - `npm run verify:full`
  - scan sicurezza/Supabase
  - scan dati sensibili
  - scan architetturali
  - `git diff --check`
  - `git status --short --untracked-files=all`
- Problemi:
  - Nessun blocker o bug codice trovato nella review/fix.
  - Warning non bloccanti confermati: Node `DEP0205`, `NO_COLOR`/`FORCE_COLOR` durante Playwright e warning dev server `allowedDevOrigins`.
- Fix applicati:
  - Aggiornamento documentale di review/fix in task, evidence e Master Plan.
- Check rieseguiti:
  - `npm run typecheck`: `PASS`
  - `npm run lint`: `PASS`
  - `npm run build`: `PASS_WITH_NOTES`
  - `npm run test:ui-smoke`: `PASS_WITH_NOTES`
  - `npm run verify`: `PASS_WITH_NOTES`
  - `npm run verify:full`: `PASS_WITH_NOTES`
  - `git diff --check`: `PASS`
- Rischi rimasti:
  - I tipi restano modello applicativo iniziale, non schema Supabase.
  - I warning tooling/dev server sono non bloccanti ma visibili.
- Verdict:
  - `READY_FOR_DONE_CONFIRMATION`, non `DONE`.
- Condizioni per `READY_FOR_EXECUTION`:
  - Master Plan indica `TASK-003` come unico task attivo.
  - Scope e non-scope sono chiari e non invadono `TASK-004`, `TASK-005` o `TASK-006`.
  - Struttura futura e safety gate sono documentati.
  - Evidence planning review riporta solo comandi realmente eseguiti e `NOT_RUN` motivati.
  - Non ci sono blocker o decisioni utente aperte.
- Condizioni per `CHANGES_REQUIRED`:
  - Il piano e correggibile documentalmente ma incompleto.
  - Restano incoerenze tra Master Plan, task, evidence o stato repo.
  - Evidence, criteri di accettazione, safety gate o comandi vietati/ammessi sono ambigui.
- Condizioni per `BLOCKED`:
  - Il tracking del Master Plan risulta incoerente e non correggibile solo documentalmente.
  - Servono decisioni utente su scope, struttura o naming prima di poter eseguire.
  - La futura execution richiederebbe Supabase/auth/API/DB o refactor ampio fuori scope.
  - Mancano file fondamentali per verificare lo stato reale della repo.
- Condizioni per passare a `DONE`:
  - Futura execution completata.
  - Check reali superati o motivati.
  - Review positiva.
  - Conferma esplicita dell'utente.
  - `DONE` non puo essere deciso da Codex durante planning o execution.

## Fix

- Richieste di fix ricevute:
  - Review/fix completa `TASK-003` in fase `REVIEW`, con correzione diretta se necessaria.
- Correzioni fatte:
  - Nessun fix codice richiesto.
  - Aggiornati task, evidence e Master Plan per registrare review/fix corrente e verdict `READY_FOR_DONE_CONFIRMATION`.
- Check rieseguiti:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run test:ui-smoke`
  - `npm run verify`
  - `npm run verify:full`
  - scan statici sicurezza/privacy/architettura
  - `git diff --check`
  - `git status --short --untracked-files=all`

## Chiusura

- Stato finale: `DONE`.
- Conferma utente: richiesta esplicita "Metti a DONE e fai commit push".
- Data chiusura: `2026-05-30`.
- Follow-up aperti:
  - Monitorare warning dev server `allowedDevOrigins` se diventa bloccante o troppo rumoroso.
  - Audit accessibilita dedicato con axe come task separato opzionale.
  - Schema Supabase, RLS, auth e dati reali nei task futuri `TASK-004` / `TASK-005`.
