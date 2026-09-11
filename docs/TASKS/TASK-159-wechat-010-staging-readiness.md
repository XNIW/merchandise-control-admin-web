# TASK-159 — WECHAT-010 controlled Mini staging readiness

- Stato: `REVIEW`
- Fase: `REVIEW`
- Writer: Codex, isolated branch from `ffafd55e`.
- Authority: explicit WECHAT-010 user request, including normal PR/CI/merge and isolated staging deploy.

## Scope

Prepare the existing Admin-owned gateway for tester/shop-only staging admission,
correct the bridge nonce encoding required by Supabase, validate session lifetimes,
and advertise mutation capabilities only while the mutation flag is enabled.
No new IdP, provider endpoint, migration, credential or production change.
All surface, linking and mutation flags remain OFF. Actual vendor qualification,
rotated Mini Test AppSecret and first real login remain external prerequisites.

## Acceptance

Focused fail-closed tests, repository verify/foundation/paging/UI checks, independent
security diff review, normal PR with green CI, and documented source-isolated
staging candidate. No live Auth or business E2E PASS from mocked tests.

## Deployment baseline

Current staging Worker `38272504-ca78-4bcb-8553-ae7463ae1e64` maps exactly to
`a787331a6e673b2daf93929b507aa18c6dc24e24` through GitHub Cloudflare run
`32530174055`. Current main contains two unapplied commerce migrations; they are
not WeChat dependencies and will not be applied or included in the isolated
staging release. All seven WeChat migration statement hashes match remote.

## Verification / handoff

Local checks: focused WeChat59/59, foundation1002PASS/2skip (existing clean
Win7POS reference used read-only), verify including lint/typecheck/security/build,
POS paging, UI48/48, OpenNext build and local Worker smoke29/29 PASS.
An initial local symlink build failure was resolved by isolated npm ci; the dirty
historical Win7POS checkout was preserved. No new dependency or lockfile change.

Independent security scan `6aeeb9bd-93e4-4ef9-b791-10bfc4ec39d2`: complete,
all7 source files plus7 supplemental files, zero findings/deferred items; P0/P1=0.
Reviewer noted a nonsecurity flag-parser mismatch; capability projection now
uses the existing exact `true` mutation-gate semantics, with a regression test.
Normal PR/CI/merge remains authorized; this handoff does not self-approve DONE.
External live Auth/catalog/functions remain NOT_RUN and flags OFF.
