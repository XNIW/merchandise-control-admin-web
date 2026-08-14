# WECHAT-006 Admin staging worklog

Append-only, redacted record. Credentials, database passwords, OAuth codes,
WeChat AppSecret/session_key, opaque sessions and full identifiers are prohibited.

| Date | Work | Evidence/status |
|---|---|---|
| 2026-08-13 | Fetched current remote and audited TASK-150 branches/worktrees, processes, locks, PRs, workflows, deploy state and unpublished work | No live writer/deploy found; historical evidence preserved; TASK-150 eligible for authorized pause/handoff |
| 2026-08-13 | Created TASK-151 / WECHAT-006 as exclusive Admin writer in an isolated current-origin/main worktree | `EXECUTION`; no remote schema/config/deploy mutation yet; external evidence bundle is restricted and uncommitted |
| 2026-08-13 | Verified exact Supabase ref/region and Worker binding; classified the explicitly authorized target as shared public staging | `STAGING_TARGET_VERIFIED=YES`; the portal's technical Production badge did not stop the run; no other environment touched |
| 2026-08-13/14 | Captured schema/history, 99,503 critical rows, 237 staging-only backup rows, and all 26 relevant Storage objects; reconstructed and restore-tested the 130-version pre-activation catalog in isolated PostgreSQL 17 | `MANUAL_STAGING_BACKUP_VERIFIED=YES`; 226-file SHA-256 manifest green; restricted local evidence only |
| 2026-08-14 | Rebuilt the full current migration head in a second isolated Supabase stack and ran the WECHAT database/application gates | Seven migrations applied locally; pgTAP `260/260`, DB lint, Verify, i18n, foundation `969/969` non-skipped, Next build and Cloudflare build green |
| 2026-08-14 | Added an exact seven-version/checksum migration manifest, delta reconciler, and guarded shared-staging workflow | Local reconciliation proves remote `130` / local `137` / exact pending `7`; CLI projection dry-run lists only the seven WECHAT migrations |
