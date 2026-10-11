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
