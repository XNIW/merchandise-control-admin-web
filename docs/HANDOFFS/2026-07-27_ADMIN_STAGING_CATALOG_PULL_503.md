# Admin staging catalog-pull 503 incident

Status: `PR_READY`.

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

The local fix replaces that dependency with a compact read-only canonical
validator. The production route dependency containing the validation boundary
drops from `17.986` to `15.101` bytes and no longer includes the write-policy
module. Golden-policy equivalence, targeted foundation tests, Cloudflare build
and local Worker smoke pass. Repository gates pass. Findings from the first
independent review have been remediated and the follow-up has
`P0=0/P1=0/P2=0`. PR/CI/merge and the single staging deployment remain
pending.

## Scope guardrails

- Staging server/edge only.
- Production, Win7POS, Android and iOS are not modified.
- No raw catalog values, request bodies, credentials or full identifiers are
  stored.
- No physical Asus acceptance is executed in TASK-143.

## Resolution

`PRE_MERGE_REVIEW_APPROVED`.
