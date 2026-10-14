# WECHAT-004 integration test matrix

Scope: local, non-production code and database verification only. All flags
remain OFF.

| Area | Required invariant | Evidence | Result |
|---|---|---|---|
| Mini audience | Opaque device/auth-generation session; no Supabase bearer | Foundation session/BFF suite and pgTAP | PASS |
| Legacy sinks | Mini token cannot call direct tables or legacy RPCs | BFF/session isolation and legacy-denial pgTAP | PASS |
| Catalog writes | Owner/manager only, exact shop, CAS, idempotency, audit | WECHAT-003 catalog pgTAP | PASS |
| Linking | Independent flag, retry/duplicate/crash/reconcile/conflict/expiry | Auth foundation plus link-saga pgTAP | PASS code-side |
| Sync pull | Minimal delta, watermark, epoch, gap and reconcile | WECHAT-004 BFF/sync tests | PASS |
| Outbox contract | Persistent per-user/shop, bounded, same-key retry, ordering | Mini durable-outbox suite | PASS |
| Images | Personal membership, replay/expiry/path/CAS/rate/cleanup | Mini image foundation plus image pgTAP | PASS |
| Cross-platform | Real local Supabase mutation/event/readback; production apply engines | Rollback-only fixture plus Android/iOS tests | PASS local |
| Performance | Keyset/bounded reads; no periodic full catalog | Guarded 20k-product SQL and Mini scheduler tests | PASS local |
| Security diff | Session, legacy sinks, service role, IDOR, link, replay, audit, rate, shop | Codex targeted diff scan; 66/66 coverage | PASS after fixes |
| Live provider/device | AppID, bridge, provider, approved domains and devices | Not available | EXTERNAL_ACTIVATION_REQUIRED |
| Staging | Verified non-production ref and allowlist | No confirmed target | NOT RUN |

The rollback-only local fixture created one real catalog mutation, one catalog
event, one prices event with two unique price rows, and authoritative Admin
readback. Android and iOS production incremental apply engines consumed the
fixture without duplicate price history or cross-shop acceptance. This is real
local Supabase evidence, not a live WeChat login claim.
