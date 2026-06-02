# TASK-032 - Full project progression mega-task

## Informazioni generali

- ID: `TASK-032`
- Titolo: `Full project progression mega-task: baseline, Shop Admin polish, Excel hardening, permissions, local POS E2E, non-production HTTPS, POS closure and sales sync foundation`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Milestone interna: `FASE_6_HTTPS_NON_PRODUCTION_BLOCKED`
- Responsabile attuale: `USER_REVIEW`
- Data apertura progetto: `2026-06-02`
- Data locale macchina in apertura: `2026-06-01 23:00:34 -04`
- Branch Admin Web: `codex/task-032-full-project-progression`
- Evidence: `docs/TASKS/EVIDENCE/TASK-032/README.md`
- Verdict corrente: `PASS_WITH_NOTES_PHASE_5_COMPLETE_PHASE_6_BLOCKED`
- Stage: `COMPLETED_IN_HANDOFF_BRANCH`
- Commit: `COMPLETED_IN_HANDOFF_BRANCH`
- Push: `COMPLETED_IN_HANDOFF_BRANCH`

## Contesto

TASK-032 e un mega-task unico richiesto esplicitamente dall'utente. Anche se le aree sarebbero normalmente task separati, il tracking ufficiale resta `TASK-032`; le parti interne sono trattate come fasi e milestone, non come task ufficiali nuovi.

Baseline nota:

- TASK-030 e chiuso come `DONE_RECONCILED_WITH_NOTES`.
- Vercel e parcheggiato: Git Integration scollegata, `vercel.json` mantiene `git.deploymentEnabled=false`, nessun deployment e nessun alias attivo.
- TASK-029 resta bloccato finche manca una vera URL HTTPS Preview/non-production.
- TASK-022_023 resta `REVIEW` / `PASS_WITH_NOTES_READY_FOR_REVIEW` con `PARKED_E2E_PENDING`.
- TASK-024 sales sync resta `DEFERRED` finche la pianificazione e i gate TASK-032 non lo rendono sicuro.
- Win7POS deve continuare a comunicare con Admin Web POS API, mai direttamente con Supabase.
- POS/Staff resta modulo della Shop Admin Console.
- Il dominio business resta basato su `shops`, senza introdurre `merchant -> stores`.

## Scope

Fasi interne autorizzate:

1. Baseline/handoff cleanup post-Vercel/post-Win7POS.
2. Shop Admin operational polish non-deploy.
3. Supplier Excel workflow hardening.
4. Shop roles and permissions hardening.
5. Local POS E2E harness senza staging pubblico.
6. Ambiente HTTPS non-production alternativo.
7. Riconciliazione TASK-029 e TASK-022_023 se i gate passano.
8. POS sales sync planning.
9. Win7POS sales sync foundation solo se planning, schema, endpoint e test strategy sono sicuri.
10. Stato mobile Android/iOS read-only se non toccati.
11. Evidence, cleanup, eventuali commit/push atomici e handoff finale.

## Fuori scope e divieti

- Non usare Vercel production come staging.
- Non ricollegare Git Integration Vercel corrente senza gate esplicito.
- Non fare deploy production.
- Non leggere o registrare valori env/secret decriptati.
- Non inserire service-role, token o secret nel browser/client o in Win7POS.
- Non usare dati clienti reali.
- Non implementare sync bidirezionale catalogo o editing catalogo dal POS.
- Non modificare Android/iOS runtime salvo necessita esplicita documentata.
- Non introdurre nuove dipendenze senza motivo forte e documentato.
- Non fare grandi refactor non necessari.
- Non dichiarare `DONE`, `production-ready`, `staging-ready`, `sales-sync-ready` o `E2E passed` senza gate reali.

## Stop condition

- Se l'HTTPS non-production non e ottenibile senza production o senza segreti/account mancanti, classificare fase 6 come `BLOCKED` e non chiudere TASK-029.
- Se sales sync non ha schema, endpoint, idempotency e test strategy sicuri, fermare la fase 9 a `BLOCKED_SALES_SYNC_FOUNDATION_NOT_READY` o `SALES_SYNC_PLANNED_ONLY`.
- Se un check fallisce per causa correggibile nello scope, correggere e rieseguire.
- Se un check fallisce per ambiente o segreto non disponibile, registrare `BLOCKED` o `NOT_RUN` con motivo preciso.

## Criteri di accettazione

- Ogni fase registra evidence con comandi realmente eseguiti o motivazioni `NOT_RUN`/`BLOCKED`.
- Nessun secret in diff, evidence o log salvati.
- Nessun file staged inatteso.
- Admin Web e Win7POS restano separati per commit/push.
- `vercel.json` mantiene `git.deploymentEnabled=false` finche Vercel resta parcheggiato.
- Handoff finale include file toccati, criteri, evidence, rischi residui, stato Git e prossima fase.
- Codex prepara handoff verso `REVIEW`; non marca `DONE`.

## Stato fasi

| Fase | Stato corrente | Note |
| --- | --- | --- |
| 0 - Pre-flight | `PASS` | Baseline locale e Vercel read-only eseguite; TASK-032 aperto ufficialmente. |
| 1 - Baseline/handoff cleanup | `PASS_WITH_NOTES` | Gate base Admin Web e Win7POS passati; fix mirato alle whitelist governance per TASK-032. |
| 2 - Shop Admin polish | `PASS_WITH_NOTES` | Filtri e ID catalogo rifiniti; test statici/build passati. Browser smoke autenticato bloccato da sessione locale assente. |
| 3 - Excel hardening | `PASS_WITH_NOTES` | Aggiunta validazione SKU duplicati, test sintetici header/alias/injection/numeri e Drive discovery read-only. `.xls` resta conversione esterna/follow-up. |
| 4 - Permissions hardening | `PASS_WITH_NOTES` | Action context ora nega `shop_id` non autorizzati invece di ricadere sullo shop selezionato; test matrix owner/manager/viewer/POS staff aggiunti. |
| 5 - Local POS E2E harness | `PASS_LOCAL_POS_E2E_WITH_CLEANUP` | Stack Supabase temporaneo isolato con migration applicate, dataset sintetico `TASK032_*`, first-login/trusted device/heartbeat/catalog full/tombstone/restore passati; cleanup eseguito e verificato con zero residui attivi. Review/fix finale: harness rafforzato per non stampare credenziali URL in errori startup. |
| 6 - HTTPS non-production | `BLOCKED_HTTPS_NON_PRODUCTION_MISSING` | Nessun endpoint HTTPS non-production reale ottenuto in questa execution; Vercel corrente resta bloccato/parcheggiato e non viene usato come staging. |
| 7 - TASK-029/TASK-022_023 reconciliation | `BLOCKED_DEPENDS_ON_PHASE_6` | Non riconciliata perche manca URL HTTPS non-production reale e run Win7POS live su tale URL. |
| 8 - Sales sync planning | `DEFERRED_NOT_STARTED` | Non avviata: il gate HTTPS non-production resta bloccato e non esiste ancora piano sicuro schema/endpoint/idempotency/test strategy. |
| 9 - Sales sync foundation | `DEFERRED_NOT_STARTED` | Non consentita senza fase 8 e gate. Nessun runtime sales sync implementato. |
| 10 - Mobile status | `NOT_TOUCHED` | Android/iOS non modificati. |
| 11 - Evidence/cleanup/handoff | `REVIEW_HANDOFF_PREPARED` | Evidence e Master Plan aggiornati per review; Codex non marca `DONE`. |

## Handoff corrente

- Prossima milestone immediata: sbloccare fase 6 con un ambiente HTTPS non-production alternativo senza usare Vercel production e senza ricollegare Git Integration.
- Stato consigliato corrente TASK-032: `REVIEW` / `PASS_WITH_NOTES_PHASE_5_COMPLETE_PHASE_6_BLOCKED`.
- Stato consigliato corrente TASK-029: resta `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT` / `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION` finche non esiste un HTTPS non-production reale.
- Stato consigliato corrente TASK-022_023: resta `PASS_WITH_NOTES_READY_FOR_REVIEW` / `PARKED_E2E_PENDING`.
- Stato consigliato corrente TASK-024: resta `DEFERRED`.
- Security review finale: Codex Security diff scan completato in `/tmp/codex-security-scans/merchandise-control-admin-web/18116bc_20260601235207/report.md`; un finding reale locale (`TASK032-URL-CREDS-LEAK`) e stato corretto e validato, nessun finding reportable resta aperto nello scope TASK-032.
