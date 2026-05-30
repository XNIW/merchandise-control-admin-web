# TASK-002 - Platform Admin UI Shell

## Informazioni generali

- ID: `TASK-002`
- Titolo: Platform Admin UI Shell
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `USER / REVIEW APPROVED`
- Data apertura: `2026-05-29`
- File Master Plan: `docs/MASTER-PLAN.md`

## Dipendenze

- Documenti da leggere:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-TEMPLATE.md`
  - `docs/TASKS/TASK-001-bootstrap-governance.md`
  - `docs/TASKS/EVIDENCE/TASK-001/README.md`
  - `docs/ARCHITECTURE/DOMAIN-MODEL.md`
  - `docs/SKILLS/admin-dashboard.md`
  - `docs/SKILLS/supabase-security.md`
  - `package.json`
- Task precedenti:
  - `TASK-001 - Bootstrap governance Admin Web`, chiuso in `DONE` su conferma esplicita dell'utente.
- Decisioni ADR rilevanti:
  - `shops` resta la root business/negozio.
  - `Platform Admin Console` e `Shop Admin Console` sono aree distinte.
  - `POS/Staff` e modulo interno shop-scoped della `Shop Admin Console`, non terza console autonoma.
- Dipendenze tecniche:
  - Next.js App Router, TypeScript e Tailwind CSS gia presenti.
  - Nessuna nuova dipendenza prevista senza approvazione esplicita.
  - Prima di cambiare codice Next.js o convenzioni framework in execution, leggere la guida pertinente in `node_modules/next/dist/docs/`.

## Scopo

Implementare una prima UI statica moderna per la `Platform Admin Console`, senza Supabase, auth, API, CRUD, dati reali o azioni amministrative operative.

## Obiettivo futuro

Creare una shell admin web pulita, professionale e moderna per il pannello master della piattaforma. La shell dovra dare una prima struttura operativa alla gestione globale di ecosistema, utenti/profili, negozi, audit, stato sistema e operazioni sicure.

## Contesto

`TASK-001` ha impostato governance, dominio e roadmap. `TASK-002` deve trasformare la direzione di prodotto in un task di execution piccolo, verificabile e limitato alla prima UI statica della `Platform Admin Console`.

La futura UI deve essere un'interfaccia operativa, non una landing page. Deve ispirarsi funzionalmente a gestionali/POS usati come riferimento, senza copiarne 1:1 layout, testi, marchi, colori o dettagli visuali.

## Scope della futura execution

### Execution boundaries

- La futura execution deve partire solo dopo approvazione/handoff esplicito da `PLANNING` a `EXECUTION`.
- Prima di modificare codice Next.js, route, layout o convenzioni App Router, leggere la documentazione pertinente in `node_modules/next/dist/docs/`.
- Il task deve restare limitato a UI statica della `Platform Admin Console`.
- La shell deve usare contenuti statici e placeholder dichiarati, senza fetch client/server.
- Non introdurre stato globale applicativo; usare solo stato locale minimo se serve per interazioni statiche di navigazione o visualizzazione.
- Non inserire business logic pesante nei componenti UI.
- Non introdurre grafici pesanti, librerie di charting, data-grid o dependency UI esterne senza approvazione esplicita.
- Eventuali azioni pericolose o amministrative devono essere rese come placeholder visibilmente disabled/non operative.

### Layout

- Sidebar persistente per navigazione platform.
- Topbar con titolo contesto e placeholder controlli globali.
- Area contenuto principale.
- Struttura leggibile per desktop e tablet.
- Navigazione chiara tra sezioni platform.

### Route e pagine candidate

Le route esatte vanno confermate in futura execution dopo lettura della documentazione Next.js locale e ispezione di `src/app`. La mappa candidata e:

- `/`: entrypoint statico che mostra la `Platform Overview` o reindirizza/compone la shell platform senza introdurre auth.
- `/platform`: contenitore candidato per la shell platform, se coerente con la struttura App Router esistente.
- `/platform/users`: placeholder `Users / Profiles`.
- `/platform/shops`: placeholder `Shops`.
- `/platform/audit`: placeholder `Audit`.
- `/platform/system`: placeholder `System Status`.
- `/platform/operations`: placeholder `Safe Operations`.

Se la futura execution sceglie route diverse, deve motivarlo nell'handoff e mantenere invariato lo scope.

### Pagine statiche future

- `Platform Overview`
- `Users / Profiles`
- `Shops`
- `Audit`
- `System Status`
- `Safe Operations` placeholder

### Componenti futuri consigliati

- `AppShell`
- `Sidebar`
- `Topbar`
- `PageHeader`
- `StatCard`
- `DataTable`
- `StatusBadge`
- `EmptyState`
- `ActionButton`
- `SectionCard`

### Component boundaries

- `AppShell`: compone sidebar, topbar e area contenuto; non contiene dati business reali.
- `Sidebar`: espone navigazione platform statica e stato visuale della sezione corrente.
- `Topbar`: mostra contesto platform e controlli statici non operativi.
- `PageHeader`: standardizza titolo, descrizione breve e azioni placeholder.
- `StatCard`: mostra metriche sintetiche placeholder privacy-safe.
- `DataTable`: tabella statica leggera per preview di utenti, shops o audit; nessuna paginazione reale, ma layout predisposto per paginazione futura.
- `StatusBadge`: stato visuale per elementi statici, senza logica autorizzativa.
- `EmptyState`: pattern per sezioni senza contenuto reale.
- `ActionButton`: bottone o link di comando; le azioni reali devono restare disabled o placeholder.
- `SectionCard`: contenitore semantico per gruppi di informazioni, senza annidare card dentro card se non necessario.

I componenti devono restare piccoli, leggibili e separati per responsabilita. La futura execution deve evitare di concentrare tutta la UI in un unico file se la shell cresce oltre una pagina semplice.

### UX

- Interfaccia operativa, non landing page.
- Layout pulito, leggibile e moderno.
- Densita informativa adatta a dashboard amministrativa.
- Stati `empty`, `loading`, `error` e `disabled` previsti almeno come pattern statici o placeholder dichiarati.
- Accessibilita base: landmark chiari, focus visibile, label comprensibili e contrasto sufficiente.
- Navigazione tastiera ragionevole per link, bottoni e focus order principale.
- Copy chiaro per operatori reali.

### Placeholder data policy

- Usare solo dati sintetici, dichiarati e privacy-safe.
- Non usare nomi, email, telefoni, indirizzi, token, ID reali o riferimenti a clienti reali.
- Preferire label generiche come `Demo Shop`, `Platform User`, `System Event` o equivalenti.
- Mantenere i placeholder piccoli e leggibili; mock business complessi appartengono a `TASK-003`.
- Separare eventuali costanti placeholder dalla struttura UI se crescono oltre pochi elementi inline.
- Non simulare autorizzazioni reali, sessioni reali o risultati Supabase.

### Visual smoke plan futuro

Quando la UI reale esistera, la futura execution puo usare Browser/Chrome per uno smoke test visivo leggero:

- Avviare il server locale solo se necessario per verificare la shell.
- Aprire la route principale della `Platform Admin Console`.
- Verificare desktop e tablet: sidebar visibile, topbar leggibile, area contenuto senza overlap.
- Verificare focus visibile su navigazione e bottoni principali.
- Verificare che i placeholder `Safe Operations` siano non operativi o disabled.
- Registrare nel report se Browser/Chrome non sono disponibili con stato `NOT_AVAILABLE` o `BLOCKED`, senza inventare screenshot.

### Definizione di out of scope escalation

- Se servono tipi dominio o mock business estesi, spostare a `TASK-003`.
- Se servono schema, migration, policy, auth boundary o Supabase reale, spostare a `TASK-004`.
- Se servono letture di dati reali, spostare a `TASK-005`.
- Se servono azioni amministrative reali, audit obbligatorio o scritture, spostare a `TASK-006`.
- Se servono nuova dipendenza, charting avanzato, data-grid o Playwright, fermare execution e richiedere approvazione o task separato.
- Se emerge una nuova area `Shop Admin Console` o `POS/Staff`, creare task separato e non ampliare `TASK-002`.

## Non incluso

- Nessun login reale.
- Nessun Supabase reale.
- Nessun database.
- Nessuna chiamata API.
- Nessuna azione admin reale.
- Nessun CRUD.
- Nessun dato reale.
- Nessun mock business complesso.
- Nessuna `Shop Admin Console`.
- Nessun modulo `POS/Staff`.
- Nessun import/export.
- Nessuna integrazione Android/iOS/POS.
- Nessuna nuova dipendenza salvo approvazione esplicita.
- Nessun deploy Vercel.
- Nessun CLI custom.
- Nessun rollback o riapertura non richiesta di `TASK-001`.
- Nessun cambio di stato di `TASK-002` a `DONE` senza review positiva e conferma esplicita dell'utente.

## Tooling e plugin ammessi

- Codex puo usare strumenti disponibili nel workspace se utili durante futura `EXECUTION` o `FIX`.
- Browser/Chrome possono essere usati in futuro per smoke test visivo.
- Figma puo essere usato in futuro per wireframe o riferimento UI/UX se disponibile e utile.
- Vercel resta fuori scope finche non esiste una UI minima stabile e finche non viene richiesto esplicitamente.
- Non sviluppare CLI custom in `TASK-002`.
- Preferire npm scripts semplici e verificabili.

## File potenzialmente coinvolti

- Documentazione:
  - `docs/MASTER-PLAN.md`, solo per tracking coerente se richiesto.
  - `docs/TASKS/TASK-002-platform-admin-ui-shell.md`.
- Codice in futura execution:
  - `src/app`, solo dopo approvazione di una fase `EXECUTION` separata.
  - Componenti React dedicati alla shell platform, solo dopo approvazione di una fase `EXECUTION` separata.
  - CSS/Tailwind esistente, solo dopo approvazione di una fase `EXECUTION` separata.
- Configurazione:
  - Nessuna modifica prevista in `TASK-002` senza motivazione esplicita.
- Evidence:
  - Evidence execution registrata in `docs/TASKS/EVIDENCE/TASK-002/README.md`.
  - Ogni risultato usa solo check realmente eseguiti o stati `BLOCKED`/`NOT_APPLICABLE` motivati.

## File vietati in TASK-002 senza nuovo handoff

- File fuori dallo scope approvato per `TASK-002`.
- Componenti React non dedicati alla shell platform.
- File Supabase, migration, schema DB, client DB o `.env`.
- File di repo Android, iOS, POS, Cash Register o Win7 POS.
- Configurazioni Next.js, package manager o dipendenze, salvo approvazione esplicita.
- Script custom o CLI dedicati.

## Evidence lifecycle

- Planning review: puo essere registrata in `docs/TASKS/EVIDENCE/TASK-002/README.md` indicando solo verifiche documentali realmente eseguite.
- Futura execution: deve registrare file toccati, check reali, output sintetico, `NOT_RUN` motivati e rischi residui.
- Futura review: deve verificare criteri di accettazione, scope e assenza di secret/dati reali.
- Eventuale fix: deve registrare richieste ricevute, correzioni fatte e check rieseguiti.
- Screenshot, smoke browser, build UI o test runtime vanno dichiarati solo se eseguiti davvero.
- Nessun `PASS` va scritto senza comando o metodo reale associato.

## Condizioni future di fase

- `PLANNING`: completata prima dell'approvazione utente.
- `EXECUTION`: completata con UI statica, evidence aggiornata e check reali.
- `REVIEW`: fase attuale; deve verificare execution, criteri di accettazione, scope e rischi residui.
- `FIX`: ammessa solo dopo review con richieste puntuali e limitate.
- `DONE`: ammesso solo dopo review positiva, evidence coerente e conferma esplicita dell'utente.
- Se una fase richiede Supabase, auth, schema, dati reali o azioni admin, fermare `TASK-002` e spostare il lavoro al task futuro corretto.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Shell admin statica renderizzata senza errori. | RUNTIME/BUILD | `PASS` |
| CA-02 | Sidebar e topbar presenti. | UI STATIC | `PASS` |
| CA-03 | Pagine platform principali presenti come placeholder dichiarati. | UI STATIC | `PASS` |
| CA-04 | Nessun Supabase/client DB introdotto. | STATIC | `PASS` |
| CA-05 | Nessun dato reale o secret. | STATIC | `PASS_WITH_NOTES` |
| CA-06 | Layout leggibile desktop/tablet. | VISUAL | `PASS` |
| CA-07 | `npm run verify` passa o e registrato con esito corretto. | STATIC/BUILD | `PASS` |
| CA-08 | `git diff --check` passa. | STATIC | `PASS` |
| CA-09 | Scope limitato a `Platform Admin UI Shell`. | MANUAL | `PASS_WITH_NOTES` |
| CA-10 | Safe Operations presenti solo come placeholder disabled/non operativo. | UI STATIC/SECURITY | `PASS` |
| CA-11 | Nessuna nuova dipendenza introdotta senza approvazione esplicita. | STATIC | `PASS` |
| CA-12 | `npm audit` analizzato senza vulnerabilita prod/runtime bloccanti non risolte. | SECURITY | `PASS` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|---|
| CA-01 | RUNTIME/BUILD | `npm run verify` e apertura locale se necessaria | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `BLOCKED` | Report execution o evidence futura `TASK-002` |
| CA-02 | UI STATIC | Lettura componenti e smoke visivo | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | Report execution o evidence futura `TASK-002` |
| CA-03 | UI STATIC | Lettura route/pagine e smoke visivo | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | Report execution o evidence futura `TASK-002` |
| CA-04 | STATIC | `rg "supabase|createClient|service_role|anon" src package.json` se pertinente | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `NOT_RUN` | Report execution o evidence futura `TASK-002` |
| CA-05 | STATIC | Secret scan o ricerca mirata privacy-safe | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `BLOCKED` | Report execution o evidence futura `TASK-002` |
| CA-06 | VISUAL | Browser/Chrome smoke test desktop/tablet quando UI esiste | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `BLOCKED` / `NOT_RUN` | Screenshot/report futuro |
| CA-07 | STATIC/BUILD | `npm run verify` | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `BLOCKED` / `NOT_RUN` | Report execution o evidence futura `TASK-002` |
| CA-08 | STATIC | `git diff --check` | `PASS` / `FAIL` / `BLOCKED` | Report execution o evidence futura `TASK-002` |
| CA-09 | MANUAL | Review file modificati e diff | `PASS` / `PASS_WITH_NOTES` / `FAIL` | Report execution o review futura |
| CA-10 | UI STATIC/SECURITY | Lettura UI e smoke visivo se disponibile | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `BLOCKED` / `NOT_RUN` | Report execution o review futura |
| CA-11 | STATIC | `git diff package.json package-lock.json` e review diff | `PASS` / `PASS_WITH_NOTES` / `FAIL` / `NOT_APPLICABLE` | Report execution o review futura |
| CA-12 | SECURITY | `npm audit --json` e, se serve, `npm audit fix --dry-run` | `PASS` / `PASS_WITH_NOTES` / `CHANGES_REQUIRED` / `BLOCKED` | Evidence `TASK-002` review finale |

## Matrice test/check

| Test | Tipo | Quando eseguirlo | PASS | FAIL | BLOCKED | NOT_RUN |
|---|---|---|---|---|---|---|
| `npm run verify` | STATIC/BUILD | Dopo futura implementazione UI | Exit code 0 | Lint/typecheck/build falliscono | Tool non disponibile o ambiente rotto | Non pertinente in solo planning, con motivo |
| `npm run lint` | STATIC | Se `verify` non e disponibile o per debug mirato | Exit code 0 | Errori ESLint | Tool non disponibile | Coperto da `verify` o non pertinente, con motivo |
| `npm run typecheck` | STATIC | Se `verify` non e disponibile o per debug mirato | Exit code 0 | Errori TypeScript | Tool non disponibile | Coperto da `verify` o non pertinente, con motivo |
| `npm run build` | BUILD | Se opportuno o incluso da `verify` | Exit code 0 | Errore build | Tool non disponibile | Non pertinente in solo planning, con motivo |
| `git diff --check` | STATIC | Dopo modifiche | Exit code 0 senza output | Whitespace error | Git non disponibile | Vietato o non pertinente, con motivo |
| `git status --short` | STATIC | Prima e dopo modifiche | Mostra solo modifiche attese | Mostra modifiche non correlate non spiegate | Git non disponibile | Vietato o non pertinente, con motivo |
| `git status --short --untracked-files=all` | STATIC | Dopo modifiche e prima di handoff | Mostra modifiche attese e spiega eventuali preesistenti | Mostra modifiche non correlate non spiegate | Git non disponibile | Vietato o non pertinente, con motivo |
| Smoke visivo Browser/Chrome | VISUAL | Solo quando verra implementata UI reale | UI caricata e leggibile | UI non carica, layout rotto o overlap evidente | Tool non disponibile | `NOT_RUN` se task resta solo planning |
| `npm audit --json` | SECURITY | Review finale o dopo modifiche dipendenze | Nessuna vulnerabilita bloccante | Vulnerabilita prod/runtime rilevante non risolta | Fix sicuro non disponibile o decisione dipendenze richiesta | Non pertinente solo se nessuna dipendenza cambia e motivato |

## Criteri stato check

- `PASS`: verifica eseguita con esito positivo e output/metodo registrato.
- `PASS_WITH_NOTES`: verifica positiva con note, warning non bloccanti o worktree gia sporca ma spiegata.
- `FAIL`: verifica eseguita con errore reale o criterio non soddisfatto.
- `BLOCKED`: verifica non completabile per causa esterna o tool necessario non funzionante.
- `NOT_RUN`: verifica non eseguita con motivo esplicito.
- `NOT_AVAILABLE`: tool, script o ambiente richiesto non disponibile.
- `NOT_APPLICABLE`: verifica non pertinente allo scope corrente.

## Safety gates

- Nessun secret nel repository.
- Nessuna chiave Supabase segreta nel client/browser.
- Nessun service role nel client/browser.
- Nessun dato reale, token, credenziale o password hardcoded.
- Nessuna dipendenza nuova senza approvazione esplicita.
- Nessuna UI fuori dallo scope approvato per `TASK-002`.
- Nessun task futuro attivato automaticamente.
- Nessun `PASS` senza comando o metodo realmente eseguito.
- Safe operations solo placeholder disabled/non operativo.
- Dati placeholder solo sintetici e privacy-safe.
- Tabelle statiche predisposte per paginazione futura senza implementare paginazione reale o fetch.
- `TASK-001` resta `DONE` salvo nuova decisione esplicita dell'utente.
- `TASK-002` puo passare a `DONE` solo con review positiva, check reali ed esplicita conferma utente.

## Decisioni

- Decisioni gia prese:
  - `TASK-002` riguarda solo la `Platform Admin Console`.
  - La futura shell sara statica e senza integrazione dati reale.
  - `POS/Staff` resta fuori scope perche appartiene alla futura `Shop Admin Console`.
  - Browser/Chrome/Figma possono aiutare ma non devono bloccare il task.
- Alternative escluse:
  - Implementare login o auth reale in `TASK-002`.
  - Collegare Supabase o creare schema/migration in `TASK-002`.
  - Creare CLI custom per orchestrare task o tooling.
  - Usare Vercel deploy durante `TASK-002`.
- Rischi accettati:
  - La prima UI potra usare placeholder statici finche `TASK-003` non definisce tipi e mock sintetici separati.
  - Smoke visivo puo essere `NOT_RUN` se gli strumenti browser non sono disponibili, ma va motivato.
  - La mappa route candidata potra cambiare se la struttura App Router reale lo richiede, ma la motivazione va documentata nell'handoff.

## Planning

- Obiettivo compreso: preparare un task execution piccolo e verificabile per la prima shell statica della `Platform Admin Console`.
- Piano minimo per futura execution:
  1. Rileggere Master Plan, task attivo e documentazione Next.js pertinente prima di toccare codice Next.js.
  2. Verificare baseline con `git status --short`, `git diff --stat` e `git diff --check`.
  3. Implementare solo shell e placeholder statici della `Platform Admin Console`.
  4. Evitare Supabase, login, DB, API, CRUD, dati reali, CLI custom e nuove dipendenze.
  5. Eseguire `npm run verify`, `git diff --check` e `git status --short --untracked-files=all`.
  6. Se UI reale esiste e strumenti disponibili, eseguire smoke visivo Browser/Chrome desktop/tablet; altrimenti registrare `NOT_RUN`, `NOT_AVAILABLE` o `BLOCKED` con motivo.
  7. Preparare handoff verso `REVIEW` con file toccati, criteri, evidence, rischi residui e prossima fase.
- Safety gates:
  - Se serve una dipendenza nuova, fermare execution e chiedere approvazione esplicita.
  - Se emerge necessita di tipi/mock business estesi, spostarla a `TASK-003`.
  - Se emerge necessita di schema/auth/Supabase, spostarla a `TASK-004` o successivo.
  - Se emerge necessita di dati reali read-only, spostarla a `TASK-005`.
  - Se emerge necessita di azioni admin reali o scritture, spostarla a `TASK-006`.
- Follow-up candidati separati:
  - `TASK-003 - Platform Admin Domain Types + Mock`.
  - `TASK-004 - Supabase Schema Discovery / Planning`.
  - `TASK-005 - Platform Admin Read-only Data`.
  - `TASK-006 - Platform Admin Controlled Actions`.
  - Smoke visuale piu strutturato o Playwright, se richiesto in task dedicato.

## Execution

- Stato: completata e pronta per review.
- Motivo: utente ha approvato il passaggio da `PLANNING` a `EXECUTION`.
- File controllati:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-002-platform-admin-ui-shell.md`
  - `docs/TASKS/EVIDENCE/TASK-002/README.md`
  - guide Next.js locali in `node_modules/next/dist/docs/`
  - `src/app/**`
- Modifiche fatte:
  - aggiunta shell statica `Platform Admin Console` con sidebar, topbar, skip link e area contenuto;
  - aggiunte route statiche `/`, `/platform`, `/platform/users`, `/platform/shops`, `/platform/audit`, `/platform/system`, `/platform/operations`;
  - aggiunti componenti platform dedicati e dati placeholder sintetici;
  - aggiunta pagina `Safe Operations` con controlli disabled/non operativi;
  - aggiornati metadata e stile globale base senza nuove dipendenze.
- Check eseguiti:
  - `npm run verify`: `PASS`;
  - `git diff --check`: `PASS`;
  - scan statico secret/Supabase scoped: `PASS_WITH_NOTES`, solo riferimenti policy in docs;
  - smoke HTTP locale `/platform` e `/platform/operations`: `PASS`;
  - smoke visuale Browser/Chrome: inizialmente `BLOCKED`, poi risolto in fix con Playwright.
- Rischi rimasti:
  - screenshot/report Playwright sono ignorati e non vanno committati salvo richiesta esplicita;
  - axe accessibility non installato; resta follow-up opzionale per audit piu profondo;
  - worktree gia sporca con modifiche documentali preesistenti fuori scope.
- Handoff: fase spostata a `REVIEW`; Codex non marca `TASK-002` come `DONE`.

## Review

- Data review finale: `2026-05-30`.
- Verdict finale: `PASS_WITH_NOTES`.
- Decisione `DONE`: applicata dopo conferma esplicita dell'utente e risoluzione del blocker audit.
- Conferma utente: presente nel prompt "RIvolvi direttamente il problema per mettere fino a DONE".
- Evidence verificata:
  - UI statica `Platform Admin Console` implementata nello scope.
  - Route principali presenti e verificate con Playwright desktop/tablet.
  - Safe Operations disabilitate e non operative.
  - Nessun Supabase, auth, DB, API, CRUD o dato reale introdotto.
  - Check statici/build/UI passano.
- Problema bloccante risolto:
  - `npm audit --json` inizialmente usciva con code `1` e segnalava 2 vulnerabilita moderate su `next` e `postcss`.
  - `npm view next version` e `npm view eslint-config-next version` hanno confermato che la versione stabile disponibile resta `16.2.6`.
  - `npm audit fix --dry-run` indicava solo fix forzato/breaking tramite `next@9.3.3`, quindi non e stato applicato.
  - Aggiunto override npm mirato `next -> postcss@8.5.10` e rigenerato lockfile con `npm install` senza `--force`.
  - `npm audit --json` finale esce con code `0` e 0 vulnerabilita.
- Correzioni fatte durante review:
  - aggiunti metadata descrittivi route-level per `/`, `/platform`, `/platform/users`, `/platform/shops`, `/platform/audit`, `/platform/system`, `/platform/operations`;
  - rafforzato focus visibile sul target `#platform-content` dello skip link;
  - aggiornato Playwright smoke per verificare anche il titolo pagina per ogni route.
- Check review/fix finale:
  - `npm run verify`: `PASS_WITH_NOTES`, exit code 0; lint/typecheck/build passano, warning Node `DEP0205` non bloccante;
  - `npm run test:ui-smoke`: `PASS_WITH_NOTES`, exit code 0; 20 test passati su Chromium desktop/tablet, warning `DEP0205`/`NO_COLOR` non bloccanti;
  - `npm run verify:full`: `PASS_WITH_NOTES`, exit code 0; include verify e smoke Playwright, 20 test passati;
  - `git diff --check`: `PASS`, exit code 0 senza output;
  - secret/static scan scoped: `PASS_WITH_NOTES`, solo match documentali/policy su `.env` e marker vietati, nessun secret runtime;
  - review statica Supabase: `PASS`, nessun match in `src/app`, `src/components/platform`, `package.json`, `playwright.config.ts` o `tests/e2e`;
  - `npm audit --json`: `PASS`, exit code 0, 0 vulnerabilita;
  - `npm audit fix --dry-run`: eseguito prima del fix, confermava solo fix via `--force`; non applicato.
- Condizioni minime per entrare in `REVIEW`: soddisfatte.
- Condizioni per passare a `DONE`: soddisfatte dopo fix audit, check completi, review positiva e conferma esplicita dell'utente.

## Fix

- Richieste di fix ricevute:
  - installare e configurare un harness Playwright minimo per smoke visuale/browser della `Platform Admin Console`;
  - mantenere `TASK-002` in `REVIEW`, non `DONE`;
  - non introdurre Supabase, login, DB, API, CRUD, Shop Admin, POS/Staff o nuove funzionalita prodotto.
- Correzioni fatte:
  - installato `@playwright/test` come dev dependency;
  - installato browser Chromium con `npx playwright install chromium`;
  - aggiunti script npm `test:e2e`, `test:e2e:headed`, `test:e2e:ui`, `test:ui-smoke`, `playwright:install`, `verify:full`;
  - aggiunto `playwright.config.ts` con Chromium desktop/tablet e `webServer` su `npm run dev`;
  - aggiunto `tests/e2e/platform-admin.spec.ts`;
  - aggiornato `.gitignore` per `playwright-report/` e `test-results/`;
  - lasciato `@axe-core/playwright` a follow-up, per evitare dipendenza extra e falsi positivi nello smoke minimo.
- Check rieseguiti:
  - `npm run test:ui-smoke`: `PASS_WITH_NOTES`, 20 test passati; warning Node/NO_COLOR non bloccanti;
  - `npm run verify`: `PASS_WITH_NOTES`, build con warning Node `DEP0205` non bloccante;
  - `git diff --check`: `PASS`;
  - secret/static scan scoped: `PASS_WITH_NOTES`, solo match policy/documentali;
  - `git status --short --untracked-files=all`: `PASS_WITH_NOTES`, modifiche attese.
- Rischi residui del fix:
  - `@axe-core/playwright` non installato; resta follow-up opzionale.
- Stato finale fix: `PASS_WITH_NOTES`; `TASK-002` e stato poi chiuso in `DONE` dopo risoluzione audit e conferma utente.

### Fix audit npm

- Richiesta ricevuta:
  - risolvere direttamente il blocker audit per portare `TASK-002` a `DONE`.
- Correzioni fatte:
  - verificato che `next@latest` ed `eslint-config-next@latest` sono `16.2.6`;
  - aggiunto override npm mirato per sostituire la transitiva vulnerabile `postcss` di `next` con `8.5.10`;
  - eseguito `npm install` senza `--force`, aggiornando `package-lock.json`;
  - puliti output generati ignorati: `.next`, `playwright-report`, `test-results`.
- Check rieseguiti:
  - `npm audit --json`: `PASS`, exit code 0, 0 vulnerabilita;
  - `npm run verify`: `PASS_WITH_NOTES`, exit code 0, warning Node `DEP0205` non bloccante;
  - `npm run test:ui-smoke`: `PASS_WITH_NOTES`, exit code 0, 20 test passati, warning `DEP0205`/`NO_COLOR` non bloccanti;
  - `npm run verify:full`: `PASS_WITH_NOTES`, exit code 0, 20 test Playwright passati;
  - `git diff --check`: `PASS`, exit code 0 senza output;
  - secret/static scan scoped: `PASS_WITH_NOTES`, solo match documentali/policy;
  - review statica Supabase: `PASS`, nessun client/API/auth/Supabase introdotto.
- Rischi residui:
  - override `postcss` da rivalutare quando Next pubblichera una versione stabile con dipendenza aggiornata nativamente;
  - warning Node `DEP0205` non bloccante resta nel toolchain.

## Chiusura

- Stato finale: `DONE`
- Conferma utente: conferma esplicita ricevuta nel prompt "RIvolvi direttamente il problema per mettere fino a DONE".
- Data chiusura: `2026-05-30`
- Follow-up aperti:
  - rimuovere l'override `postcss` quando Next aggiornera nativamente la dipendenza vulnerabile;
  - `@axe-core/playwright` resta follow-up opzionale, non blocker rispetto al problema audit.
