# WECHAT-010 / TASK-159 functional evidence

## 2026-09-25 — Verified integration and staging OFF receipt

Current acceptance report: [Mini WECHAT-010](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md). TASK-159 remains REVIEW; authentic TEST acceptance is BLOCKED_EXTERNAL, owner user for the existing protected installer input and subsequent personal pairing. No DONE or public release. The14September TEST-only credential exception remains valid; rotation NOT_PERFORMED / ACCEPTED_FOR_TEST_ONLY.

PR107 merged419d53bb5a70ff95f491f174fbb45f2b0d3617fe after exact-head CI36165504804 and Cloudflare build36165504722 PASS; main CI36166021776/build36166021736 PASS, automatic staging/production deploys SKIPPED. Selective release b8a859c236385d39b2b9b52e5dc56310ee386980 derives from b0e306f1 and changes only six runtime files plus one WeChat migration, all independently approved. Worker beef7b20-2448-4f45-8ff7-67e014004702 verified active; all bindings preserved, seven flags OFF, no tracing. Wrangler only made the default asset base_path / explicit; compatibility settings unchanged. HTTP OFF smoke12/12 PASS. No whole-main deploy.

Registry143, newest20260925172134_wechat_010_functional_reads, zero commerce. Rename from the initial source timestamp20260925161038 reconciles the service-assigned registry version; SQL bytes remain SHA25617049a7ed3fde844d80877065c3ac2853312aa4e1bf6aadbea1c6f1f3a9f0d27. Function definitions match isolated tested DB, owners/grants unchanged and anon/authenticated EXECUTE denied. Backup two definitions+ACL+142registry saved0600 before apply; restore/reapply tested locally with22pgTAP PASS. Advisors security/performance0new findings versus before. No business fixtures or financial/native/production mutations.

Local evidence: Node22 verify, foundation1015PASS/2skip,337pgTAP,48UI smoke+2pairing component. Mini independent33/33 runner guard tests and actual DevTools5tab OFF smoke are separate from authenticated business. Binding still absent, designated active profile/shop has0active Mini mappings; credential validity/pairing/login/phone NOT_RUN. Protected input is already requested once; all reported source/release work is complete independently of it.

## Historical pre-integration notes — superseded by receipt above

## 2026-09-25 — TASK-159 functional read delta / WECHAT-010

Current source of product acceptance is Mini `docs/testing/WECHAT-010-REPORT.md` and its unified parity matrix. Historical activation notes below do not supersede the14September TEST-only exposed-credential mandate. No production or DONE; source integration is distinct from staging deployment and authentic validation.

Implemented six route/server changes plus migration20260925161038: optional exact shop-scoped category/supplier ID lookup; strict calendar History filters converted at shop timezone; explicit membership/shop/read denials; own valid Mini session account suspension. No table/data migration, grants widened, native/OIDC/commerce change, or client credential. Unknown read RPC still fails42501 before membership lookup.

Evidence: Admin verify Node22 PASS; foundation1015PASS/2skip with existing read-only Win7POS reference; initial2ENOENT due incomplete default external checkout are not source failures. All337pgTAP across8WeChat suites PASS on isolated local PostgreSQL17.6 database (schema only copied, no real data). New22assertions cover250+250relations, lookup/search/archive/scope/permissions, month boundary and23/25-hour DST dates including microseconds. Direct pairing55assertions includes suspended valid session vs invalid device. Local UI smoke/Worker checks recorded separately; none are Tencent/business-live evidence.

Independent read-only contracts review APPROVED, Admin10-file application/test/migration manifest SHA2560fafba0256f1caebf0950dbf41bd90311e00a306707c9e46103ec7d3054c8b39 (sorted path+NUL+SHA256(bytes)+LF). Migration SHA25617049a7ed3fde844d80877065c3ac2853312aa4e1bf6aadbea1c6f1f3a9f0d27. Source baseline13389c5e, branch codex/wechat-010-functional-completion. PR/CI/merge and isolated release receipts follow actual execution.

Selective staging release must derive from b0e306f1 and include only the six runtime files and this migration, never whole Admin main. Before mutation revalidate142registry entries/zero commerce, active Worker3185ab67, exact target/flags, and preserve both function definitions+ACL for recovery; restore flags OFF/previous Worker if needed. Existing142migration statements remain unchanged. The7WeChat flags remain OFF until authentic activation. Protected input request already sent; AppSecret validity, pairing, login, business/phone/native readback NOT_RUN. Rotation NOT_PERFORMED/ACCEPTED_FOR_TEST_ONLY.

Final Sales formatting regression independently approved1/1; canonical numeric fields remain unchanged. Admin Playwright UI smoke48/48 and pairing component2/2 PASS under Node22 (local/intercepted evidence, not live Tencent). API contract now explicitly distinguishes current direct opaque Mini sessions from historical OIDC/bearer descriptions.

## 2026-09-25 — Image recovery delta in REVIEW

Single writer, two readonly reviewers under the continuation mandate. Only the
WeChat service branch changes: reconcile immutable existing JPEG bytes before
signing missing variants, exact null URLs for verified variants, and retryable503
for uncertain access revalidation. Explicit false remains403. The additive RPC
replacement locks product then version and returns noop only for the current
ready version of an active product; native RPC signatures/ACLs remain unchanged.

Node22 verify PASS; foundation1030PASS/2skip; targeted service25/25; image pgTAP41/41.
Old replay FAIL then new replay PASS, including a two-session concurrent finalize
state on a disposable local database clone (not a live Mini interaction). The local
harness pins a validated Unix Docker socket and drops only its generated database.
Backup of the remote function/ACL and exact143registry saved0600 before any DDL;
restore/reapply of the single function tested locally. Deployment/PR receipts follow
execution. No commerce, ordinary shop data, native or production mutations.

Worker beef7b20 and exact target checked again, secret absent/all7flags OFF at18:40UTC.
Authentic pilot remains BLOCKED_EXTERNAL: owner user for protected AppSecret input,
then personal pairing. Canonical full mandate matrix/evidence: [Mini report](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
No LIVE_VALIDATED, PHONE_VALIDATED, PUBLIC_RELEASE_READY or self-approved DONE.

## 2026-09-25 — Image recovery integrated and selective staging verified

PR109 head de9b3924669c4df7d4785108e2b121ca190c8ce3 merged as
beed0a575a1d65ff0d267b7c1ec6ce6ecd9e754f after CI36175280179 and
Cloudflare36175280178 PASS; postmerge CI36175776026/Cloudflare36175776098 PASS.
Automatic staging/production deploy SKIPPED. Selective release
c55f88a36ac89684f25fd503ca7a3bc085c08660 derives from b8a859c2 and changes only
service.ts plus the new image migration. Actual Worker
6343d39c-d50a-4c88-89df-676f709697a2 verified100%; binding/runtime hashes unchanged,
all7flags OFF, AppSecret absent. HTTP OFF12/12 PASS, no authentic business claim.

Applied migration20260925184847_wechat_010_image_recovery once; registry144,
previous143version/name/hash entries identical, zero commerce. Function MD5
588c797e1d304291e34b0628f58b6c4e matches isolated tested DB; owner/ACL unchanged,
anon/authenticated EXECUTE false. Backup0600 and local restore/reapply PASS;
advisors security/performance0new. Rename source184000 to service-assigned184847
and remove only one empty EOF line; SQL instructions unchanged. Final file SHA256
45e84b6070d35daeb4d1a15b32be3e558303cd67f0286e805719f36ea0559f60 (applied input
4a863559f6cda50fe7c177ed176d6c5fe3d3837a5c28037b2413039dc2e40d4d).

Two independent readonly reviews APPROVED; original recovery7file manifest
73c0ebefc32910b302e58986d18769f852bbffa1a9fa10dda537ea83e7a14457 before metadata-only
rename/EOF normalization. No unreviewed application logic. Node22 verify,
1030foundationPASS/2skip,25targeted,41pgTAP and isolated concurrent SQL recovery
PASS. No live fixtures. Mini PR20 integrated with149tests; imported project build
updated, but new DevTools UI smoke NOT_RUN because the Mac locked during execution.
Protected AppSecret input and Mac unlock requested once each, no reply acquired.

Full A–G acceptance state: [canonical Mini report](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
TASK159 REVIEW/BLOCKED_EXTERNAL; no live, phone, public readiness or DONE.
Final metadata receipt [PR110](https://github.com/XNIW/merchandise-control-admin-web/pull/110)
contains no second migration application or deployment.

## Aggiornamento DevTools — 2026-09-25T19:03:05.409Z

Mac tornato accessibile dopo la ricevuta precedente: build Mini f956680/app08cb400
ricompilata e verificata nel DevTools ufficiale,5tab OFF PASS via UI e SDK,
0nuove eccezioni, nessuna sessione/shop. Primo tentativo SDK rawPath null;
secondo dopo pagina disponibile PASS, nessuna modifica applicativa/mock.
Il precedente blocco Mac sotto è storico e risolto. Rimane l'input protetto
AppSecret, non una nuova richiesta di autorizzazione. Business/telefono NOT_RUN.
Fonte unica dello stato corrente: [report Mini](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
Nessun codice, DDL o deployment ulteriore; CI postmerge7753c0ca
36176894582/36176894608 PASS. Solo ricevuta: [PR111](https://github.com/XNIW/merchandise-control-admin-web/pull/111).

## Enrollment TEST attivo — 2026-09-25T20:01:41.857Z

Input AppSecret completato personalmente; binding verificato sul Worker cb474c33.
PATCH revisionata del solo enrollment: Worker f1e2e3ce-557b-42f4-9159-e796dc635c32,
traffico100%, release selettiva c55f88a3 e runtime/altri binding invariati.
WECHAT_MINI_ENROLLMENT_ENABLED=true; altri6flag OFF, tracing disabilitato,
allowlist singleton e target preservati. Nessun DDL, sorgente o deploy main intera.
Mini verify149PASS, UI pairing DevTools pronta senza sessione/shop o nuove eccezioni;
readback limitato profilo/AppID0mapping. Accesso Admin completato personalmente; avvio pairing osservato nel browser e nel DB.
Due tentativi personali Mini falliti al challenge HTTP400 backend_temporary prima di Tencent.
Causa riprodotta in workerd1.20260811.1: redirect:error genera TypeError prima della rete.
FIX nei due trasporti Mini RPC/catalogo: redirect manual, response.ok invariato,
nessun redirect seguito. Regressione sul motore Cloudflare isolato; nessuna credenziale,
autenticazione simulata live o diagnostica pubblica. Pairing finale e business NOT_RUN.
Non chiedere di nuovo AppSecret. Rotazione NOT_PERFORMED, rischio ACCEPTED_FOR_TEST_ONLY.
Fonte unica: [report Mini](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
FIX sul challenge; nessun DONE/live/telefono attestato.
Le note precedenti su binding assente/tutti flag OFF sono storiche.

2026-09-26 — TASK-159: pairing personale verificato da UI e readback canonico (mapping/audit/due prove consumate); readonly server attivo Worker15ad37e9, enrollment e altri5flag OFF, codice/runtime/ambito preservati. Stato pubblico riconciliato dopo propagazione senza retry. Registry144 invariato, zero commerce. Mini verify149PASS; Mac bloccato prima del caricamento, sblocco richiesto. Login distinto/business/telefono NOT_RUN; nessuna fixture o DONE. Dettagli nel report Mini canonico.
# 2026-09-26 — Authentic Mini sync lease defect

Authentic business execution completed16read cases and9catalog cases with independent
readback. Five run-owned fixtures remain journaled. Image attempt stopped on session
expiry before picker/upload; before/after image state identical, NO_WRITE.

Checkpoint503 reproduced: authentic new Mini device has no native POS lease. Reviewed
additive migration20260926164349 isolates Mini scope/event readers behind the existing
session wrappers, authorizes the actual viewer/member and preserves mapping locks,
event projection, cursor bounds and snapshot fences. No native API or ACL weakened.
Review APPROVED SQL SHA2561800620a45edbc5e84c4ac8286d124cbbd664161b37effb26a68c7d514a14ad9.

Validation: 84direct-pairing +52BFF +22functional-read +365native-contract pgTAP PASS;
Node22 verify PASS; foundation1031PASS/2skip. Restore script initially lacked a SQL
statement separator and was corrected before remote use. Local wrapper restore then
reproduced the expected old lease failure; wrapper-only reapply returned84PASS.
A full migration reapply was correctly rejected because the new helper already existed;
no second remote apply occurred. Protected backup and tested compensation retained.

Single remote apply16:43UTC; source filename changed from161920 to service timestamp
164349 without SQL-byte changes. Registry145 with exact prior144 version/name/hash
preservation and zero commerce. Four Mini fingerprints/owner/ACL match isolated tested
DB; two native function fingerprints/owner/ACL equal their remote pre-apply snapshot.
Advisors unchanged after observation timestamp normalization. Worker beb94e1e and
runtime source a805d640 unchanged. Live checkpoint/delta retry still NOT_RUN.

Android/iPhone Google authentication completed personally; exact canonical profile,
shop and TEST project verified. iPhone Retry16:36 failed on missing catalog envelope;
old July diagnostics were not treated as a current network failure. Native sources
and ordinary databases unchanged. Convergence and full acceptance remain open.

## 2026-09-28 — bounded physical History normalization (local execution)

Delegated writer owns only the Admin delta under the authorized cross-repository
TEST completion mandate. The demonstrated compressed-History recovery blocker has
no existing preserving UPDATE route because the canonical trigger rejects OLD
compressed JSONB. Added a private postgres-only plan/apply contract with explicit
PGLZ expansion bound, typed validation before serialization, exact manifest,
transaction/backend/row markers, full-row equality, unchanged timestamps and zero
sync events. Runtime storage guard, canonical payload validator and event publisher
are unchanged. No GUC authorization or trigger disable.

Migration generated via Supabase CLI2.118.0 as
`20260928193505_wechat_010_history_physical_normalization.sql`. Local PostgreSQL17.6
schema-only template is empty and postgres-owned; no migration registry table is
present, and no live registry claim is made. Isolated 63 pgTAP and 365 existing
native recovery contract cases PASS; original trigger restore/reapply then the
same 63 PASS; actual second-writer row lock gives NOWAIT55P03 with no
partial work, followed by successful apply after release, zero events. Deployment
under the wrong role fails atomically. The test-only second-row fault proves
rollback of the first rewritten row and marker consumption. Private local log:
`history-normalization-local.log`. Runbook records pinned PostgreSQL sources,
execution boundaries and compensating DDL. Node22.23.3 verify PASS, including lint,
typecheck, security/secret scan and build (Node26 verify also PASS). Foundation:
1023 PASS, 8 skip, 2 ENOENT failures for external Win7POS
`RemoteCatalogProductWriter.cs` and `SalesSyncOutboxRepository.cs`; no full-suite
PASS. Logs: `history-normalization-verify-node22.log` and
`history-normalization-foundation.log`. Diff check PASS. Handoff to independent
review; no live SQL, commit, push, migration deployment or native acceptance.

## 2026-09-29 UTC — reviewed TEST application and catalog runtime receipt

PR115/PR116 merged after required CI PASS. The selective source release from the
three reviewed build/route files produced Worker bdd42368 at01:31:13UTC. The
recorded before/after metadata verifies unchanged bindings, runtime and settings
except deployment annotations; no scope, credential binding or flag changes.
Mini auth/catalog mutations stay ON, enrollment/other auth surfaces OFF, tracing OFF.
Public unauthenticated offset-timestamp and240-unit cursor smoke returned401;
241-unit cursor remained400. These are boundary checks, not business acceptance.

Normal Admin apply_migration assigned20260929013345 to original source20260928193505
and20260929013437 to original source20260929004159. Source filenames now match the
registry, with100% identical SQL bytes and the local normalization runner reference
updated. Registry147 preserves all145 previous entries. Exact snapshots confirm
unchanged existing owner/ACL, storage and four trigger registrations; only the two
reviewed existing function bodies changed. No repair or migration-history rewrite.

The private16-row normalization plan was approved by root and recovery reviewers
and applied once at01:38UTC. Independent postcheck01:39:14UTC:16 identical complete
row hashes/revisions, both payload compression fields NULL, zero markers, unchanged
2074 shop events. This removes the physical storage blocker without content edits;
it does not prove native recovery or cross-client convergence. Protected pre-apply
schema/ACL/registry and the manifest remain in the private audit packet.

Actual Mini v9 catalog validation: seven pages/350 IDs, exact canonical order and
microsecond revisions match independent scoped SQL; zero duplicates/omissions
within the measured window. Six load-more cases PASS, min323/median328/max2321ms,
n=6, p95=null. The SQL-oracle helper initially rejected a wrong column and timestamp
parser formats; corrected read-only comparison is explicitly recorded, with old
runtime failures preserved. No phone, whole-catalog or p95 acceptance is inferred.

Private evidence: `worker-catalog-deployment.json`, protected metadata before/after,
`history-normalization-live-before-v4-snapshot.json`,
`history-normalization-after-ddl-snapshot.json`, `history-normalization-live-plan.json`,
`history-normalization-live-postcheck.json`, and
`native-completion-20260928/catalog-measure-1790645825389/oracle-reconciliation.json`.
Repository receipt validation is recorded after the checks below; no further live
operation or new application logic is part of this source reconciliation.

Post-maintenance actual iOS Retry01:41:42–01:41:51UTC failed with checkpoint HTTP500.
The scoped server log reports SQLSTATE57014 in the price recovery preflight
(`sync_checkpoint_json_timestamp` via `sync_price_recovery_row_v1`), with8645ms
origin latency. This is a newly observed runtime blocker after successful physical
normalization; no further Retry or native convergence PASS is claimed. A bounded
Admin performance investigation is the next separate execution step.

Receipt-only checks: both SQL bodies match their pre-service source SHA256 exactly;
local runner resolves the renamed migration and Node22 syntax check PASS. Four
existing migration-ledger/workflow regressions PASS, repository security/secret
scan PASS, diff check PASS. Governance review keeps TASK-159 active, preserves
historical evidence, and does not mark DONE. Full verify was not repeated for
filename/documentation-only changes; the reviewed application logic and earlier
verify results are unchanged.


## 2026-10-01 — complete checkpoint performance, local REVIEW

PR118 postmerge CI36510419025 and Cloudflare36510419084 verified SUCCESS. The sole
Admin writer reproduced the complete recovery timeout on61,595 synthetic rows in
an empty local clone. Additive migration20261001195438 introduces two indexes of
the unchanged lower(UUID::text) predicate and six pure helper SQL→PL/pgSQL RETURN
changes. Scalar expressions, OIDs/owner/ACL/attributes, every other function, data
and event fingerprints remain identical; runtime8s and all scope/resource guards
remain unchanged. DDL uses transaction-local5s lock/60s statement limits.

Final local run: original timeout8s; fixed2,074 events4.695/4.584/4.638s; baseline=max
3.074s;10,001 event candidates5.959s with unchanged incomplete/full-recovery flags.
Complete old/new JSON equality includes all digest fields.365pgTAP, scalar vectors,
actual expression-index plans, rejected role/ACL drift, atomic rollback and
compensating restore/reapply PASS. Private log: checkpoint-performance-regression-v2.log.
Runbook: docs/RUNBOOKS/wechat-recovery-checkpoint-performance.md.

No remote SQL, data mutation, migration or deploy by this delta. The newer Android
HTTP200 resource_exceeded is separately traced to three History ISO timestamps;
this patch preserves the current validator and makes no native convergence claim.
Independent artifact review and source integration remain pending.

Full Admin verify with Node22.23.3 PASS: lint, route types, TypeScript, secret/security
scan and production build. Final diff-check PASS. No dependency or application
TypeScript file changed.

Independent review identified a DDL baseline-identity gap: matching by name alone
could accept a same-source overload. Reproduced in a disposable transaction and
fixed by exact regprocedure/OID, return type and argument/default metadata guards.
The new signature-drift regression fails closed before indexes; complete local
365-suite/benchmark rerun PASS, with the same six scalar expressions and RPC bodies.


## 2026-10-01 — performance TEST receipt and History compatibility REVIEW

Performance PR119 head df79d440 merged4532831b after CI36931262840 and CF36931262847
SUCCESS; postmerge CI36931671476 and CF36931671402 SUCCESS. Deploy jobs SKIPPED.
The coordinator applied only the exact reviewed SQL once; service20261001220355
maps source20261001195438, SHA54a49cbf529e1019468c9e2708c36f83eea783edca31b0df3c22af43e8fc80d7.
Registry148 preserves147 prior entries;22:04:29UTC independent postcheck confirms
six identical scalar expressions, OID/owner/ACL/attributes, two indexes and unchanged
other functions/triggers, scoped data hashes and2074 events. Source filename is
reconciled byte-for-byte; no new authentic Retry is claimed.

The separate History fix adds a private boolean predicate for existing legacy or
exact UTC ISO milliseconds, replacing only three History predicate calls in two
existing functions. Shared legacy/price predicates, raw active DTO strings,
updated/deleted timestamps, tombstone fallback, scope/leases, resource/storage
limits, OIDs/ACL and other functions remain unchanged. The metadata regression
caught the checkpoint's later VOLATILE lease attribute; the copied declaration
now preserves it and the migration rejects volatility drift atomically.

Local184 new pgTAP +365 native assertions PASS.45 shared vectors include valid
calendar/millisecond bounds and rejection of offsets, trim, casing, year zero,
extra/missing fractions and invalid dates. Admin legacyAccepted is a server baseline
expectation, not a claim about pre-existing native price parsers. Integrated checks
prove unchanged legacy+ISO-tombstone full JSON; old checkpoint resource_exceeded
versus ready for the same supported ISO rows; paginated/targeted raw DTOs; independently
computed History SHA chain; mixed shop/legacy scope and cross-shop exclusion;
unchanged row/event fingerprints and rollback/reapply. All fixture writes use active
canonical triggers in a disposable local clone. Private log:
history-timestamp-compatibility-test-final.log. Native oracle runs, independent
artifact review, source integration and History TEST application remain pending.
Full Admin `verify` on Node 22.23.3 PASS (lint, route type generation, TypeScript,
security scan and production build); log `history-timestamp-verify.log`.

## 2026-10-01 — History ACL baseline correction REVIEW

PR120 merged b162f23d at 22:37:16 UTC. Head CI36934913127/CF36934913057 and
postmerge CI36936157036/CF36936157032 PASS; deploy jobs SKIPPED. The coordinator's
TEST migration attempt failed atomically with baseline_mismatch. A fresh snapshot
at 22:53:55 UTC confirms registry148, new helper absent, unchanged functions/data
and 2074 events. The exact source bodies match, but TEST already grants checkpoint
EXECUTE to service_role in addition to postgres/authenticated.

The guard-only correction compares complete sorted ACL items against precisely
the two verified checkpoint sets. The active-payload set stays exact. It retains
grantor/grant-option checks and changes no existing privilege; runtime SQL after
the guard has SHA256 96af0f4c789ccab7c86e02816066c57cd528e525ae8a61912cd21c5fc0a3fda8
identical to PR120. This source migration is not registered remotely, so no applied
migration or registry is altered.

The original SQL reproduces the TEST ACL rejection locally. Eleven positive and
negative ACL scenarios PASS, preserving exact metadata and rolling back fixtures
and failures. The 184 History plus 365 native assertions and complete checkpoint,
DTO/digest/scope/rollback checks PASS again. Full Admin Node22 verify PASS.
Private logs: history-timestamp-acl-red.log, history-timestamp-acl-green.log,
history-timestamp-acl-verify.log. No remote SQL/application or authentic Retry by
this writer; independent review and any second coordinator apply remain pending.

## 2026-10-01 — History TEST v2 applied and version receipt REVIEW

PR121 head0875e944 merged d1287cab at 23:44:48 UTC after exact-head Verify,
Database and Cloudflare PASS. Head CI36942045201/CF36942044782 and postmerge
CI36942419923/CF36942419889 SUCCESS; staging/production deploy jobs SKIPPED.
The coordinator applied the corrected migration once at 23:51:53 UTC, service
version20261001235153 from source20261001215458. Registry149 preserves all148
previous entries. SQL SHA256 remains
765a891c7c89f4aff0824384754c5aa8a9dfda4766a6fd77fd4a7a0efd7080d1.

Independent postcheck23:52:26 UTC PASS: two existing function OIDs/full metadata/ACL
preserved, expected History source bodies and postgres-only new helper; all scoped
data, original History row fingerprints, image versions and2074 events unchanged.
Other functions and triggers are unchanged. Private receipts are
history-timestamp-v2-{apply-intent,apply-result,after,postcheck}.json.

This source-only delta renames the SQL file to the service version and changes
only its runner path plus documentation. SQL bytes are identical; no registry
repair, remote SQL or new runtime behavior by this writer. Byte/hash and path
checks, runner syntax, security scan and diff checks PASS. Large unchanged suites
are not rerun for this receipt. No authentic recovery, performance or native
convergence acceptance is inferred from application success.


## 2026-10-02 — price-digest checkpoint performance REVIEW

Authentic iOS/Android recovery after History v2 still fails with HTTP500/57014 in
the price aggregate (origin8227/8181ms). Resource preflight is clean; these are not
the earlier preflight/History-format failures. The sole Admin writer used only a
local schema clone and synthetic data. New additive migration narrows/materializes
the price CTE, validates bytewise distinct timestamps once per SELECT and converts
the amount scalar to PL/pgSQL with the exact existing expression. Scope, parent
checks, validation grammar, ordered raw digest, all other domains and8s stay exact.

PASS9 guard cases,14+184+365 assertions, deterministic callcount RED→GREEN,
complete JSON equality on61595rows/41345prices (165legacy),2074 and10001events,
NULL/invalid/empty/Unicode/nonfinite/rounding/all-unique timestamp cases, exact
metadata/ACL/OID, other functions, row/event fingerprints and rollback/reapply.
Local full2074 timing4405–4467→3831–3956ms;10001boundary5896→5430ms. The Mac baseline
finished below8s; authentic failure receipts remain authoritative and no live
recovery/P95 is claimed. Private logs price-digest-performance-tests.log and
price-digest-investigate-next.log. Full Admin Node22.23.3 verify and diff checks
PASS (price-digest-performance-verify.log). Freeze for root/recovery review before source
integration; no remote action or native Retry by this writer.


## 2026-10-02 — final integrity performance and prior application receipt

PR123 merged e4377f83 after required exact-head and postmerge CI/Cloudflare PASS.
The coordinator applied its exact SQL once as service20261002005414 (registry150);
00:54:42 postcheck preserved prior149 registry entries, OID/ACL, unrelated functions,
all scoped data and events. Rename from source20261002002517 and runner reference
is byte-identical SHA25654bc73e0dcbd4bd1d4323989b3bce6dc1c528117fe45509c35b5301243d8474a.
The subsequent iOS/Android authentic retries still failed500/57014 in the final
integrity SELECT; Mini polling also waited on the unchanged catalog fence. These
failures remain evidence, not a successful recovery.

One Admin writer profiled the complete local pipeline and prepared additive
20261002011223 with only narrower final-SELECT projections and per-SELECT distinct
predicate evaluation. Validators, NULL behavior, row counts, order/digests, scope,
authorization, locks and runtime8s remain exact; no helper/index/ACL/data changes.
The coordinator's read-only TEST comparison confirms identical20 counts and
execution3536.944/3183.693ms →1785.830/1827.670ms. This is not authenticated RPC
acceptance. SQL application, terminal native recovery and latency acceptance are
still pending independent reviews, integration and coordinator release.

Local clone validation: nine guard cases plus deploy-role denial, nine new +184
History +365 native assertions PASS; 61,595 representative synthetic rows,2074 and
10001 events; complete JSON/metadata/data parity; NULL/nonfinite/signed-zero/
invalid/all-unique vectors; six same-backend generic-plan calls each version;
rollback/reapply exact. Full checkpoint4153–4225ms →3943–3972ms; cap case6190ms.
Node22 full verify, targeted final runner lint and diff/security checks PASS. The
clone is removed in finally. Logs and coordinator failure/read-only plans remain
private under checkpoint-integrity-performance-* and integrity-readonly-*; no
protected configuration or real row contents are published. No remote action by
the writer, no live recovery/convergence PASS, no DONE.
