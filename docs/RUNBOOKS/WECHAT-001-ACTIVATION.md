# WECHAT-001 activation, disablement, and incident runbook

## Ordered manual activation

1. Review ADR-002 and approve the bridge operator/security contract. Record fixed issuer, discovery/JWKS URLs, algorithms, key rotation, audiences, nonce policy, token TTL, `email_optional`, and incident owner.
2. In official WeChat Open Platform documentation/console, register or associate Website, Android, iOS, and Mini Program applications with the same intended owner. Record whether UnionID is actually returned for this association.
3. Verify Website callback domain; Android application ID/package and signing fingerprint; iOS bundle ID, URL scheme and Universal Link/Associated Domains; Mini Program request/socket domain and privacy/account-deletion requirements.
4. Configure bridge AppIDs/AppSecrets and code exchange server-side. Never copy secrets to Git, client configuration, a report, or terminal output.
5. Create/enable Supabase custom OIDC provider `custom:wechat` in dev/staging with issuer/discovery, client ID/secret, acceptable audiences, `email_optional`, and nonce checks. Leave `WECHAT_AUTH_LINKING_ENABLED` OFF until its separate account-takeover review passes.
6. Apply the reviewed migration to local then controlled dev/staging only. Run pgTAP, cross-shop, replay, suspension, and rate tests. Do not run production migration from this task.
7. Configure the value-free environment names in the controlled server secret store. Add only the verified public AppID/base URL/flag to each client configuration.
8. Set public staging callbacks/domains; exclude localhost, Vercel deployment URLs, and LAN IPs from the public staging flow.
9. Enable one staging surface at a time; test cancel/deny/mismatch/replay/conflict/suspended/membership removal, same canonical identity, and absence of secrets/tokens/codes in logs/bundles.
10. Complete Apple 4.8 decision and independent review. Production enablement/publication requires a separate explicit mandate.

## Disablement and rollback

Turn OFF the affected surface flag first. Revoke sessions/bridge credentials according to the owning systems, then revoke RPC execute if data isolation is in doubt. No destructive rollback migration is provided. After challenges expire, reviewed operators may drop only WECHAT-001 functions/challenge data; POS source data is never rolled back.

## Incident response and rotation

For suspected code/token/identity/cross-shop leakage: disable the surface, preserve redacted correlation/audit records, revoke affected sessions, notify the bridge/Supabase owners, rotate bridge client secret and OIDC signing keys/JWKS according to their runbooks, validate audience/issuer/callbacks, rerun security and live matrices, and obtain review before re-enable. Do not paste secrets or complete external identifiers into tickets.

## WECHAT-004 pre-activation gates

Before enabling any Mini or native surface in non-production, additionally:

1. prove the client receives only an opaque Mini session and that direct legacy
   table/RPC calls reject it;
2. run the session revocation, device binding, generation, viewer, suspended
   shop/member and cross-shop suites;
3. run link success/retry/duplicate/crash/reconcile/conflict/expiry tests with
   the independent linking flag OFF first;
4. verify delta watermark, gap recovery, epoch bootstrap, durable outbox restart,
   same-key retry and conflict UX against a real non-production Supabase stack;
5. verify receipt cleanup preserves the 30-day replay window and never exposes
   a public cleanup grant;
6. validate request/upload/socket domains in the official console and complete
   DevTools/device network inspection without recording tokens or signed URLs.

Local integration evidence is not activation evidence. No staging project was
confirmed during WECHAT-004, so no remote migration or preview deployment was
performed. Production remains prohibited. Keep every WeChat and catalog mutation
flag OFF until the external operator completes this runbook and independent
review accepts the redacted evidence.
