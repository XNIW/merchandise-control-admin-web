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

Required private environment names are `PAYMENT_HISTORY_SUPABASE_URL` and
`PAYMENT_HISTORY_SERVICE_ROLE_KEY`. These names deliberately do not reuse the
HTTP app's credentials. Supply values through the selected host's secret store;
never put them into a command argument, repository, UI or logs. HTTPS is required.
An owned local QA endpoint may use `PAYMENT_HISTORY_ALLOW_LOOPBACK=yes`, which
permits only localhost/127.0.0.1 over HTTP. Do not run against a linked project
to qualify this code. CLI without `--once` polls sequentially every2seconds.

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
Provider verification and shared permission changes remain legal-owner actions;
operators with import permission may attest merchant/CLP/actual-first-use sources.
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
