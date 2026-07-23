# Staging migration reconciliation — 2026-07-23

## Decision

The eight staging-only migration sources were recovered directly from
`supabase_migrations.schema_migrations.statements` with Supabase CLI
`migration fetch`. They are restored to the repository under their existing
version and name. This is source recovery, not a new migration and not a
request to execute their DDL/DML again.

The staging ledger already contains all eight versions. A staging dry-run must
therefore report none of these files as pending. Any mismatch fails closed.

## Authorized target

- Supabase project ref: `jpgoimipbothfgkokyvm`
- Environment: isolated staging only
- Production data: prohibited
- Approval basis: the 2026-07-23 final Win7POS execution request authorizes
  reconciliation only after a verified backup and restore rehearsal.

## Backup and restore gate

- Workflow: `Staging Backup and Restore Rehearsal`
- Run: `30038095015`
- Workflow commit: `5e69af9183ee5a45388e8059ff359d5b9881f6d7`
- Result: `PASS`
- Encrypted archive bytes: `42141345`
- Encrypted archive SHA-256:
  `d98ec8cdacc31f1517801c524e91ffd957197670651d414091669206328accba`
- Source/restored fingerprints: byte-identical
- Validated: schema, data counts, policies, triggers, foreign keys, indexes,
  constraints, migration ledger, and the current catalog-v2 object count
- Storage backup: 1 bucket, 2 objects, 135730 bytes

The artifact contains only the age-encrypted backup plus sanitized manifests
and fingerprints. No plaintext SQL backup is retained in the artifact.

## Recovered sources

| Version | Name | Statements | File SHA-256 | Ledger-array SHA-256 |
| --- | --- | ---: | --- | --- |
| `20260707183000` | `mac_admin_w7pos_009_pos_admin_staff_role` | 24 | `4bd1403d568ed78d5aab239689f30eaf474aeaf35e1a88f92a0f710a28810376` | `d63ead2623d29449465a25cde8d99168366f3cbb46e1763a926a4eef6dae64fa` |
| `20260707200500` | `mac_admin_w7pos_009_pos_admin_permission_completion` | 7 | `d9b19bd0a0eb9a4761d5591ef339e852fa528574454f3cc47bb74492a5f6b6f8` | `2e61ac3f5d33c33686b7229ca20cd3e85197a7126324a8aa352c563631f6aed7` |
| `20260708003000` | `mac_admin_w7pos_009_pos_admin_permission_remote_repair` | 7 | `99003edfb76a696d84b07b6b71b920c146c54b165c640badb5d5d3748b840c04` | `c526d3f53f40842bc71da2d01a74e1f69373214194480312d70ce05db71a1d45` |
| `20260713010000` | `deep_audit_shop_scoped_dml_rls` | 1 | `fac79bd4455dcbbf225d1d23784b386c22532cd2b32670907a19da1a524753ee` | `d0f51b4508df7a61b2370f2615c130a279e2f8f7322ac5863f7803e4e6e70bda` |
| `20260713020000` | `deep_audit_atomic_staff_lockout` | 1 | `77b57355e087f3a0487ad0eb6b3594c1f2fe4c0a35954f9d21a535b6a30f6751` | `124d0f34587397f1d5145c1cfaaa70e193675ee8e4298812f27cd4d39f80f352` |
| `20260718120000` | `task_139_product_image_cleanup_runs` | 13 | `41903721ce88632ef9380f921adce12143f4ac44344ba127a7374858d73a23c6` | `85f8cc9db4fd9097f2a934f6ef02c1cd33c5c7cce59f3b8f01c99235cf4b2128` |
| `20260718235345` | `task_140_staff_pin_reset_login` | 51 | `3f6382029aaafa132bef74dce4a3015d5f5b84e0e0ce3e6a625a841d685813c5` | `b163c37f3f3880964b0b6f26d120e363635e6f86db8c9f8f9dc223663bd7d365` |
| `20260719090000` | `task_140_auth_concurrency_hardening` | 44 | `60f31949a73977b0d91aa4104021b8aec6ceb8302ee306538d6f9e28c797ff11` | `ec11dcc3d322c5197bf56d572fac67029b1851e113bf5cab55aa56d80e7722a9` |

`File SHA-256` binds the exact bytes emitted by Supabase CLI. The separate
ledger-array hash binds the PostgreSQL `text[]` representation stored remotely.
The recovery workflow also pins statement count, reconstructed byte count, and
reconstructed SQL hash before it accepts the files.

## Dry-run gate

From an exact commit containing these files:

1. verify the project ref allowlist and URL/ref match without printing secrets;
2. list local and remote migrations;
3. run `supabase db push --dry-run` against staging;
4. require all eight recovered versions to be present on both sides;
5. require none of the eight recovered versions to be pending;
6. require the only expected pending migration to be
   `20260719170600_task_139_pos_catalog_v2_pagination_snapshot.sql`;
7. capture the pre-apply schema/policy/function/index/data fingerprint.

No `reset`, `repair`, `squash`, remote seed, or destructive push is allowed.

The executable implementation is
`.github/workflows/staging-catalog-v2-deploy.yml`. It uses the protected
`cloudflare-staging` environment and has two separate dispatch modes:

- `dry-run`, which must complete before any write;
- `apply`, which additionally requires the literal confirmation
  `APPLY_CATALOG_V2_STAGING` and repeats the exact-delta proof and dry-run
  before applying.

## Apply and recovery plan

Apply only the one dry-run-approved catalog-v2 migration from the same exact
commit. After apply, compare migration ledger, functions, grants, policies,
indexes, constraints, and expected data counts with the pre-apply capture.

Operational rollback is fail-closed:

1. stop or roll back the Admin/Cloudflare deployment to the previous known-good
   worker so clients do not advertise catalog-v2;
2. revoke test sessions and stop fixture writers;
3. retain the failed database and evidence for diagnosis;
4. prefer an additive corrective migration;
5. restore the encrypted staging backup only with explicit owner approval,
   because restore replaces staging state.

There is no destructive down migration and no deletion of migration-ledger
history.
