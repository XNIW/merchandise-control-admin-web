# WECHAT-001 shared identity and API contract

Version: `supabase-custom-oidc-bridge-v1` plus `wechat-002-read-parity-v1`

## Types

- `AuthProvider`: `email | google | wechat`
- `WeChatSurface`: `web | android | ios | mini_program`
- link state: `not_linked | linked | conflict | link_required`
- external activation: `disabled | external_activation_required | ready`
- session: `signed_out | exchanging | active | expired | revoked`
- modes: `login | link`
- audit: exchange success/blocked and link success/conflict only, with redacted identifiers

Error taxonomy is stable and sanitized: provider not configured, user cancel/deny, missing/invalid/expired code, invalid/expired/replayed state, identity already linked/conflict, suspended account, missing membership, expired session, rate limit, oversized body, and temporary backend failure.

## Endpoints

| Endpoint                                  | Caller                               | Purpose                                                | Auth                                             |
| ----------------------------------------- | ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------ |
| `GET /api/auth/wechat/status`             | all                                  | Non-secret feature/config status                       | none                                             |
| `POST /api/auth/wechat/challenge`         | Android/iOS/Mini Program             | Create one-time state/nonce                            | device UUID; server rate limit                   |
| `POST /api/auth/wechat/exchange`          | Android/iOS/Mini Program             | Consume state and exchange temporary code              | bearer required only for `link`                  |
| `GET /auth/oauth/wechat`                  | Admin Web personal mode              | Begin Supabase custom OIDC redirect                    | SSR cookie flow                                  |
| `GET /auth/oauth/wechat/link`             | Signed-in Admin Web personal account | Explicitly link WeChat through Supabase `linkIdentity` | SSR session + separate link flag                 |
| `GET /auth/callback`                      | Supabase                             | Existing PKCE code exchange                            | state/cookie owned by Supabase                   |
| `GET /api/mini-program/v1/shops`          | Mini Program                         | Active authorized shops                                | Supabase bearer                                  |
| `GET /api/mini-program/v1/sales/summary`  | Mini Program                         | Daily summary                                          | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/sales`          | Mini Program                         | Bounded keyset page                                    | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/sales/detail`   | Mini Program                         | Minimal bounded ledger lines                           | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/sales/range`    | Mini Program                         | Zero-filled daily summaries for a bounded range        | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/sales/filters`  | Mini Program                         | Bounded payment/staff/device filter facets             | Supabase bearer; staff/device owner/manager only |
| `GET /api/mini-program/v1/account`        | Mini Program                         | Own profile/provider state                             | Supabase bearer                                  |
| `GET /api/mini-program/v1/catalog`        | Mini Program                         | Search/filter/sort keyset product page                 | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/catalog/detail` | Mini Program                         | Product detail                                         | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/catalog/prices` | Mini Program                         | Bounded keyset price history                           | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/categories`     | Mini Program                         | Categories and product counts                          | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/suppliers`      | Mini Program                         | Suppliers and product counts                           | Supabase bearer + shop membership                |
| `GET /api/mini-program/v1/history`        | Mini Program                         | Sanitized catalog/price/history sync events            | Supabase bearer + shop membership                |
| `POST /api/shop/product-images/read-urls` | Mini Program                         | Existing canonical batched private-image resolver      | Supabase bearer + `products.read`                |

The exchange request contains `surface`, `mode`, temporary `code`, `state`, `nonce`, `correlationId`, and a random installation `deviceId`; it contains no AppSecret, `session_key`, OpenID, nickname, or role. The session response is `Cache-Control: no-store` and contains only the supported Supabase client session plus canonical user ID/provider.

## Environment matrix (names only)

| Boundary          | Names                                                                                                                                                      | Exposure                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Surface flags     | `WECHAT_AUTH_WEB_ENABLED`, `WECHAT_AUTH_ANDROID_ENABLED`, `WECHAT_AUTH_IOS_ENABLED`, `WECHAT_AUTH_MINI_PROGRAM_ENABLED`, `WECHAT_AUTH_LINKING_ENABLED`     | server; OFF by default; linking is separately gated |
| Supabase provider | `WECHAT_OIDC_PROVIDER`                                                                                                                                     | server, exact `custom:wechat`                       |
| Bridge            | `WECHAT_IDENTITY_BRIDGE_EXCHANGE_URL`, `WECHAT_IDENTITY_BRIDGE_HOST_ALLOWLIST`, `WECHAT_IDENTITY_BRIDGE_CLIENT_ID`, `WECHAT_IDENTITY_BRIDGE_CLIENT_SECRET` | server-only; secret is never public                 |
| Technical hashing | `WECHAT_AUTH_TECHNICAL_HASH_SALT`                                                                                                                          | server-only                                         |
| Android client    | `WECHAT_ANDROID_APP_ID`, `WECHAT_AUTH_ANDROID_ENABLED`, `WECHAT_AUTH_GATEWAY_BASE_URL`                                                                     | public AppID/flag/base URL only                     |
| iOS client        | `WECHAT_IOS_APP_ID`, `WECHAT_AUTH_IOS_ENABLED`, `WECHAT_AUTH_GATEWAY_BASE_URL`                                                                             | public AppID/flag/base URL only                     |
| Mini Program      | `WECHAT_MINI_PROGRAM_APP_ID`, `WECHAT_AUTH_MINI_PROGRAM_ENABLED`, `WECHAT_AUTH_GATEWAY_BASE_URL`                                                           | public AppID/flag/base URL only                     |

## Callback and registration matrix

| Surface      | Callback/code source                                            | External registration still required                                                                                      |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Web          | Supabase `/auth/v1/callback` then public Admin `/auth/callback` | Website AppID, approved callback domain, bridge redirect, Supabase redirect allowlist; public staging domain only         |
| Android      | Official SDK adapter → gateway                                  | AppID, application ID/package, release/test signature, callback activity/package requirements verified from official docs |
| iOS          | Official SDK adapter → gateway                                  | AppID, bundle ID, Universal Link/URL scheme/Associated Domains verified from official docs                                |
| Mini Program | `wx.login` → gateway                                            | Mini Program AppID, request/socket domains, privacy and account deletion, code2Session server entitlement                 |

No public staging callback may use localhost, a Vercel deployment URL, or a LAN IP. Localhost remains local-development-only.

## Data contract

The WECHAT-001 functions plus `wechat_account_profile_v1`, `wechat_sales_period_summary_v1`, `wechat_sales_page_v2`, `wechat_sale_detail_v2`, `wechat_sales_filter_options_v1`, `wechat_catalog_page_v1`, `wechat_product_detail_v1`, `wechat_price_history_page_v1`, `wechat_categories_page_v1`, `wechat_suppliers_page_v1`, and `wechat_sync_history_page_v1` form the personal-account read contract. Business-data functions deny anonymous, disabled profiles, suspended shops/memberships, and cross-shop reads. Viewer is a read role; owner/manager retain the same read right. Platform-admin status alone does not bypass membership.

Dates use the configured shop timezone and return configured currency. “Net revenue” is POS ledger revenue, not bank balance or cash availability. Pages and ranges are bounded; history excludes metadata/entity/device identifiers. Staff/device names and staff/device filters are available only to active `shop_owner`/`shop_manager` memberships; viewers receive masked names and cannot use those filters. Product lists return only image version references. Existing server authorization resolves private paths and generates five-minute signed thumbnail/main URLs in batches of at most 16; the bucket remains private and raw paths are not returned by the catalog RPC.
