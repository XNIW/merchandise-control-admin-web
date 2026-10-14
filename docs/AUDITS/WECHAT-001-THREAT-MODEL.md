# WECHAT-001 targeted threat model

This is a scoped authentication/data-boundary review, not a repository-wide deep scan.

| Threat | Priority | Mitigation / required evidence |
|---|---:|---|
| Code interception, CSRF/state mismatch, replay, session fixation | P0 | Random one-time state and nonce, five-minute DB ledger, surface/device/IP/mode/correlation binding, consume-before-exchange, replay tests, Supabase PKCE for web |
| Account-link takeover, OpenID/UnionID collision | P0 | Canonical `auth.users`; stable signed OIDC `sub`; explicit authenticated link; no similarity merge; conflict fail-closed; manual linking remains gated |
| Cross-shop leak, removed membership, suspended account/shop | P0 | RPC `auth.uid()` plus active profile/member/shop on every call; no direct table/view grant; pgTAP cross-shop and revocation tests |
| Provider/AppID/callback confusion | P0 | One provider ID, typed surface, bridge audience allowlist, issuer/JWKS/audience/nonce verification, exact callback matrix |
| Secret/service-role/token/code/log leakage | P0 | Server-only env, publishable-key OIDC grant, no client AppSecret/service role, no-store responses, no token/code logs, secret/bundle scans |
| Open redirect/redirect URI mismatch | P1 | Existing safe internal `next`, same-origin callback construction, stale Vercel detection, explicit public-domain activation checklist |
| SSRF/outbound abuse | P1 | HTTPS bridge URL, explicit hostname allowlist, no credentials in URL, redirect rejection, eight-second timeout, bounded JSON, no code retry |
| Brute force/enumeration/rate abuse | P1 | DB issue limits per hashed device/IP, Cloudflare durable rate-limit rule required at activation, uniform sanitized failures, bounded RPCs |
| Compromised device/Mini Program storage | P1 | Short supported sessions; no OpenID/session_key; Mini Program avoids indefinite persistence; local logout and server revocation; reauth on expiry |
| SDK/supply chain compromise | P1 | No unverified native SDK added; official provenance/version/license review required before enabling adapters; deterministic locks/scans |
| Realtime topic guessing/event leakage | P1 | No Realtime publication or Phoenix implementation; bounded polling reloads authoritative RPCs |
| Audit PII excess | P1 | SHA-256 salted subject/device/IP identifiers only; correlation/surface/mode/reason; no nickname/email/OpenID/token/code |

## Residual activation gates

- Official WeChat documentation/console verification for every surface and cross-AppID UnionID conditions.
- Approved bridge operator, key-management/rotation/SLA/incident contract, discovery/JWKS validation, audience set, and penetration review.
- Durable distributed edge rate limiting; the database challenge limiter is necessary but not the only production control.
- Approved manual identity-linking and unlink recent-session UX; unlink is intentionally not exposed by this change.
- Device/DevTools/browser staging tests, same-sub evidence across four surfaces, and redacted log inspection.
- Apple Guideline 4.8 product/legal decision.

## WECHAT-004 verified deltas

- The Mini audience is now an opaque, device/auth-generation-bound BFF session;
  it is not a Supabase bearer and cannot authenticate directly to legacy
  catalog sinks.
- Native linking requires the independent server-side linking flag. Web/native
  identity linking uses an idempotent recoverable saga with one live
  actor/provider attempt, provider-state reconciliation and bounded redacted
  audit.
- Invalid unissued exchange state no longer creates a durable public audit row.
- Catalog and image receipt lifetime is bounded after the 30-day replay horizon;
  cleanup is private, bounded and serialized.
- Expired/terminal image intent replay cannot mint a new upload capability, and
  image removal cannot lock a foreign-shop target before scope validation.
- A targeted immutable-snapshot security review covered all 66 ranked rows. It
  reported five Medium and two Low findings, all fixed and regression-tested in
  the current integration branch. The remaining Low follow-up is bounded
  repeated Storage/JPEG work from parallel finalize calls before downstream
  CAS; feature flags are OFF and production-like amplification is unmeasured.

External bridge/AppID/provider/domain/device inputs and a real provider login
remain unavailable, so `WECHAT_AUTH_LIVE_E2E_PASS` is not claimed.
