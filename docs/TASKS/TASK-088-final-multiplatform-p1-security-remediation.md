# TASK-088 - Final multi-platform P1 security remediation and staging validation

## Informazioni generali

- ID: `TASK-088`
- Stato: `REVIEW_WITH_ENVIRONMENTAL_PERFORMANCE_BLOCKER`
- Fase attuale: `REVIEW`
- Responsabile attuale: `USER_REVIEW`
- Data apertura: `2026-07-15`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-088/README.md`
- Task precedente: `TASK-086` resta `REVIEW_READY`, non `DONE`
- Coordinamento cross-repository: durante l'esecuzione l'override esplicito
  dell'utente e gli addendum operativi hanno reso TASK-088 il solo task attivo
  per l'integrazione scoped Android/iOS/Win7POS. Il task e ora congelato come
  predecessore di TASK-137 e non viene riaperto.

## Origine e obiettivo

Chiudere i sette finding High/P1 validati dal Deep Security Scan finale
multi-repository, preservare la parita Admin Web/Android/iOS/Win7POS e
produrre evidence reale locale, staging non-production e post-fix prima
dell'handoff a `REVIEW`.

Finding in scope:

- `DSC-008`, `DSC-072`, `DSC-073`: boundary RLS per DML catalogo legacy,
  mapping shop/owner e stato membership;
- `DSC-075`: lease autorizzativa offline Win7POS e revalidazione delle
  sessioni aperte;
- `DSC-093`: sconto POS derivato da catalogo autoritativo e cap server-side;
- `DSC-094`, `DSC-134`: refund/void legati alla riga originale, residui
  cumulativi e transazione atomica.

## Scope

- migration Supabase additive e fail-closed per i boundary catalogo;
- test SQL/foundation per owner, manager, viewer, membership sospesa,
  cross-shop e compatibilita legacy;
- hardening atomico della route/RPC Sales Sync con input bounded,
  idempotenza e catalogo server-authoritative;
- contratto Win7POS per `clientOriginalLineId` senza rompere l'outbox legacy;
- lease offline Win7POS con expiry autoritativa, controllo clock rollback e
  revalidazione di login, sessione, override e commit vendita;
- integrazione conservativa dei diff riconciliati Admin/Android/iOS senza
  reset, clean o stash e senza stage/commit/push;
- preservazione delle modifiche canoniche non sovrapponibili: Android
  `gradle/libs.versions.toml` resta sulla versione locale e
  `.idea/deploymentTargetSelector.xml` resta escluso come artefatto IDE;
- gate locali completi per tutti i repository;
- Supabase staging/dev allowlistato e Cloudflare Workers staging soltanto;
- smoke/runtime Android emulator e iOS simulator; Win7POS fisico resta
  `EXTERNAL_TEST_PENDING_CODEX_ASUS`;
- misure di latenza e cleanup verificato delle fixture sintetiche;
- snapshot immutabile scoped e `security-diff-scan` post-fix senza avviare un
  nuovo Deep Security Scan.

## Non incluso

- nessun deploy o migration production;
- nessun dato cliente reale;
- nessun secret, token, PIN, password o service-role nel repository,
  browser o client mobile/POS;
- nessuna nuova dipendenza senza blocker esplicito;
- nessun refactor estraneo ai sette P1 o alla parita necessaria;
- nessun reset/clean/stash distruttivo dei worktree;
- nessun stage, commit o push per Admin Web, Android o iOS;
- nessun claim `PASS` senza comando o runtime realmente eseguito;
- nessun passaggio a `DONE`: Codex prepara esclusivamente l'handoff a
  `REVIEW`.

## Strategia di correzione

### RLS catalogo

- migration append-only successiva a `20260713020000`;
- helper `SECURITY DEFINER` con `search_path` fisso, grant minimo e
  valutazione fail-closed;
- policy DML sostituite senza modificare migration storiche;
- mantenere revocato il grant DELETE non necessario;
- regressioni SQL su mapping attivo, mapping sospeso, legacy unmapped,
  spoof/cross-shop e ruoli read-only.

### Sales Sync

- prezzi, quantità, valori lordi e cap sconto derivati server-side dal
  catalogo e dai permessi correnti;
- refund/void referenziano una riga vendita originale univoca;
- cap cumulativo su quantità e valore residui sotto lock;
- idempotenza e tutte le scritture di batch in un'unica transazione DB;
- payload bounded e risposte redatte con contratti 400/401/409/500.

### Win7POS

- expiry effettiva `min(sessionExpiresAt, lastOkServerAt + 12h)`;
- server time più delta locale monotono, high-water mark e deny su rollback;
- dati lease legacy incompleti falliscono chiuso senza cancellare catalogo,
  outbox o mirror locale;
- autorizzazione rivalidata prima di login offline, cambio operatore,
  override, azioni protette e commit vendita;
- `clientOriginalLineId` propagato da `RelatedOriginalLineId`; fallback legacy
  ammesso solo se la riga originale è univoca e compatibile.

## Criteri di accettazione

| CA | Descrizione | Stato handoff |
|---|---|---|
| CA-01 | Tutti i sette High/P1 hanno patch e regression test. | `PASS_CODE_AND_TEST_EVIDENCE` |
| CA-02 | Admin Web gate locali e Supabase lint/dry-run passano realmente. | `PASS` |
| CA-03 | Win7POS build/test/scanner passano; runtime fisico resta dichiarato esterno. | `PASS_WITH_EXTERNAL_RUNTIME_PENDING` |
| CA-04 | Android e iOS mantengono build/test/runtime e contratto sync. | `PASS` |
| CA-05 | Staging Supabase/Cloudflare usa solo target allowlistati non-production. | `PASS_NON_PRODUCTION_ONLY_NO_CLOUDFLARE_DEPLOY_IN_RESUME` |
| CA-06 | Smoke auth/catalog/sales/refund/void e negative authorization passano. | `PASS_FUNCTIONAL_FAIL_FINAL_SYNC_LATENCY_GATE` |
| CA-07 | Fixture sintetiche hanno cleanup verificato a zero residui mutabili. | `PASS` |
| CA-08 | Snapshot scoped post-fix e security diff scan non riportano nuovi finding reportabili. | `PASS_WITH_COVERAGE_LIMITATION` |
| CA-09 | Nessun file Admin/Android/iOS è staged, committato o pushato. | `PASS_CURRENT_RESUME` |
| CA-10 | Handoff finale contiene file, evidence, rischi residui e fase `REVIEW`. | `PASS` |

## Stato iniziale ed evidence

- snapshot pre-fix immutabile: digest
  `codex-security-snapshot/v1:sha256:aac342e1642269bd8b41dddecbb8306b489fce049c8600d9c76159b83e1f4427`;
- scan pre-fix: `468caed0-8489-473c-a378-c1aca5143be5`;
- finding pre-fix: `99` totali, `7` High/P1;
- i contratti di patch sono stati preparati separatamente e non sono ancora
  evidence di remediation;
- nessuna correzione viene considerata chiusa prima dei gate post-fix.

## Handoff LOCALK84 - 2026-07-16

- resume eseguito senza ripetere inventario, migration dry-run, pgTAP, refresh
  sessione o cleanup già dimostrati e non invalidati;
- matrice finale congelata su prefisso
  `TASK_SYNC_FINAL_20260714_LOCALK84_`;
- punto di arresto: campione `46/1024`, `G002-warm-14`,
  `Admin -> iOS`, `Product update`, scenario `warm`;
- il campione applicativo è `PASS`, ma la latenza end-to-end
  `9595.406 ms` supera il max locale `3000 ms`; stop al primo hard failure,
  nessun retry silenzioso;
- campioni applicativi: `46 PASS`, `0 FAIL`; hard latency failure: `1`;
- statistiche globali sui 46 campioni: `p50 656.217 ms`,
  `p95 1774.779 ms`, `max 9595.406 ms`;
- cleanup automatico: `PASS`, tutti i codici `0`, residuo remoto `0`,
  baseline non-fixture before/after identica e refresh sessione `3/3`;
- i sette P1 non sopravvivono nel codice post-fix secondo validation e
  attack-path analysis; i finding originari restano aperti/non chiusi nel
  workbench, con gap di runtime fisico Win7 per `DSC-075`;
- `security-diff-scan` canonico sigillato con `0` finding reportabili,
  `62/62` file scoped contabilizzati e coverage `partial` dichiarata perché
  l'addendum vietava i worker di scan e il runtime Win7 fisico resta esterno;
- report:
  `/private/tmp/codex-security-scans/TASK-088-postfix-multirepo/task088-k84-20260716T195843Z/report.md`;
- nessun nuovo Deep Security Scan, nessun commit, nessun push, nessun deploy
  production.

## Resume TASK-088B - 2026-07-17

- il campione K84 `G002-warm-14` è stato ricostruito senza attribuire il
  ritardo al solo runtime iOS: `8410.500 ms` erano nel commit/coordinator
  Admin (`87.65%`), `1184.906 ms` tra server e osservazione iOS, con marker
  iOS apply `864 ms` e residuo post-commit non separabile `320.906 ms`;
- il campione era funzionalmente `PASS`, con checkpoint avanzato, pending
  finale `0` e `fullPull=false`; non è stato dimostrato un collo di bottiglia
  nel codice produttivo iOS e non è stata applicata alcuna patch produttiva;
- due run mirati `Admin -> iOS Product update warm` sono passati `32/32`:
  K97T `p50/p95/p99/max 783.173/923.354/1016.153/1016.153 ms` e K99T
  `883.089/1355.491/1447.981/1447.981 ms`, entrambi con `0` failure;
- dopo i blocker successivi sul percorso opposto, due run mirati
  `iOS -> Admin Product create warm` sono passati `32/32`: K123
  `862.632/1248.463/1338.623/1338.623 ms` e K124
  `834.865/1058.543/1385.247/1385.247 ms`, con `0` failure, nessun full pull,
  cleanup `PASS` e baseline preservata;
- i cambi eseguiti in TASK-088B sono solo harness/test: telemetria delle fasi,
  uso del percorso automatico atomico già produttivo nel test iOS e refresh
  esplicito della sessione nel driver Android; anche
  `tools/agent/lib/task088_supabase_rest.mjs`, untracked e con hash
  post-K84 differente, è stato revisionato integralmente; nessun file di
  servizio produttivo è stato modificato per la latenza;
- test già eseguiti dopo i cambi harness: iOS apply `8/8`, regressione iOS
  selezionata `2/2`, build iOS Debug `PASS`, Android contratto `234/234`,
  build Android Debug `PASS`, contratto shared final-sync `60/60`;
- K125, run completo finale, si è arrestato dopo `128/1024` campioni, al gate
  aggregato successivo a G004 e prima di G005: `128 PASS` funzionali,
  `0` failure applicative e `0` full pull;
- il primo gate fallito è `Android -> iOS Product`: p50 non-burst
  `1008.715 ms` contro `1000 ms`, scarto `8.715 ms`; p95 `1253.091 ms`,
  p99/max `1520.728 ms` e burst `4853.488 ms` restano entro le rispettive
  soglie. Non è un hard failure di singolo campione;
- statistiche globali parziali K125 sui 128 campioni, burst inclusi:
  `p50 821.154 ms`, `p95 1282.011 ms`, `p99 3120.301 ms`,
  `max 4853.488 ms`; failure applicative `0`, gate aggregati falliti `2`
  (`android:ios:Product` e confronto TASK-123);
- cleanup K125 `PASS`: tutti i nove codici `0`, residuo remoto `0`, baseline
  non-fixture preservata e refresh sessione `5/5`;
- la comparabilità fisica TASK-123 non è dimostrata: il confronto warm
  server-to-iOS fallisce oltre `25%`, ma emulator e simulator correnti non
  sono provati equivalenti alla baseline. Non viene dichiarata parity fisica;
- i contratti checkpoint, duplicate, no-op, stale conflict, tombstone,
  offline/reconnect e full-pull avoidance restano coperti e hanno esito
  funzionale positivo nei gruppi completati; account/shop switch resta coperto
  dai test mirati, ma non dal run live K125 interrotto prima di tali scenari;
- evidence diagnostica durevole:
  `docs/TASKS/EVIDENCE/TASK-088/task-088b-latency-diagnostic.json` e
  `docs/TASKS/EVIDENCE/TASK-088/task-088b-latency-diagnostic.sql`;
- xcresult copiati fuori da `/private/tmp`: K123 `35`, K124 `34`, K125 `103`
  sotto `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/xcresults/`.
- evidence review: K121 ha come primo errore durevole
  `cleanup_payload_invalid` per path vuoto, non la successiva/inferita
  sessione Android stale; K118M ha p99 globale `3774.517 ms` e max globale
  `4529.717 ms` per il burst G004;
- security diff scan post-K125: `6/6` delta full-file, `56/62` baseline
  byte-identici, `0` finding reportabili, coverage `partial`; i sette
  High/P1 sono `7/7` invariati/non regressi ma restano aperti/non chiusi.
  Report durevole:
  `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/report.md`.

## Prossima fase

Review utente del blocker aggregato K125, della comparabilità runtime e del gap
fisico Win7. K125 resta congelato: nessun retry di sample/run/gruppo, nessun
nuovo benchmark hardware, nessun claim `1024/1024` e nessuna modifica
produttiva motivata dalla latenza. Le soglie non vengono rilassate. Il task
resta `REVIEW_WITH_ENVIRONMENTAL_PERFORMANCE_BLOCKER`, mai `DONE` da Codex.
