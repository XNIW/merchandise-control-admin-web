# TASK146 operator SQL lineage

Exact original PR141/operator bytes retained for audit and rollback provenance. These TEST/OID/TLS-pinned packets are not canonical portable migrations and MUST NOT be run automatically. Their existing TEST ledger versions must not be reapplied. Current portable migration lineage preserves the bodies, permissions and timeout contracts; the internal shared-to-exclusive upgrade hardening is an explicitly tested additional change.

- `20261027143737_mobile_recovery_preflight_metadata_custom_plan.sql`: `9fa653cbd503626ca4e7de2ba957b0cc4274cd604489a9e89998f8e65a397357`
- `20261028132836_mobile_recovery_checkpoint_product_timestamp_memo.sql`: `f4d51af0863b136695772db3b76d98f8f4f758ef16099bba588317f9c77215d1`
- `20261030065236_mobile_recovery_shared_reader_fences.sql`: `5ec447ab99a7694c5c336c5ca76cfbb1a48f568cbb0ad0a97290c4a84099df0c`
- `mobile-recovery-shared-reader-fences-rollback.sql`: `0eccd41373a2ca08a02835848b41ea979b9bf182b322345356a0e94e98c70072`

Canonical portable shared source: `supabase/migrations/20261104224833_mobile_recovery_shared_reader_fences.sql`, SHA256 `6c6555304418c337da74c5be7549677d5604ea3d5e4e4ed7ba7d8941c6b29134`. The actual TEST connector ledger version is `20261104224833`; only the unpublished canonical filename was aligned after readback. The retained original300 operator above remains byte-exact and is not the portable successor SQL. No ledger repair or predecessor reapply is part of this alignment.
