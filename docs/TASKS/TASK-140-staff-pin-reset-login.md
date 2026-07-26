# TASK-140 - Staff PIN reset e Shop Code login

## Informazioni generali

- ID: `TASK-140`
- Titolo: `Staff PIN reset e Shop Code login`
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `COMPLETED`
- Data apertura: `2026-07-18`
- Data chiusura: `2026-07-26`
- Branch: `codex/task-140-staff-pin-reset-login`
- Worktree:
  `/Users/minxiang/.codex/worktrees/task-140-20260718/admin`
- Baseline: `origin/main` a
  `c30cf3f2b44e1bf67a2c3bcbdcd0b2cc6a9328a4`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-140/README.md`

## Autorizzazione e governance

Il prompt utente del `2026-07-18` autorizza questo fix P0 nell'Admin Web e la
relativa migration locale. L'addendum P0.5 dello stesso giorno rende inoltre
obbligatoria, dopo i gate locali, l'acceptance sullo staging pubblico reale e
autorizza esclusivamente su quel target non-production la migration e il
deploy necessari. La scansione globale dei task ha confermato che `TASK-140`
e il primo ID libero. Il checkout principale dirty e preservato; l'esecuzione
avviene nel worktree pulito indicato sopra.

Codex prepara l'handoff verso `REVIEW` e non marca il task `DONE`. Non sono
autorizzati commit, push, merge, deploy production o apply production. Ogni
operazione staging resta subordinata a verifica esplicita del progetto
non-production, guardrail, dry-run e cleanup delle sole fixture sintetiche.

I gate locali, l'apply della migration additiva P1, il redeploy Worker e l'E2E
finale sullo staging non-production sono stati completati con target guard
esatto e cleanup sintetico a zero. I pgTAP correnti e il DB lint linked sono
verdi. La precedente acceptance Google autenticata resta evidence storica
della build pre-review; la build corrente ha una acceptance Playwright propria
`1/1 PASS`. Il task resta in `REVIEW`, mai `DONE` senza conferma esplicita
dell'utente. La conferma è stata poi ricevuta il `2026-07-26`; la sezione
finale di questo documento registra la transizione autorizzata a `DONE`.

## Obiettivo

Correggere il contratto delle nuove credenziali numeriche staff e rendere
effettivamente utilizzabili i PIN generati dai flussi Shop Admin e Master:

- ogni nuovo PIN POS generato da create, reset, recovery e future rotation e
  composto da esattamente `6` cifre;
- gli zeri iniziali sono validi e preservati;
- password alfanumeriche e PIN numerici restano contratti separati;
- le credenziali legacy gia memorizzate con lunghezza diversa continuano a
  essere verificate senza migrazione distruttiva;
- un reset Shop Admin produce una credenziale immediatamente utilizzabile,
  elimina entrambi i domini di lockout e non riattiva implicitamente uno staff
  sospeso;
- la recovery avanzata Master del manager iniziale resta un'operazione
  emergenziale esplicita che riattiva l'account e rende il nuovo PIN
  immediatamente utilizzabile;
- il contratto staging gia esistente per il ruolo built-in `pos_admin` resta
  self-contained nella history canonica, shop-scoped e allineato tra schema,
  provisioning/recovery e permessi staff web.

## Contesto e root cause ricostruita prima delle patch

L'audit statico pre-modifica ha ricostruito i percorsi reali da UI a Server
Action/service/RPC, login web staff e login POS. Il problema non e soltanto la
lunghezza mostrata all'utente: generazione, validazione di hash, flag di stato,
lockout e semantica di sospensione sono divergenti.

### Matrice pre-patch

| Percorso | Generazione/validazione iniziale | Stato dopo operazione | Lockout iniziale | Gap verificato |
|---|---|---|---|---|
| Shop Admin personale: create/reset staff | PIN reset a `8` cifre tramite `randomBytes` con modulo; il ramo `allowTemporaryPin` accetta invece solo `5` cifre | create/reset impostano `rotation_required` e `must_change_credential=true` | reset azzera solo i contatori su `staff_accounts` | il login richiede `active` e `must_change_credential=false`, quindi il PIN consegnato e bloccato; il lockout web separato resta attivo |
| Shop Code manager: create/reset diretto | usa lo stesso generatore divergente del service Shop Admin | reset imposta rotation/must-change e forza `status=active` | non cancella `staff_web_login_attempts` | PIN non utilizzabile e staff sospeso riattivato implicitamente |
| Master: creazione manager iniziale | helper temporaneo genera `5` cifre | credenziale attiva e immediata | nessuna canonicalizzazione a 6 cifre | lunghezza non canonica e tipo numerico registrato come `password` |
| Master: recovery manager iniziale `1001` | helper temporaneo genera `5` cifre | `active`, `must_change_credential=false`, riattivazione intenzionale | azzera lockout staff, non quello web separato | recovery utilizzabile solo se il secondo lockout non blocca; lunghezza/tipo divergenti |
| Shop Code web login | input non vuoto, max 256; verifica hash senza vincolo di lunghezza | ammette solo staff/credenziale attivi e non `must_change` | consulta prima `staff_web_login_attempts`, poi il lockout staff | conferma compatibilita legacy, ma rende visibile la mancata pulizia del doppio lockout |
| POS first login backend | input non vuoto, max 256; verifica hash senza vincolo di lunghezza | stessa eligibility attiva/non-must-change | lockout staff | nessun controllo login va irrigidito a 6 cifre, altrimenti romperebbe le credenziali legacy |

### Contratto canonico deciso

- `STAFF_PIN_LENGTH = 6` server-side.
- Nuovi PIN: `^\d{6}$`, inclusi `000000` e valori con leading zero.
- Generazione crittograficamente uniforme con
  `randomInt(0, 1_000_000).toString().padStart(6, "0")`.
- Vietati `Math.random`, troncamento/modulo di byte casuali e range che
  escludono gli zeri iniziali.
- La validazione stretta a 6 cifre si applica alla creazione/hash di **nuovi**
  PIN, non alla verifica login di hash legacy.
- Le password seguono la policy alfanumerica esistente e non usano il ramo PIN.
- Reset/create non richiedono una first-access rotation finche il prodotto non
  offre un flusso di cambio credenziale collegato: la credenziale consegnata
  deve essere subito utilizzabile.
- Il doppio lockout comprende sia i contatori su `staff_accounts` sia la riga
  deterministica di `staff_web_login_attempts` per shop/staff normalizzati.
- Il reset ordinario preserva `suspended`; la recovery Master puo riattivare
  perche e un'operazione emergenziale esplicita e auditata.

## Dipendenze e riferimenti auditati

- `docs/MASTER-PLAN.md` e task/evidence storici relativi a staff auth,
  Shop Code login e recovery Master;
- `src/server/shop-admin/staff-mutations.ts`;
- `src/server/shop-admin/staff-credentials.ts`;
- `src/server/shop-admin/staff-web-auth.ts`;
- `src/server/shop-admin/staff-aware-mutations.ts`;
- `src/server/platform-admin/temporary-manager-pin.ts`;
- `src/server/platform-admin/staff-manager-provisioning.ts`;
- `src/server/platform-admin/shop-actions.ts`;
- Server Actions e UI Shop Admin/Platform che invocano i service;
- migration canoniche TASK-019, TASK-038, TASK-051 e TASK-068I;
- test foundation, pgTAP ed E2E collegati ai percorsi sopra;
- contratto Win7POS consultato soltanto in modalita read-only.

Prima di modifiche Next.js sono state lette le guide locali Next.js 16 su
mutazioni, data security, `use server`, cookie e Route Handlers. Prima della
migration sono state verificate CLI Supabase e linee guida ufficiali su
funzioni, `SECURITY DEFINER`, `search_path`, grant e pgTAP.

## Scopo incluso

- un unico contratto server-side per generazione e validazione di nuovi PIN;
- allineamento Shop Admin personale e Shop Code manager;
- allineamento provisioning e recovery Master del manager iniziale;
- riallineamento self-contained del ruolo built-in `pos_admin`, del manager
  iniziale `1001` e della matrice permessi POS Admin, senza privilegi platform;
- migration additiva minima per riallineare le RPC/helper canoniche;
- pulizia dei due domini di lockout nei flussi autorizzati;
- preservazione dello stato sospeso nel reset ordinario;
- riattivazione esplicita nella recovery Master;
- regressioni su leading zero, password separata, legacy 5/8 cifre, lockout,
  status e invalidazione sessione/versione;
- test esclusivamente con fixture sintetiche nuove e cleanup fail-closed;
- documentazione ed evidence reali per handoff `REVIEW`.

## Non incluso

- modifiche a Win7POS, Android o iOS;
- migrazione/re-hash massivo delle credenziali legacy;
- esposizione di PIN, password, token o hash in UI, log o evidence;
- service-role nel browser/client;
- refactor auth non necessario al P0;
- nuove dipendenze;
- dati reali o riuso dei valori riportati dall'utente;
- apply/deploy production, commit, stage, push o merge;
- uso dello staging senza target guard, dry-run e cleanup verificato;
- marcatura `DONE` da parte di Codex.

## File potenzialmente coinvolti

- Documentazione:
  - `docs/MASTER-PLAN.md`;
  - `docs/TASKS/TASK-140-staff-pin-reset-login.md`;
  - `docs/TASKS/EVIDENCE/TASK-140/README.md`.
- Codice server:
  - moduli staff credential/mutation/web auth Shop Admin;
  - moduli provisioning/recovery Platform Admin.
- Database:
  - una migration TASK-140 additiva per RPC/helper esistenti;
  - pgTAP TASK-140.
- Test:
  - foundation mirati;
  - Playwright locale/staging exact-guarded con fixture sintetica;
  - security scanner e gate regressione pertinenti.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Tutti i nuovi PIN numerici prodotti dai flussi staff create/reset/recovery sono esattamente 6 cifre e preservano leading zero | unit/foundation + pgTAP + E2E | `PASS_CURRENT_STAGING` |
| CA-02 | Le password alfanumeriche restano separate e seguono la policy esistente | unit/foundation | `PASS_CURRENT` |
| CA-03 | Credenziali legacy sintetiche a 5 e 8 cifre continuano ad autenticarsi; il reset le canonicalizza a 6 cifre | pgTAP/E2E POS e Shop Code | `PASS_CURRENT_STAGING` |
| CA-04 | Create/reset Shop Admin producono credenziali `active`, non `must_change`, immediatamente utilizzabili | pgTAP + Playwright | `PASS_CURRENT_STAGING` |
| CA-05 | Reset e clear-lockout autorizzati cancellano lockout staff e `staff_web_login_attempts`; i failure concorrenti avanzano atomicamente e una richiesta stale non rilocka una credenziale resettata | pgTAP + Playwright | `PASS_CURRENT_STAGING` |
| CA-06 | Il reset ordinario non cambia uno staff `suspended` in `active` | pgTAP + Playwright | `PASS_CURRENT_STAGING` |
| CA-07 | La recovery Master riattiva esplicitamente il manager iniziale, invalida la vecchia credenziale/sessione, elimina entrambi i lockout e abilita subito il nuovo PIN a 6 cifre | pgTAP + Playwright | `PASS_CURRENT_STAGING` |
| CA-08 | Vecchio PIN respinto dopo reset/recovery; nuovo PIN accettato da Shop Code e POS senza esporre valori sensibili o mostrarlo sotto un target diverso | E2E staging | `PASS_CURRENT_STAGING` |
| CA-09 | RPC/helper mantengono authz shop-scoped, audit redatto, `search_path` sicuro, grant minimi e scadenza credenziale su login/session resolver | pgTAP + lint DB + security scan | `PASS_CURRENT_STAGING` |
| CA-10 | Nessun dato reale, secret o valore utente entra in fixture, output persistito o evidence; cleanup residui a zero | audit evidence + cleanup query | `PASS_CURRENT_ZERO_RESIDUE` |
| CA-11 | Win7POS, Android, iOS, production e checkout originale restano intatti | git/status audit | `PASS_LOCAL` |
| CA-12 | Migration e deploy necessari sono applicati soltanto allo staging pubblico verificato non-production, con ID registrato e senza secret | target guard + dry-run + deploy evidence | `PASS_CURRENT_STAGING_ONLY` |
| CA-13 | Creazione/reset/recovery/login staff sintetico passano sullo staging pubblico e tutte le fixture, sessioni e lockout QA sono eliminate | acceptance autenticata staging + cleanup | `PASS_CURRENT_STAGING_ZERO_RESIDUE` |
| CA-14 | `pos_admin` resta shop-scoped, con matrice canonica completa, creazione/delega riservata a owner/platform e recovery `1001` coerente | foundation + pgTAP + contratti staging | `PASS_CURRENT_STAGING` |

## Matrice CA -> evidence

| CA | Comando/metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|
| CA-01, CA-02 | test foundation mirati su contratto/generatore/hash | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | README TASK-140 |
| CA-03, CA-04, CA-05, CA-06, CA-07, CA-09 | pgTAP staging exact-guarded e lint linked `public,app_private` | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | README TASK-140 |
| CA-03, CA-04, CA-05, CA-06, CA-07, CA-08 | Playwright staging exact-guarded, Shop Code + POS + Master recovery | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | README TASK-140 |
| CA-10 | fixture manifest redatto e query cleanup scoped | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | README TASK-140 |
| CA-11 | `git status`, diff scoped e audit sibling read-only | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | README TASK-140 |
| CA-12, CA-13 | target staging, dry-run migration, deploy/smoke pubblico, E2E staff sintetico e cleanup | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | README TASK-140 |
| CA-14 | foundation/pgTAP TASK-140 e query contratti staging redatte | `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` | README TASK-140 |

## Matrice test/check all'handoff corrente

| Test/check | Stato | Nota |
|---|---|---|
| contratto unit/foundation, authz, concorrenza, expiry e target binding | `PASS` | rerun finale repo-only TASK-140 `16/16` |
| manifest pgTAP corrente | `PASS_STATIC_COUNT` | `7` file / `469` assertion pianificate; TASK-140 `228`, DSC sales `38` |
| pgTAP TASK-140 staging dopo fix P1 finale | `PASS` | `228/228` sul target staging exact-guarded |
| pgTAP DSC sales staging dopo fix P1 finale | `PASS` | `38/38`; lock policy e rollback sales verificati |
| reset DB locale dopo fix P1 finale | `NOT_RUN` | stack exact-local storico distrutto; i gate DB correnti sono stati eseguiti sul solo staging autorizzato |
| legacy 5/8, nuovo PIN e doppio lockout runtime DB | `PASS` | coperti dal pgTAP TASK-140 staging corrente `228/228`; E2E browser ancora in corso |
| reset suspended / recovery reactivation e sessione invalidata | `PASS` | DB staging ed E2E Chromium Desktop correnti verdi |
| migration additiva e DB lint correnti | `PASS_STAGING_ONLY` | apply exact-guarded solo staging; lint linked `public,app_private` con `0` errori |
| Playwright TASK-140 dopo fix P1 finale | `PASS` | Chromium Desktop `1/1`, `6.1m`, target staging exact-guarded |
| Playwright recovery TASK-051 | `HISTORICAL_PASS_NOT_RERUN_AFTER_FINAL_P1_FIX` | Chromium Desktop pre-fix `1/1`, `15.5s` |
| Playwright manual platform regression TASK-051 | `HISTORICAL_PASS_NOT_RERUN_AFTER_FINAL_P1_FIX` | Chromium Desktop pre-fix `1/1`, `9.2s`; credenziale effimera generata a runtime |
| typecheck, lint e build Next.js | `PASS` | tutti exit `0`; Next.js `16.2.6` |
| build OpenNext dopo fix P1 finale | `PASS` | artefatto corrente compilato per staging |
| dry-run migration additiva staging | `PASS` | exact target guard e transaction dry-run con rollback prima dell'apply |
| dry-run Wrangler staging | `PASS` | Worker corrente validato prima del deploy |
| security scan mirata TASK-140 | `PASS` | matrice ACL deterministica verificata |
| security scan completa | `BLOCKED_EXTERNAL` | file Win7POS esterno richiesto dal gate non presente |
| i18n check | `BLOCKED_EXTERNAL` | sibling Win7POS/Localization richiesto dal gate non presente |
| `npm run verify` completo | `BLOCKED_EXTERNAL` | blocco sulla security scan completa per `OperatorLoginDialog.xaml.cs` mancante; typecheck/lint/build separati verdi |
| apply migration additiva P1 finale | `PASS_STAGING_ONLY` | `20260719090000_task_140_auth_concurrency_hardening.sql` applicata solo al progetto staging verificato |
| lint DB linked staging | `PASS` | schemi `public,app_private`, `0` errori |
| contratti, ACL e lock health staging | `PASS` | signature 12-arg esatta, overload legacy assente, lifecycle/permission RPC presenti e matrice `pos_admin` canonica |
| artefatto OpenNext corrente | `PASS` | build corrente usata dal Worker staging |
| redeploy Worker staging | `PASS_STAGING_ONLY` | Version ID `0f904fed-1832-4637-ab2a-234d031d8e6b` |
| smoke Worker staging | `PASS_WITH_NOTES` | OAuth mobile `5/5 PASS`; Products `SKIP_CONFIG` per credenziali staging non impostate |
| sessione Google staging in Chrome pre-fix | `HISTORICAL_PASS_SUPERSEDED` | autenticazione confermata senza registrare account ID, dati utente o credenziali |
| acceptance funzionale staff pubblica corrente | `PASS` | E2E staging Chromium Desktop `1/1` in `6.1m` |
| cleanup fixture staging corrente | `PASS_ZERO_RESIDUE` | `auth_users=0`, `profiles=0`, `shops=0`, `staff_accounts=0`, `web_attempts=0` |
| contratti/health exact-local pre-teardown | `HISTORICAL_PASS_SUPERSEDED` | TASK-137/139 e TASK-140 erano verdi prima della migration additiva P1; stack poi distrutto |
| teardown ambiente locale esatto | `PASS` | `supabase stop --no-backup` exit `0`; container/volumi target vuoti e porta `58322` non in ascolto |
| `git diff --check` finale locale | `PASS` | nessun errore whitespace |
| apply/deploy production | `NOT_RUN_OUT_OF_SCOPE` | vietato |
| commit/stage/push/merge | `NOT_RUN_OUT_OF_SCOPE` | vietato |

## Safety gates

- nessuna patch prima della ricostruzione end-to-end e della matrice sopra;
- migration P0 originaria validata sul target locale identificato; migration
  additiva P1 sottoposta a exact target guard e dry-run transazionale con
  rollback, poi applicata soltanto allo staging non-production;
- funzioni `SECURITY DEFINER` con `search_path` esplicito, riferimenti
  qualificati e grant/revoke minimi;
- nessun irrigidimento della validazione di login che rompa hash legacy;
- nessun raw PIN/password nei log, audit metadata, screenshot o evidence;
- fixture con prefisso TASK-140 univoco e cleanup fail-closed;
- stop su mismatch del target Supabase o presenza di runner concorrenti.

## Execution

- Audit statico e matrice pre-patch: `COMPLETED`.
- Worktree/branch isolati: `COMPLETED`.
- Implementazione e verifica locale: `COMPLETED_EXACT_LOCAL_GATES`.
- Ambiente Supabase locale esatto: `DESTROYED_NO_BACKUP`; controlli finali
  contratti/ACL/health verdi, container e volumi target vuoti, porta `58322`
  non in ascolto. I residui disposable non sono recuperabili; staging e
  production non sono stati toccati dal teardown.
- Execution P0.5 storica del 2026-07-18, migration e redeploy staging:
  `COMPLETED`;
  dry-run, history `78/78`, lint linked, contratti/ACL/lock health, artefatto
  congelato, scan sensitive e smoke finale registrati nell'evidence.
- Sessione Google Chrome storica sullo staging: `PASS_AUTHENTICATED`, senza
  identificativi o dati utente persistiti nell'evidence.
- Acceptance funzionale staff pubblica P0.5 storica:
  `PASS_STAGING_AUTHENTICATED_CLEANUP_ZERO`; reset sospeso, reactivation,
  recovery `1001`, login precedente/nuovo, audit, logout e cleanup scoped
  verificati realmente in Chrome e sul database staging.
- Handoff: `REVIEW`, mai `DONE` senza review positiva e conferma esplicita
  dell'utente.
- Addendum final review 2026-07-19: implementazione P1 completata; foundation
  `16/16`, pgTAP staging TASK-140 `228/228`, DSC sales `38/38`, lint DB linked,
  build OpenNext, Worker dry-run, deploy e smoke staging sono reali e verdi.
  La migration additiva e il Worker sono stati applicati esclusivamente al
  target staging exact-guarded. Il P1 di consegna UI one-time e chiuso:
  create/reset non invalidano piu la pagina prima del risultato
  `useActionState` e rendono esiti applicativi espliciti. L'E2E staging finale
  e `PASS 1/1` in `6.1m`, con cleanup aggregate a zero.

## Review

- Decisione: `REVIEW_P1_FIXES_STAGING_ACCEPTANCE_PASS`.
- Evidence corrente: foundation, pgTAP TASK-140/DSC sales, lint DB, lint,
  typecheck, build Next/OpenNext, Worker dry-run/deploy/smoke e security scoped
  `PASS` sul solo staging autorizzato.
- Evidence browser corrente: Chromium Desktop staging `1/1 PASS` in `6.1m`;
  cleanup finale `PASS_ZERO_RESIDUE`.
- Condizioni per `DONE`: review positiva, criteri/evidence verificati e conferma
  esplicita dell'utente.

## Review documentale fresca — 2026-07-21

TASK-140 resta `REVIEW / REVIEW_READY`; Codex non lo marca `DONE`. La review
read-only del diff corrente non ha confermato finding P0/P1.

Gate eseguiti realmente in questo checkpoint:

- tre suite foundation TASK-140: `21/21 PASS`, `0` fail/skip; il risultato
  combina il core storico `16/16` con `5` test supplementari su downstream
  lock-expiry e request deduplication, senza sostituire i record storici;
- freeze pre-patch documentale: `48` path (`39 M`, `9 ??`), diff tracked `39`
  file (`+6754/-1765`), stage vuoto e `git diff --check` PASS;
- scan secret scoped ad alta confidenza `0` match e nessun artifact nel
  diff/status; la cache locale `.wrangler/.../metadata.sqlite` è ignorata;
- `npm run security:scan` globale `BLOCKED_EXTERNAL`: `ENOENT` su
  `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs`.

Non sono stati rieseguiti né promossi a nuovi PASS i gate staging/pgTAP/build già
registrati nell'evidence. Nessun deploy, installazione, write database, stage,
commit, push o merge è stato eseguito da questa review.

## Admin staging post-deploy acceptance closeout — 2026-07-26

Il closeout ha recuperato nel checkout canonico i test TASK-140 necessari e li
ha riallineati senza modificare il contratto runtime:

- `p_sales = []` resta un caso negativo `validation_failed`, privo di vendite,
  outbox e side effect; il positivo usa una vendita sintetica valida;
- una sessione invalidata durante un lock non risorge dopo la scadenza: la
  vecchia sessione resta respinta e soltanto un nuovo login crea una sessione
  valida;
- le azioni built-in protette restano owner-only; il manager staff conserva il
  boundary di login e lettura previsto dal contratto corrente;
- le fixture browser sono run-scoped, exact-ID e cleanup fail-closed.

Evidence runtime corrente: pgTAP linked staging `230/230 PASS`; Playwright
TASK-140 Chromium Desktop `1/1 PASS` in `6.7m`; cleanup operativo della
sessione a zero. Il POS harness TASK-032 ora provisiona lo shop con
`platform_create_shop`, lo staff con `shop_staff_create` nel ruolo canonico
`pos_admin`, e la sorgente inventario con
`platform_map_shop_inventory_source`; first-login, heartbeat, catalog,
sales/outbox, duplicate/conflict e cleanup sono `PASS`. Lo smoke TASK-085
autenticato usa un owner personale sintetico e termina con residui attivi a
zero. Il follow-up riproducibile è tracciato nella PR `#39`, commit test
`8c17a6e8`.

Il solo redeploy staging del closeout ha pubblicato la versione
`aeb4e70d-8d66-43c7-b686-91a5d31c99be` dal codice runtime su `main`
`a8230659cff62ff962a15b6f8010d31c1d99aac7`. Le modifiche successive sono
esclusivamente test, harness e documentazione e non richiedono un secondo
deploy. Nessuna migration nuova, nessun apply/deploy production e nessuna
nuova Codex Security scan sono stati eseguiti.

Stato governance al completamento tecnico: `REVIEW`. Handoff separato:
`READY_FOR_WIN7POS_ASUS_RUNTIME_ACCEPTANCE`; la prova fisica Asus non è ancora
dichiarata completata.

## Conferma DONE — 2026-07-26

L'utente ha confermato esplicitamente la chiusura dopo il report finale
dell'esecuzione. Tutti i criteri Admin/staging risultano verificati, la PR
`#39` è integrata su `main` e il checkout è stato riconciliato pulito.

Stato finale TASK-140: `DONE`.

La chiusura riguarda esclusivamente il perimetro Admin/staging. L'handoff
`READY_FOR_WIN7POS_ASUS_RUNTIME_ACCEPTANCE` resta valido e non equivale a un
PASS della successiva prova fisica Asus.
