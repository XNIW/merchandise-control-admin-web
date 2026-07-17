# Security Hardening Review: MerchandiseControl Admin product images

## Evidence Basis

This review is derived from the committed Admin Changes scan at revision
`2f166b51e7d3ff68f8f01593cb68845788e7be9a`. The scan closed all 35 diff
review rows and retained one reportable Medium/P2 finding:
[cross-shop denied product-image audit injection](../findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md).
The local transactional PoC passed 9/9 assertions and demonstrated audit
integrity impact without image, catalog, or credential access.

I inspected the four denied route branches, their shared service-role helper,
the `SECURITY DEFINER` RPC, and the existing actor/shop and product/shop
helpers at the scanned revision. The source worktree matched that revision
without drift. This analysis is pre-seal derived guidance; it does not claim
that the finding has been fixed.

## Constraints

We are working under a balanced change profile. The public product-image API
should remain compatible, Win7POS stays read-only and outside scope, and no
production or staging behavior was measured. The evidence supports an
incremental database authorization change and regression coverage; it does
not support performance percentages or claims about deployment-edge
throttling.

## Opportunity Portfolio

No structural hardening opportunity qualified. The observed failure is
localized to one privileged denial-audit RPC and its four thin wrappers.
Existing `app_private.product_image_actor_can_read` and
`app_private.product_image_product_is_in_shop` helpers already own the two
missing invariants. The closed review did not expose repeated policy drift,
multiple unsafe privileged sinks, or a blast radius that would justify a new
service, policy engine, capability layer, or isolation boundary.

| Opportunity | Evidence | Options | Recommendation | Proposal |
| --- | --- | --- | --- | --- |
| None qualified | Cross-shop denied product-image audit injection (Medium/P2; 9/9 local PoC) | Local remediation only | Guard the privileged RPC and add tenant-binding regressions | Not applicable |

## Recommendation Summary

I recommend a focused tactical fix inside `product_image_record_denied`:
require the actor to pass the existing read-level shop relationship check and
require the product to belong to that shop before calling the audit writer.
This preserves useful write-denied auditing for same-shop viewers while
rejecting non-member cross-shop writes. The original cross-shop PoC and a
same-shop viewer control should become permanent regressions.

This is the proportionate choice because it restores the invariant at the
privileged sink, introduces no new runtime boundary, and keeps rollback
reviewable. Route-level throttling and cross-shop denial monitoring may be
useful defense in depth, but neither should delay or substitute for the RPC
guard.

## Next Decisions

- Implement the RPC-local actor/shop and product/shop guards.
- Add regressions for cross-shop rejection, zero victim-shop audit rows, and
  preservation of same-shop viewer denial audits.
- Re-run the invalidated pgTAP and security gates, then scan the new committed
  revision before treating the finding as closed.
- Evaluate edge throttling separately only if operational telemetry shows
  denial-volume abuse; no architectural project is recommended from the
  current evidence.
