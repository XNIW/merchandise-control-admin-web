# Dedicated historical import worker

This Node24 process verifies uploaded bytes and prepares bounded Getnet analysis.
It cannot commit or cancel financial movements. It is separate from the128MB
Cloudflare HTTP isolate. Initial measured parser100k peak394MiB is not a cloud
job p95 or a database benchmark. Deployment budget:1GiB hard process/container
limit, one process/concurrent job; heap640MiB. No service has been provisioned.

Use the repository lockfile and the existing locked esbuild toolchain:

```text
node scripts/build-payment-history-worker.mjs <absolute-output-outside-checkout.cjs>
node --max-old-space-size=640 <absolute-output-outside-checkout.cjs> --once
```

Required private environment names are `PAYMENT_HISTORY_WORKER_GATEWAY_URL` and
`PAYMENT_HISTORY_WORKER_GATEWAY_SECRET` (at least32bytes). The endpoint path is
`/api/internal/payment-history/worker`. The worker has no Supabase service key.
The HTTP application's dedicated gateway validates timestamp/nonce/body HMAC,
allows only bounded analysis operations, and uses a SQL replay cache so a
transport retry cannot double-claim or append staging twice. Each attempt has a15s
deadline covering headers and body, with an8MiB reply limit; cancellation stops
without another attempt. It signs downloads
only for source objects returned by a scoped database claim, never an arbitrary
path supplied by the worker. Supply the shared key through the host's secret store;
never put them into a command argument, repository, UI or logs. HTTPS is required.
An owned local QA endpoint may use `PAYMENT_HISTORY_ALLOW_LOOPBACK=yes`, which
permits only localhost/127.0.0.1 over HTTP. Do not run against a linked project
to qualify this code. CLI without `--once` polls sequentially every2seconds.

Requests of at least1KiB use Node's built-in gzip only when smaller than JSON.
The sender bounds the original JSON to8MiB, compresses once, and signs the exact
wire bytes. A retry keeps those bytes and the nonce. The HTTP gateway bounds the
wire body to8MiB, verifies HMAC, then uses the native gzip DecompressionStream
with an independent8MiB decoded limit and strict UTF-8 JSON admission. Missing or
explicit identity encoding retains the previous protocol. Unsupported encodings,
corrupt gzip and oversized decoded bodies cannot reach the privileged RPC. No
new dependency, operation, SQL grant, row/batch limit or deadline is introduced.
The native workerd transport tests use compatibility date2026-06-10/nodejs_compat;
the Node24 worker bundle still excludes the privileged database adapter.
Roll out the gzip-capable gateway before the Node sender. The gateway accepts
the previous identity sender; the previous gateway cannot decode a gzip sender.
Rollback therefore restores the identity sender first, with no change to source
archives, nonce identity, staging contents or financial authorization.

The synthetic-only volume probe is
`node --import ./scripts/testing/foundation-text-normalizer.mjs scripts/testing/payment-history-gateway-volume-benchmark.mjs <new-absolute-evidence-directory-outside-checkout> all`.
It expands the checked-in CLR fixture to25947 invented movements/20274917 NDJSON
bytes and compares the immutable ca9f239 sender/pipeline with the current
versioned transport/pipeline through actual workerd admission. Its owned RPC
stub does not access Supabase. The registered300ms RTT
and50KiB/s upload model is a controlled hypothesis, never a live DB benchmark or
proof of the observed timeout's cause. Existing120s analysis/15s request timers,
200rows/6MiB batches and20s heartbeat remain active. An `inspect` mode captures
full byte/hash parity without injected latency. Every run needs a fresh output
directory so previous failures cannot be overwritten.

Local baseline staging now requires the additive `migration.stage_vector_v2`
contract: one original fence, one phase,1..4 canonical chunks,1..200 rows/chunk,
and at most6MiB total payload/8MiB decoded envelope. The SQL wrapper invokes the
unchanged v1 engine in order and commits or rolls back the entire vector. The
worker verifies phase/chunk-count/last-ordinal ACK before advancing. Object and
movement phases cannot share a vector;130+130 canonical chunks require33+33
vector RPCs. Missing v2 support fails closed; it never falls back to v1.
The single120s monotonic analysis budget begins before the migration claim,
including its retry/backoff, and reaches every RPC and source read. Replayed
`attempt_started_at`, when supplied, can only shorten that deadline. The daemon
may recover only an uncertain migration claim with the same immutable bytes and
nonce: after the normal pair of attempts, at most3 interruptible2s/5s/15s
backoffs, all inside that deadline. Stage/auth/contract failures do not receive
this recovery; `--once` retains its normal failure result. No second outer claim
starts while the original claim is uncertain. Terminal `fail` uses
only the original fence and process signal through the existing15s transport
bound; no finish follows cancellation. Process stop and failed migration remain
distinct lifecycle events.

Closed diagnostics separate gateway wall time, DB round trip (PostgREST plus
SQL), and the SQL wrapper's actual `sql_elapsed_ms`. A replay returns the
original cached SQL measurement, logged as `sql_original_elapsed_ms`; it is
never presented as the SQL time of the retry. Phase read/validation wall time
includes nested object staging, with its RPC wait reported separately. Counts,
byte sizes, last acknowledged ordinals, retries, RSS/peak and cancellation causes
contain no raw source, exception or credential data. The Windows host supplies
the bounded persistent diagnostic path under its existing status ACL.

Migration and private Storage bucket must be reviewed and applied in the selected
environment first. The browser signals transfer completion; the worker downloads
with a streaming20MiB limit and checks exact length/SHA256 under an upload fence.
The object cannot be overwritten through its signed upload URL. A job accepts
10files/100MiB/100000rows, stages at most200rows per RPC, heartbeats20s, has a120s
lease and a120s analysis timeout. Attempts are limited to3 and work per claim to
30minutes; queue time does not consume the analysis deadline. RSS above896MiB
stops preparation; a host hard limit is still required for allocation spikes.

On interruption, the old fence cannot stage/finish after expiry; a new claim
clears partial staging and recomputes from verified originals. Errors contain
closed event/code fields only, never paths, signed URLs, credentials, references
or financial rows. SIGTERM/SIGINT stops the process. No automatic financial retry
exists. Commit comes from a fresh browser actor, persisted evidence and a current
content-bound review; a network uncertainty is recovered by receipt lookup.

Unresolved modern times produce both candidate ranges and merchant metadata,
with zero staged financial candidates. Reanalysis requires a new job under a
verified provider policy. A free-text reference and the `Z` suffix are insufficient.
Provider verification and transfer use the separate financial migrate capability;
shared permission changes remain legal-owner actions. Import operators may attest
merchant/CLP/actual-first-use sources. Verification still requires an immutable
verified PDF/image document, scoped merchant/files/period and an explicit policy.
Evidence scopes include canonical merchant, source hashes and half-open100ns range.

Browser recovery keeps only opaque job/upload/request IDs in the current URL.
No financial values, filenames, credentials or browser persistence store is used.
IDs never authorize access: SQL checks the current shop/actor/session/version.
A new valid login of the same actor can explicitly resume analysis, invalidating
the prior review and worker fence. Another actor cannot inherit that job.

The runtime defaults to local writer authority. Deployment of this worker never
activates the web writer. Cutover remains closed until local export, complete
device inventory and replica convergence are qualified. In particular, unavailable
old/offline POS devices block activation; no remote control can disable them.

No original Getnet imports, local receipts, database profiles or qualified Windows
packages are inputs to development tests. Automated browser component tests use
intercepted HTTP and synthetic data; they do not attest authenticated live E2E.

When the import queue is idle, the same sequential process claims local-export
migration analysis. It retains original NDJSON lines and receipts, stages at most
200rows per canonical chunk, with at most4 chunks/6MiB per versioned request,
then normalized movements. SQL independently recomputes
all seven entry SHA256/byte/row counts. Applying also requires the manifest SHA
and archive/backup SHA authenticated by the frozen POS. Local proofs remain
legacy_attested; this transfer cannot resolve missing Getnet provider evidence.
