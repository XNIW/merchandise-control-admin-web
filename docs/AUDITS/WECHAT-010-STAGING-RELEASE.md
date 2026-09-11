# WECHAT-010 isolated staging release

Baseline `a787331a6e673b2daf93929b507aa18c6dc24e24` is the exact source of
Worker `38272504-ca78-4bcb-8553-ae7463ae1e64`, proven by GitHub run32530174055.

All seven modified runtime files, `.env.example`, four WeChat test files and
ADR/TASK159 documents are copied byte-for-byte from normally merged revision
`67e360fcbc5812b2bf8e5471ef17b2323d0f0fd2`, PR102. It includes the previously
reviewed PR101 sync-envelope budget. No dependency, commerce implementation,
Supabase migration or other runtime file changes from the deployed baseline.

PR102 source gates and independent security review passed; this exact release
requires its own CI and Cloudflare build-only workflow before deployment.
Deployment target is exclusively `--env staging --keep-vars --minify`; existing
secrets/variables are preserved. All six WeChat flags are OFF/unset by default.
Rollback is the baseline Worker version above. No production or remote migration
operation is part of this release. First live Mini Auth/business E2E remains
NOT_RUN pending qualified provider, rotated Test AppSecret and designated
canonical tester/shop allowlists.
