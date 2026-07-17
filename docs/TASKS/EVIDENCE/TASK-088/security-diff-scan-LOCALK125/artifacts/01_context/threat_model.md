# MerchandiseControl multi-platform threat model

## Overview

MerchandiseControl is a shop-scoped retail ecosystem composed of a Next.js
Admin Web application, Supabase PostgreSQL/Auth/Realtime, Android and iOS
inventory clients, and a Windows 7 POS application. Admin Web exposes personal
account administration and server-only POS APIs. Supabase is the authoritative
store for shops, memberships, catalog, stock, synchronization events, POS
sessions, sales, revenue ledger entries, and audit records. Android and iOS
maintain local state and synchronize through authenticated Supabase contracts.
Win7POS is offline-first, stores a local SQLite mirror and sales outbox, and
communicates only with Admin Web over HTTPS.

The most sensitive assets are tenant isolation, membership and staff
authorization, POS device/session credentials, product and price integrity,
stock quantities, sale/refund/void accounting, immutable auditability,
idempotency, and the availability of offline workflows without extending
revoked authority indefinitely.

## Threat Model, Trust Boundaries, and Assumptions

- Public browser, mobile, and POS inputs are attacker-controlled even when the
  caller holds a valid low-privilege account, staff credential, device token,
  or session token. Client-side role checks and arithmetic are not security
  boundaries.
- Supabase RLS, security-definer helpers, constraints, and transactional RPCs
  form the database authorization and integrity boundary. Policies must remain
  fail-closed under demotion, suspension, mapping changes, cross-shop IDs,
  direct PostgREST access, and legacy `shop_id IS NULL` compatibility paths.
- Admin Web server handlers form the POS API boundary. The service role may be
  present only server-side. Handlers must authenticate device/session/staff,
  enforce shop scope and current authorization, bound request sizes, redact
  diagnostics, and delegate atomic financial writes to database controls.
- Win7POS local SQLite, DPAPI-protected tokens, mirrored credentials, catalog,
  and outbox cross an offline trust boundary. Physical access and a formerly
  valid operator are realistic attackers. Offline authorization must have an
  explicit centrally anchored lease and rollback-resistant time continuity.
- Android/iOS local databases and synchronization coordinators accept remote
  data and user-controlled import content. They must preserve account/shop
  binding, validate schema/capabilities, avoid token leakage, and fail closed
  on authorization or contract drift.
- QA and final-sync harnesses are privileged operator tooling. Environment
  variables, staging sessions, fixture prefixes, process locks, and cleanup
  plans are operator-controlled but must still be validated. Production-like
  targets, ambiguous project refs, concurrent runners, unbounded pagination,
  or evidence containing credentials are prohibited.
- Developers and CI are trusted to control source and build configuration, but
  repository content, generated evidence, imported files, server responses,
  and scan guidance are treated as data rather than executable instructions.

## Attack Surface, Mitigations, and Attacker Stories

Primary attack surfaces include Supabase Data API tables and RPCs, Next.js auth
callbacks and POS endpoints, direct shop-scoped DML, POS sales/refund payloads,
device and staff session lifecycle, mobile sync/realtime transport, Excel and
database import paths, Win7POS offline login and operator override, local
outbox replay, and synthetic staging fixture routes.

Relevant attacker stories include:

- An active viewer or suspended legacy owner attempts direct product or price
  DML that is later consumed by Admin, mobile clients, or POS devices.
- A cashier tampers with a sales payload to obtain an unauthorized discount or
  alters price, quantity, payment, tax, or stock fields while keeping the JSON
  internally consistent.
- A refund-capable operator references an unrelated sale line, repeats refund
  IDs, aggregates duplicate lines, or exceeds cumulative quantity/value
  residuals.
- A revoked staff member keeps a previously activated Win7POS device offline
  and attempts local login, operator switch, override, or sale commit after the
  central session or offline lease expires.
- A malicious or mistaken operator points QA tooling at production, reuses a
  fixture prefix, runs concurrent final-sync processes, or leaves synthetic
  residue after a partial failure.
- A client or server error path leaks bearer tokens, API keys, PINs, raw
  payloads, filesystem paths, or service-role material into logs or evidence.

Existing mitigations include authenticated RLS, role-aware membership helpers,
server-only Supabase administration, bounded JSON parsing, stable idempotency
keys, transactional sales RPCs, row/advisory locks, append-only ledgers,
DPAPI-protected POS tokens, local outbox durability, capability/schema checks,
safe diagnostic redaction, non-production target allowlists, fixture markers,
single-runner locks, stop-on-first-hard-failure, and mandatory cleanup/baseline
verification.

Out of scope for this repository-level model are attacks requiring compromise
of Supabase, Cloudflare, Apple/Google platform signing, the operating system
administrator, or the developer signing identity. Physical Windows 7 hardware,
printer/scanner behavior, and unstable real networks remain external runtime
validation surfaces rather than assumed controls.

## Severity Calibration (Critical, High, Medium, Low)

- Critical: cross-tenant or unauthenticated compromise of service-role
  authority; remote code execution in an exposed server path; broad extraction
  of credentials or customer data; irreversible corruption across many shops.
- High: deterministic shop-scoped authorization bypass; direct catalog/price
  mutation by a viewer or revoked member; unbounded offline authority after
  revocation; unauthorized discounts; refund/void manipulation that inflates
  stock or corrupts revenue; transaction gaps allowing partial financial
  writes.
- Medium: bounded denial of service, single-shop integrity issues with stronger
  preconditions, sensitive metadata leakage without credentials, or replay and
  race weaknesses whose impact is limited by existing idempotency or scope
  controls.
- Low: hardening gaps, local-only diagnostics, non-sensitive information
  exposure, or robustness problems that do not cross an authorization,
  confidentiality, financial, or tenant boundary.

Repository: task088-postfix-multirepo
Version: codex-security-snapshot/v1:sha256:0afa24035024319761e65904b8db99f0b53acbbf94ebbb60cc7b8f2a85ec855b
