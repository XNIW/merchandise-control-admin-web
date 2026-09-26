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
