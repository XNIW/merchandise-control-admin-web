# Resolved repository SECURITY.md guidance

No non-empty `SECURITY.md` file was resolved in Admin Web, Android, iOS, or
Win7POS for this scan. Repository-local `AGENTS.md`/`CLAUDE.md` instructions
and the user-provided TASK-088/TASK-088B constraints remain applicable
governance, but are not treated as `SECURITY.md` policy.

Scan-specific constraints:

- working-tree diff only, against each canonical repository `HEAD`;
- no new Deep Security Scan;
- no production access, migration, deploy, commit, push, or finding closure;
- seven imported High/P1 findings are reviewed for regression state only;
- runtime Win7 physical evidence remains an explicit external proof gap.
