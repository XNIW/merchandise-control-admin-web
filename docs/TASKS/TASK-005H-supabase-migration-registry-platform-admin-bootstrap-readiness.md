# TASK-005H - Supabase Migration Registry / Platform Admin Bootstrap Readiness

## Informazioni generali

- ID: `TASK-005H`
- Titolo: Supabase Migration Registry / Platform Admin Bootstrap Readiness
- Stato: `ACTIVE`
- Fase attuale: `PLANNING`
- Responsabile attuale: `USER / PLANNING`
- Data apertura: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`

## Dipendenze

- Documenti da leggere:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-005G-supabase-end-to-end-execution.md`
  - `docs/TASKS/EVIDENCE/TASK-005G/README.md`
- Task precedenti:
  - `TASK-005D - Supabase Schema / Auth Boundary Decision`
  - `TASK-005E - Supabase Foundation Execution`
  - `TASK-005F - Supabase Schema / RLS / Auth SSR Planning`
  - `TASK-005G - Supabase End-to-End Execution`
- Decisioni ADR rilevanti:
  - `shops` resta root aziendale/negozio.
  - `platform_admin` resta autorizzazione server-side, non derivata da client state o metadata utente.
- Dipendenze tecniche:
  - Supabase CLI collegata al progetto remoto.
  - Migration `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql`.
  - Tabelle Admin Web create in `TASK-005G`.

## Scopo

Preparare un passaggio controllato dopo `TASK-005G` per:

- riconciliare migration history/registry prima di usare `supabase db push` come gate standard;
- definire il bootstrap sicuro del primo `platform_admin` reale;
- mantenere `TASK-005` bloccato finche i gate di sicurezza e session lifecycle non sono verificati.

## Contesto

`TASK-005G` ha applicato lo schema Admin Web via query diretta perche `supabase db push --linked --dry-run` era bloccato da migration history remota preesistente fuori repo. La migration SQL e presente in questa repo, ma il registry remoto va riconciliato prima di considerare affidabile il workflow standard `db push`.

In parallelo, la console live richiede un primo `platform_admin` reale, ma quel bootstrap non puo essere hardcoded, non puo esporre service-role key e non deve introdurre PII o secret nel repository.

## Non incluso

- Repair distruttivo o riscrittura cieca della migration history remota.
- Seed permanente non approvato.
- Hardcode di email, user id, token, password, service-role key o secret.
- Service-role key nel client/browser.
- Login UI.
- Session lifecycle completo.
- CRUD Admin Web o mutazioni applicative generiche.
- Apertura execution `TASK-005`.
- Modifiche Android/iOS/POS.

## File potenzialmente coinvolti

- Documentazione:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-005H-supabase-migration-registry-platform-admin-bootstrap-readiness.md`
  - eventuale `docs/TASKS/EVIDENCE/TASK-005H/README.md`
- Configurazione:
  - `supabase/config.toml`
  - `supabase/migrations/*`
- Codice:
  - solo se serve un harness read-only o uno script locale non secret-bearing.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Inventario non distruttivo di migration history locale/remota documentato. | STATIC / MANUAL | `PLANNED` |
| CA-02 | Strategia di riconciliazione registry definita prima di riabilitare `supabase db push`. | MANUAL | `PLANNED` |
| CA-03 | Bootstrap primo `platform_admin` definito con input espliciti e senza hardcode di PII/secret. | MANUAL / STATIC | `PLANNED` |
| CA-04 | Safety gate service-role/client/browser/RLS/audit/rollback documentati. | STATIC | `PLANNED` |
| CA-05 | Nessuna apertura di `TASK-005` finche bootstrap, session lifecycle e registry non sono verificati. | MANUAL | `PLANNED` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|---|
| CA-01 | STATIC / MANUAL | `supabase migration list --linked` o comando equivalente non distruttivo | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Sintesi redatta senza secret/project ref sensibili. |
| CA-02 | MANUAL | Review della strategia proposta prima di qualunque repair | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Decisione tracciata nel task/evidence. |
| CA-03 | MANUAL / STATIC | Metodo bootstrap con placeholder e input utente espliciti | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` | Nessun user id/email reale hardcoded in repo. |
| CA-04 | STATIC | `npm run security:scan` e review diff | `PASS` / `PASS_WITH_NOTES` / `FAIL` | Scan e diff senza secret/client service-role. |
| CA-05 | MANUAL | Master Plan e task tracking | `PASS` / `PASS_WITH_NOTES` | `TASK-005` resta `PLANNED_BLOCKED`. |

## Matrice test/check

| Test | Tipo | Quando eseguirlo | PASS | FAIL | BLOCKED | NOT_RUN |
|---|---|---|---|---|---|---|
| `npm run security:scan` | STATIC | Se vengono toccati script/config/codice | Nessun secret o service-role client | Match reale non giustificato | Dipendenze mancanti | Task solo planning senza file runtime |
| `npm run test:foundation` | STATIC | Se vengono toccati boundary Supabase o schema checks | Test passano | Regressione harness | Dipendenze mancanti | Task solo planning |
| `npm run verify` | BUILD / STATIC | Se vengono toccati codice o config runtime | Lint/typecheck/security/build passano | Errore reale | Dipendenze mancanti | Task solo documentale |
| `supabase migration list --linked` | STATIC remoto | Prima di qualunque strategia registry | Inventory ottenuto | Errore comando | Pooler/circuit breaker/auth | Non richiesto da planning iniziale |

## Decisioni

- Decisioni gia prese:
  - `TASK-005G` e approvato tecnicamente con review `PASS_WITH_NOTES`.
  - `TASK-005` resta `PLANNED_BLOCKED`.
  - Il bootstrap `platform_admin` deve essere server-managed e non client-side.
- Alternative escluse:
  - riparare la history remota alla cieca;
  - committare dati reali o identificativi utente;
  - introdurre service-role key nel browser.
- Rischi accettati:
  - finche il registry non e riconciliato, `supabase db push` non e un gate affidabile per questa repo.

## Planning

- Obiettivo compreso:
  - separare registry/bootstrap da `TASK-005` read-only live.
- Piano minimo:
  - inventario non distruttivo migration history;
  - proposta di riconciliazione;
  - proposta bootstrap primo `platform_admin`;
  - safety gate e handoff.
- Safety gates:
  - nessun secret in repo;
  - nessun dato reale hardcoded;
  - nessuna mutazione remota senza input e approvazione esplicita;
  - rollback/undo documentato prima di qualunque operazione irreversibile.
- Follow-up candidati separati:
  - session lifecycle SSR/middleware;
  - UI login;
  - rivalutazione `TASK-005`.

## Execution

- File controllati:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-005G-supabase-end-to-end-execution.md`
  - `docs/TASKS/EVIDENCE/TASK-005G/README.md`
- Modifiche fatte:
  - task aperto e tracciato come follow-up autorizzato.
- Check eseguiti:
  - `git diff --check`: `PASS`
  - `npm run test:foundation`: `PASS`, 9 test passati.
  - `npm run verify:full`: `PASS_WITH_WARNINGS`, include lint, typecheck, security scan, build e 20 smoke test Playwright passati. Warning non bloccanti: Node `DEP0205`, `NO_COLOR`/`FORCE_COLOR`, Next dev origin/HMR.
- Rischi rimasti:
  - input bootstrap primo `platform_admin` non ancora fornito;
  - migration history remota non ancora riconciliata.
- Handoff:
  - `TASK-005H` resta in `PLANNING`.
  - Nessuna mutazione remota Supabase eseguita in questo handoff.
  - Nessun bootstrap reale `platform_admin` eseguito senza input esplicito dell'utente.

## Review

- Decisione: `PENDING`
- Evidence verificata: `PENDING`
- Problemi: `PENDING`
- Condizioni per passare a `DONE`: review positiva e conferma esplicita dell'utente.

## Fix

- Richieste di fix ricevute: nessuna.
- Correzioni fatte: nessuna.
- Check rieseguiti: `NOT_RUN`.

## Chiusura

Da compilare solo dopo review positiva e conferma esplicita dell'utente.

- Stato finale: `PENDING`
- Conferma utente: `PENDING`
- Data chiusura: `PENDING`
- Follow-up aperti: `PENDING`
