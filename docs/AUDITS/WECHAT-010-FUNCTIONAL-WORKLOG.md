# WECHAT-010 / TASK-159 functional evidence

## 2026-09-25 — TASK-159 functional read delta / WECHAT-010

Current source of product acceptance is Mini `docs/testing/WECHAT-010-REPORT.md` and its unified parity matrix. Historical activation notes below do not supersede the14September TEST-only exposed-credential mandate. No production or DONE; source integration is distinct from staging deployment and authentic validation.

Implemented six route/server changes plus migration20260925161038: optional exact shop-scoped category/supplier ID lookup; strict calendar History filters converted at shop timezone; explicit membership/shop/read denials; own valid Mini session account suspension. No table/data migration, grants widened, native/OIDC/commerce change, or client credential. Unknown read RPC still fails42501 before membership lookup.

Evidence: Admin verify Node22 PASS; foundation1015PASS/2skip with existing read-only Win7POS reference; initial2ENOENT due incomplete default external checkout are not source failures. All337pgTAP across8WeChat suites PASS on isolated local PostgreSQL17.6 database (schema only copied, no real data). New22assertions cover250+250relations, lookup/search/archive/scope/permissions, month boundary and23/25-hour DST dates including microseconds. Direct pairing55assertions includes suspended valid session vs invalid device. Local UI smoke/Worker checks recorded separately; none are Tencent/business-live evidence.

Independent read-only contracts review APPROVED, Admin10-file application/test/migration manifest SHA2560fafba0256f1caebf0950dbf41bd90311e00a306707c9e46103ec7d3054c8b39 (sorted path+NUL+SHA256(bytes)+LF). Migration SHA25617049a7ed3fde844d80877065c3ac2853312aa4e1bf6aadbea1c6f1f3a9f0d27. Source baseline13389c5e, branch codex/wechat-010-functional-completion. PR/CI/merge and isolated release receipts follow actual execution.

Selective staging release must derive from b0e306f1 and include only the six runtime files and this migration, never whole Admin main. Before mutation revalidate142registry entries/zero commerce, active Worker3185ab67, exact target/flags, and preserve both function definitions+ACL for recovery; restore flags OFF/previous Worker if needed. Existing142migration statements remain unchanged. The7WeChat flags remain OFF until authentic activation. Protected input request already sent; AppSecret validity, pairing, login, business/phone/native readback NOT_RUN. Rotation NOT_PERFORMED/ACCEPTED_FOR_TEST_ONLY.

Final Sales formatting regression independently approved1/1; canonical numeric fields remain unchanged. Admin Playwright UI smoke48/48 and pairing component2/2 PASS under Node22 (local/intercepted evidence, not live Tencent). API contract now explicitly distinguishes current direct opaque Mini sessions from historical OIDC/bearer descriptions.
