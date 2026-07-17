# Reviewed surfaces

| Surface | Risk area | Outcome | Notes |
| --- | --- | --- | --- |
| Android final-sync acceptance driver | fixture/session/shop isolation; local SQL cleanup; command boundary | No issue found | Full-file review. Exact run-prefix gate and scoped account/shop controls remain; SQLite `LIKE` wildcard escaping is a later hardening opportunity. |
| iOS final-sync acceptance driver | session handling; coordinator gates; retry visibility; source/apply timing | No issue found | Full-file review. Tokens are not emitted and gate paths are bounded; retry and automatic-push subphase telemetry are not complete proof. |
| Shared final-sync shell and Python contract | target binding; stop-first; evidence integrity; cleanup scope | No issue found | Full-file review. Single runner, mandatory cleanup and partial-ledger preservation remain. Admin residue responses should later be validated semantically, not only counted. |
| Supabase REST cleanup helper | service-role handling; target binding; fixture deletion scope | No issue found | Full-file review. Key redaction, prefix/owner/shop checks and trusted-event file guards remain. Exact project-host/ref pinning is defense in depth. |
| Seven inherited High/P1 controls | tenant/RLS, financial integrity and Win7 offline authority | Rejected for new reporting | 7/7 control-chain files are hash-identical to K84 and not regressed. Original findings remain open; DSC-075 keeps the physical-runtime proof gap. |

