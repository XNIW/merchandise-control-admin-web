# Cross-shop denied product-image requests can inject tenant audit events

## Executive Summary

MerchandiseControl Admin Web revision
`2f166b51e7d3ff68f8f01593cb68845788e7be9a` contains a confused-deputy
condition in the product-image denial audit path. An ordinary active account
that is not a member of a victim shop can submit the victim shop UUID and a
product UUID to any of four product-image API routes. The requested image
operation is correctly rejected, but the route then forwards those
attacker-selected identifiers to a service-role client. The resulting
`SECURITY DEFINER` RPC checks only that the shop exists before writing a
shop-scoped audit event.

The practical effect is a persistent cross-tenant write into another shop's
audit stream. An attacker can create repeatable warning events attributed to
their real profile but scoped to the victim shop and carrying the selected
product identifier. This can create operational noise and reduce confidence in
security audit data. The issue does not grant access to image bytes, signed
URLs, catalog records, or mutation of product/image state.

I reviewed the vulnerable revision directly and reproduced the database
primitive against the repository's local Supabase instance: all nine pgTAP
assertions passed, including four victim-shop audit inserts, and the
transaction was rolled back. I did not exercise a deployed HTTP endpoint or
any live, staging, or production system. No fixed revision was available when
this report was prepared.

Severity is **Medium (P2)**. Exploitation requires an active authenticated
account and a valid victim shop UUID, but no membership in that shop. The path
is remote and repeatable, and no route-level rate limit was found.

## Background

The affected feature exposes four server-side product-image operations:

- `intent` creates an upload intent;
- `finalize` verifies uploaded variants and publishes a version;
- `read-urls` resolves short-lived read URLs; and
- `remove` removes the current image reference.

Each route parses a client JSON body containing a `shopId` and one or more
product identifiers, then calls `resolveProductImageRequestActor` with either
`products.read` or `products.write`. The resolver uses a server-side Supabase
client to check that the profile and shop are active, then checks shop
membership or platform-administrator status.

For a signed-in personal account without the requested shop membership, the
resolver deliberately retains the authenticated profile ID so the denial can
be audited:

```ts
if (
  membership?.membership_status !== "active" ||
  !role ||
  !canShopAdmin(role, permission)
) {
  return {
    actorKind: "personal_account",
    actorProfileId: identity.userId,
    code: "permission_denied",
    status: "blocked",
  };
}
```

This is a useful auditing design, but it creates a second authorization
boundary. The business operation and its audit side effect both need a valid
actor-to-shop binding. The normal business RPCs enforce that binding through
`app_private.product_image_actor_can_read` or
`app_private.product_image_actor_can_write`. The denied-audit RPC does not.

The existing read helper is suitable for binding a denial event to a shop. It
accepts active owners, managers, and viewers in that shop, as well as active
platform administrators:

```sql
and (
  (
    p_actor_kind = 'personal_account'
    and exists (
      select 1
      from public.shop_members member
      where member.profile_id = p_actor_profile_id
        and member.shop_id = p_shop_id
        and member.membership_status = 'active'
        and member.role_key in ('shop_owner', 'shop_manager', 'viewer')
    )
  )
  or (
    p_actor_kind = 'platform_admin'
    and exists (
      select 1
      from public.platform_admins platform_admin
      where platform_admin.profile_id = p_actor_profile_id
        and platform_admin.status = 'active'
        and platform_admin.revoked_at is null
    )
  )
)
```

Using the read-level relationship for denial auditing preserves legitimate
write-denied events from viewer accounts while preventing a non-member from
choosing another tenant's audit namespace.

## Vulnerability Details

### Attacker-controlled entry points

The `intent` route illustrates the shared pattern. After parsing the request,
it authorizes the caller against the request's `shopId`. On denial it passes
that same request data to `recordProductImageDenied`:

```ts
const auth = await resolveProductImageRequestActor(
  request,
  input.shopId,
  "products.write",
);
if (auth.status !== "authorized") {
  await recordProductImageDenied({
    actorKind: auth.actorKind,
    actorProfileId: auth.actorProfileId,
    code: auth.code,
    operation: "intent",
    productId: input.productId,
    shopId: input.shopId,
  });
  // Return 401, 403, or 503.
}
```

The same denial branch appears in `finalize`, `remove`, and `read-urls`.
The read route takes its product identifier from the first supplied reference;
the other routes use `input.productId` directly. In each case the shop and
product values originate in the authenticated request body.

### Privilege transition

We now carry the blocked actor profile and caller-selected identifiers into
`recordProductImageDenied`. This helper resolves the Supabase admin
configuration and invokes the denial RPC through a service-role client:

```ts
const admin = resolveAdminClient();
if (!admin) {
  return;
}

await admin.rpc("product_image_record_denied", {
  p_actor_kind: input.actorKind ?? "personal_account",
  p_actor_profile_id: input.actorProfileId,
  p_code: input.code,
  p_operation: input.operation,
  p_product_id: input.productId,
  p_shop_id: input.shopId,
});
```

The browser cannot call this RPC directly because execute privilege is granted
only to `service_role`. That restriction does not protect the call here:
the API route is intentionally the deputy that holds the privileged client.

### Missing tenant-binding guard

The `product_image_record_denied` function is declared
`SECURITY DEFINER`. It normalizes the operation and result code, but its only
shop-side authorization condition is an existence check:

```sql
if not exists (select 1 from public.shops where shop_id = p_shop_id) then
  return jsonb_build_object('ok', false, 'code', 'not_found');
end if;

v_audit_id := app_private.write_product_image_audit(
  p_actor_profile_id,
  p_shop_id,
  'shop.product_image.' || v_operation || '_denied',
  'warning',
  'blocked',
  p_product_id,
  null,
  v_code,
  case when p_actor_kind in ('personal_account', 'platform_admin')
    then p_actor_kind else 'personal_account' end
);
```

No condition establishes that `p_actor_profile_id` belongs to `p_shop_id`, and
no condition establishes that `p_product_id` belongs to that shop. We
therefore arrive at `write_product_image_audit` with a valid actor from Shop A
and target identifiers from Shop B.

The sink inserts the supplied shop as the audit scope and persists the chosen
product identifier:

```sql
insert into public.audit_logs (
  actor_profile_id, scope, shop_id, event_key, severity, result,
  target_type, target_id, metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  ...,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_build_object('product_id', p_product_id, ...)
);
```

The resulting audit row crosses the tenant boundary even though the original
image action does not. The event is accurately marked `blocked` and retains
the true attacker profile, which helps investigation, but those properties do
not authorize the attacker to write into the victim's audit stream.

## Exploitability Analysis

The strongest route is straightforward:

1. We authenticate with any active personal account.
2. We choose a valid victim shop UUID and a product UUID.
3. We send repeated requests to one of the four product-image endpoints.
4. The membership check correctly returns `permission_denied`.
5. The post-denial service-role call inserts the chosen event into the victim
   shop's audit namespace.

The attacker controls one target shop per request, the selected product
identifier, and the event family by choosing the endpoint. Operation names and
error codes are allowlisted, so arbitrary event keys or metadata fields cannot
be injected. The actor ID is derived from the authenticated session rather
than supplied directly, which prevents impersonating another profile.

A valid shop UUID is a real precondition. Random UUID guessing is unlikely to
hit a tenant, and the code does not disclose whether a supplied identifier is
valid beyond observable response behavior that should be assessed separately.
Once a valid identifier is known through ordinary business context, logs,
screenshots, invitations, or another disclosure, however, the attacker needs
no victim membership.

Repeated requests can create audit noise or misleading incident volume. That
may burden shop operators or automated monitoring if alerts consume these
warning events. No application-level rate limit was found on this denial path.
We did not test external edge controls, so deployment-specific throttling
could reduce throughput but would not restore tenant authorization.

Several stronger outcomes are not supported by the evidence:

- the underlying read/write action remains denied;
- no signed URL, image byte, catalog row, credential, or existing audit entry
  is returned;
- product and image state are not changed;
- event result remains `blocked` and the real actor remains attributable;
- no privilege escalation or code execution primitive is present.

These constraints keep severity at Medium. The issue is still security
relevant because a low-privilege principal causes a privileged service to
perform a persistent write across an explicit tenant boundary.

## Proof of Concept

The bundled pgTAP test creates two active shops in one transaction. The
attacker profile is an owner only in Shop A; the victim product belongs to
Shop B. It first proves both image-read and image-write authorization return
false for the attacker against Shop B. It then switches to the same
`service_role` database role used by the server helper and calls
`product_image_record_denied` for `intent`, `finalize`, `read`, and `remove`.

Run it only against a disposable local Supabase database:

```sh
cd poc
supabase test db --local ./cross-shop-denied-audit.sql
```

On the vulnerable revision, all nine assertions pass:

```text
Connecting to local database...
cross-shop-denied-audit.sql .. ok
All tests successful.
Files=1, Tests=9
Result: PASS
```

The decisive assertions observe four rows under the victim shop and zero under
the attacker shop. Each row contains the victim product identifier. The
transaction ends with `rollback`, so the fixture and audit entries are not
retained.

On a fixed revision, the four RPC calls should return `permission_denied`
instead of `denied_recorded`, and the victim-shop audit count should remain
zero. The vulnerable-behavior PoC will therefore fail its corresponding
assertions after the fix; that is the expected safe result.

The supplied `representative-output.txt` is the sanitized output of the
validated local run. This PoC does not issue HTTP requests and does not contact
staging or production.

## Remediation

The invariant is: a shop-scoped denied event may be written only when the
authenticated actor has a legitimate relationship with that shop, and any
recorded product must belong to the same shop. The authorization must be
enforced inside the privileged RPC, not only by its TypeScript caller.

A minimal database-side patch can reuse the existing read-level actor binding
so viewer write denials remain auditable:

```sql
if not app_private.product_image_actor_can_read(
  p_actor_profile_id,
  p_shop_id,
  p_actor_kind
) then
  return jsonb_build_object('ok', false, 'code', 'permission_denied');
end if;

if not app_private.product_image_product_is_in_shop(
  p_product_id,
  p_shop_id
) then
  return jsonb_build_object('ok', false, 'code', 'not_found');
end if;
```

Place these checks after the existing shop-existence condition and before
`write_product_image_audit`. Returning a generic denial for the actor guard
avoids adding a new cross-shop oracle. The TypeScript helper should continue
to treat audit recording as best effort and must never turn a denied business
operation into a successful one.

Regression coverage should include:

- an active Shop A member cannot record a denied event in Shop B;
- the same attempt creates zero Shop B audit rows;
- a Shop B viewer can still record a write-denied event in Shop B;
- a valid member cannot attach a product from another shop;
- all four operation values retain the same behavior;
- `authenticated` and `anon` still lack direct execute privilege.

As defense in depth, route-level throttling can limit audit floods, and
monitoring can flag one actor producing denials across many shop identifiers.
Neither measure replaces the RPC authorization check.

## Summary

The product-image routes correctly reject unauthorized image operations, but
their denial audit path crosses into a service-role RPC without re-establishing
the actor-to-shop relationship. We followed attacker-controlled shop and
product IDs from four authenticated API routes, through the admin client and a
`SECURITY DEFINER` function, into a victim-scoped `audit_logs` insert. A local
9/9 pgTAP reproduction demonstrated the persistent cross-tenant write while
also proving that image read and write permissions remained denied.

Binding the actor and product to the requested shop inside
`product_image_record_denied` restores the missing invariant and preserves
useful same-shop denial auditing. Variant review should focus on other
service-role or `SECURITY DEFINER` helpers invoked after an authorization
failure, especially helpers that accept tenant identifiers copied from the
rejected request.
