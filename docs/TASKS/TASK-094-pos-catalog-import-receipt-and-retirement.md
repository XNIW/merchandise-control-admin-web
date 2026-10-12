# TASK-094 — POS import receipt, retirement and linked correction continuation

Phase: REVIEW. Scoped FIX continuation authorized 2026-10-11 for the uniform import
qualification failures, isolated from Admin main15ee1886. The original
continuation below was authorized 2026-10-08, isolated source lane from main
02ea44b95d4a05baddbf46f24251f0d5f0dea294. No DONE or runtime readiness.

A lost response must not trigger a fresh apply. A missing receipt also cannot
fence a delayed request, and replaying full import metadata after an accepted
batch would overwrite newer remote edits. The patch adds three authenticated,
shop/device-scoped endpoints: receipt, explicit private identity retirement and
linked masked correction. Receipt/retirement accept original import or immutable
correction-child requests; retirement blocks late children before economic writes.
Current outer trust, catalog.import permission and inventory mapping are checked
after blocking waits. Receipt performs no DML/audit. Correction checks all row
revisions and exact masked baseSnapshots before DML, appends only changed price
history, adjusts relative stock and retains current metadata. One late constraint
rolls back the entire correction and its durable ACK. Equal included prices get
stored unchangedFields proof, no duplicate price history.

Contract: contracts/pos-catalog-import-receipt-v1/README.md and exact JSON fixtures.
Raw client hashes remain locally verifiable declarations; legacy server canonical
normalization is preserved. Safe out-of-range originals and bounded Int64 text
are unchanged; unsafe JSON integer precision fails explicitly. Accepted ACK does
not prove that an invalid original raw price was applied.

Validation on the original immutable freeze ae8257: foundation1071 PASS/8 SKIP/
0 FAIL (1079 total, including28 targeted service checks); owned network-none
PostgreSQL69 PASS. The final small precision-only delta has one targeted PASS
(large finite correction snapshot lookup/retirement, unsafe original still400)
and typecheck PASS. Exact final-head full remote CI remains NOT_RUN; prior full
gates and delta evidence are attributed separately, with no immutable reruns.
The model runs both actual new migrations against synthetic dependency tables,
a lease/owner stub, legacy-apply economic sentinel and reservation/revision
triggers. It proves scoped races/CAS/rollback/no-economic-lookup behavior in that
model; it does not prove the complete historical apply_v1 implementation, deployed
schema or live authentication. The exact owned container is confirmed absent by a read-only Docker inspect.
The original runner did not record stop/remove return codes, so shutdown mode is
not independently attested. A narrow subsequent runner delta checks both return
codes and exact-container absence before future CLOSED claims; no69-test rerun.

Repository lint/type generation/typecheck/security passed. First build failed only
because cached node_modules was a symlink outside the Turbopack project root; the
own ignored dependencies were APFS-cloned from identical package-lock cache.
Subsequent restricted build could not fetch the unchanged public Google Fonts;
final build with normal public-font access is tracked in validation receipt.
Those failed logs are preserved, not treated as product defects or hidden.

Independent immutable SQL/HTTP review and final build receipt are tracked under
EVIDENCE/TASK-094/import-receipt-20261008. Source-freeze manifest and fixture hashes
identify exact reviewed bytes; prior32/49/62/68-check results and setup failures
remain historical. No new dependency/package lock, mobile input, foreign WIP,
live SQL, cleanup, DB apply, Worker deploy or READY issuance occurred.

Exact source effects for a separately approved apply: migration20261008194809 adds
private retirement table and service-only receipt/retire/fenced import wrappers;
migration20261008200355 adds private correction ledger and service-only atomic
correction plus cross-ledger lookup/apply fences. Both private ledgers have forced
RLS and no API table grants; prior implementations remain private without direct
service execute. No indiscriminate migration/apply or production operation.

Next: frozen-source review and normal PR/CI. Applying the two exact migrations and
deploying exact source require their separate concrete authorization; acceptance
on the real caller/shop and platform remains NOT_RUN.

## Continuazione source-only del 12 ottobre 2026 UTC: complete-plan con un builder

Stato: REVIEW, candidata da verificare. Il coordinatore autorizza il FIX soltanto
nel nuovo worktree `admin-post-pr123-plan-complete-fix-20261012`, branch
`codex/admin-post-pr123-plan-complete-fix-20261012`, da Admin
`ae0e8304144bb7b567dc3ed354f3092cd2bdb69d`, tree
`41f74d9d71d1430f9602351ab3046defc4352854`. Il checkout pairing precedente e la
primary Admin restano immutati. Il fallimento reale fresh 59999 e5bf resta FAIL:
complete-plan ha concluso tardi, senza child apply; non viene riqualificato qui.

La diagnostica COPY_PROFILE REV6 sulla copia owned e5bf ha raggiunto gli 11
marker Phased e 13 SmallV1, confrontato tutta la risposta planned con quella
cached e chiuso con rollback e catalog/data invariati. La chiamata misurata e
7587.597 ms; P08, hash e assemblaggio `v_normal`, 1490.084 ms. Queste misure
calde includono storage gia planned e ON CONFLICT, non il percorso fresh e5bf
da 11493.906 ms; il costo residuo non viene attribuito a un singolo operatore.
Validation raw: `05-profile-validation.json`, SHA256
`2e1180f283a7aaba5ecc2cc19eaaf267296b92d2efd007498d51acc9ae45ba75`, nel run
`maximum-uniform/V3_REV2_MAXIMUM_e5bf_COPY_PROFILE_PREPARATION/revisions/rev6-qualified-reset-plpgsql-load/runs/863eb4b85cb9444fa34a075f56921b67/`.
Il successo diagnostico non prova miglioramento della candidata o accettazione
del massimo. Nuove calibrazione 5000 e qualifica 59999 restano necessarie.

La CLI Supabase 2.109.0 ha generato, senza DB/apply,
`20261012055628_pos_import_recovery_plan_single_builder.sql`. Il forward modifica
soltanto il builder complete-plan `v_normal` in Phased. Per header JSON oggetto,
`jsonb_each` conserva i campi sconosciuti ed esclude le quattro chiavi sostituite;
UNION ALL con VALUES aggiunge parts, coverage, planCanonicalHash e itemCount.
Un unico `jsonb_object_agg`, senza ORDER BY, costruisce il risultato con chiavi
uniche e stessa precedenza RHS. Coverage conserva il coalesce a []; COUNT usa
gli stessi shop/device/upload/domain e include ogni group_index come prima.
Per SQL NULL, JSON null, scalari e array il fallback e l'esatta espressione
precedente. Ordine degli array e valori null restano invariati. Hash UTF8 e
prefisso canonico, P05, tutto SmallV1, prova raw, guard, risultato ed errori,
auth, cap, timeout, GUC, indici e dipendenze restano invariati.

Pin del prosrc normalizzato LF prima: MD5
`e638c34aaa588e2b64f63fa3dc3102b0`, SHA256
`821d34d4ca0234b42ae48b87715bad224c901ef9e0a35fbeb4204a63a45d1b1d`.
Dopo: MD5 `0eec947d66bbac2930385977b448a836`, SHA256
`b3062b925c3968caf9bba6129a288e49006cdeb9140165c24a3245628192a3d2`.
La migration riconosce LF/CRLF, esige un solo blocco precedente e confronta
l'intera riga pg_proc eccetto prosrc, inclusi OID/owner/ACL/config/flags.
Drift di baseline o postcondizione solleva 55000 e abortisce la transazione.
Non vengono riscritte migration storiche o create nuove funzioni pubbliche.

`supabase/tests/task_094_import_recovery_plan_single_builder.sql` verifica il
blocco estratto dal prosrc effettivo contro l'espressione precedente e expected
indipendenti: header mancanti/null/non-oggetto/vuoti, precedenza RHS, ordinary e
correction, CJK, ordine degli array, campi sconosciuti e COUNT scoped su staging
reale. Verifica inoltre il forward effettivo, metadata completo, drift 55000 e
rollback con catalog/data intatti. Nessun auth stub o rilassamento di assert.
I 22 vettori/17 gruppi di identity pairing restano immutati; cambia soltanto il
pin del corpo installato, che ora include il builder successivo.

File del delta: nuova migration e nuovo pgTAP, pin del test pairing, questa
scheda e MASTER-PLAN. La verifica statica e i pin concreti sono nell'handoff
esterno; test/SQL/build/apply/deploy e beneficio prestazionale restano NOT_RUN
da questa lane. Il workflow esistente esegue la chain e `supabase test db`.
Servono review indipendente, PG isolato con chain reale e pgTAP reale, CI sul
nuovo commit e prove 5000/59999 con medesimi cap/deadline e controlli economici.
Nessun DONE, READY o nuova qualifica viene emesso da questo delta source-only.

## Candidata source-only del 12 ottobre 2026 UTC: pairing delle identita

Stato: CODEX_CANDIDATE_COMPLETE_TO_REVIEW. Il coordinatore autorizza soltanto
la preparazione sorgente nel nuovo worktree
`admin-post-pr123-identity-pairing-fix-20261012`, branch
`codex/admin-post-pr123-identity-pairing-fix-20261012`, da main Admin
`9f8d6a7e53835b04ed41a1bc4ce568d65b4a8db2`, tree
`7f992cd0ff4676efce8cf35fac8208dea8bfea88`. Le prove e il checkout e3 precedenti
restano congelati. Il massimo59999 effettivo REV3 resta FAIL, receipt_unavailable
sull'ultima normalizzazione originale. Il successivo piano read-only e acquisito;
questa candidata non ha efficacia prestazionale o qualifica funzionale provata.

Diagnostica a2de, PASS_READ_ONLY_ESTIMATED_PLAN_SCOPE, receipt SHA256
`671945c33bf243bc465f7894fb38b99349a9a807b34985c8a46d4db20357bd42`:
`maximum-uniform/V2_REV3_MAXIMUM_PLAN_DIAGNOSTIC_PREPARATION_fba1/runs/a2de0abe9f36421f962a4c533659a88f/`.
Il corpo effettivo resta e018, prosrc SHA256
`2cf20cf2c6a518c73a98a3e2db5118e3aca2be65004cb831d6d23aad1eb2d532`.
`plan-disjunction-3.json`, SHA256
`a39bb7e780566afec28a8fc0dac721539cc56a82007fb8db13397e10e44d3279`,
mostra un Nested Loop normalized/raw con group_index+ordinal nel Join Filter:
entrambi gli Index Scan PK hanno Index Cond soltanto shop/device/upload/domain
e Plan Rows1. Il secondo Nested Loop applica i VALUES; i primi due guard hanno
zero Nested Loop. Questo supporta il perimetro della candidata, non il successo
del fix. EXPLAIN FORMAT JSON senza ANALYZE, su sessione riaperta e stato dopo
rollback dell'ultima249 righe: non e il piano storico della transazione pending,
non misura tempi/loop/spill di esecuzione. La durata della richiesta EXPLAIN non
e latenza SQL. Metadata completo pg_proc immutato, rollback e cleanup/release
conclusi; nessun runtime o query nuova e eseguito da questa lane sorgente.

La CLI Supabase2.109.0, dopo `migration new --help`, ha creato
`20261012005020_pos_import_recovery_identity_pairing.sql`. Il forward sostituisce
solo il terzo EXISTS dell'IF `global original identity collision`: scalari
normalized/raw con tag di lato, UNION ALL e GROUP BY(group_index,ordinal),
MAX/FILTER su ciascun lato e HAVING presenza di entrambi. La PK completa e i
WHERE scoped immutati garantiscono al massimo una riga per lato/chiave; MAX
preserva anche NULL e i flag escludono gli orfani come l'inner join precedente.
Il primo guard clientItemId, il secondo barcode new/updated, alias camel/snake,
LATERAL, filtro nonempty, collation e COUNT DISTINCT restano invariati. Non viene
aggiunto group_index=0. Auth/lease/fence, hash/cursor/ACK, DML, cap, timeout,
indici, GUC e dipendenze restano identici.

Guard del corpo normalizzato LF: MD5 `e0189819fb64f62c7cd4e1b0019610bb` prima,
`e638c34aaa588e2b64f63fa3dc3102b0` dopo; replacement univoco e confronto della
riga pg_proc completa eccetto prosrc, inclusi OID/owner/ACL/config/flags.
LF e CRLF vengono riconosciuti senza riscrivere i byte circostanti. Drift o
postcondition mismatch abortiscono la transazione. Nessuna migration storica
viene modificata. La spec esterna del replace ha SHA256
`4918a33f131a476031e784a71ff294cd7fc32379e79a521ca0599356d2e8eb86`.

`supabase/tests/task_094_import_recovery_identity_pairing.sql` prepara22 vettori
in17 gruppi su vere document/raw/normal staging tables, nella propria transazione
rollback-only. La query candidata e estratta dal prosrc installato con anchor
univoci; la baseline JOIN e una copia indipendente dell'espressione e018.
Entrambe vengono confrontate con expected espliciti, fra loro e con lo snapshot
completo delle fixture prima/dopo. Copertura: ID e barcode duplicati oltre pagina,
NULL/empty, new/updated/no_change, alias e precedenza camelCase vuoto, trim/NFC
preprojected, stesso ordinal fra gruppi, collisione nel gruppo1, orfani e scope
shop/device/upload/domain estranei. I vettori avversariali sono prove della query,
non una dichiarazione di ammissione del parser. Nessuno stub auth o grant nuovo.
Il percorso reale store-normalize-page rimane alla qualifica uniforme dell'owner.

File del delta: nuova migration, nuovo pgTAP, questa scheda e MASTER-PLAN.
Check autorizzati ora: solo parser/static e git diff --check; risultati concreti
sono registrati nell'handoff esterno. pgTAP/PG/runtime/build/apply/deploy/push:
NOT_RUN per lease diagnostica del coordinatore. Il workflow CI esistente applica
le migration e raccoglie il nuovo file con `supabase test db`, senza nuovi job.
Su PG isolato occorrono la chain reale installata e pgTAP reale; niente fallback
auth/TAP stubbato. Review distinta e freeze di source/fixture, valutati insieme
al piano stimato acquisito, precedono pubblicazione e runtime. Seguono prove catalog pre/post/rollback/drift,
parita DB, nuova calibrazione5000 e qualifica59999 completa con cap/deadline e
contatori/economia esattamente una volta invariati. Nessun DONE o READY.

## Handoff source-only dell'11 ottobre 2026: normalizzazione originale

Stato: CODEX_FIX_COMPLETE_TO_RE_REVIEW. La richiesta utente dell'11 ottobre
autorizza il lavoro e i fix necessari alla qualifica post-PR123. Il FIX e stato
aperto solo nel worktree `admin-post-pr123-normalize-fix-20261011`, branch
`codex/admin-post-pr123-normalize-fix`, da main Admin
`15ee18863bfac545d53ff5784eea46d96f8af82c`, tree
`ee1274f9ff3e388e01c9642769ea91202398f0b9`. Questa patch nuova non ripubblica il
privato4027; i suoi byte non sono disponibili e non vengono usati come fonte.
La lane POS gestisce separatamente l'accounting del child, senza modifica qui
al guard `pg_column_size(p_items)>524288` o ai cap di protocollo.

Due failure conservati, distinti:

- Calibrazione5000, POS9c19bbe/Admin15ee: primo child523 righe, payload locale
  salvato520048UTF8; apply HTTP319byte; items normalizzati JSONB572424byte,
  testoJSONB554058byte. Il wrapper storico rifiuta con validation_failed prima
  del DML. E un disallineamento raw/normalized; la fixture usa il guard originale.
- Massimo59999, stesso freeze: receipt_unavailable durante l'ultimo normalize
  dell'originale, cursor59750. Il controllo globale di identita era ancora attivo
  al cleanup; nessun ACK/apply economico concluso. EXPLAIN read-only successivo
  al rollback mostra Nested Loop fra CTE MATERIALIZED con stima1 per CTE,
  reltuples=-1/relpages0 e last_analyze/last_autoanalyze null. Gli indici scoped
  sono presenti. Questo piano nuovo non e il piano storico al timeout e non
  misura tempi/loop/spill; le righe correnti sono59999raw/59750normal.

Evidence esterna conservata sotto
`C:\Dev\_codex-evidence\win7pos-post-pr123-20261011`:
`maximum-uniform/runs/20261011T212715Z-fbf7d6681eaf49f59e8a1d6e0ceafc53/diagnostic-read-only.json`,
`maximum-uniform/runs/20261011T213112Z-634a07020858486c820969312524c4fe/qualification.json`,
`maximum-uniform/diagnostic/runs/20261011T214256Z-f22e941f1cc34e4d8e936a935f675ff9/EXPLAIN_RECEIPT.json`.
L'EXPLAIN usa PG17.11, work_mem4MB e nessun ANALYZE; non prova risoluzione entro
la deadline client10s. Nessun valore reale di credenziale e riportato qui.

File toccati: questa scheda, `docs/MASTER-PLAN.md` e la nuova migration
`supabase/migrations/20261011215021_pos_import_recovery_identity_cte_folding.sql`.
La CLI Supabase installata2.109.0 ha generato il file vuoto con
`supabase migration new pos_import_recovery_identity_cte_folding`.
Le migrazioni storiche restano identiche.

La migration forward risolve la signature qualificata di
`app_private.pos_import_recovery_phased_v1` e verifica corpo storico/owner/flags/
config prima del replace. Cambia soltanto i due hint del controllo finale root:
`normalized AS MATERIALIZED` e `raw AS MATERIALIZED` diventano
`AS NOT MATERIALIZED`. Il corpo normalizzato LF ha MD5
`f0079a99c0d44fd791fd6e2298cdc4c4` prima e
`e0189819fb64f62c7cd4e1b0019610bb` dopo. Il postcheck confronta l'intera riga
pg_proc eccetto prosrc, preservando OID, owner, signature, config e ACL completa
con grantors/options. Drift o postcondition mismatch abortiscono la transazione.

I due SELECT sono non ricorsivi e privi di funzioni volatile; tutte le proiezioni,
WHERE scoped, GROUP BY, HAVING, JOIN USING(group_index,ordinal), LATERAL VALUES,
regole NULL, eccezioni, auth/lease/fences, hash/cursor e DML restano invariati.
normalized e usata tre volte: il folding di default da solo non basta.
La documentazione primaria
[PostgreSQL17, CTE materialization](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION)
supporta NOT MATERIALIZED esplicito per consentire l'ottimizzazione con gli
indici delle tabelle di base; il planner mantiene la scelta concreta del join.

Check source: confronto statico del corpo e del delta a due hint; git diff
--check. Runtime SQL, foundation, build, cloud/apply/deploy/push: NOT_RUN per
istruzione del coordinatore, che serializza la lease Asus. La review indipendente
e pending. Nessun PASS prestazionale o chiusura della qualifica e attribuito.

Procedura successiva, solo dopo review e nuovo source/input freeze autorizzato:

1. Nel medesimo owned runner PG/Worker+C# creare cluster/DB nonce-bound fresco,
   manifestare la nuova revisione Admin e appendere questa migration dopo
   20261009004800 nel bootstrap. Il runner e
   `maximum-uniform/Run-UniformMaximum.ps1`; la sua binding hardcoded15ee deve
   essere aggiornata dall'owner al nuovo commit prima dell'esecuzione uniforme.
   Non proseguire il DB del failure e non riusare il vecchio manifest come nuovo.
2. Nello stesso cluster isolato verificare pre/post pg_proc completo, rollback,
   baseline drift refusal e che i due hint siano l'unico delta prosrc. Confrontare
   l'espressione collisione baseline/candidate sullo stesso snapshot e su casi
   sintetici scoped: validi, ID/barcode duplicati oltre pagina, collisione trim,
   itemNumber nullo/vuoto, gruppi/ordinal e altro shop/device/upload. I booleani
   e i rifiuti global identity collision devono coincidere.
3. Ripetere calibrazione5000 e qualifica completa59999 con il POS nuovo congelato,
   stesso protocollo/deadline/cap e accounting corretto dalla lane POS. Richiedere
   upload/normalizzazione/retirement/plan/apply/ACK/retry/readback terminale,
   identita/payload immutabili, economia esattamente una volta e contatori completi.
   Nessun ANALYZE manuale, cambio work_mem/planner/deadline o salto dei controlli
   per ottenere PASS. Il solo EXPLAIN non soddisfa questi criteri.

Owner operativo: coordinatore e task massimo uniforme per nuovo freeze/runner/
lease/prove; reviewer distinto per la patch prima del runtime. Prossima fase:
REVIEW, nessun DONE/READY o qualifica fisica Win7/Cloudflare implicita.
