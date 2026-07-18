# Security Review: merchandise-control-validate-admin-20260717T150455Z

## Scope

Committed Changes review of the Admin consolidation diff from 38f02bd969e55df91ff41d3905661da8dfdb145a through 2f166b51e7d3ff68f8f01593cb68845788e7be9a. All 35 changed-file worklist rows were read in full.

- Scan mode: branch_diff
- Target kind: git_diff
- Target ID: target_sha256_fad9083fc958bc71f2eb8ec0afa0a6a7ec9649ac044c88a3001b44ae86539aec
- Revision range: 38f02bd969e55df91ff41d3905661da8dfdb145a...2f166b51e7d3ff68f8f01593cb68845788e7be9a
- Snapshot digest: codex-security-snapshot/v1:sha256:80d0ac6f423142d40d1a3ebb2a0e3ef44b5d20d59840b730f806cc7c8523daed
- Inventory strategy: diff
- Included paths: .
- Excluded paths: none
- Runtime or test status: Targeted local pgTAP validation passed 9/9 in a rolled-back transaction. No live HTTP, staging, production, or cross-client run was performed.
- Artifacts reviewed: 35 changed-file review rows and seven worker receipts, product-image routes, authorization, service-role helper, Storage service, UI, and browser cache, Supabase migrations, RLS, grants, SECURITY DEFINER RPCs, and pgTAP contracts, Admin data access, POS sales and QA fixture changes, operational scripts, scanners, and localization
- Scan context: The threat model was generated during the scan from repository source and deployment documentation. This was a Changes scan; Deep Scan remained disabled. Win7POS was external, read-only, and outside the target.

Limitations and exclusions:
- The route-to-RPC path was validated statically and at the local database RPC boundary; no deployed HTTP session was exercised.
- Deployment-edge rate limiting and alerting were not measured.
- Staging/dev migrations, production behavior, and live cross-client parity were not exercised.
- Excluded external Win7POS repository: User-directed read-only preservation boundary outside the Admin scan target; no Win7POS files were modified or scanned.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 4 |
| Severity mix | medium: 4 |
| Confidence mix | high: 4 |
| Coverage | complete |
| Validation mode | Exact committed source trace plus targeted local pgTAP integration PoC |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

MerchandiseControl Admin Web is a multi-tenant Next.js service backed by Supabase Auth, Postgres, RLS, SECURITY DEFINER RPCs, and private Storage. The highest-risk boundary in this diff is the transition from an authenticated request to server-side service-role authority, where every caller-selected shop and resource identifier must be rebound to the resolved actor before a persistent write.

### Assets

- shop-to-shop tenant isolation and role authorization
- catalog, inventory, sales, product-image, and audit integrity
- personal-account sessions, POS credentials and device/session tokens
- the server-only Supabase service-role capability
- private product-image objects, signed URLs, and canonical object paths

### Trust Boundaries

- browser or device input to Next.js routes and server actions
- Next.js server to Supabase through session/publishable clients
- Next.js server to Supabase through the service-role client
- Next.js server to private Storage and signed bearer capabilities
- operator tooling to local, staging, and production services

### Attacker Capabilities

- authenticate with an ordinary active personal account
- choose request shop, product, image-version, and operation identifiers
- repeat remote requests and observe application responses
- supply bounded image metadata and uploaded bytes to authorized image flows

### Security Objectives

- verify client-supplied shop identifiers rather than treating them as authority
- enforce viewer, manager, owner, staff, and platform-admin permissions server-side
- bind every service-role RPC argument and persistent side effect to the resolved actor and tenant
- keep private Storage capabilities short-lived, canonical, tenant-bound, and version-bound
- preserve redacted, attributable, tenant-correct audit records

### Assumptions

- Supabase token signing, managed Postgres/Storage, TLS termination, and Cloudflare isolation are trusted platform dependencies.
- A fully compromised operator, developer workstation, CI control plane, or production secret store is outside this repository-level model.
- Local test harnesses are not production entry points unless an operator explicitly deploys or runs them.

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Denied product-image finalize can inject a victim-shop audit event](#finding-1) | medium | high | inline below |
| [Denied product-image removal can inject a victim-shop audit event](#finding-2) | medium | high | inline below |
| [Denied product-image read can inject a victim-shop audit event](#finding-3) | medium | high | inline below |
| [Denied product-image intent can inject a victim-shop audit event](#finding-4) | medium | high | [Open report](findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md) |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Denied product-image finalize can inject a victim-shop audit event

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The committed route-to-service-role-to-RPC trace is direct, and a rolled-back local pgTAP PoC passed 9/9 assertions, including the finalize variant and victim-shop audit row. |
| Category | Improper authorization / cross-tenant confused deputy |
| CWE | CWE-862 |
| Affected lines | supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1256-1266, src/app/api/shop/product-images/finalize/route.ts:26-39, src/server/shop-admin/product-images/service.ts:128-140, supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375 |

#### Summary

An active authenticated account can submit another shop's identifiers to the product-image finalize route. Finalization is denied, but the denial branch forwards those identifiers through a service-role client to a SECURITY DEFINER RPC that writes a victim-scoped audit event without actor/shop or product/shop binding.

#### Root Cause

The invariant is that a shop-scoped audit write must be authorized for the final shop and resource identity at the privileged boundary. The finalize route correctly denies the business action but forwards request-derived `shopId` and `productId` to a service-role helper. `product_image_record_denied` verifies only that the shop exists, then writes those identifiers into `audit_logs` without reapplying the actor/shop or product/shop controls already available in the migration.

**Finalize denial forwards caller-selected shop and product** — `src/app/api/shop/product-images/finalize/route.ts:26-39`

The membership decision correctly blocks finalization, but the denial side effect carries request-derived `shopId` and `productId` into `recordProductImageDenied()`.

```typescript
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
    operation: "finalize",
    productId: input.productId,
    shopId: input.shopId,
  });
```

**Shared helper crosses into service-role authority** — `src/server/shop-admin/product-images/service.ts:128-140`

The helper preserves both attacker-selected resource identifiers while changing authority to the server-only service-role client.

```typescript
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

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

**Existing helper expresses the missing actor-to-shop invariant** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:258-280`

`product_image_actor_can_read` already defines the actor/shop relationship suitable for same-shop denial auditing, including viewers and active platform administrators.

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

#### Validation

A rolled-back two-shop fixture proved the attacker had neither read nor write permission in the victim shop. The finalize call still returned `denied_recorded`, and the combined four-operation fixture produced four victim-shop audit rows and zero attacker-shop rows.

Validation method: targeted local pgTAP integration PoC plus exact static route-to-RPC trace

**Finalize denial forwards caller-selected shop and product** — `src/app/api/shop/product-images/finalize/route.ts:26-39`

The membership decision correctly blocks finalization, but the denial side effect carries request-derived `shopId` and `productId` into `recordProductImageDenied()`.

```typescript
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
    operation: "finalize",
    productId: input.productId,
    shopId: input.shopId,
  });
```

**Shared helper crosses into service-role authority** — `src/server/shop-admin/product-images/service.ts:128-140`

The helper preserves both attacker-selected resource identifiers while changing authority to the server-only service-role client.

```typescript
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

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

#### Dataflow

request `shopId` and `productId` -\> finalize denial branch -\> `recordProductImageDenied()` -\> service-role `product_image_record_denied` -\> `write_product_image_audit` -\> victim `audit_logs` row

- **Source:** authenticated request body identifiers

- **Sink:** shop-scoped `audit_logs` insert

- **Outcome:** persistent victim-shop finalize-denied event and product metadata

**Finalize denial forwards caller-selected shop and product** — `src/app/api/shop/product-images/finalize/route.ts:26-39`

The membership decision correctly blocks finalization, but the denial side effect carries request-derived `shopId` and `productId` into `recordProductImageDenied()`.

```typescript
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
    operation: "finalize",
    productId: input.productId,
    shopId: input.shopId,
  });
```

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

#### Reachability

The attacker needs an active personal account and a valid victim shop UUID; victim-shop membership is not required. The route is a normal POST endpoint and the sink is reached specifically after the business action is denied.

- **Attacker:** ordinary active authenticated personal account

- **Entry point:** POST `/api/shop/product-images/finalize`

- **Outcome:** repeatable unauthorized write into the victim shop's audit namespace

Preconditions:
- valid victim shop UUID
- product UUID supplied in the request

#### Severity

**Medium** — The path is remotely reachable by an ordinary active account and produces a persistent cross-tenant audit write without victim-shop membership. Impact is limited to audit integrity and operational noise: finalization remains denied, the real actor is retained, and no image, signed URL, catalog data, credential, or product state is exposed or changed.

Raise severity if the injected events trigger privileged automation, suppress real alerts, or enable broader tenant-state mutation. Lower severity if deployment evidence proves the route cannot reach the RPC or an independent tenant-binding control prevents the write.

#### Remediation

Inside `product_image_record_denied`, reject any actor that fails `app_private.product_image_actor_can_read(p_actor_profile_id, p_shop_id, p_actor_kind)` and any product that fails `app_private.product_image_product_is_in_shop(p_product_id, p_shop_id)` before calling `write_product_image_audit`.

Tests:
- A Shop A member receives `permission_denied` and creates zero Shop B audit rows through the finalize variant.
- A Shop B viewer can still create a same-shop write-denied audit event.
- A same-shop actor cannot attach a product that belongs to another shop.
- Direct `anon` and `authenticated` execute privileges remain revoked.

Preventive controls:
- Enforce tenant authorization inside every service-role or SECURITY DEFINER write RPC.
- Bind both actor/shop and resource/shop identities before persistent side effects.
- Add route-level throttling and multi-shop denial monitoring only as defense in depth.

<a id="finding-2"></a>

### [2] Denied product-image removal can inject a victim-shop audit event

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The committed route-to-service-role-to-RPC trace is direct, and a rolled-back local pgTAP PoC passed 9/9 assertions, including the remove variant and victim-shop audit row. |
| Category | Improper authorization / cross-tenant confused deputy |
| CWE | CWE-862 |
| Affected lines | supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1256-1266, src/app/api/shop/product-images/remove/route.ts:26-39, src/server/shop-admin/product-images/service.ts:128-140, supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375 |

#### Summary

An active authenticated account can submit another shop's identifiers to the product-image remove route. Removal is denied, but the denial branch forwards those identifiers through a service-role client to a SECURITY DEFINER RPC that writes a victim-scoped audit event without actor/shop or product/shop binding.

#### Root Cause

The invariant is that a shop-scoped audit write must be authorized for the final shop and resource identity at the privileged boundary. The remove route correctly denies the business action but forwards request-derived `shopId` and `productId` to a service-role helper. `product_image_record_denied` verifies only that the shop exists, then writes those identifiers into `audit_logs` without reapplying the actor/shop or product/shop controls already available in the migration.

**Remove denial forwards caller-selected shop and product** — `src/app/api/shop/product-images/remove/route.ts:26-39`

The membership decision correctly blocks removal, but the denial side effect carries request-derived `shopId` and `productId` into `recordProductImageDenied()`.

```typescript
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
    operation: "remove",
    productId: input.productId,
    shopId: input.shopId,
  });
```

**Shared helper crosses into service-role authority** — `src/server/shop-admin/product-images/service.ts:128-140`

The helper preserves both attacker-selected resource identifiers while changing authority to the server-only service-role client.

```typescript
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

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

**Existing helper expresses the missing actor-to-shop invariant** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:258-280`

`product_image_actor_can_read` already defines the actor/shop relationship suitable for same-shop denial auditing, including viewers and active platform administrators.

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

#### Validation

A rolled-back two-shop fixture proved the attacker had neither read nor write permission in the victim shop. The remove call still returned `denied_recorded`, and the combined four-operation fixture produced four victim-shop audit rows and zero attacker-shop rows.

Validation method: targeted local pgTAP integration PoC plus exact static route-to-RPC trace

**Remove denial forwards caller-selected shop and product** — `src/app/api/shop/product-images/remove/route.ts:26-39`

The membership decision correctly blocks removal, but the denial side effect carries request-derived `shopId` and `productId` into `recordProductImageDenied()`.

```typescript
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
    operation: "remove",
    productId: input.productId,
    shopId: input.shopId,
  });
```

**Shared helper crosses into service-role authority** — `src/server/shop-admin/product-images/service.ts:128-140`

The helper preserves both attacker-selected resource identifiers while changing authority to the server-only service-role client.

```typescript
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

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

#### Dataflow

request `shopId` and `productId` -\> remove denial branch -\> `recordProductImageDenied()` -\> service-role `product_image_record_denied` -\> `write_product_image_audit` -\> victim `audit_logs` row

- **Source:** authenticated request body identifiers

- **Sink:** shop-scoped `audit_logs` insert

- **Outcome:** persistent victim-shop remove-denied event and product metadata

**Remove denial forwards caller-selected shop and product** — `src/app/api/shop/product-images/remove/route.ts:26-39`

The membership decision correctly blocks removal, but the denial side effect carries request-derived `shopId` and `productId` into `recordProductImageDenied()`.

```typescript
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
    operation: "remove",
    productId: input.productId,
    shopId: input.shopId,
  });
```

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

#### Reachability

The attacker needs an active personal account and a valid victim shop UUID; victim-shop membership is not required. The route is a normal POST endpoint and the sink is reached specifically after the business action is denied.

- **Attacker:** ordinary active authenticated personal account

- **Entry point:** POST `/api/shop/product-images/remove`

- **Outcome:** repeatable unauthorized write into the victim shop's audit namespace

Preconditions:
- valid victim shop UUID
- product UUID supplied in the request

#### Severity

**Medium** — The path is remotely reachable by an ordinary active account and produces a persistent cross-tenant audit write without victim-shop membership. Impact is limited to audit integrity and operational noise: removal remains denied, the real actor is retained, and no image, signed URL, catalog data, credential, or product state is exposed or changed.

Raise severity if the injected events trigger privileged automation, suppress real alerts, or enable broader tenant-state mutation. Lower severity if deployment evidence proves the route cannot reach the RPC or an independent tenant-binding control prevents the write.

#### Remediation

Inside `product_image_record_denied`, reject any actor that fails `app_private.product_image_actor_can_read(p_actor_profile_id, p_shop_id, p_actor_kind)` and any product that fails `app_private.product_image_product_is_in_shop(p_product_id, p_shop_id)` before calling `write_product_image_audit`.

Tests:
- A Shop A member receives `permission_denied` and creates zero Shop B audit rows through the remove variant.
- A Shop B viewer can still create a same-shop write-denied audit event.
- A same-shop actor cannot attach a product that belongs to another shop.
- Direct `anon` and `authenticated` execute privileges remain revoked.

Preventive controls:
- Enforce tenant authorization inside every service-role or SECURITY DEFINER write RPC.
- Bind both actor/shop and resource/shop identities before persistent side effects.
- Add route-level throttling and multi-shop denial monitoring only as defense in depth.

<a id="finding-3"></a>

### [3] Denied product-image read can inject a victim-shop audit event

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The committed route-to-service-role-to-RPC trace is direct, and a rolled-back local pgTAP PoC passed 9/9 assertions, including the read variant and victim-shop audit row. |
| Category | Improper authorization / cross-tenant confused deputy |
| CWE | CWE-862 |
| Affected lines | supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1256-1266, src/app/api/shop/product-images/read-urls/route.ts:24-37, src/server/shop-admin/product-images/service.ts:128-140, supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375 |

#### Summary

An active authenticated account can submit another shop's identifiers to the product-image read-URL route. The read is denied, but the denial branch forwards the requested shop and first product reference through a service-role client to a SECURITY DEFINER RPC that writes a victim-scoped audit event without actor/shop or product/shop binding.

#### Root Cause

The invariant is that a shop-scoped audit write must be authorized for the final shop and resource identity at the privileged boundary. The read-URL route correctly denies the business action but forwards request-derived `shopId` and the first `productId` to a service-role helper. `product_image_record_denied` verifies only that the shop exists, then writes those identifiers into `audit_logs` without reapplying the actor/shop or product/shop controls already available in the migration.

**Read denial forwards caller-selected shop and first product** — `src/app/api/shop/product-images/read-urls/route.ts:24-37`

The membership decision correctly blocks signed read URL issuance, but the denial side effect carries request-derived `shopId` and the first `productId` into `recordProductImageDenied()`.

```typescript
const auth = await resolveProductImageRequestActor(
  request,
  input.shopId,
  "products.read",
);
if (auth.status !== "authorized") {
  await recordProductImageDenied({
    actorKind: auth.actorKind,
    actorProfileId: auth.actorProfileId,
    code: auth.code,
    operation: "read",
    productId: input.refs[0]?.productId,
    shopId: input.shopId,
  });
```

**Shared helper crosses into service-role authority** — `src/server/shop-admin/product-images/service.ts:128-140`

The helper preserves both attacker-selected resource identifiers while changing authority to the server-only service-role client.

```typescript
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

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

**Existing helper expresses the missing actor-to-shop invariant** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:258-280`

`product_image_actor_can_read` already defines the actor/shop relationship suitable for same-shop denial auditing, including viewers and active platform administrators.

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

#### Validation

A rolled-back two-shop fixture proved the attacker had neither read nor write permission in the victim shop. The read call still returned `denied_recorded`, and the combined four-operation fixture produced four victim-shop audit rows and zero attacker-shop rows.

Validation method: targeted local pgTAP integration PoC plus exact static route-to-RPC trace

**Read denial forwards caller-selected shop and first product** — `src/app/api/shop/product-images/read-urls/route.ts:24-37`

The membership decision correctly blocks signed read URL issuance, but the denial side effect carries request-derived `shopId` and the first `productId` into `recordProductImageDenied()`.

```typescript
const auth = await resolveProductImageRequestActor(
  request,
  input.shopId,
  "products.read",
);
if (auth.status !== "authorized") {
  await recordProductImageDenied({
    actorKind: auth.actorKind,
    actorProfileId: auth.actorProfileId,
    code: auth.code,
    operation: "read",
    productId: input.refs[0]?.productId,
    shopId: input.shopId,
  });
```

**Shared helper crosses into service-role authority** — `src/server/shop-admin/product-images/service.ts:128-140`

The helper preserves both attacker-selected resource identifiers while changing authority to the server-only service-role client.

```typescript
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

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

#### Dataflow

request `shopId` and first `productId` -\> read denial branch -\> `recordProductImageDenied()` -\> service-role `product_image_record_denied` -\> `write_product_image_audit` -\> victim `audit_logs` row

- **Source:** authenticated request body identifiers

- **Sink:** shop-scoped `audit_logs` insert

- **Outcome:** persistent victim-shop read-denied event and product metadata

**Read denial forwards caller-selected shop and first product** — `src/app/api/shop/product-images/read-urls/route.ts:24-37`

The membership decision correctly blocks signed read URL issuance, but the denial side effect carries request-derived `shopId` and the first `productId` into `recordProductImageDenied()`.

```typescript
const auth = await resolveProductImageRequestActor(
  request,
  input.shopId,
  "products.read",
);
if (auth.status !== "authorized") {
  await recordProductImageDenied({
    actorKind: auth.actorKind,
    actorProfileId: auth.actorProfileId,
    code: auth.code,
    operation: "read",
    productId: input.refs[0]?.productId,
    shopId: input.shopId,
  });
```

**Denied-audit RPC checks shop existence but not actor binding** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1255-1279`

The privileged RPC validates only that `p_shop_id` names an existing shop before passing the actor, shop, and product to the audit writer; it never proves the actor or product belongs to that shop.

```sql
begin
  if not exists (select 1 from public.shops where shop_id = p_shop_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_operation not in ('intent', 'finalize', 'read', 'remove', 'request') then
    v_operation := 'request';
  end if;
  if v_code !~ '^[a-z0-9_]{1,64}$' then
    v_code := 'permission_denied';
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

  return jsonb_build_object('ok', true, 'code', 'denied_recorded', 'audit_event_id', v_audit_id);
```

**Audit sink persists the supplied shop and product** — `supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375`

The sink turns the unbound `p_shop_id` into the row's tenant scope and records `p_product_id` as both target and redacted metadata.

```sql
insert into public.audit_logs (
  actor_profile_id,
  scope,
  shop_id,
  event_key,
  severity,
  result,
  target_type,
  target_id,
  metadata_redacted
)
values (
  p_actor_profile_id,
  'shop',
  p_shop_id,
  p_event_key,
  case when p_severity in ('info', 'warning', 'critical') then p_severity else 'warning' end,
  case when p_result in ('success', 'blocked', 'simulated') then p_result else 'blocked' end,
  'inventory_product_image',
  coalesce(p_version_id::text, p_product_id::text),
  jsonb_strip_nulls(
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'code', p_code,
      'product_id', p_product_id,
      'source', 'product_image_api',
```

#### Reachability

The attacker needs an active personal account and a valid victim shop UUID; victim-shop membership is not required. The route is a normal POST endpoint and the sink is reached specifically after the business action is denied.

- **Attacker:** ordinary active authenticated personal account

- **Entry point:** POST `/api/shop/product-images/read-urls`

- **Outcome:** repeatable unauthorized write into the victim shop's audit namespace

Preconditions:
- valid victim shop UUID
- at least one product UUID supplied in `refs`

#### Severity

**Medium** — The path is remotely reachable by an ordinary active account and produces a persistent cross-tenant audit write without victim-shop membership. Impact is limited to audit integrity and operational noise: read URL issuance remains denied, the real actor is retained, and no image, signed URL, catalog data, credential, or product state is exposed or changed.

Raise severity if the injected events trigger privileged automation, suppress real alerts, or enable broader tenant-state mutation. Lower severity if deployment evidence proves the route cannot reach the RPC or an independent tenant-binding control prevents the write.

#### Remediation

Inside `product_image_record_denied`, reject any actor that fails `app_private.product_image_actor_can_read(p_actor_profile_id, p_shop_id, p_actor_kind)` and any product that fails `app_private.product_image_product_is_in_shop(p_product_id, p_shop_id)` before calling `write_product_image_audit`.

Tests:
- A Shop A member receives `permission_denied` and creates zero Shop B audit rows through the read variant.
- A Shop B viewer can still create a same-shop read-denied audit event when another read control rejects the request.
- A same-shop actor cannot attach a product that belongs to another shop.
- Direct `anon` and `authenticated` execute privileges remain revoked.

Preventive controls:
- Enforce tenant authorization inside every service-role or SECURITY DEFINER write RPC.
- Bind both actor/shop and resource/shop identities before persistent side effects.
- Add route-level throttling and multi-shop denial monitoring only as defense in depth.

<a id="finding-4"></a>

### [4] Denied product-image intent can inject a victim-shop audit event

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The committed route-to-service-role-to-RPC trace is direct, and a rolled-back local pgTAP PoC passed 9/9 assertions, including the intent variant and victim-shop audit row. |
| Category | Improper authorization / cross-tenant confused deputy |
| CWE | CWE-862 |
| Affected lines | supabase/migrations/20260717072959_task_137_product_catalog_images.sql:1256-1266, src/app/api/shop/product-images/intent/route.ts:26-39, src/server/shop-admin/product-images/service.ts:128-140, supabase/migrations/20260717072959_task_137_product_catalog_images.sql:350-375 |

#### Summary

See the [detailed technical write-up](findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md).

#### Validation

See the [detailed technical write-up](findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md).

#### Dataflow

See the [detailed technical write-up](findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md).

#### Reachability

See the [detailed technical write-up](findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md).

#### Severity

See the [detailed technical write-up](findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md).

#### Remediation

See the [detailed technical write-up](findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md).

## Structural Hardening

The scan also produced derived, unsealed design guidance based on the complete finding collection. These proposals describe options and tradeoffs; they do not indicate that any finding has been remediated.

[Open the structural hardening portfolio](hardening/hardening.md)

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Product-image route authorization and privileged denial audit | Tenant authorization and service-role confused deputy | Reported | Four independently triggerable denied routes share one missing actor/shop and product/shop guard in product_image_record_denied; each became a canonical finding instance. Evidence: artifacts/02_discovery/worker_receipts/ADM-S1.json, artifacts/02_discovery/worker_receipts/ADM-S5.json, artifacts/05_findings/ADM-S1-001/candidate_ledger.jsonl |
| Product-image service, request contracts, JPEG validation, Storage, and browser cache | Signed capabilities, canonical paths, validation, cache isolation, and lifecycle races | No issue found | Reviewed full service and browser flows; authorization-rechecking RPCs, canonical paths, immutable uploads, byte verification, and scoped cache keys closed the evaluated hypotheses. Evidence: artifacts/02_discovery/worker_receipts/ADM-S2.json |
| Admin product-image UI, page access, and permission presentation | UI-only authorization, XSS, signed URL exposure, and cache-scope propagation | No issue found | Server-derived permissions remain authoritative; React escaping and scoped identifiers prevented a surviving UI or client-side candidate. Evidence: artifacts/02_discovery/worker_receipts/ADM-S3.json |
| Admin data access, read models, staff permission mapping, and generated types | Shop selection, staff authorization, service-role queries, and DTO disclosure | No issue found | Server-resolved shops and explicit permissions remain bound to queries; no cross-shop read or unsafe DTO survived. Evidence: artifacts/02_discovery/worker_receipts/ADM-S4.json |
| Supabase product-image, inventory, sync, and cleanup database controls | RLS, grants, SECURITY DEFINER functions, transactionality, and shop binding | Reported | The denial-audit RPC duplicate root cause maps to the reported route instances; other reviewed RLS, sync, cleanup, and service-role controls had no surviving candidate. Evidence: artifacts/02_discovery/worker_receipts/ADM-S5.json, artifacts/05_findings/ADM-S1-001/validation_report.md, artifacts/05_findings/ADM-S1-001/attack_path_analysis_report.md |
| POS sales security, sale detail, QA fixture, and native security gates | Token binding, replay, financial atomicity, fixture exposure, and scanner masking | No issue found | Full-file review found the changed paths fail closed with bounded inputs, service-role-only atomic RPCs, shop constraints, and active gate dispatch. Evidence: artifacts/02_discovery/worker_receipts/ADM-S6.json |
| Product-image operations, reporting, localization scanner, and package scripts | Destructive target selection, secret logging, command construction, and developer tooling | No issue found | Local/staging allowlists, explicit execution flags, canonical path checks, redacted output, and non-shell npm aliases prevented a surviving operational candidate. Evidence: artifacts/02_discovery/worker_receipts/ADM-S7.json |

## Open Questions And Follow Up

- Do deployment-edge controls rate-limit repeated denied product-image requests?
  - Follow-up prompt: Inspect Cloudflare and application rate-limit configuration for the four product-image routes at 2f166b51e7d3ff68f8f01593cb68845788e7be9a, without treating throttling as a substitute for tenant authorization.
