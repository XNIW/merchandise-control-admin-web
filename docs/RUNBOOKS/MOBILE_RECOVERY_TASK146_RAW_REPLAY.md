# TASK146 — portable recovery migration replay

The versioned 271/281/300 migrations are portable successor sources. They retain signature and exact function-body preimages, logical metadata and ACL envelopes, and compare actual metadata before/after. No object identifier, TLS state or environment-specific full metadata digest is a portable identity. The original operator SQL packets and their hashes remain in `sql/task146-operator-lineage/`; they are historical evidence, not an execution input.

271 preserves the public checkpoint body; 281 changes its product timestamp implementation; 300 makes the qualified reader substitutions. Public checkpoint/marker JSON, digest, authorization, grants and the authenticated 8-second budget remain unchanged. The two private writer helpers intentionally add bounded upgrade handling: ordinary writers retain their blocking key order, while a transaction already holding any target shared-only lock tries every target exclusively in canonical order and raises `40001` on contention. Uncontended upgrades and exclusive reentry succeed. Readers do not mint the writer witness.

The canonical shared migration is `20261104224833_mobile_recovery_shared_reader_fences.sql`, matching the actual version returned by the single authorized TEST connector apply. Its SQL SHA256 is `6c6555304418c337da74c5be7549677d5604ea3d5e4e4ed7ba7d8941c6b29134`. The earlier unpublished filename `20261030065236_mobile_recovery_shared_reader_fences.sql` remains an evidence/lineage identifier only; the versioned source was renamed without changing SQL bytes. The runner and read-only ledger snapshot use the actual version. Do not repair the remote ledger or apply the same SQL a second time. Historical references to300 below identify this same shared-reader change.

## Fresh local replay

Use Python 3.11+ and the pinned Supabase CLI 2.109.0 already available on `PATH`. The runner does not install tools, search ports, reset a database or reuse a preexisting stack. Use new absolute work/evidence directories:

```sh
python3 scripts/ci/mobile-recovery-local-replay.py run \
  --repo "$PWD" --workdir /absolute/new/local-replay \
  --evidence-dir /absolute/new/local-evidence --profile ci
```

The default `ci` profile keeps the committed HEAD ports. `task146-host` changes only the project locator and these exact active configuration values: shadow65420, API65421, database65422, Studio65423, mail65424, analytics65427, pooler65429 and edge inspector18083. Every intended port must be free before startup. The inverse configuration check, owned-creation record, Docker context, project/container labels and exact endpoint guards remain mandatory. Neither profile authorizes operations on another stack.

The runner archives the reviewed HEAD prefix, overlays only allowlisted canonical SQL and the reviewed recovery contract, captures a SHA manifest, starts a fresh owned prefix, then applies the three exact versioned files through the native migrator. The migrator owns each migration transaction and ledger update; 300 contains no embedded `COMMIT`. Failure consumes an apply latch and retains private output. Investigate it and create a successor attempt with explicit source/admission evidence; do not remove the latch or retry identical input.

Qualification includes the original reader-first lock witnesses, 11 bounded upgrade/writer-first/mixed-key cases, exact cleanup/rollback snapshots, and the full 66-file pgTAP membership. The exported summary includes hashes for both concurrency suites and the 11-case count. A local PASS proves that scope only; it does not establish authenticated TEST, device, performance or production acceptance. Do not reapply 271/281 predecessors to an environment where their versions already exist.

## Guarded inverse

`sql/mobile-recovery-shared-reader-fences-rollback.sql` is an operator inverse, not an automatic downgrade. Run it only for the verified owned target and inside a single caller transaction. Its preflight checks all four owned helper bodies and logical metadata/private ACL, the exact current checkpoint and writer bodies, current role/database and budget **before any mutation**. It restores checkpoint604 and the original private writers, preserves their actual metadata/ACL and drops the four qualified helpers with `RESTRICT`. Any drift aborts the transaction. The caller must keep migration-ledger handling explicit; this SQL does not erase a ledger version.

For a nonpersistent local inverse proof, open `BEGIN`, include the inverse file, verify restored body hashes/helper absence, then `ROLLBACK`; the installed candidate and ledger must compare exactly before/after. Keep tampered-config and tampered-ACL expected-failure receipts alongside that proof. A real target rollback requires a separately recorded operational decision and exact target provenance.
