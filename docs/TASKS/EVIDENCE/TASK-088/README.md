# Evidence TASK-088 - Final multi-platform P1 security remediation

Data apertura: `2026-07-15`

Stato: `REVIEW_WITH_ENVIRONMENTAL_PERFORMANCE_BLOCKER`

## Baseline

- Deep Security Scan pre-fix completato su snapshot immutabile.
- Snapshot digest:
  `codex-security-snapshot/v1:sha256:aac342e1642269bd8b41dddecbb8306b489fce049c8600d9c76159b83e1f4427`.
- Scan ID: `468caed0-8489-473c-a378-c1aca5143be5`.
- Finding: `99` totali, `7` High/P1.
- High/P1 in scope: `DSC-008`, `DSC-072`, `DSC-073`, `DSC-075`,
  `DSC-093`, `DSC-094`, `DSC-134`.

## Regole evidence

- Registrare solo comandi e runtime realmente eseguiti.
- Usare `NOT_RUN` o `BLOCKED` con motivazione quando un gate non è disponibile.
- Non salvare secret, token, cookie, PIN, password, service-role o dati reali.
- Separare chiaramente locale, Supabase staging/dev, Cloudflare staging e
  runtime esterno Win7POS.
- Verificare il cleanup delle fixture mutabili con conteggi finali a zero.
- Non marcare il task `DONE`; l'esito Codex massimo è `REVIEW`.

## Ledger iniziale

| Area | Stato | Evidence |
|---|---|---|
| Governance TASK-088 | `PASS_OPENED_FIX` | Master Plan e task file aggiornati. |
| RLS catalogo | `PASS_STATIC_REVIEWED_DB_RUNTIME_PENDING` | Foundation 4/4; review indipendente post-fix PASS; pgTAP 24 casi pronto ma non ancora eseguito. |
| Sales Sync | `CHANGES_REQUIRED_ITERATION_2` | Prima review ha bloccato residual intra-sale, auth TOCTOU, permission/cap hardcoded, reversal economics e historical residual; seconda patch/test SQL in corso. |
| Win7POS lease | `PUBLISHED_TO_MAIN_EXTERNAL_RUNTIME_PENDING` | `origin/main` `0d6eaff0870014a93b29f184e868d6a619d67387`; CI/gate Mac PASS; runtime fisico esterno. |
| Android/iOS parity | `PASS_LOCAL_RUNTIME` | Android 38/38 e iOS 48/48 integrati; build/test/emulator/simulator gate PASS con skip live dichiarati. |
| Staging | `PENDING` | Nessun apply/deploy eseguito da TASK-088. |
| Deep Scan post-fix | `PENDING` | Snapshot non ancora creata. |

Nota governance cross-repository: per ordine esplicito dell'utente TASK-088
e l'unico coordinamento attivo della closure; non vengono creati task Android
o iOS duplicati. I rispettivi Master Plan restano invariati e la loro baseline
IDLE/DONE viene trattata come override scoped, documentato in questa evidence.

## Preflight ambiente

Eseguito senza stampare chiavi o valori sensibili:

```text
supabase CLI: 2.109.1
Supabase locale API: http://127.0.0.1:54321
Supabase locale DB: postgresql://127.0.0.1:54322
Supabase locale Studio: http://127.0.0.1:54323
container locale: MerchandiseControlSupabase attivo
wrangler CLI: 4.105.0
```

Lo status staging iniziale fallisce chiuso correttamente:

```text
BLOCKED_STAGING_SUPABASE_URL_REQUIRED
```

Nessuna migration, query mutativa, apply o deployment è stato eseguito nel
preflight. Il target staging verrà usato solo con URL `https://*.supabase.co`,
project ref allowlistato e conferme non-production previste dagli script.

## Evidence intermedia verificata

### RLS DSC-008/072/073

- test-first foundation: RED causale, quindi GREEN `4/4`;
- policy prodotti e prezzi: owner-bound e
  `is_active_shop_staff_admin_member`, senza fallback viewer;
- pgTAP preparato con `24` assertion per owner/manager/viewer, mapping
  sospeso/attivo/unmapped, cross-shop, spoof, grant helper e DELETE revoke;
- re-review indipendente: `PASS`, nessun finding residuo statico;
- runtime pgTAP: `NOT_RUN_PENDING_ORDERED_LOCAL_MIGRATION_APPLY`.

### Android canonico

- overlay allowlistato: `38/38` hash identici al riconciliato;
- `gradle/libs.versions.toml` canonico preservato su AGP `9.3.0`;
- `.idea/deploymentTargetSelector.xml` escluso;
- `assembleDebug`: `PASS`;
- `lintDebug`: `PASS`, `0 errors`, `23 warnings` non bloccanti classificati;
- unit: `612` eseguiti, `0` failure/error, `5` skipped;
- `assembleDebugAndroidTest`: `PASS`;
- emulator `connectedDebugAndroidTest`: `20` eseguiti, `0` failure/error,
  `18` skipped perché i gate live non sono configurati;
- index Git vuoto e `git diff --check` `PASS`.

### iOS canonico

- overlay: `48/48` file in parità, mismatch `0`, manifest
  `65f59cfeee5b7a9ab826cbfed2feb034a417377ef2f60dc83c974598dbb8b239`;
- fix causale post-integrazione: `SyncDecisionInputProvider` usa
  `AccountBindingStore` con i `UserDefaults` iniettati; annotazione Sendable
  coerente con lo store immutabile;
- Debug e Release: `PASS`, warning applicativi `0`;
- ring sync: `296`, failure `0`;
- Task119 automatic architecture: `20`, failure `0`;
- suite completa finale: `984`, failure `0`, skip live-gated `32`;
- quattro localizzazioni `plutil`: `PASS`; script Supabase `bash -n`: `PASS`;
- index Git vuoto, nessun untracked/artifact harness, `git diff --check` `PASS`.

### Sales Sync DSC-093/094/134 - review 1

La prima implementazione ha raggiunto test statici verdi ma la review
indipendente ha prodotto outcome `CHANGES_REQUIRED`. Non viene conteggiata come
remediation chiusa. Blocker riprodotti dalla lettura SQL:

- residuo per-linea aggirabile da due righe nello stesso reversal;
- revalidazione atomica incompleta di device, credential e invalidazione
  sessione;
- permesso/cap sconto derivati da ruolo hardcoded, non dalla configurazione DB;
- discount/tax reversal non legati all'economia originale;
- reversal storici senza binding esclusi dal residuo;
- test regex-only insufficienti.

La seconda iterazione richiede pgTAP comportamentale prima di qualsiasi apply.

### Win7POS DSC-075 e sales line binding

- commit applicativo `138b3e64d82558e069bb04920bfda62e5d642b72`;
- commit handoff `4c82ac8dc5b392e9554a865b236ad65e2f823ffb`;
- merge/finale `origin/main`
  `0d6eaff0870014a93b29f184e868d6a619d67387`;
- push non-force, local/remoto/`ls-remote` identici, divergenza `0/0`, tree
  pulita;
- scanner `30/30`, lease/reversal `22/22`, Core `82/82`, mirati `27/27`,
  harness `8/8`, build Core/Data/CLI/WPF x86 `0` warning/`0` errori;
- Release Pack CI `29409840193`: `PASS`;
- runtime Windows: `EXTERNAL_TEST_PENDING_CODEX_ASUS`.

## Checkpoint consolidato Admin — 2026-07-15

### Integrazione e contratto sync finale

- overlay Admin riconciliato nella working tree canonica e mantenuto in parita
  byte-per-byte con il worktree `.../reconcile-20260714-ivtTcq/admin`;
- fixture route con marker `TASK_SYNC_FINAL_ADMIN_V1`, autenticazione e scope
  shop obbligatori, match prefix esatto, History read-only, ProductPrice
  append-only e osservazione burst `B01..B10` con `recordCount = 10`;
- SHA-256 della route finale:
  `a55568e96bf1c886c96dc25b0614ce739ec8ff9153998091f242b7d3e99d5595`;
- coordinatore con marker `TASK088_FINAL_SYNC_DRIVER_V1`, gate source e
  destination sul conteggio `10`; contratto coordinator `32/32`;
- Android congelato con SHA-256 harness
  `674c054ae6a681ba29fcdaa233b7e1601db8818780e9c16321fcddad82022eb5`;
- observer iOS aggiornato per `B01..B10`; build-for-testing `PASS`.

### Remediation RLS e Sales

- migration RLS `20260715120000_dsc_008_072_073_inventory_product_dml_rls.sql`
  e pgTAP `dsc_008_072_073_inventory_product_dml_rls.sql`;
- migration Sales `20260715130000_dsc_093_094_134_pos_sales_security.sql`
  e pgTAP `dsc_093_094_134_pos_sales_security.sql`;
- formula reversal allineata al payload Win7POS:
  `lineAmountTotal + missingDiscount - missingTax` per refund/void;
- coerenza payment/header rafforzata sia nell'handler sia nella RPC:
  somma amount, somma change e netto devono concordare prima dei sink;
- il test di errore sink usa pagamenti validi e viola intenzionalmente il
  vincolo `fiscal_status`, verificando il vero percorso `db_failure` e rollback.

### Gate realmente eseguiti

```text
RLS pgTAP:                         PASS 24/24
Sales pgTAP:                       PASS 26/26
Supabase migration repair/reapply: PASS
Supabase DB lint:                  PASS, 0 issue
Foundation final sync route:       PASS 5/5
Focused integration set:           PASS 58/58
Sales/deep focused set:             PASS 26/26
Reversal/payment handler behavior: PASS 4/4
TypeScript typecheck:              PASS
ESLint scoped:                     PASS
Security scanner:                  PASS
```

Il full gate Admin non e stato rilanciato in questa lane per evitare
duplicazione: resta assegnato al coordinatore root dopo l'handoff.

### Win7POS pubblicato e freeze esterni

- implementazione Win7POS:
  `dc162aeff484b576ef21565338cf3d5d492285d4`;
- `main`, `origin/main` e remoto:
  `ca1e57af4436ffecaee87f52aaf4dc62bdd6399e`;
- Release `95/95`, scanner `31/31`, WPF `x86/net48` e CI: `PASS`;
- runtime ZIP SHA-256:
  `9e489fcbcc770159ea99f748b3feb38c05d28ec4f409719a382e054455d4cd84`;
- runtime fisico: `EXTERNAL_TEST_PENDING_CODEX_ASUS`, non dichiarato `PASS`.

### Limiti e prossima fase

- staging Supabase/Cloudflare e live auth/latency: `NOT_RUN`, perché non sono
  stati forniti target non-production e credenziali abilitate a questa lane;
- Deep Security Scan post-fix: resta al coordinatore su snapshot immutabile;
- nessuno stage, commit, push o deploy Admin eseguito;
- task non marcato `DONE`; handoff al coordinatore per full gate e successiva
  fase `REVIEW`.

## Checkpoint finale LOCALK84 - 2026-07-16

Questa sezione sostituisce lo stato operativo intermedio sopra senza
cancellarne la cronologia. Il resume è partito dal checkpoint LOCALK74 e ha
preservato tutte le verifiche già concluse. Non sono stati ripetuti inventario,
migration dry-run, pgTAP, session-refresh test o cleanup già dimostrati perché
nessuna modifica successiva li ha invalidati.

### Stato esatto del resume

- `LOCALK82`: arresto `32/1024`, con `31` application PASS e primo stale
  conflict FAIL; `p50 620.185 ms`, `p95 1471.677 ms`,
  `max 2917.136 ms`; cleanup `PASS`.
- `LOCALK83`: `0` campioni, blocco prewarm prima di mutazioni; nessun dato
  creato.
- `LOCALK84`: run finale congelato e autoritativo, prefisso
  `TASK_SYNC_FINAL_20260714_LOCALK84_`; nessun rerun successivo.

### Gate prima della matrice

| Gate | Risultato |
|---|---|
| Target Supabase esplicitamente non-production | `PASS` — linked dev `merchandisecontrol-dev` |
| Migration dry-run vuoto | `PASS_PRESERVED` |
| Fixture sintetica univoca e baseline registrata | `PASS` — prefisso LOCALK84 e baseline before salvata |
| Session refresh verificato | `PASS_PRESERVED`; nel run finale `3/3` |
| Admin server pronto | `PASS` — `127.0.0.1:3050` |
| Android device pronto | `PASS` — emulator selezionato |
| iOS simulator pronto | `PASS` — iPhone 17 Pro, iOS 26.5 |
| Nessun altro processo final-sync attivo | `PASS` |
| Cleanup precedente a residuo zero | `PASS_PRESERVED` |
| Evidence/temp permissions | `PASS` — file sensibili/evidence operativa `0600` |

### Matrice 32 x 32

- risultato: `STOPPED_AT_46_OF_1024`;
- primo hard failure: sample `#46`, correlation
  `G002-warm-14`, `Admin -> iOS`, `Product update`, scenario `warm`;
- risultato applicativo del sample: `PASS`;
- latenza totale: `9595.406 ms`, oltre soglia max locale `3000 ms`;
- componente Admin/server: `8410.500 ms`;
- server-to-destination iOS: `1184.906 ms`;
- query/page/retry: `3/3/0`;
- pending after: `0`; full pull: `false`;
- stop al primo hard failure, nessun retry silenzioso e ledger parziale
  preservato;
- application result: `46 PASS`, `0 FAIL`;
- hard latency failure count: `1`;
- gruppi con gate aggregato `FAIL`: `Admin -> Android Product` e
  `Admin -> iOS Product`;
- coverage incompleta per stop anticipato: non viene dichiarato
  `1024/1024`.

Statistiche:

| Ambito | Count | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| Globale campioni completati | 46 | `656.217 ms` | `1774.779 ms` | `9595.406 ms` |
| Admin -> Android, non-burst | 31 | `603.346 ms` | `1574.803 ms` | `1669.574 ms` |
| Admin -> Android, tutti gli scenari | 32 | `603.346 ms` | `1669.574 ms` | `2818.479 ms` |
| Admin -> iOS, parziale | 14 | `1517.125 ms` | `9595.406 ms` | `9595.406 ms` |

Soglie LOCALK84: `p50 <= 1000 ms`, `p95 <= 1500 ms`,
`max <= 3000 ms`, burst `<= 5000 ms`. Le soglie non sono state rilassate.

Evidence principale:

- `ios-coordinator/agent-runs/20260716T193151Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK84_-environment-local-p4547.md`
- `ios-coordinator/agent-runs/20260716T193151Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK84_-environment-local-p4547.json`
- `ios-coordinator/agent-runs/20260716T193151Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK84_-environment-local-p4547.log`
- `ios-coordinator/agent-runs/20260716T193151Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK84_-environment-local-p4547-final-sync-ledger.json`

### Cleanup e baseline preservation

- cleanup automatico: `PASS`;
- tutti i codici Admin/Android/iOS/Supabase dry-run/execute/residue/count:
  `0`;
- residue count finale: `0`;
- `remoteNonFixtureBaselinePreserved = true`;
- conteggi remoti before/after identici:
  categories `139`, history `179`, product prices `41364`,
  products `19985`, suppliers `170`;
- session refresh finale: `3` tentativi, `3` successi, `0` failure;
- nessun dato cliente reale e nessuna credenziale salvata nell'evidence.

### Stato dei sette High/P1

| Finding | Stato post-fix | Evidence principale | Stato workbench |
|---|---|---|---|
| `DSC-008` | `CODE_FIXED_VALIDATED` | RLS role-aware + pgTAP 24/24 | `OPEN/UNCLOSED` |
| `DSC-072` | `CODE_FIXED_VALIDATED` | lifecycle mapped owner + pgTAP 24/24 | `OPEN/UNCLOSED` |
| `DSC-073` | `CODE_FIXED_VALIDATED` | lifecycle product-price + pgTAP 24/24 | `OPEN/UNCLOSED` |
| `DSC-075` | `CODE_FIXED_RUNTIME_PROOF_GAP` | Release 95/95, scanner 31/31, lease trace | `OPEN/UNCLOSED` |
| `DSC-093` | `CODE_FIXED_VALIDATED` | atomic permission/cap + pgTAP 26/26 | `OPEN/UNCLOSED` |
| `DSC-094` | `CODE_FIXED_VALIDATED` | locked cumulative residual + pgTAP/Win tests | `OPEN/UNCLOSED` |
| `DSC-134` | `CODE_FIXED_VALIDATED` | exact original-line/product/value binding | `OPEN/UNCLOSED` |

Nessun finding è stato chiuso o riscritto nel workbench. `DSC-075` richiede
ancora il runtime fisico Win7 per la massima confidenza di closure.

### Security diff scan post-fix

- nuovo Deep Security Scan: `NOT_RUN_BY_DESIGN`;
- scan canonico: `task088-k84-20260716T195843Z`;
- snapshot digest:
  `codex-security-snapshot/v1:sha256:fcfacbc9e7346273c20a521b26e290ae5ddba3d646cf1b4bb2f351b4b5aa548a`;
- risultato: `0` finding reportabili;
- sette candidate: `7/7` discovery, validation e attack-path receipt;
- coverage: `62/62` file scoped contabilizzati, `partial` dichiarata;
- limitazione: main-agent changed-hunk + complete control-chain review, non
  plugin-grade independent exhaustive full-file review perché i worker di scan
  erano vietati dall'addendum;
- hardening non reportabile: exact binding host/ref nel helper REST e allowlist
  output/admin + HTTPS nel refresh harness;
- report canonico:
  `/private/tmp/codex-security-scans/TASK-088-postfix-multirepo/task088-k84-20260716T195843Z/report.md`;
- manifest, report, canonical JSON e receipt hanno permessi `0600`.

### File TASK-088 per repository

Admin Web, scope security/final-sync:

- `scripts/run-with-env.mjs`
- `scripts/security-checks.mjs`
- `scripts/testing/task-088-bootstrap-session.mjs`
- `scripts/testing/task-088-refresh-session.py`
- `src/app/api/shop/pos/revenue/sale-detail/route.ts`
- `src/app/shop/qa-sync-fixture/route.ts`
- `src/server/pos-auth/sales-sync.ts`
- `supabase/migrations/20260715120000_dsc_008_072_073_inventory_product_dml_rls.sql`
- `supabase/migrations/20260715130000_dsc_093_094_134_pos_sales_security.sql`
- `supabase/migrations/20260715223000_task_088_mobile_atomic_sync_event_triggers.sql`
- i tre pgTAP TASK-088 sotto `supabase/tests/`;
- i sei test TASK-088 sotto `tests/e2e/staging/` e `tests/foundation/`;
- governance/evidence: `docs/MASTER-PLAN.md`, questo task file e questo
  ledger.

Android:

- `app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task103CrossPlatformAcceptanceTest.kt`.

iOS:

- `iOSMerchandiseControlTests/Task088ObservePrewarmCoordinatorTests.swift`
- `iOSMerchandiseControlTests/Task103CrossPlatformAcceptanceTests.swift`
- `tests/test_final_sync_contract.py`
- `tools/agent/lib/android.sh`
- `tools/agent/lib/final_sync.sh`
- `tools/agent/lib/final_sync_contract.py`
- `tools/agent/lib/ios.sh`
- `tools/agent/lib/task088_supabase_rest.mjs`

Win7POS:

- nessun file uncommitted nel checkout finale;
- i controlli lease/reversal sono già presenti in `main` a
  `ca1e57af4436ffecaee87f52aaf4dc62bdd6399e`.

I worktree Admin/Android/iOS contengono inoltre molte modifiche cumulative
preesistenti fuori dallo scope TASK-088, preservate senza reset, clean o stash.

### Staging/dev state

- Supabase linked target: `merchandisecontrol-dev`, esplicitamente
  non-production;
- migration dry-run: vuoto;
- migration/pgTAP/lint dev già verificati e non invalidati;
- fixture LOCALK84 sintetica e univoca;
- residue remoto finale: `0`;
- baseline non-fixture preservata;
- Cloudflare: nessun deploy eseguito nel resume;
- production: non letta o mutata tramite operazioni live del task.

### Git status finale dei quattro repository

| Repository | Branch / HEAD | Stato | Staged | `git diff --check` |
|---|---|---|---:|---|
| Admin Web | `main` / `20f430f8c6e7`, behind `origin/main` di 5 | 90 modified, 33 untracked entries | 0 | `PASS` |
| Android | `main` / `4dc5f725a816`, behind `origin/main` di 3 | 52 modified, 11 untracked entries | 0 | `PASS` |
| iOS | `main` / `2801241a646c`, tracking allineato nel status locale | 60 modified, 17 untracked entries | 0 | `PASS` |
| Win7POS | `main` / `ca1e57af4436`, `origin/main` e `origin/HEAD` uguali | clean | 0 | `PASS` |

### Rischi residui e handoff

- blocker primario: latenza K84; matrice incompleta a `46/1024`, con p95
  Admin -> Android oltre budget e outlier Admin -> iOS a `9595.406 ms`;
- runtime fisico Win7 per `DSC-075`: esterno;
- security diff coverage: scoped/control-chain, non exhaustive full-file
  indipendente;
- due note hardening harness non reportabili, da affrontare solo in un task
  successivo perché una patch post-K84 invaliderebbe l'identità del run
  congelato;
- worktree Admin/Android/iOS molto dirty e Admin/Android dietro i tracking ref:
  il reviewer deve evitare reset o integrazioni distruttive.

Verdict Codex: `REVIEW_WITH_BLOCKERS`, non `DONE`.

Conferma esplicita del resume: **nessun commit, nessun push, nessun deploy
production; nessun nuovo Deep Security Scan**.

## Resume TASK-088B e checkpoint LOCALK125 - 2026-07-17

Questa sezione sostituisce lo stato operativo LOCALK84 senza cancellarne la
cronologia. Inventario, migration dry-run, pgTAP, session-refresh e cleanup già
dimostrati sono stati preservati finché nessuna modifica successiva li ha
invalidati.

### Root cause temporale K84

| Fase | Durata | Evidenza |
|---|---:|---|
| Commit/coordinator Admin | `8410.500 ms` | `87.65%` dei `9595.406 ms`; segmento dominante verificato |
| Server -> osservazione iOS | `1184.906 ms` | include visibilità evento, polling/rete, apply e osservazione runner |
| Marker apply iOS | `864 ms` | intervallo interno, non additivo rispetto alle altre sottofasi |
| Residuo post-commit | `320.906 ms` | K84 non separa ulteriormente event visibility, rete e final observation |

Il campione `G002-warm-14` era funzionalmente `PASS`, con checkpoint avanzato,
pending finale `0` e `fullPull=false`. L'evidence non dimostra un collo di
bottiglia nel servizio produttivo iOS, nel simulatore o nella sola rete; il
ritardo è dominato dal segmento Admin/coordinator. Decisione:
`NO_PRODUCTION_PATCH`.

### Run mirati e iterazioni preservate

| Run | Scope | Esito | p50 | p95 | p99 / max | Note |
|---|---|---|---:|---:|---:|---|
| K97T | Admin -> iOS Product update warm | `32/32 PASS` | `783.173` | `923.354` | `1016.153 / 1016.153 ms` | failure `0` |
| K99T | Admin -> iOS Product update warm repeat | `32/32 PASS` | `883.089` | `1355.491` | `1447.981 / 1447.981 ms` | failure `0` |
| K118M | full matrix | `STOP 129/1024` | `846.401` | `1476.372` | `3774.517 / 4529.717 ms` | p99 `3774.517`; max globale burst G004 `4529.717`; stop G005 warm-01 iOS -> Admin |
| K119D | iOS -> Admin targeted diagnostic | `STOP` | - | - | `3029.078 ms` | primo errore preservato; retry harness distinto dal path produttivo |
| K120 | iOS -> Admin targeted | `32/32 functional, aggregate FAIL` | `1749.363` | `2078.062` | `2415.308 ms` | nessun failure funzionale |
| K121 | iOS -> Admin targeted | `group PASS, cleanup FAIL` | `870.090` | `1234.234` | `1420.689 ms` | primo errore durevole `cleanup_payload_invalid` per path vuoto; recovery pass 2 `PASS` |
| K122 | iOS -> Admin targeted | `32/32 functional, aggregate FAIL` | `872.092` | `1569.124` | `1681.150 ms` | cleanup `PASS` |
| K123 | iOS -> Admin Product create warm | `32/32 PASS` | `862.632` | `1248.463` | `1338.623 / 1338.623 ms` | full pull `0`, cleanup/baseline `PASS` |
| K124 | iOS -> Admin Product create warm repeat | `32/32 PASS` | `834.865` | `1058.543` | `1385.247 / 1385.247 ms` | full pull `0`, cleanup/baseline `PASS` |

K121 non è stato promosso a PASS finale perché il cleanup fallì; il primo
errore durevole è `cleanup_payload_invalid`, causato dal path cleanup vuoto.
La sessione Android stale è una causa successiva/inferita, non il primo errore
registrato. Il primo recovery riportava `residue_count=0` ma aveva codici
Android/Supabase non-zero e baseline ricostruita, quindi non prova cleanup
completo. Solo il recovery pass 2 ha verificato tutti i nove codici a `0`,
residuo `0` e baseline preservata. Nessuna iterazione di run o gruppo è stata
nascosta o sostituita da retry silenzioso; i retry bounded interni dei driver
non sono però contabilizzati integralmente dal campo `retryCount`.

Per precisione, in K84 G001 aveva già fallito il gate p95 aggregato prima del
sample `#46`: `#46` resta il primo hard failure per-sample. Analogamente,
in K118M il comparator TASK-123 p95/max era già fallito dopo G004 prima dello
stop per-sample `#129`; il comparator p50 K118M era ancora `PASS 1.239x`.

### Modifiche TASK-088B

Nessun codice produttivo è stato modificato per la latenza. I cambi sono
limitati a test/harness:

- iOS `Task103CrossPlatformAcceptanceTests.swift`: telemetria pre-gate e uso
  nel test del servizio automatico atomico già produttivo;
- iOS `tools/agent/lib/final_sync.sh`: mapping delle nuove fasi e telemetria
  destination Admin;
- iOS `tools/agent/lib/final_sync_contract.py` e relativo test Python: campi
  di fase contrattuali;
- Android `Task103CrossPlatformAcceptanceTest.kt`: sessione fresca per il
  cleanup e flag di refresh già verificato.
- iOS `tools/agent/lib/task088_supabase_rest.mjs`: hash post-K84 differente,
  helper untracked quindi attribuzione Git non ricostruibile; il contenuto
  corrente con cleanup event-ID scoped è stato incluso integralmente nel
  security diff review.

Check post-modifica realmente eseguiti:

```text
iOS incremental apply tests:          PASS 8/8
iOS selected harness regression:      PASS 2/2
iOS Debug build:                      PASS
Android equivalent contract tests:   PASS 234/234
Android Debug build:                  PASS
Shared final-sync contract:           PASS 60/60
```

### LOCALK125 - matrice completa richiesta

- prefisso: `TASK_SYNC_FINAL_20260714_LOCALK125_`;
- un solo runner, nessun processo concorrente;
- risultato: `STOPPED_AFTER_128_OF_1024_BEFORE_G005`;
- punto esatto: gate aggregato dopo G004 `Android -> iOS Product`, prima del
  campione `129` / gruppo G005;
- risultati applicativi: `128 PASS`, `0 FAIL`; full pull `0`;
- failure count: `0` funzionali, `2` gate aggregati
  (`android:ios:Product`, confronto TASK-123 warm);
- stop al primo gate fallito, nessun retry e ledger parziale preservato.

Statistiche globali parziali sui 128 campioni, burst inclusi, nearest-rank:

| Count | p50 | p95 | p99 | Max | Failure applicative |
|---:|---:|---:|---:|---:|---:|
| 128 | `821.154 ms` | `1282.011 ms` | `3120.301 ms` | `4853.488 ms` | 0 |

Gruppi completati; p50/p95/p99/max sono non-burst, burst separato:

| Gruppo | Direzione | p50 | p95 | p99 / max | Burst max | Esito |
|---|---|---:|---:|---:|---:|---|
| G001 | Admin -> Android Product | `838.096` | `1114.742` | `1139.939 / 1139.939 ms` | `2778.597 ms` | `PASS` |
| G002 | Admin -> iOS Product | `785.379` | `1082.515` | `1282.011 / 1282.011 ms` | `1704.279 ms` | `PASS` |
| G003 | Android -> Admin Product | `688.726` | `1265.314` | `1850.577 / 1850.577 ms` | `3120.301 ms` | `PASS` |
| G004 | Android -> iOS Product | `1008.715` | `1253.091` | `1520.728 / 1520.728 ms` | `4853.488 ms` | `FAIL_P50` |

Il primo gate fallisce solo su p50 G004: `1008.715 ms` contro `1000 ms`,
delta `+8.715 ms`. p95, max e burst restano entro le soglie non rilassate.
Non esiste un singolo sample hard failure in K125.

Il confronto paired G004 K118M -> K125 mostra source coordinator medio
`-3.994 ms`, server-to-iOS `+25.477 ms`, event visibility/fetch `-0.871 ms`,
domain fetch `-13.355 ms`, domain apply/persistence `+10.194 ms` e runner final
observation `+32.419 ms`. I marker interni iOS si sovrappongono e non sono
additivi. Nessuna regressione produttiva iOS o di rete-only è dimostrata.

Il confronto TASK-123 warm server-to-iOS fallisce: p50
`510.840/408.000 ms` (`1.252x`), p95 `589.232/445.000 ms` (`1.324x`), max
`671.273/448.000 ms` (`1.498x`). La comparabilità tra baseline fisica e la
coppia emulator/simulator corrente non è dimostrata; non viene dichiarata
parity fisica.

### Invarianti Android/iOS

| Invariante | Android | iOS | Evidence K125 |
|---|---|---|---|
| Checkpoint | avanzamento obbligatorio e watermark persistito | avanzamento obbligatorio e checkpoint persistito | `PASS` nei 128 sample |
| Duplicate | mutazione duplicata idempotente | mutazione duplicata idempotente | `PASS` G001-G004 |
| No-op | nessuna scrittura/evento spurio | nessuna apply/persistenza spuria | `PASS` G001-G004 |
| Stale conflict | fail-closed/server authoritative | fail-closed/server authoritative | `PASS` G001-G004 |
| Tombstone | soft-delete applicata | soft-delete applicata | `PASS` G001-G004 |
| Offline/reconnect | outbox e catch-up incrementale | pending push e catch-up incrementale | `PASS` G001-G004 |
| Account/shop switch | isolamento owner/shop nei test mirati | isolamento owner/shop nei test mirati | `NOT_REACHED_K125` |
| Full-pull avoidance | full pull vietato nel final driver | full pull vietato nel final driver | `0/128` full pull |

La parity dichiarabile è contrattuale/funzionale sui percorsi eseguiti; non è
parity prestazionale fisica tra emulator e simulator.

### Cleanup, baseline ed evidence durevole

- K123/K124/K125 cleanup: `PASS`, tutti i nove codici `0`;
- K125 residue count `0`, Admin residue checks `6`, marker cleanup Android
  presente, session refresh `5/5`;
- i sei check Admin dimostrano la presenza delle risposte, non verificano da
  soli `recordCount == 0`; il residuo zero è comunque provato
  indipendentemente dal check Supabase, dai nove codici a zero, dai marker
  locali e dalla baseline remota invariata;
- remote non-fixture baseline before/after identica;
- xcresult durevoli: K123 `35`, K124 `34`, K125 `103`, permessi directory
  `0700`, sotto `ios-coordinator/xcresults/LOCALK123|124|125`;
- diagnostico riproducibile:
  `task-088b-latency-diagnostic.json` e
  `task-088b-latency-diagnostic.sql`; query SQLite JSON1 eseguite con exit
  `0`. Lo SQL è una proiezione verificabile del JSON, non un ricalcolo
  indipendente dai ledger;
- report K125:
  `ios-coordinator/agent-runs/20260717T054430Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK125_-environment-local-mode-full-p69539.json`.

### Stato TASK-088B

- verdict: `REVIEW_WITH_BLOCKERS`;
- matrice: non `1024/1024`, arresto esatto `128/1024`;
- patch produttiva latenza: `NONE`;
- soglie: invariate;
- rischio primario: p50 G004 appena oltre budget e runtime non comparabili;
- gap security già noto: runtime fisico Win7 per `DSC-075`;
- production: non letta o mutata; nessun deploy/apply production;
- Deep Security Scan: non riavviato.

### Security diff scan post-K125

- target: delta K84 -> K125 sui sei file hash-differenti, con confronto
  dell'intero inventario scoped K84 `62` righe;
- `56/62` file sono byte-identici a K84; tutte le root-control chain dei
  sette High/P1 sono comprese in queste 56 righe;
- `6/6` file delta hanno full-file receipt; nessun file produttivo è cambiato;
- risultato: `0` finding reportabili, discovery conclusa senza candidati;
  validation/attack-path del nuovo scan correttamente non avviate;
- stato High/P1: DSC-008, DSC-072, DSC-073, DSC-075, DSC-093, DSC-094 e
  DSC-134 `7/7 INVARIATI_NON_REGRESSI`; i finding originari restano
  aperti/non chiusi e DSC-075 conserva il gap fisico Win7;
- coverage: `partial`, per matrice K125 `128/1024`, account/shop switch non
  raggiunto live e runtime fisico Win7 esterno;
- hardening non reportabile: residue Admin contato ma non validato
  semanticamente, retry interni iOS sottocontati, sottofasi automatic-push
  aggregate e target/path binding locale migliorabile;
- report durevole:
  `security-diff-scan-LOCALK125/report.md`;
- snapshot digest:
  `codex-security-snapshot/v1:sha256:0afa24035024319761e65904b8db99f0b53acbbf94ebbb60cc7b8f2a85ec855b`.

Conferma esplicita TASK-088B: **nessun commit, nessun push, nessun deploy
production; nessun nuovo Deep Security Scan**.
