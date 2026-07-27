# Admin staging catalog-pull 503 incident

Status: `REVIEW_READY`.

## Incident timeline

- Client completion: `2026-07-27T19:31:27.9819345Z`.
- Primary correlation window: `±5 minutes`.
- HTTP/stage: `503` / `catalog_pull`.
- Request reached server: `true`.
- Redacted client request ID: `sha256:081732bebab8`.
- Redacted edge correlation ID: `sha256:c24e0c989466`.
- Server request ID: not supplied.
- Catalog pages received: `0`.

## Known evidence

Authentication, device approval, first login and trusted session succeeded.
The audit window contains no catalog success or failure event.

Cloudflare GraphQL correlation for the active staging Worker confirms:

- `2026-07-27T19:31:27Z`, the client completion second;
- version `c5ae7e81-ded9-43ec-996a-199f7cfa540b`;
- status `exceededResources`;
- CPU `10.000µs`, memory `30.965.825` bytes, response body `0`;
- `errors=1`, `requests=1`, `subrequests=0`.

The failure therefore occurred at the Worker resource boundary before any
Supabase or audit subrequest. The same version has five additional bounded
`exceededResources` observations after deployment. All required Supabase
bindings were present in the active Worker version.

The preceding Worker version
`87430495-6b28-429d-9f40-40240b5793c4` recorded no
`exceededResources` in its observed deployment window and successfully served
the real full-catalog response, including a `548.585` byte invocation with
`18` subrequests.

## Root cause

TASK-142 added the full catalog text normalization/write policy import to the
catalog pull route. OpenNext loads that route dependency before the first
catalog I/O. On the constrained cold path, the additional parsing and module
initialization crossed the Worker resource boundary; consequently the edge
returned `503` before the route could emit a server request ID or catalog
audit.

The deployed fix replaces that dependency with a compact read-only canonical
validator. The production route dependency containing the validation boundary
drops from `17.986` to `15.101` bytes and no longer includes the write-policy
module. Golden-policy equivalence, targeted foundation tests, Cloudflare build
and local Worker smoke pass. Repository gates pass. Findings from the first
independent review and the first CI run have been remediated. Final independent
review has `P0/P1/P2/P3=0/0/0/0`.

## Delivery

- PR `#45`, normal merge.
- Feature SHA:
  `92de5c27d88d640f72a535a7412e535caa3c5b89`.
- Admin merge SHA:
  `75113502a824461dce8487c93383fde3122774c1`.
- CI run `212`: `PASS`, including database migrations and pgTAP.
- Cloudflare run `209`: `PASS`.
- Staging migration parity: `94/94`; no TASK-143 migration.
- Single staging deployment:
  `bbdc35a8-14b8-4201-8144-c4c6d060bc7c`.
- Active staging Worker version:
  `66eeda7f-003b-4b61-9fbd-b4222896c048`.
- Deploy timestamp: `2026-07-27T22:14:27.319282Z`.

## Server-side acceptance

A dedicated POS session was created through the existing runtime boundary on
the real shop scope correlated to the Asus incident. The physical Asus and its
harness were not used. The dedicated session, credential and device were
revoked after the run.

- First page: `HTTP 200 / success`, `4.879,2ms`.
- Full drain: `676/676` pages, `205.616,7ms`.
- Exact manifest and returned unique rows:
  categories `71`, suppliers `102`, products `19.763`, prices `41.228`.
- Catalog text validation: `PASS`.
- Unique bounded support IDs: `676`.
- Catalog success audit: `676`.
- Catalog failure audit: `0`.
- Catalog business data generated or modified: `NO`.
- Cleanup DB: active dedicated device/credential/session `0/0/0`.
- Cloudflare after deploy through `2026-07-27T22:24:00.121Z`:
  `823` invocations, all `success`, zero errors, zero
  `exceededResources`, zero exceptions.

## Scope guardrails

- Staging server/edge only.
- Production, Win7POS, Android and iOS are not modified.
- No raw catalog values, request bodies, credentials or full identifiers are
  stored.
- No physical Asus acceptance is executed in TASK-143.

## Resolution

`READY_FOR_ASUS_BOOTSTRAP_ACCEPTANCE`.

Production, Win7POS, Android and iOS remain `NOT_MODIFIED`. Authorization is
requested for exactly one final physical Asus bootstrap acceptance.
