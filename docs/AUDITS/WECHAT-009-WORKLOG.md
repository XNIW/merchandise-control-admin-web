# WECHAT-009 / TASK-158 — execution evidence

2026-09-06/07, sole Admin writer, isolated branch from origin/main c18b3cc5.
User authorizes bounded fixes, normal PR/CI/merge, staging only; no DONE.

- Verified project jpgoimipbothfgkokyvm / merchandisecontrol-dev ACTIVE_HEALTHY,
  141 migrations versus local143; latest remote20260821211500.
- Worker38272504-ca78-4bcb-8553-ae7463ae1e64 at100%, all WeChat surfaces OFF,
  no WECHAT bindings; secret inventory names only, no secret values read.
- Reduced sync producer page to5 (safe entity_ids <=16KiB each); upstream and
  full JSON envelope128KiB; fail closed without rewriting cursors/events.
- Targeted WeChat004+009 tests9/9 PASS. Boundary128KiB/one byte over/256KiB,
  Unicode, denied session and cross-shop response covered.
- verify lint/typegen/typecheck/security/build PASS. Foundation998 total,
  996 PASS+2 canonical skip using clean existing Win7 reference fea70fa7 in
  read-only mode. Initial run4 failures: incomplete local Win7 files and
  in-flight EXECUTION ledger, corrected by selecting the reference worktree
  and normal REVIEW handoff. No Win7 source modification.
- Paging checker PASS; Chromium UI smoke48/48 PASS, including email and
  Shop-code login UI. Live WeChat not executed.
- Manual review of gateway/test diff and trusted session/RPC producer paths:
  no new P0/P1 identified, no scope/auth/secret change. No deep/plugin scan claim.
- Existing dependency audit3 transitives (browserslist high, qs/xmldom moderate)
  reported separately; dependencies and lockfile unchanged.
- ADR addendum proposes typed vendor grant mapping only; nonce remains required.
  Tencent OneID is a qualification recommendation, not approved activation.
- No migration/apply/deploy/provider/flag/production change; zero live fixtures.
  Global main would include later commerce code against remote141/local143:
  defer deploy to a scoped, authenticated staging acceptance with real prerequisites.
- Implementation commit704efde50baa4a7257ef11f5844573d0b3b0bf4c; normal
  integration tracked by PR101:
  https://github.com/XNIW/merchandise-control-admin-web/pull/101
  Final merge/CI recorded in the consolidated report; task REVIEW, parent live
  acceptance external.

Consolidated report: Mini `docs/testing/WECHAT-009-REPORT.md`.
Operator packet reused outside repositories at
`/Users/minxiang/Projects/_codex-private/wechat-007/OPERATOR-ACTIONS.md`.
