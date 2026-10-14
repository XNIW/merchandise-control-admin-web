# WECHAT-010 — Mini direct protocol and native privacy design

Date: 2026-09-12. User-authorized amendment to ADR-002, Mini only.
Status: design APPROVED by the two independent protocol/security reviewers before implementation. Initial design SHA256 bfeedbb3b9586cb0fd856b850aaeee0e912cf46e99922ff1b614ec3bbece0f89. Final implementation review remains required before rollout; actual credential/TEST evidence is required before activation.

## Scope and evidence

Protocol identifier: `wechat-mini-code2session-v1`. Existing Web/Android/iOS OIDC
and `mini-id-token-nonce-v1` retain their signature/audience/nonce checks. Explicit
server/client protocol configuration selects a single path; no error-triggered
fallback. OneID stays paused and is not a dependency of the new Mini path.

The official wx.login type contract is available in the installed official
`miniprogram-api-typings` package. Current official code2Session and wx.login
documentation fetches failed non-retryably; they were not reopened via another
browser or transport. Search results for TCSAS/OpenServer are excluded. Generic
protocol support, TEST-account eligibility and actual exchange are separate
evidence: TEST/live still require an official replacement credential and runtime
proof. An implementation tested with an injected transport does not close them.

## Entry and login transaction

Separate `/api/auth/wechat/mini/*` endpoints. Fixed server AppID and exact HTTPS
WeChat endpoint `/sns/jscode2session`; AppSecret only in Worker secret store.
No configurable upstream host, redirects, retries, query/error logging or tracing
of the credential-bearing upstream request. Bound time/body/content validation;
discard session_key/UnionID, expose neither. HMAC-SHA256(AppID/OpenID) with a
versioned server key identifies the mapping; no nickname/email/UnionID merge.

Mini generates a random transaction verifier before requesting a challenge;
server stores only its digest and the device digest, protocol/AppID, expiry and
one-use state. The same attempt calls wx.login and sends its returned code over
TLS. No code from URL, clipboard, external callback or restored storage is used.
An atomic claim consumes the challenge/code digest before the upstream request;
concurrent/replayed claims fail, and uncertain upstream results require a fresh
login. TTL at most five minutes; existing admission and ingress rate-limit
principles apply, with bounded ledgers and no raw IP/code/secret retention.

This is a bearer-code protocol, not OIDC: the local verifier correlates our
transaction but is NOT a nonce signed by WeChat or a cryptographic attestation
of the originating Mini instance. TLS, official wx.login, AppID binding and
single-use codes supply the platform guarantees. Compromised endpoints or full
social-engineering relays remain outside what a local challenge can prevent.

After external verification, a narrow service-only database function derives
the actor from the active AppID/identity mapping, canonical account lifecycle
and exact pilot allowlists. It must not accept an arbitrary actor UUID. It consumes
the verified transaction and creates a random opaque 15-minute session atomically.
No Supabase JWT, password, magic link, Auth user or Auth identity is synthesized.
Malformed/uncertain issue responses trigger revocation of the candidate token hash.
Mini installs only a current attempt's receipt and keeps it in memory.

## Explicit initial enrollment

1. An already authenticated personal Admin session starts pairing with explicit
   intent. Same-origin POST/CSRF checks and server `getUser` apply. The user-context
   RPC derives auth.uid()/session_id and validates the canonical live session;
   no actor identifier is accepted from a request. The target must be allowlisted.
2. Pairing stores protocol, AppID, five-minute deadline and distinct random
   transfer/Admin/Mini capabilities (hashes only), with a fixed originating Admin
   session. Admin displays a transfer code for the operator to enter in Mini;
   possession of this code alone cannot approve a mapping or issue a session.
3. Mini creates its own verifier and obtains a code only from wx.login. The first
   successful WeChat verification claims the pairing's AppID/identity/device
   immutably. Competing claims cannot replace it. Both views show the same short
   comparison code and canonical account context, without exposing OpenID.
4. The operator confirms the matching code in the authenticated Admin application.
   Approval requires the original still-live personal session and Admin capability;
   another account/session cannot approve. Mini then explicitly confirms and calls
   wx.login again; identity must match the first proof and the same Mini capability.
5. Finalization locks pairing and mapping key, checks deadline, both consents,
   live Admin session/account and collision, then commits mapping, terminal pairing
   and audit together. Existing same-profile active mapping is idempotent; another
   profile is a safe conflict. Unlink never allows implicit reassignment/revival;
   re-enrollment requires fresh dual consent. Pairing does not automatically issue
   a business session while Auth is OFF.

Two consents, contextual display and comparison mitigate forwarded-pairing attacks;
they are not a claim to defeat full endpoint compromise or a deliberate relay.
No SQL administrative linking substitutes for the application flow. Cross-platform
OIDC linking remains a separate, disabled feature.

## Database and authorization

Add private mapping/pairing/proof-ledger tables with RLS and no anon/authenticated
table grants. Public RPC wrappers have enumerated signatures, explicit role
grants and restricted private implementations/search_path. Admin RPCs derive
the actor from real Auth; direct issue RPCs derive it from consumed verified
proof+mapping. No generic new actor-assumption or arbitrary-RPC API.

Extend existing opaque sessions with protocol/mapping/generation, requiring a
mapping for direct sessions and none for legacy OIDC. Resolve checks expiry,
token/device digests, session generation, mapping activity/generation, active
profile, auth.users ban/deletion/anonymous state. Unlink atomically revokes mapping
and all related sessions under the same mapping lock used for issue/finalize.

Replace Mini business entry calls based on an actor UUID with session-bound
wrappers that revalidate the session inside the business transaction before
invoking the existing enumerated, shop-scoped read/mutation/sync implementation.
They preserve its capability, lifecycle, lock/idempotency and cross-shop checks;
service role itself is not constrained by RLS. Existing OIDC clients remain
unchanged. Private assume-actor helpers remain internal and unavailable to users.

The account DTO distinguishes `wechat-mini` application mapping from Supabase
`custom:wechat`. Google remains in auth.identities; linked state for direct Mini
comes from the application mapping. Do not forge a Supabase provider name.

Storage keeps canonical paths, private buckets and short signed URLs. Mini context
carries its session proof for revalidation before finalize and before returning
new URLs. Revocation stops new authorized operations/emissions. Already issued
Storage URLs remain bearer capabilities until their documented TTL; no retroactive
revocation promise and no policy broadening outside the gateway.

## Native privacy/readiness

Admin `src/lib/legal/policies.json` is the versioned source for complete existing
privacy/deletion facts plus en/it/es/zh-Hans translations. Mini imports a generated,
hash-checked pinned copy. Native page is public, works offline, has locale selection,
scroll/back and real assisted deletion instructions. No invented contact/endpoint.
H5 is no longer the sole privacy entry. General domain/TLS checks stay enabled.
Platform portal privacy obligations remain independent and unqualified.

Readiness v1 remains OIDC+verified-H5 only. V2 discriminates protocol and privacy
mode, rejects mixed/unknown fields and requires native content hash/version/runtime
evidence for native privacy. Direct mode requires fresh credential/AppID proof,
TEST exchange evidence, reviewed mapping/enrollment and exact profile/shop, current
Mini/Admin SHA and Worker identity. No `privacyWebView=PASS` for native evidence;
no provider-qualification field falsely reused for direct code2Session.
Enrollment can be enabled separately after its gates; business Auth/mutations
remain OFF until their corresponding evidence exists. Server precedes client build.

## Required verification and release

Deterministic transport/protocol negatives; replay/race/timeout; malicious pairing
handoff, wrong identity/device/session/consent, expiry, collision and unlink races;
direct SQL anon/authenticated denial and viewer/cross-shop outside the gateway;
mapping/session revocation across reads/mutations/sync/Storage; strict DTO/readiness
discriminators and unchanged OIDC regressions. Privacy completeness/parity plus
actual native runtime content, language, scrolling, return and offline checks.

Additive migration in Admin only, application and rollback/flag-disable strategy
tested on disposable local DB; no commerce migrations on shared staging. Exact
diff technical/security review before rollout. Normal CI/merge, selected-file
release from existing isolated staging baseline, traceable migration delta and
Worker. Pilot only after real credential+pairing+vertical login proof; otherwise
integrate valid reviewed code with capability OFF and report remaining evidence.
