# TASK-158 — WECHAT-009 bounded sync and Auth prerequisite decision

- Stato: `REVIEW`
- Fase: `REVIEW`
- Responsabile: Codex, sole writer in isolated worktree from c18b3cc5.
- Authority: explicit WECHAT-009 user mandate; normal commit/PR/CI/merge authorized.

## Scope / acceptance

Bound sync producer requests to five events (safe entity IDs <=16 KiB each),
validate the complete 128 KiB consumer envelope without dropping events or
changing cursors, test byte boundaries and session/shop isolation. No migration.
Research bridge compatibility and record minimal ADR proposal; do not configure
an invented provider. Required verify/foundation/paging/UI smoke and diff security
review, normal integration, staging deploy only when safe against current schema.
Production/native/POS/client/Excel source unchanged; general flags OFF.

## Execution / handoff

Implementation verified in commit `704efde50baa4a7257ef11f5844573d0b3b0bf4c`.
Normal integration is tracked by [PR #101](https://github.com/XNIW/merchandise-control-admin-web/pull/101).
The WECHAT-009 consolidated report in Mini `docs/testing/WECHAT-009-REPORT.md`
records final merge/CI and checkout evidence.
No DONE without explicit reviewer/user acceptance; live Auth blocked externally.
