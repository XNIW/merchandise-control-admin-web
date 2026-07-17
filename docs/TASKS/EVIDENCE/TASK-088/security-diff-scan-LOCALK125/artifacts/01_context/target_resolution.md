# Target resolution

- Mode: multi-repository working-tree delta against the sealed TASK-088 K84 scoped snapshot.
- Baseline scan: `task088-k84-20260716T195843Z`.
- Baseline scoped rows: 62.
- Hash-identical rows: 56.
- Delta rows requiring deep review: 6.
- Production source changes after K84 in this scope: 0.
- Changed rows are Android/iOS acceptance tests and local final-sync harness/contract helpers.
- Production, credentials, new Deep Security Scan, live mutation, commit, push and deploy are excluded.

The 62-row current inventory plus the four repository HEADs binds this scan to the reviewed checkout. The discovery worklist is limited to the six hash-different rows; the 56 identical rows reuse the sealed K84 receipts without repeating completed review.

