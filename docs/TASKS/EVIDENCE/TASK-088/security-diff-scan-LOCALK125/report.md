# Security Review: TASK-088B K84-to-K125 multi-repository harness delta

## Scope

Security diff review of the six Android/iOS acceptance-test and local final-sync harness files whose current hashes differ from the sealed K84 62-file TASK-088 snapshot. All six were full-file reviewed; no reportable candidate survived discovery.

- Scan mode: diff
- Target kind: git_diff
- Target ID: target_sha256_e397bf80dd7dc00072a915a325ef14b3d4f9b62642baa0ca2a73495f459cc360
- Snapshot digest: codex-security-snapshot/v1:sha256:0afa24035024319761e65904b8db99f0b53acbbf94ebbb60cc7b8f2a85ec855b
- Inventory strategy: custom
- Included paths: android/app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task103CrossPlatformAcceptanceTest.kt, ios/iOSMerchandiseControlTests/Task103CrossPlatformAcceptanceTests.swift, ios/tests/test_final_sync_contract.py, ios/tools/agent/lib/final_sync.sh, ios/tools/agent/lib/final_sync_contract.py, ios/tools/agent/lib/task088_supabase_rest.mjs
- Excluded paths: none
- Runtime or test status: Executed evidence preserved by TASK-088B: iOS apply tests 8/8 and selected regression 2/2 PASS, iOS Debug build PASS, Android equivalent tests 234/234 PASS, Android Debug build PASS, shared final-sync contract 60/60 PASS; K123 and K124 targeted groups 32/32 PASS; K125 stopped after 128/1024 on the G004 p50/comparator aggregate gates with zero functional sample failures, mandatory cleanup PASS, residue zero and baseline preserved.
- Artifacts reviewed: current 62-row content-hash inventory and six-row delta manifest, sealed K84 candidate validation and attack-path receipts, K123/K124 targeted-run and K125 partial-matrix durable evidence, current Android/iOS acceptance tests and local final-sync harness/contract files
- Scan context: The repository-wide threat model was regenerated for this scan and bound to the current 62-file snapshot. The sealed K84 scan is baseline evidence only; no new Deep Security Scan was started. The seven inherited High/P1 findings remain open/unclosed.

Limitations and exclusions:
- The K84 scan preserved file hashes and receipts rather than source copies, so a text-hunk K84-to-K125 patch cannot be reconstructed; the current versions of all six changed files were reviewed in full.
- The complete 32 x 32 matrix was not achieved: K125 stopped after 128/1024 at the first aggregate failure boundary after G004.
- Account/shop switch scenarios were not reached by K125 live execution, although focused platform tests cover those invariants.
- The physical Win7 runtime checklist for DSC-075 remains external.
- Several local harness telemetry fields are coarse or undercount retries; they must not be treated as more precise than the end-to-end monotonic measurements.
- Excluded production targets, production credentials and production deployment: Explicitly prohibited; no production system was accessed or changed.
- Excluded new Deep Security Scan: Explicitly prohibited; the sealed K84 scan was used only as read-only baseline evidence.
- Excluded files outside the six hash-different K84-to-K125 rows: This is a precise post-K84 diff scan. The 56 byte-identical rows reuse sealed K84 receipts and unrelated dirty-worktree files remain outside scope.
- Excluded Product Catalog Images implementation: The later product requirement is queued and was not allowed to contaminate TASK-088B or this security snapshot.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | partial |
| Validation mode | Read-only full-file discovery over 6/6 delta rows plus byte-identity reconciliation of the seven inherited High/P1 root-control chains against sealed K84 receipts. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

MerchandiseControl is a shop-scoped multi-platform retail system in which Supabase RLS and transactional RPCs protect tenant/catalog/financial integrity, Admin Web protects server-only POS credentials and APIs, mobile clients synchronize authenticated shop state, and Win7POS crosses a bounded offline authorization boundary.

### Assets

- shop and tenant isolation
- membership and staff authorization
- product, price, stock, sale, refund, void and ledger integrity
- POS device/session credentials
- auditability and idempotency
- bounded offline authority

### Trust Boundaries

- authenticated browser/mobile direct Supabase DML to RLS
- POS request input to Admin Web and service-role-only transactional RPC
- central POS session state to Win7POS offline trusted state
- privileged QA harness target/session/prefix to synthetic staging mutation and cleanup

### Attacker Capabilities

- valid low-privilege viewer, suspended owner, cashier, refund-capable operator, or formerly valid offline operator
- control of client JSON, identifiers, quantities, values, timing and direct Data API requests
- physical access to a POS endpoint without operating-system administrator compromise

### Security Objectives

- fail closed on demotion, suspension, cross-shop identifiers and legacy compatibility paths
- derive authority and financial economics from locked server state
- bind reversals to exact original sale lines and cumulative residuals
- expire offline authority from authenticated server time and prevent in-process rollback
- keep service-role material server-side and evidence redacted
- restrict QA mutation to non-production synthetic fixtures with mandatory cleanup

### Assumptions

- Supabase, platform signing identities, developer/CI identities and operating-system administrator access are not compromised.
- Physical Win7 hardware and unstable real networks are external runtime validation surfaces rather than assumed controls.

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| K84-to-K125 Android/iOS final-sync delta | session and shop binding, command/path handling, retry visibility, cleanup scope and evidence integrity | No issue found | All 6/6 changed test/harness files received full-file review. No reportable candidate was found; hardening/evidence notes remain documented. Evidence: artifacts/02_discovery/work_ledger.jsonl, artifacts/02_discovery/finding_discovery_report.md, artifacts/03_coverage/repository_coverage_ledger.md, artifacts/03_coverage/reviewed_surfaces.md |
| Inherited product and product-price DML authorization controls | RLS authorization, membership lifecycle and cross-shop isolation | Rejected | DSC-008, DSC-072 and DSC-073 root-control files are byte-identical to K84 and not regressed. The original findings remain open/unclosed. Evidence: artifacts/01_context/baseline_receipts.md, artifacts/01_context/snapshot_inventory.tsv |
| Inherited POS sales and reversal controls | financial authorization, concurrency, residuals and original-line binding | Rejected | DSC-093, DSC-094 and DSC-134 root-control files are byte-identical to K84 and not regressed. The original findings remain open/unclosed. Evidence: artifacts/01_context/baseline_receipts.md, artifacts/01_context/snapshot_inventory.tsv |
| Inherited Win7POS offline authorization lease | offline session lifetime and protected action gating | Needs follow-up | DSC-075 code and receipts are unchanged and no source regression was found; physical Win7 runtime proof remains external. Evidence: artifacts/01_context/baseline_receipts.md, artifacts/01_context/threat_model.md |
| K125 final-sync runtime and cleanup evidence | first-failure preservation, residue, baseline and parity claims | Needs follow-up | K125 stopped exactly after 128/1024 on aggregate G004 gates, with zero functional failures and cleanup/baseline PASS. Full cross-platform performance and physical-device parity are not demonstrated. Evidence: artifacts/02_discovery/finding_discovery_report.md, artifacts/03_coverage/reviewed_surfaces.md |

## Open Questions And Follow Up

- Does the current Win7POS release deny login, operator switch, override and sale commit at exact lease expiry on physical Win7 hardware?
  - Follow-up prompt: Run the existing physical Win7 release checklist against the final published Win7POS SHA and capture redacted pass/fail evidence.
- Should a later harness-only task make residue semantics and retry telemetry exact without invalidating preserved K125 evidence?
  - Follow-up prompt: After TASK-088B review, require each Admin residue response to assert zero records, count bounded internal retries explicitly, pin operator-script/session paths and rerun only the invalidated harness contract tests.
- The physical Win7 release-package runtime checklist was not executed on this host.
  - Follow-up prompt: Review deferred unit physical-win7-runtime and close its stated proof gap. Paths: win7pos/src/Win7POS.Core/Online/PosOfflineAuthorizationLeasePolicy.cs, win7pos/src/Win7POS.Wpf/Pos/Online/PosOfflineAuthorizationLeaseGuard.cs, win7pos/src/Win7POS.Wpf/Infrastructure/Security/OperatorSession.cs. Surfaces: surface_inherited_win7_lease.
- K125 stopped after G004 at 128/1024, so later groups including live account/shop-switch coverage were not executed.
  - Follow-up prompt: Review deferred unit full-final-sync-parity and close its stated proof gap. Paths: android/app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task103CrossPlatformAcceptanceTest.kt, ios/iOSMerchandiseControlTests/Task103CrossPlatformAcceptanceTests.swift, ios/tests/test_final_sync_contract.py, ios/tools/agent/lib/final_sync.sh, ios/tools/agent/lib/final_sync_contract.py. Surfaces: surface_k125_runtime_evidence.
