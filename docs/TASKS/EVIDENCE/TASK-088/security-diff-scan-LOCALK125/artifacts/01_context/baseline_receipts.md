# Reused sealed baseline receipts

Baseline scan: `task088-k84-20260716T195843Z`  
Baseline snapshot: `codex-security-snapshot/v1:sha256:fcfacbc9e7346273c20a521b26e290ae5ddba3d646cf1b4bb2f351b4b5aa548a`

- 62 scoped rows were hash-compared with the current checkout.
- 56 rows are byte-identical and retain the K84 file-review receipts.
- The seven High/P1 post-fix root-control chains are in the 56 identical rows.
- K84 validation and attack-path receipts remain the authoritative proof for those inherited rows; this scan does not close or rewrite them.
- DSC-075 retains the physical Win7 runtime proof gap.

Authoritative baseline artifacts:

- `../task088-k84-20260716T195843Z/artifacts/05_findings/validation_summary.md`
- `../task088-k84-20260716T195843Z/artifacts/05_findings/attack_path_analysis_report.md`
- `../task088-k84-20260716T195843Z/artifacts/05_findings/preserved_test_evidence.md`

