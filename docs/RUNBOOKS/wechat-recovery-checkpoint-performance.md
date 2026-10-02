# WECHAT-010 — prestazioni del checkpoint di recovery

## Current status — pipeline applied; authentic retry still failed, 2 October 2026 UTC

PR124 merged at `2e236586` with head and postmerge CI/Cloudflare PASS. The
coordinator applied the exact integrity SQL once at 01:37:45 UTC as service version
`20261002013745`, registry151. The source migration originally named
`20261002011223` is renamed byte-for-byte, SHA256
`c3960c7e7c4ffd49dd61e5a84b9108ddd2fb0fa34f1d5e87d6439fe3d546c07b`;
its regression runner changes only that filename. The independent postcheck at
01:38:10 preserves prior registry entries, scoped data/events, OIDs/ACL and other
functions/triggers, with the expected checkpoint body change only.

Authentic iOS Retry at 01:39:43–01:39:52 still failed HTTP500/SQLSTATE57014 in final
integrity. There was no new manifest/finalization proof. Subsequent standalone
read-only phase profiling identified cumulative work across preflight, events,
products, prices and integrity. Instrumented phase timings must not be summed and
presented as an authenticated RPC measurement. Runtime `statement_timeout=8s`,
lease checks and the catalog fence remain unchanged.

PR125 integrated the reviewed pipeline correction at `7bd490ba` after exact-head
and postmerge CI/Cloudflare PASS. The coordinator applied its exact SQL once at
02:53:17 UTC, service `20261002025317`, registry152. The 02:53:40 independent
postcheck confirms the expected three bodies and two helper languages only;
existing OIDs/full ACL and all other metadata, unrelated functions/triggers,
History storage, scoped rows and events are unchanged. Source version
`20261002022202` is renamed to the assigned service version with identical SHA256
`38e504d8b2bd06620b4325c20189eb420ec75afead3572f0685bbb12ed2ba626`.
The local regression runner changes only its migration path. There is no replay.

The applied migration `20261002025317_wechat_010_checkpoint_pipeline_performance.sql`
changes exactly three existing routines:

- The checkpoint's product SELECT projects the nine fields it consumes and
  materializes the same recovery DTO bytecount once per row in the same statement.
  Counts, raw digest fields, UUID ordering, WHERE predicate and byte threshold are
  identical. No preflight summary is reused across snapshots or differing domains.
- The event-row and relation-row scope helpers use PL/pgSQL and short-circuit only
  when the row already has a shop. That branch is exactly `event shop IS NOT NULL
  AND row shop = event shop`. Each complete original legacy expression remains
  byte-identical in the fallback, preserving SQL NULL and mapping semantics.

The guard pins exact OIDs by signature, bodies, owner, full ACL, arguments/defaults,
security, language, volatility and evaluation attributes. Only the two existing
helper languages and the three bodies change. No grants, new routines, indexes,
row rewrite, timeout extension or weakened validator are introduced. DDL has
transaction-local 5s lock and 60s statement limits. Runtime keeps its existing 8s.

The coordinator refreshed registry151 and scoped fingerprints immediately before
application, retaining all three definitions and complete metadata. Postcheck
confirmed event scope body MD5 `95de885c228cb643e349730ae925078c`, relation scope
`2eb0aee5feb14762b8a52da19662e5f0` and checkpoint
`f9f74642dbf4e8c1b7e1949f8972c582`. Any compensating restoration requires review
and the saved three definitions plus the same metadata/data postchecks; it never
resets data. Receipts remain private under `checkpoint-pipeline-apply-*`.
The single authentic iOS Retry on registry152 at02:55:18–02:55:27 failed again
HTTP500/SQLSTATE57014, now in the price SELECT at checkpoint line418, origin8279ms
and upstream8049ms. Binding remained unchanged; manifest/finalization/journal were
absent and verified=false. Android152 is NOT_RUN and there is no identical retry.
The private log is `checkpoint-pipeline-ios-failure-logs.json`. Successful source
integration, SQL application or a phase SELECT is not native recovery acceptance.
Further correction requires evidence from the complete cumulative execution, not
a speculative change based only on the final interrupted statement.

Local verification command (dedicated disposable clone, synthetic rows only):

```sh
node scripts/testing/wechat-010-checkpoint-pipeline-performance.mjs
```

The fixture retains the previous representative 61,595 rows and 2,074 events. The
runner uses TEST's `work_mem=2184kB`, one parallel worker and JIT off, and enforces
8s per complete authenticated checkpoint. It compares complete JSON, current and
zero verified baselines, six calls in a single forced-generic backend, and the
10,001-event cap. Exact metadata/data/other-function parity and rollback/reapply
are required. Product vectors cover NULL, Unicode, oversize, nonfinite and tombstone
inputs, including exact aggregate parity and reduced DTO evaluation count.
The 32 targeted pgTAP assertions include 8,750 comparisons against canonical
SQL oracles using synthetic mapping-table copies, plus 3,750 comparisons through
real mapped/disabled/absent states. They exercise NULL, ambiguous/unverified and
nonfinite mapping cases without disabling canonical triggers. The full 184 History
and 365 native recovery contract assertions are also required.

Independent read-only TEST product SELECT comparison already returned identical
complete JSON: baseline 1653.153/1620.620ms versus candidate 1202.087/1170.984ms in
ABBA order, two samples each. The receipt is kept privately in
`checkpoint151-products-comparison.json`. This is a phase-only improvement; it
proves neither full RPC completion nor p95. Final source clone checks pass all
32+184+365 assertions and 15 guard scenarios plus wrong-role denial. Complete
checkpoint samples are baseline3979/3956/3977ms versus candidate2728/2706/2789ms;
current verified baseline2121ms versus1993ms; 10001-event cap6224ms versus3349ms.
Both versions complete six same-backend forced-generic calls under8s each.
Product DTO evaluation count is39664 versus19832 with identical aggregate JSON.
Complete metadata/data/other-function parity and rollback/reapply pass. Logs are
private in `checkpoint-pipeline-performance.log`; the initial vector-fixture SQL
failure remains separately preserved. No native terminal PASS is implied.

## Previous review — final integrity, 2 October 2026 UTC

PR123 merged at `e4377f83` after exact-head and postmerge CI/Cloudflare PASS.
The coordinator applied the price-digest SQL once at 00:54:14 UTC. Source version
`20261002002517` maps to service `20261002005414`, registry 150; SQL SHA256
`54bc73e0dcbd4bd1d4323989b3bce6dc1c528117fe45509c35b5301243d8474a` is unchanged.
The 00:54:42 postcheck preserved previous 149 registry entries, function identities,
ACL and all scoped data/events, with only the expected implementation changes.
This source reconciliation renames the migration and its regression-runner path.

Authentic recovery remains open: iOS at 00:55:17 and Android at 00:59:26 each still
returned HTTP500/SQLSTATE57014, now inside the final integrity SELECT after the
price/history/image aggregates. Mini polling also waited on the same catalog
fence. Preserve these failures; the lock and the runtime 8s deadline are unchanged.
The native apps were parked normally to prevent repeated contention during diagnosis.

The additive candidate changes only the final integrity SELECT in
`shop_sync_recovery_checkpoint_v1`: narrower materialized row projections and
per-SELECT validation of distinct non-NULL price timestamps and numeric values.
Date strings use bytewise `C` collation. Numeric equality only coalesces values
with the same predicate result, including NaN and signed zero. LEFT JOINs retain
every scoped row, so violations are still counted per row, including multiple
invalid fields on one product. NULL price/date remains invalid; NULL product
number remains materializable. No persistent or cross-statement cache exists.
All validators, event processing, scopes, parent checks, DTOs, digest inputs/order,
lease checks, advisory locks and final status construction remain unchanged.

The DDL guard checks the exact checkpoint signature, source, attributes and complete
canonical-local or observed-TEST ACL set. It also pins the three memoized predicate
bodies, immutability and evaluation configuration. The migration replaces only the
checkpoint body; it adds no helper, index, privilege, data mutation or timeout change.

The coordinator additionally compared the original and candidate SELECT against
TEST in read-only transactions with an 8s limit, without calling an authenticated
RPC or changing a definition. All 20 integrity counters were equal and zero.
Original execution 3536.944/3183.693ms versus candidate 1785.830/1827.670ms; the second
pair reversed execution order. This proves the measured SELECT improvement, not
terminal recovery or full RPC completion. Four plans and the comparison are kept
privately in `integrity-readonly-comparison-receipt.json`. No p95 is inferred from
these two samples per version. The earlier dataset counts refer to that snapshot;
subsequent authorized Mini fixtures require a fresh pre-application fingerprint.

Run the local regression and whole-checkpoint benchmark with Node22:

```sh
node scripts/testing/wechat-010-checkpoint-integrity-performance.mjs
```

Its disposable local Docker clone has 61,595 synthetic rows: 19,832 products
(19,772 active, 19,811 parent-linked), 41,345 prices, 135 suppliers, 104 categories,
178 History (83 active, 1,437 array rows) and one ready primary image. History data
and overlay text total 232,794 and 23,852 bytes. These generated strings are not
real business data, and the sizes are not asserted to match TEST exactly. Numeric
cardinalities and near-universal parent references address the previous simpler
fixture. All business triggers remain active; the image fixture uses the normal
server-managed guard in the disposable clone only.

Local complete-checkpoint samples on 2 October, milliseconds:

| Case | Previous source | Candidate |
| --- | --- | --- |
| 2,074 events, first new backend | 4225 | 3972 |
| Repeated calls, fresh backend/shared data cache | 4197 / 4153 | 3943 / 3969 |
| Verified current event baseline | 2383 | 2130 |
| 10,001 events, baseline zero | 6613 | 6190 |

Every measured call keeps the 8s deadline. These are local samples, not cold-cache
or remote percentile claims. Complete old/new JSON is identical, including the
scope, hashes, payload budgets and event decisions. The 10,001-event case still
inspects 10,000 and requires full recovery. Six consecutive calls in each of the
same original/candidate backends with `force_generic_plan` also remain identical
and finish under the per-statement 8s deadline.

Deterministic RED→GREEN in the final SELECT: price validator calls 41,345→1,142;
product-number calls 59,496→1,345; legacy-timestamp calls 82,773→1,407 (including
83 unchanged History calls). All-unique distributions validate every distinct input
and finish under 8s. Temporary constraint-free projections compare every integrity
counter for NULL, NaN, infinities, signed zero, subnormal/large/fractional numbers,
invalid dates, missing parents, duplicate barcodes and empty inputs; no malformed
canonical rows or disabled triggers are involved.

Nine guard scenarios plus the wrong deploy role, nine focused pgTAP assertions,
184 History and 365 native-contract assertions PASS. Full metadata/OID/ACL and
all unrelated function definitions stay exact; row/event fingerprints are unchanged.
An explicit rollback then reapplication preserves the same output and metadata.
Full Admin Node22 verify, targeted runner lint and diff checks PASS. Private logs:
`checkpoint-integrity-performance-tests.log`, `checkpoint-integrity-performance-verify.log`.

Before release, the coordinator must refresh registry 150, exact checkpoint source/
metadata/ACL and all scoped row/event fingerprints (including newly authorized
Mini fixtures), save protected original definitions, then apply only the reviewed
merged additive migration once. Record its assigned service version. Independently
verify the target OID/metadata/ACL, unchanged predicates/other functions/triggers
and all data/events. A reviewed additive restoration of the saved checkpoint is
the rollback. Only a subsequent authentic terminal recovery proves the full RPC
fits the existing budget. The read-only SELECT improvement does not establish that.

## Historical review — price digest, before its 2 October 2026 application

After the previous performance and History fixes were applied (registry149),
authentic iOS and Android recovery each still reached HTTP500/SQLSTATE57014 in the
checkpoint price aggregate. iOS origin8227ms/upstream8099ms at00:11:58.614UTC;
Android origin8181ms at00:24:27.912UTC. The clean resource preflight does not prove
that the complete checkpoint finishes. Both original failures remain preserved;
this candidate has no remote application or authentic recovery acceptance yet.

`20261002002517_wechat_010_price_digest_performance.sql` changes only the price
aggregate in `shop_sync_recovery_checkpoint_v1` and the implementation language of
`sync_price_canonical_amount_v1`. The latter returns the exact existing expression.
The price CTE materializes only digest inputs and the computed DTO byte count,
so each DTO is serialized once. Non-NULL timestamp spellings are de-duplicated
with bytewise `C` collation and each calls the unchanged validator once per SELECT.
Two LEFT JOINs retain every price, including NULL/invalid spellings and the original
`invalid` fallback. There is no persistent cache. Scope/parent predicates, raw
strings, UUID ordering, hash expressions, all other domains and the preflight
remain unchanged. The RPC stays VOLATILE; its 8s runtime budget is unchanged.

The DDL guard requires postgres, exact signatures/source/attributes and complete
ACL sets (canonical local or the observed TEST checkpoint set). It never grants or
revokes existing permissions. CREATE OR REPLACE preserves OIDs/owners/ACLs. Local
DDL lock/statement limits remain5s/60s. No data, trigger, index or registry repair.

PostgreSQL can fold an ordinary CTE into its parent query; explicit
[MATERIALIZED](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION)
prevents duplicate computation here. The evidence below also measures actual
[transaction-local function counters](https://www.postgresql.org/docs/17/monitoring-stats.html),
rather than inferring speed or evaluation counts from source alone.

Run the isolated regression/benchmark from the repository root with Node22:

```sh
node scripts/testing/wechat-010-price-digest-performance.mjs
```

The runner uses only a disposable local Docker schema clone, no database URL or
live rows, and removes the clone in `finally`. All fixture triggers remain active.
Its61,595 synthetic rows contain41,345 prices,165 legacy prices and663/661 distinct
effective/created timestamps, matching the measured price cardinalities. Other
domain counts remain the existing synthetic load described below; this is not a
copy or exact distribution of TEST. It compares complete checkpoint JSON, including
all byte counts, hashes, scope and event decisions, under the real authenticated
role in verified mixed shop/legacy scope.

Local results on2 October (milliseconds):

| Complete checkpoint | Previous source | Candidate |
| --- | --- | --- |
| 2074 events, first call in a new backend | 4432 | 3865 |
| 2074 events, repeated shared-cache calls | 4405 /4467 | 3956 /3831 |
| Verified current event baseline | 2952 | 2428 |
| 10001 events, baseline zero | 5896 | 5430 |

Each candidate checkpoint uses8s. The original diagnostic oracle permits40s,
although it completed below8s on this Mac. These are local samples, not remote
percentiles or proof that TEST now finishes. Each call has a fresh backend/plan;
shared data/OS caches are not evicted. The10001-event case still inspects10000,
reports incomplete scan and requires full recovery. Separate EXPLAIN measurements
attribute the gain to the price stage; other pipeline stages remain unchanged.

Deterministic RED→GREEN: original price aggregate calls the DTO constructor82,690
times and the timestamp validator82,690 times; candidate calls41,345 and1,324.
The complete old/new JSON SHA256 for the2074-event fixture is
`e8f14905be56beaeccf1243a7caf8f23c56d500ac5e0a72c524191502991e013`.
Nine baseline/ACL/source/signature cases,14 new scalar assertions,184 History and
365 native contract assertions PASS. Temporary projections also prove equal
NULL/invalid/empty/Unicode/nonfinite/rounding results and all82,690 timestamps
unique. Every non-NULL unique spelling is still validated. Full metadata except
the intended scalar language, unrelated functions, row/event fingerprints and
compensating rollback/reapply remain exact. Private logs:
`price-digest-performance-tests.log`, `price-digest-investigate-next.log`.
Full Admin Node22.23.3 verify PASS (lint/type generation/typecheck/security/build);
`git diff --check` PASS. Verification log: `price-digest-performance-verify.log`.

Before coordinator release, acquire a fresh registry149/source/metadata/ACL
snapshot and protected original definitions. In a coordinated DDL window apply
only the twice-reviewed merged SQL once; record any service-assigned version.
Independently compare existing OIDs/full metadata/ACL, expected two body changes,
other functions/triggers, scoped rows and event fingerprints. Rollback is an
additive reviewed restoration of those protected definitions, with data untouched.
Only then perform a bounded authentic Retry and assess the terminal recovery and
latency. A clean preflight or successful migration alone is insufficient.

## Historical receipt — first performance delta, 1 October 2026

Stato: PR119 integrata in main4532831b con CI/Cloudflare PASS; migrazione TEST
applicata una sola volta dal coordinatore il1 ottobre2026. Nessun Retry autentico
è stato eseguito per dichiarare recovery/convergenza. Il checkpoint canonico, i
guard di scope e storage e il limite runtime di8 secondi restano identici.

Il servizio ha assegnato20261001220355 alla sorgente20261001195438, con SQL SHA256
`54a49cbf529e1019468c9e2708c36f83eea783edca31b0df3c22af43e8fc80d7` invariato.
Registry148 mantiene i147 precedenti record/hash. Postcheck22:04:29UTC: sei helper
con OID/owner/ACL/attributi identici e stesse espressioni PL/pgSQL, due indici;
altre funzioni/trigger, fingerprint dati scoped e2074 eventi invariati. Backup,
intent, risultato e postcheck sono ricevute private; nessun secret è pubblicato.

## Difetto e delta

Il Retry iOS del 29 settembre, dopo la normalizzazione fisica delle 16 History,
ha ricevuto HTTP500/SQLSTATE57014; il contesto server indicava il preflight dei
prezzi. La riproduzione locale misura **l'intero checkpoint**, non solo il preflight.
La scansione eventi ripete ricerche `lower(id::text)` che non possono usare il PK
UUID; i helper SQL scalari vengono inoltre richiamati per ogni riga, più volte
fra preflight, digest e integrità.

`20261001220355_wechat_010_recovery_checkpoint_performance.sql` aggiunge due indici
sull'esatta espressione esistente, in `inventory_products` e
`inventory_product_prices`. Converte sei helper privati da SQL a PL/pgSQL con
`RETURN` della stessa identica espressione. Non cambia il corpo di alcun RPC,
validator, digest aggregate, resolver, writer o trigger. Non modifica alcun dato.

Gli [indici di espressione PostgreSQL 17](https://www.postgresql.org/docs/17/indexes-expressional.html)
consentono questa ricerca mantenendo la semantica del predicato. Il meccanismo di
[preparazione delle espressioni PL/pgSQL](https://www.postgresql.org/docs/17/plpgsql-implementation.html#PLPGSQL-PLAN-CACHING)
riusa le espressioni analizzate nella sessione. Il beneficio riportato sotto è
misurato sul checkpoint completo, non dedotto solamente da questi meccanismi.

Il guard DDL richiede `postgres`, sei firme regprocedure/OID e return type esatti,
argomenti/defaults attesi, sorgenti originali precise, owner, ACL,
volatility, STRICT, parallel safety e search_path attesi. `CREATE OR REPLACE`
conserva identità/OID, owner e ACL. I timeout DDL sono transaction-local:
`lock_timeout=5s`, `statement_timeout=60s`; non modificano il limite runtime.
Gli indici non sono UNIQUE e non aggiungono restrizioni ai writer esistenti.

## Riproduzione isolata e risultati

Da root repository, con Node22:

```sh
node scripts/testing/wechat-010-recovery-checkpoint-performance.mjs
```

Il runner accetta solamente il socket Docker locale, un container Supabase e un
template `wechat010_*` senza business data e senza connessioni attive. Clona il
template con owner postgres, applica le due migrazioni precedenti già revisionate,
esegue il contratto pgTAP e inserisce soltanto fixture sintetiche con tutti i
trigger attivi. Rimuove il clone nel `finally`. Non accetta URL database.

Fixture: 61.595 righe (20.106 prodotti, 41.345 prezzi, 78 fornitori, 50 categorie,
16 History); è un carico sintetico comparabile, non una copia del dataset TEST.
I 2.074 e 10.001 eventi sono prodotti da writer con transazioni reali separate,
rispettando il raggruppamento canonico per transazione.

Risultati del collaudo finale del 1 ottobre 2026:

| Caso completo | Sorgenti originali | Candidato |
| --- | --- | --- |
| 2.074 eventi, baseline zero | timeout a 8s senza indici; 8.433ms con soli indici | 4.695 / 4.584 / 4.638ms |
| baseline verificata pari al massimo evento | 6.951ms con soli indici | 3.074ms |
| 10.001 eventi, baseline zero | 9.910ms con soli indici | 5.959ms |

Per ottenere l'oracolo completo dei sorgenti originali il solo clone diagnostico
usa 40s e mantiene gli indici. Ogni esecuzione del candidato usa 8s. A 10.001
candidati, il risultato mantiene `inspectedCount=10000`, `scanComplete=false` e
`requiresFullRecovery=true`; la coda non è promossa a prova di convergenza.

PASS: confronto completo JSON originale/candidato, inclusi tutti i digest, byte
DTO, scope e decisioni eventi; null, UTC/microsecondi, Unicode, numeri non finiti
e tombstone; espressioni scalari originali identiche; OID/owner/ACL/attributi e
ogni altra funzione invariati; fingerprint righe/eventi invariato prima/dopo;
ruolo, ACL e firma inattesi rifiutati atomicamente; rollback DDL e rollback compensativo
con reapply; piani naturali che usano entrambi gli indici; **365/365** del contratto
nativo `cross_platform_sync_recovery_contract.sql`.

Nel clone gli indici occupano rispettivamente 1.212.416 e 2.465.792 byte. Ogni
nuova riga richiede la relativa manutenzione indice; non è attestato un p95 di
scrittura né una latenza live. Il checksum completo del checkpoint sintetico
originale/candidato è `fd39ab8302ec659680bc831b527531e5e74fa526648a7aca23aa4b269c72ccba`.
Il guard precedente, basato sul solo nome, è stato riprodotto in un clone: un
omonimo con firma errata avrebbe permesso la creazione di una nuova funzione
con ACL di default. La regressione V2 rifiuta quel drift prima degli indici;
entrambe le prove sono rollback-only. Il log integrale resta nella ricevuta privata `checkpoint-performance-regression-v2.log`.

Validation: full Admin `verify` on Node22.23.3 PASS (lint, route type generation,
TypeScript, security scan, production build); `git diff --check` PASS.

## Procedura TEST revisionata (applicazione completata)

Prima di un'eventuale applicazione, acquisire un fresh snapshot scoped di registry,
sorgenti/owner/ACL dei sei helper, definizioni degli RPC/guard invariati, indici,
trigger e fingerprint dati/eventi. Verificare una finestra DDL coordinata. Applicare
una sola volta i byte revisionati tramite la convenzione Admin e registrare la
versione assegnata dal servizio; non simulare un timestamp del registry.

Confermare poi i sei helper, i due indici e l'assenza di ogni altro cambiamento;
rieseguire il checkpoint autentico con il client e la sessione autorizzati. Se il
DDL incontra il limite lock/statement, la transazione deve fallire senza effetto:
nessun retry automatico o timeout aumentato.

Rollback: dopo fresh confronto dello stato, ripristinare le sei definizioni
originali dal backup revisionato e rimuovere soltanto i due indici introdotti,
in una transazione con gli stessi limiti DDL. Conservare il registry/receipt
secondo il normale processo compensativo Admin. Nessun rollback di dati o eventi.

## Limiti e secondo problema distinto

Il 1 ottobre Android ha osservato HTTP200 con `checkpoint_resource_exceeded`.
La diagnosi scoped read-only ha isolato tre History attive con storage e JSON
tipizzati validi, ma timestamp ISO rifiutati dal validator legacy. Non è un timeout
e questo delta conserva esattamente tale rifiuto. Una compatibilità documentata
richiede un delta separato: non cancellare, troncare o riscrivere dati esistenti,
né ampliare il validator in questa migrazione di prestazioni.

Nessun PASS live, telefono, p95, recovery nativa o convergenza è dedotto dal benchmark.
