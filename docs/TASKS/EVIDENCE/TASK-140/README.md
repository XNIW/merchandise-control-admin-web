# Evidence TASK-140 - Staff PIN reset e Shop Code login

## Stato corrente

- Task: `TASK-140 - Staff PIN reset e Shop Code login`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Data apertura: `2026-07-18`
- Branch: `codex/task-140-staff-pin-reset-login`
- Baseline `origin/main`:
  `c30cf3f2b44e1bf67a2c3bcbdcd0b2cc6a9328a4`
- Worktree:
  `/Users/minxiang/.codex/worktrees/task-140-20260718/admin`
- Verdict corrente: `REVIEW_P1_FIXES_STAGING_ACCEPTANCE_PASS`
- Handoff corrente: `REVIEW`, non `DONE`

## Addendum final review P1 - 2026-07-19

La final review ha chiuso i P1 non coperti dalla precedente acceptance:

1. `pos_admin` e permessi owner-only sono strutturalmente riservati a owner o
   platform, con trigger, seed/reconcile canonico e protezione delle boundary
   staff-web;
2. i failure Shop Code/POS avanzano il lockout in modo atomico e
   version-aware, senza relock dopo un reset concorrente;
3. la credenziale one-time e vincolata alla identita/target esatto mostrato;
4. expiry e lock vengono applicati in modo coerente a login, session resolver,
   heartbeat, catalogo e sales;
5. ogni mutation staff-web usa la sessione DB esatta, propagata end-to-end, e
   la RPC 12-arg sostituisce l'overload storico 11-arg;
6. permission update e lifecycle staff/personale sono atomici, con dual
   principal o JWT-only, recheck transazionale e audit nella stessa RPC;
7. la wrapper sales accetta soltanto lock realmente elapsed, nega future/NULL
   e fa rollback quando il sink finanziario rifiuta la scrittura.
8. create/reset consegnano la credenziale one-time a `useActionState` prima di
   qualsiasi invalidazione della pagina e mostrano un esito applicativo
   esplicito (`staff-create-result` / `staff-reset-result`), evitando la perdita
   del valore non recuperabile sul Worker staging.

Le review indipendenti SQL e TypeScript successive non hanno trovato P0/P1
residui. La correzione DB additiva
`20260719090000_task_140_auth_concurrency_hardening.sql` e stata applicata
soltanto allo staging non-production exact-guarded dopo dry-run transazionale
con rollback. Il pgTAP, il deploy Worker e l'E2E corrente attestano la build P1:
Chromium Desktop `1/1 PASS` in `6.1m`, con cleanup aggregate finale a zero.

## Regole evidence

- registrare soltanto comandi e runtime realmente eseguiti;
- classificare ogni gate come `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED` o
  `NOT_RUN`;
- usare solo fixture nuove, sintetiche e scoped con prefisso TASK-140;
- non salvare PIN/password raw, hash, token, cookie, service-role key, dati
  cliente o valori riportati dall'utente;
- redigere identificativi e payload sensibili negli output durevoli;
- non dichiarare runtime Win7POS/Android/iOS: questi repository sono fuori
  scope e restano read-only/intatti;
- nessun apply/deploy production, commit, stage, push o merge;
- lo staging pubblico e autorizzato soltanto dopo target guard non-production,
  dry-run e gate locali, con cleanup sintetico obbligatorio.

## Audit e matrice pre-patch

La matrice completa e congelata prima dell'implementation in
`docs/TASKS/TASK-140-staff-pin-reset-login.md`.

Finding iniziali confermati staticamente:

1. il reset Shop Admin genera `8` cifre con un'operazione modulo, mentre
   `allowTemporaryPin` accetta `5` cifre;
2. create/reset impostano `rotation_required` e `must_change_credential=true`,
   ma Shop Code/POS richiedono una credenziale attiva e non `must_change`;
3. il reset diretto Shop Code riattiva implicitamente staff sospesi;
4. esistono due domini di lockout e reset/clear/recovery non li cancellano
   entrambi;
5. provisioning/recovery Master generano `5` cifre e classificano il PIN
   numerico come password;
6. la verifica hash login non impone una lunghezza, quindi consente una
   correzione forward-only senza rompere le credenziali legacy 5/8.

## Contratto da provare

- nuovi PIN: esattamente 6 cifre, leading zero incluso;
- password alfanumeriche separate;
- legacy 5/8 ancora valide fino al prossimo reset;
- reset/create immediatamente utilizzabili;
- entrambi i lockout cancellati;
- reset ordinario preserva `suspended`;
- recovery Master riattiva intenzionalmente e invalida vecchia
  credenziale/sessione;
- nessun raw secret in UI/log/audit/evidence.

## Ledger comandi verificati

| Gate | Esito | Note |
|---|---|---|
| preflight branch/worktree/baseline | `PASS` | worktree dedicato basato su `origin/main`; checkout principale dirty preservato |
| scansione ID globale | `PASS` | `TASK-140` primo ID libero rilevato |
| audit task/evidence/migration/source/test | `PASS_STATIC_AUDIT` | percorsi e drift registrati nel task; nessuna patch runtime prima della matrice |
| reset DB locale dopo fix P1 finale | `NOT_RUN` | stack exact-local storico distrutto; i gate DB correnti usano esclusivamente lo staging autorizzato |
| manifest pgTAP corrente | `PASS_STATIC_COUNT` | `7` file / `469` assertion: `228 + 38 + 32 + 30 + 76 + 41 + 24` |
| pgTAP TASK-140 corrente | `PASS_STAGING` | `228/228` sul target staging exact-guarded |
| pgTAP DSC sales corrente | `PASS_STAGING` | `38/38` sullo stesso target; policy lock e rollback sales coperti |
| pgTAP storico pre-fix | `HISTORICAL_PASS_SUPERSEDED` | precedente claim `8/408`, TASK-140 `137/137`; conservato solo come storico |
| test foundation TASK-140 | `PASS` | rerun finale repo-only `16/16`; il caso one-time include `4` assertion su assenza revalidate create/reset e notice esplicite |
| test foundation mirati TASK-051/054/140 pre-fix finale | `HISTORICAL_PASS_SUPERSEDED` | `25/25` sulla revisione precedente; il gate corrente autorevole e TASK-140 `16/16` |
| Playwright TASK-140 Shop Code/POS corrente | `PASS_STAGING` | Chromium Desktop `1/1`, `6.1m`, target exact-guarded |
| Playwright TASK-140 storico | `HISTORICAL_PASS_SUPERSEDED` | precedente Chromium Desktop `1/1`, `31.9s`; non include i fix P1 finali |
| Playwright TASK-051 recovery completa | `HISTORICAL_PASS_NOT_RERUN_AFTER_FINAL_P1_FIX` | Chromium Desktop pre-fix `1/1`, `15.5s` |
| Playwright TASK-051 manual platform regression | `HISTORICAL_PASS_NOT_RERUN_AFTER_FINAL_P1_FIX` | Chromium Desktop pre-fix `1/1`, `9.2s`; credenziale effimera generata a runtime |
| legacy 5/8 + nuovo PIN 6 cifre runtime DB | `PASS_STAGING` | coperti dal pgTAP TASK-140 corrente; browser E2E ancora in corso |
| lockout concorrente + reset stale | `PASS_STAGING` | pgTAP TASK-140 corrente verde; E2E browser ancora in corso |
| typecheck | `PASS` | exit `0` |
| lint | `PASS` | exit `0` |
| build Next.js | `PASS` | Next.js `16.2.6`, exit `0` |
| build OpenNext corrente | `PASS` | artefatto P1 corrente compilato per staging |
| Supabase migration dry-run staging corrente | `PASS` | exact target guard; transaction dry-run completato con rollback prima dell'apply |
| Wrangler deploy dry-run staging corrente | `PASS` | Worker P1 corrente validato prima del deploy |
| security scan mirata TASK-140 | `PASS` | ACL, atomicita/versione, expiry, authz `pos_admin` e target binding verificati |
| security scan completa | `BLOCKED_EXTERNAL` | manca il file Win7POS esterno `OperatorLoginDialog.xaml.cs` richiesto dal gate globale |
| DB lint linked `public,app_private` | `PASS` | `0` errori dopo la migration additiva P1 |
| contratti/ACL post-apply | `PASS_STAGING` | RPC mutate 12-arg presente, overload 11-arg assente, lifecycle/permission RPC presenti, matrice owner-only canonica |
| `npm run i18n:check` | `BLOCKED_EXTERNAL` | manca il sibling Win7POS `Localization` richiesto dal gate |
| `npm run verify` | `BLOCKED_EXTERNAL` | blocco sullo stesso file Win7POS esterno; typecheck/lint/build separati restano verdi |
| contratti TASK-137/139 pre-teardown | `HISTORICAL_PASS_SUPERSEDED` | `{ok:true, failures:0}` prima dei fix P1 finali |
| struttura/ACL TASK-140 pre-teardown | `HISTORICAL_PASS_SUPERSEDED` | `{ok:true, failures:0}` prima della migration additiva P1 |
| health exact-local pre-teardown | `HISTORICAL_PASS_SUPERSEDED` | transazioni lunghe, lock waiter, lock non concessi e grantee inattesi tutti `0` prima dei fix P1 |
| teardown stack locale esatto | `PASS` | `supabase stop --no-backup` exit `0`; container/volumi target vuoti e porta `58322` non in ascolto |
| `git diff --check` finale locale | `PASS` | exit `0` al checkpoint precedente; verra rieseguito dopo l'evidence finale |
| Win7POS/Android/iOS runtime | `NOT_RUN_OUT_OF_SCOPE` | nessuna modifica autorizzata |
| artefatto OpenNext corrente | `PASS` | artefatto P1 usato nel deploy staging corrente |
| scan sensitive scoped corrente | `PASS` | security scan TASK-140 verde; nessun secret registrato nell'evidence |
| redeploy Worker staging corrente | `PASS_STAGING_ONLY` | Version ID `0f904fed-1832-4637-ab2a-234d031d8e6b` |
| smoke staging corrente | `PASS_WITH_NOTES` | OAuth mobile `5/5 PASS`; Products `SKIP_CONFIG` per credenziali staging non impostate |
| sessione Google staging in Chrome pre-fix | `HISTORICAL_PASS_AUTHENTICATED` | sessione confermata senza registrare dati sensibili; non attesta la build P1 corrente |
| acceptance funzionale staff pubblica pre-fix | `HISTORICAL_PASS_RUNTIME_RERUN_REQUIRED` | scenari completati realmente sulla build precedente, non sui quattro fix P1 finali |
| cleanup staging TASK-140 corrente | `PASS_ZERO_RESIDUE` | `auth_users=0`, `profiles=0`, `shops=0`, `staff_accounts=0`, `web_attempts=0` |
| apply/redeploy migration additiva P1 finale | `PASS_STAGING_ONLY` | migration applicata e Worker pubblicato solo sul target non-production exact-guarded |
| production apply/deploy | `NOT_RUN_OUT_OF_SCOPE` | vietato |
| commit/stage/push/merge | `NOT_RUN_OUT_OF_SCOPE` | vietato |

## Execution staging non-production - build P1 corrente

Il target e stato verificato fail-closed come staging/non-production prima di
ogni write. Nessun project ref, token, cookie, PIN o service-role secret e
registrato in questa evidence.

| Gate | Esito | Evidence redatta |
|---|---|---|
| target guard Supabase | `PASS` | link metadata e naming non-production verificati; production esclusa |
| transaction dry-run migration | `PASS_ROLLBACK` | bundle migration esatto verificato in transazione e annullato prima dell'apply |
| migration apply | `PASS_STAGING_ONLY` | applicata soltanto `20260719090000_task_140_auth_concurrency_hardening.sql` sul target autorizzato |
| post-apply contract health | `PASS` | migration presente; mutate 12-arg presente; overload 11-arg assente; lifecycle e permission RPC presenti |
| permission matrix health | `PASS` | owner-only condivisi fuori `pos_admin`: `0`; permessi `pos_admin` mancanti: `0`; extra: `0` |
| DB-owner maintenance | `PASS_ROLLBACK` | delete di manutenzione provato come DB owner in transazione separata e annullato; service-role resta negato |
| pgTAP TASK-140 | `PASS` | `228/228` |
| pgTAP DSC sales | `PASS` | `38/38` |
| DB lint linked | `PASS` | schemi `public,app_private`, `0` errori |
| foundation TASK-140 | `PASS` | `16/16` |
| typecheck / lint / Next.js build | `PASS` | tutti i gate separati completati; Next.js `16.2.6` |
| OpenNext build / Worker dry-run | `PASS` | artefatto P1 corrente e configurazione staging validati |
| deploy Worker staging | `PASS_STAGING_ONLY` | Version ID `0f904fed-1832-4637-ab2a-234d031d8e6b` |
| smoke Worker staging | `PASS_WITH_NOTES` | OAuth mobile `5/5 PASS`; Products `SKIP_CONFIG` per credenziali staging non impostate |
| security scan TASK-140 scoped | `PASS` | nessun P0/P1 residuo nella review finale SQL/TypeScript |
| security scan globale / verify | `BLOCKED_EXTERNAL` | manca soltanto `OperatorLoginDialog.xaml.cs` nel sibling Win7POS |
| i18n check | `BLOCKED_EXTERNAL` | manca il sibling Win7POS `Localization` |
| Playwright staging TASK-140 | `PASS` | Chromium Desktop `1/1` in `6.1m` |
| cleanup E2E finale | `PASS_ZERO_RESIDUE` | aggregate exact-guarded: `auth_users=0`, `profiles=0`, `shops=0`, `staff_accounts=0`, `web_attempts=0` |
| production apply/deploy | `NOT_RUN_OUT_OF_SCOPE` | target non autorizzato e non toccato |
| commit/stage/push/merge | `NOT_RUN_OUT_OF_SCOPE` | operazioni non autorizzate e non eseguite |

Il conteggio statico corrente dei sette manifest pgTAP e `469` assertion:
TASK-140 `228`, DSC sales `38`, image denied audit `32`, mobile atomic sync
events `30`, product catalog images `76`, release catalog security `41` e
inventory DML/RLS `24`. Soltanto le suite TASK-140 e DSC sales sopra sono
dichiarate `PASS` runtime in questa final review; non viene inferito un PASS
runtime per le altre `203` assertion.

I run preliminari non sono stati promossi a evidence positiva: hanno esposto
una fixture incompatibile con il seed canonico `pos_admin`, aspettative route
obsolete, wait Server Action insufficienti, un'attesa `response.finished()`
non adatta allo streaming RSC e infine il P1 reale di consegna one-time durante
`revalidatePath`. L'harness ha mantenuto il cleanup fail-closed; l'unico
conteggio promosso a evidence e la query aggregate finale a zero. Il run
autorevole e soltanto quello finale sul Worker
`0f904fed-1832-4637-ab2a-234d031d8e6b`, `1/1 PASS` in `6.1m`, seguito dalla
query aggregate a residuo zero.

## Execution staging non-production - storico pre-fix P1

Questa sezione documenta soltanto l'esecuzione del 2026-07-18. E superseded
per la build corrente dall'addendum P1 sopra.

| Gate | Esito | Evidence redatta |
|---|---|---|
| target guard Supabase | `PASS` | progetto collegato verificato come staging/non-production; ref e secret non registrati |
| migration dry-run | `PASS` | `8` migration attese, nessuna migration inattesa |
| migration apply | `PASS` | applicate le stesse `8` migration verificate |
| history migration | `PASS` | locale/remoto allineati `78/78` |
| DB lint linked | `PASS` | `public,app_private` senza errori bloccanti |
| contratti TASK-140 / POS Admin | `PASS` | contratto PIN/reset/recovery e matrice canonica `pos_admin` verificati |
| ACL post-apply | `PASS` | matrice finale conforme; nessun grant inatteso rilevato |
| transaction/lock health | `PASS` | nessuna transazione lunga, lock waiter o lock non concesso rilevato |
| OpenNext + Wrangler dry-run | `PASS` | build staging completato e dry-run Worker verde |
| artefatto Worker finale | `PASS` | `BUILD_ID=7vsutJNyNWu_v1cVTozEB`; hash Worker e aggregate asset registrati sopra |
| scan sensitive scoped | `PASS` | nessun secret nei file cambiati o nell'evidence; credenziali one-time solo in memoria |
| deploy Worker staging finale | `PASS` | version ID `c52acab5-63f5-4fff-9d47-beaa61f71446`; nessun deploy production |
| smoke pubblico finale | `PASS` | endpoint pubblico staging raggiungibile e risposta attesa dopo il redeploy |
| sessione Google Chrome | `PASS_AUTHENTICATED` | autenticazione staging confermata senza registrare identificativi o dati utente |
| acceptance staff autenticata | `PASS` | create/reset/recovery/login, stato sospeso/riattivato, audit e logout eseguiti sul runtime pubblico |
| cleanup fixture | `PASS_ZERO_RESIDUE_WITH_REHEARSAL_NOTE` | query scoped post-cleanup: tutti i residui del QA shop a `0`; fixture rehearsal TASK-140 a `0`; shop storico e account manager preesistente ancora presenti |

Il redeploy finale autorevole `c52acab5-63f5-4fff-9d47-beaa61f71446`
supersede i deploy precedenti della stessa acceptance. Il dry-run Wrangler ha
validato `55` asset (`2344.23 KiB` gzip); BUILD_ID, hash Worker e aggregate
asset sono registrati sopra. Smoke pubblico, acceptance autenticata e cleanup
scoped post-acceptance sono tutti `PASS`.

## Acceptance autenticata staging P0

La verifica e stata eseguita nella sessione Chrome scelta dall'utente, senza
automatizzare Google e senza stampare o salvare alcuna credenziale one-time.

| Scenario | Esito reale |
|---|---|
| reset PIN numerico | `PASS`: valore generato di esattamente 6 cifre, mantenuto soltanto nella memoria della sessione QA |
| staff sospeso | `PASS`: il reset non lo ha riattivato e il nuovo PIN e stato respinto finche lo staff era sospeso |
| riattivazione | `PASS`: stato tornato attivo senza una seconda rotazione; lo stesso nuovo PIN e stato accettato |
| recovery manager `1001` | `PASS`: risultato `PIN reset`, manager attivo, vecchio PIN respinto e nuovo PIN accettato |
| audit | `PASS`: recovery, login fallito, login riuscito e logout visibili nel read model globale redatto |
| sessioni | `PASS`: logout staff eseguiti; nessun cookie o token registrato nell'evidence |
| cleanup | `PASS_ZERO_RESIDUE_WITH_REHEARSAL_NOTE`: QA shop/staff/sessioni/permessi/audit a zero; staff TASK-140 nel rehearsal rimosso; shop storico e account manager preesistente ancora presenti |

Il secondo evento applicativo opzionale `platform.staff_manager_web.recovery.success`
non era presente nelle ultime `80` righe del read model; l'evento database
canonico `platform.staff_manager.initial_recovery.success` era presente ed e
stato usato come evidence autorevole insieme all'esito UI e ai login reali.

### Nota sul rehearsal storico

Un primo rehearsal aveva usato un negozio storico chiaramente sintetico
`TASK068E REHEARSAL`: vi aveva creato uno staff QA TASK-140 e aveva ruotato la
credenziale del manager preesistente `1001`. Il cleanup finale ha rimosso lo
staff aggiunto e i suoi eventi scoped; ha lasciato presenti il negozio e
l'account manager nello stato attivo. La rotazione precedente non e
reversibile alla credenziale originale: il valore one-time usato nel test e
stato eliminato dalla sessione in memoria e non e stato persistito. Non viene
quindi dichiarata una preservazione byte-per-byte della credenziale storica.

## Implementazione verificata

- contratto condiviso `STAFF_PIN_LENGTH = 6` con generazione crittografica
  uniforme e leading zero;
- validazione stretta soltanto per i nuovi PIN, senza rompere la verifica degli
  hash legacy;
- create/reset immediatamente attivi e non `must_change`;
- reset ordinario con stato `suspended` preservato; recovery Master con
  riattivazione intenzionale;
- pulizia atomica dei due domini di lockout e invalidazione della versione
  credenziale/sessione;
- avanzamento lockout Shop Code/POS serializzato nella RPC service-role-only,
  con `credential_version` attesa per impedire il relock dopo reset;
- scadenza credenziale verificata da Shop Code login/session e da POS
  first-login/heartbeat/catalog/sales;
- valore one-time renderizzato soltanto quando target ID e identita mostrata
  coincidono con il risultato;
- create/reset restituiscono la credenziale a `useActionState` senza
  `revalidatePath` anticipato e mostrano sempre notice applicative dedicate;
- RPC staff-aware con binding alla sessione staff-web DB esatta, recheck
  transazionale di attore/shop/target/permessi, audit redatto e ACL espliciti;
- lifecycle personale JWT-only e permission mutation dual-principal atomiche,
  senza DML TypeScript parziali;
- ruolo built-in `pos_admin` self-contained con matrice canonica di `33`
  permessi, creazione riservata a shop owner/platform, accesso staff web
  shop-scoped e recovery del manager iniziale `1001` allineata;
- trigger owner-only strutturale, seed automatico dei nuovi shop e reconcile
  canonico delle matrici esistenti;
- wrapper sales e resolver downstream fail-closed su lock future/NULL, con
  lock elapsed normalizzato e rollback della scrittura finanziaria negata;
- E2E protetti da guard distinti per loopback locale e staging exact-guarded,
  fixture sintetiche e cleanup fail-closed.

## File nel diff TASK-140

- `docs/MASTER-PLAN.md`;
- `docs/TASKS/TASK-140-staff-pin-reset-login.md`;
- `docs/TASKS/EVIDENCE/TASK-140/README.md`;
- `scripts/security-checks.mjs`;
- `scripts/testing/target-guardrails.mjs`;
- `src/app/shop/_components/StaffActionPanel.tsx`;
- `src/app/shop/actions.ts`;
- `src/app/shop/staff/page.tsx`;
- `src/i18n/dictionaries.ts`;
- `src/lib/supabase/database.types.ts`;
- `src/server/platform-admin/temporary-manager-pin.ts`;
- `src/server/pos-auth/catalog-import-sync.ts`;
- `src/server/pos-auth/catalog-pull.ts`;
- `src/server/pos-auth/sales-sync.ts`;
- `src/server/pos-auth/service.ts`;
- `src/server/shop-admin/access-principal.ts`;
- `src/server/shop-admin/action-context.ts`;
- `src/server/shop-admin/data-access.ts`;
- `src/server/shop-admin/permissions.ts`;
- `src/server/shop-admin/staff-aware-mutations.ts`;
- `src/server/shop-admin/staff-credentials.ts`;
- `src/server/shop-admin/staff-mutations.ts`;
- `src/server/shop-admin/staff-read-model.ts`;
- `src/server/shop-admin/staff-web-auth.ts`;
- `src/server/shop-admin/staff-web-permissions.ts`;
- `supabase/migrations/20260718235345_task_140_staff_pin_reset_login.sql`;
- `supabase/migrations/20260719090000_task_140_auth_concurrency_hardening.sql`;
- `supabase/tests/dsc_093_094_134_pos_sales_security.sql`;
- `supabase/tests/task_140_staff_pin_reset_login.sql`;
- `tests/e2e/task-051-platform-provisioning-manual-platform-admin-regression.spec.ts`;
- `tests/e2e/task-051-platform-provisioning-shop-code-recovery.spec.ts`;
- `tests/e2e/task-140-staff-pin-reset-login.spec.ts`;
- `tests/foundation/task-020-win7pos-integration-planning.test.mjs`;
- `tests/foundation/task-021-pos-backend-session-device.test.mjs`;
- `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs`;
- `tests/foundation/task-037-dual-access-model.test.mjs`;
- `tests/foundation/task-038-pos-manager-web-login.test.mjs`;
- `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`;
- `tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs`;
- `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`;
- `tests/foundation/task-054-shop-code-recovery-diagnostics.test.mjs`;
- `tests/foundation/task-055-shop-admin-ui-polish.test.mjs`;
- `tests/foundation/task-079-catalog-pagination-unified.test.mjs`;
- `tests/foundation/task-088-pos-sales-reversal-parser.test.mjs`;
- `tests/foundation/task-088-pos-sales-security-regressions.test.mjs`;
- `tests/foundation/task-140-pos-downstream-lock-expiry.test.mjs`;
- `tests/foundation/task-140-staff-pin-reset-login.test.mjs`;
- `tests/foundation/task-140-shop-admin-request-dedup.test.mjs`.

Gli artifact temporanei `test-results/` e `playwright-report/` sono stati
rimossi dopo il run autorevole. Nessun valore credenziale e stato persistito
nei file di evidence.

## Rischi e blocker correnti

- l'E2E staging della build P1 corrente e `PASS 1/1` in `6.1m`; il cleanup
  aggregate finale e a zero su tutte le cinque famiglie fixture tracciate;
- il rehearsal sintetico storico mantiene la rotazione del manager `1001`
  descritta sopra; nessun dato business reale e stato coinvolto, ma la
  credenziale storica precedente non puo essere ripristinata;
- lo stack exact-local e stato distrutto senza backup; gli eventuali residui
  disposable sono stati eliminati e non sono recuperabili. Il teardown non ha
  toccato staging o production;
- pgTAP TASK-140 `228/228`, DSC sales `38/38` ed E2E Chromium Desktop `1/1`
  sono `PASS` runtime staging;
- `npm run verify` e security scan completa restano `BLOCKED_EXTERNAL` per il
  solo file Win7POS esterno mancante `OperatorLoginDialog.xaml.cs`, non per un
  errore TASK-140 locale;
- grant service-role table-wide restano un rischio architetturale noto; una
  riduzione a RPC/privilegi colonna e fuori scope;
- due gap UX non-P1 restano documentati: la credenziale one-time vive nello
  state del componente finche resta montato e un doppio submit autorizzato puo
  ruotare due volte, rendendo stale il primo PIN mostrato; nessuno dei due
  supera authz, shop o target boundary;
- lo smoke Products corrente e `SKIP_CONFIG`, non `PASS`, perche le relative
  credenziali staging non sono impostate; OAuth mobile e invece `5/5 PASS`;
- production resta vietata e non e stata toccata;
- il task e in `REVIEW`, mai `DONE` senza review positiva e conferma esplicita
  dell'utente.

## Review documentale fresca — 2026-07-21

Questa sezione è additiva: non riclassifica come freschi i gate staging,
pgTAP, build o browser delle sezioni precedenti.

| Gate | Esito osservato |
|---|---|
| Foundation TASK-140, tre suite | `PASS 21/21`, `0` fail/skip: core storico `16/16` + `5` test supplementari lock-expiry/request-dedup |
| Freeze pre-patch documentale | `48` path: `39 M`, `9 ??`; diff tracked `39` file, `+6754/-1765` |
| Stage | vuoto |
| `git diff --check` | `PASS` |
| Artifact nel diff/status | `0`; `.wrangler/.../metadata.sqlite` è cache locale ignorata da `.gitignore` |
| Scan secret scoped ad alta confidenza | `0` match |
| Review P0/P1 SQL/TypeScript | `0` finding confermati |
| `npm run security:scan` globale | `BLOCKED_EXTERNAL`: `ENOENT` su `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs`; non dichiarato PASS |

I risultati storici `228/228` pgTAP TASK-140, `38/38` DSC sales, E2E staging
`1/1` e cleanup aggregato a zero restano registrati come tali e non sono stati
rieseguiti in questo checkpoint. Restano i due gap UX P2 già documentati e il
rischio architetturale dei grant service-role table-wide; nessuno supera i
boundary authz/shop/target. Nessun codice runtime, deploy, installazione, write
database, stage, commit, push o merge è stato eseguito. Stato:
`REVIEW / REVIEW_READY`, mai `DONE` da Codex.

## Admin staging post-deploy acceptance closeout — 2026-07-26

Questa sezione è additiva e supersede soltanto i risultati obsoleti dei quattro
blocchi di acceptance. I test finali sono presenti nel checkout canonico
corrente; nessun PASS deriva da un vecchio worktree.

| Gate | Esito reale | Evidence redatta |
|---|---|---|
| migration parity linked | `PASS` | target staging exact-guarded; migration pending `0`; nessuna migration applicata nel closeout post-deploy |
| pgTAP TASK-140 linked | `PASS 230/230` | `Files=1, Tests=230`, `Result: PASS`; `p_sales=[]` negativo e vendita sintetica positiva separati |
| Playwright TASK-140 | `PASS 1/1` | Chromium Desktop staging, `6.7m`; sessione revocata fail-closed, nuovo login, owner-only boundary e cleanup esatto |
| foundation mirati TASK-032/TASK-085/TASK-139/TASK-140 | `PASS 34/34` | eseguiti dal checkout corrente con Win7POS clean exact-`origin/main`; il checkpoint precedente TASK-032/085/140 `12/12` resta superseduto |
| lint / typecheck / Next build / OpenNext | `PASS` | tutti exit `0`; Next.js `16.2.6` |
| `npm run verify` | `PASS` | `WIN7POS_REPO_PATH=/Users/minxiang/.codex/worktrees/win7pos-main-20260722`, HEAD `24d6e0d5f82b5c32e48b42d31333459dbc7d4c6b` |
| Worker readiness pubblico | `PASS` | `cf:check:staging`; workers.dev pubblico raggiungibile |
| smoke staging / platform | `PASS 1/1 + 1/1` | guard staging e Supabase superati; test read-only |
| catalog paging | `PASS` | snapshot-bound keyset con sentinel interno `limit+1` |
| POS harness dry-run | `PASS` | `PASS_STAGING_PRECHECK_DRY_RUN`; nessun dato creato e nessuna vendita inviata |
| POS harness positivo | `PASS_STAGING_POS_E2E_WITH_CLEANUP` | first-login, heartbeat, catalog, sales/outbox, duplicate/conflict; residue operativo zero |
| TASK-085 autenticato | `PASS` | OAuth mobile `5/5`; Products autenticato owner sintetico; cleanup active shop/mapping/member/profile/platform-admin a zero |
| fixture sessione | `PASS_ZERO_RESIDUE` | fixture TASK-140, POS e TASK-085 della sessione chiuse exact-ID |
| fixture TASK-032 storiche | `PRESERVED_CLASSIFIED` | `33` shop sintetici già archiviati conservati; vendite, ledger e audit immutabili non cancellati |
| deploy staging | `PASS_STAGING_ONLY` | precedente `dcc1ff4c-02c3-4bad-bf32-4464e355d407`; finale `aeb4e70d-8d66-43c7-b686-91a5d31c99be`; timestamp `2026-07-26T18:31:35.574245Z` |
| runtime bundle | `PASS` | SHA256 `d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45`; BUILD_ID `dvd3hqd1X34zjqsAB0oSA` |
| production / client sibling | `NOT_RUN_OUT_OF_SCOPE` | production, Win7POS, Android e iOS non modificati |
| Codex Security / CodeQL manuale | `NOT_RUN` | non ripetuti; il check locale incorporato in `npm run verify` non è una nuova scansione Codex Security |
| follow-up GitHub | `PR #39` | commit test/harness `8c17a6e8`; merge e SHA finale sono registrati nel report di closeout |

Root cause chiuse:

1. il pgTAP storico usava un array sales vuoto come caso positivo, mentre il
   contratto corrente richiede `1–100` vendite;
2. il Playwright storico pretendeva la riattivazione automatica di una
   sessione già invalidata;
3. il POS setup storico inseriva direttamente in `shops`; il primo
   riallineamento ha inoltre esposto che uno shop sintetico nuovo richiede il
   ruolo canonico `pos_admin` e un prezzo catalogo coerente con la vendita;
4. i wrapper smoke non caricavano i guard staging e il Products TASK-085 usava
   un boundary staff ormai non autorizzato invece dell’owner personale.

Il redeploy unico è stato eseguito dopo il merge del codice runtime su `main`
`a8230659cff62ff962a15b6f8010d31c1d99aac7`. Il follow-up contiene soltanto
test, harness e documentazione: nessun secondo deploy, nessuna migration e
nessuna modifica runtime. Stato finale del task secondo `AGENTS.md`: `REVIEW`,
non `DONE`. Handoff:
`READY_FOR_WIN7POS_ASUS_RUNTIME_ACCEPTANCE`.
