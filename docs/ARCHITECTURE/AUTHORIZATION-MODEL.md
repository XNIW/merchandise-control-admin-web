# Authorization model

Status: `REVIEW`

This document records the Admin Web authorization model used by TASK-053. It separates identity, permission layers, read models and mutation boundaries so staff POS access stays inside the Shop Admin Console without becoming a third console.

## Identity model

`platform_admin` is a personal Supabase Auth account whose profile is authorized globally through `platform_admins`. This identity can enter the Master Console and perform platform-scoped provisioning and operations.

`personal_account` is a Supabase Auth account backed by `profiles` and shop-scoped membership in `shop_members`. This identity enters the Admin Console through `/auth/login` and can belong to one or more shops.

`pos_staff_manager` is not a Supabase Auth profile. It authenticates with `shop_code + staff_code + credential`, receives a server-managed `staff_web_sessions` browser cookie, and is resolved as a single-shop Admin Console principal.

Staff POS is not a profile and does not use `auth.uid()` for staff identity. Staff rows live in `staff_accounts`; personal web accounts live in `profiles`.

In short: staff POS non usa `auth.uid()`.

## Permission layers

Global permissions are only for the Master Console. Platform access is resolved through server-side platform admin checks and must not be inferred from shop roles.

Shop permissions for personal accounts come from active `shop_members.role_key`. Owners and managers are shop-scoped and can never authorize a different shop by editing a `shop_id` query parameter.

Staff permissions come from `staff_role_permissions`. A staff manager may hold `shop_admin.full_access` or granular permissions such as `staff.read`, but these permissions are scoped to the staff account shop.

Personal account permissions and staff permissions remain separate even when they allow similar Admin Console screens.

## Server boundary

Every `/shop/*` page must pass through a server-only resolver. UI components receive resolved DTOs and must not decide authorization.

`shop_id` query parameters are navigation hints only. The resolver either maps the requested shop to an authorized shop for the current principal or rejects it.

The browser must never receive a service-role key, secret key, raw credential, PIN, password, token or credential hash. Service-role usage is allowed only in server-side code paths that have already resolved an authorized principal and then filter by the server-resolved `shop_id`.

## Read models

Sensitive read models must return safe DTOs. They must not expose `credential_hash`, raw PINs, passwords, staff web session tokens, device tokens, POS trusted tokens or service credentials.

`/shop/staff` uses `getShopStaffReadModel`, which reads `staff_accounts_safe` and maps only safe fields into `ShopStaffReadModelStaffAccount`.

`staff_accounts_safe` is intentionally `security_invoker=true`: personal account reads are protected by the RLS policy on `staff_accounts`, while the view hides credential material at the column boundary.

TASK-053 uses the grants/view solution because the view does not select `credential_hash`, the selected fields are operationally safe, RLS already limits rows by active owner/manager shop membership, and the missing failure was a column grant mismatch for `web_access_revoked_at`.

## Mutations

Mutation flow is:

UI -> Server Action or Route Handler -> server resolver -> audited RPC or server-side transactional operation -> redacted audit.

The actor must be explicit. Personal-account actions use `actor_profile_id`; staff-manager actions use `actor_staff_id` where supported.

Sensitive actions require a reason. Reasons may be normalized and redacted; raw credentials must not be written to audit metadata.

## Error semantics

`Read blocked` means a real schema, grant, RLS or read-boundary error prevented the safe read model from loading.

`Unauthorized` means the principal was resolved but lacks permission for the requested shop or action.

`Empty` means the boundary is healthy and the authorized query returned no rows.

`Not configured` means an optional mapping, runtime variable or schema component is not ready and the page is failing closed.
