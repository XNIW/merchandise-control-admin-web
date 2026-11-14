# ASUS019 historical worker on Windows staging

This deployment hosts a separately qualified Node24 analysis worker on the
available Windows11 ASUS. It is separate from the WPF POS and its shop profile.
The service runs only while this computer is available; shutdown or sleep delays
queue preparation until the host returns. This is a staging host, not an
availability claim for a production server. Node24 is never installed on Win7.

`MerchandiseControlHistoryWorker` runs as its dedicated virtual account
`NT SERVICE\MerchandiseControlHistoryWorker`. Windows manages that account without
an operator password. Executables and the DPAPI LocalMachine gateway-key file
are owned by SYSTEM and readable only by the service, SYSTEM and administrators.
The POS user's ordinary token receives no key access. Only closed lifecycle and
limit metadata is exposed in the public status file. Child stdout/stderr goes to
NUL. The host additionally supplies `HISTORY_WORKER_DIAGNOSTICS_FILE` as the fixed
`worker-diagnostics.ndjson` sibling of that status file, under its existing ACL.
The worker reconstructs closed numeric phase/transport/lifecycle events and
atomically replaces a bounded512KiB metadata ring. Raw messages/stacks, rows,
actor IDs, paths, signed URLs and credentials are never copied. This preserves
a caught fatal code with discarded standard streams. An external kill or
allocation abort still requires the host's actual exit code; an OOM cause is
never inferred from a restart counter.

Before the child executes, an unnamed Windows Job Object limits private committed
memory to1GiB for both process and job, and limits the job to one process. The
existing worker retains its RSS896MiB check and Node heap640MiB budget. Windows
job commit limits are distinct from RSS. Closing this host's own job terminates
only its child. No process-name termination or POS manipulation is used.

The executable is built with the existing .NET Framework compiler for net48/x64;
no additional service-wrapper framework is installed. Node24.18.0 must have a
valid OpenJS signature and the exact qualified hash. Its binary and license are
copied into the protected service directory, without changing the global Node
installation. The v1 CJS hash remains pinned to the worker exercised in the
authenticated server612/clientaa4 roundtrip; the frozen kit/gate are retained.

The v2 package requires a previously qualified CJS and an externally verified
qualification receipt plus SHA256. Its clean immutable Git HEAD/tree must match
the receipt. The builder copies that artifact rather than rebuilding it, checks
its hash, CI artifact ID/archive digest and canonical SQL/real-volume run/report
digests. The real-volume gate requires actual SQL/native gateway,25947 synthetic
movements/20274917 NDJSON bytes, unchanged120s/15s and200-row canonical chunks,
at most4 chunks/vector, completed below120s. It never creates that receipt or
promotes a stub/NOT_RUN/FAIL. Root's canonical artifact verifier owns issuance.
Use the existing build command with `-QualifiedWorker`,
`-RuntimeQualificationReceipt`, `-RuntimeQualificationReceiptSha256` for v2.
The installer requires the external receipt hash again and a hashed
`asus019-staging-ready-v2` binding the same source, qualification hash and
deployed `stage_vector_v2` gateway. Server/SQL precede the Node sender. This
validation does not bypass the refusal to overwrite an installed service/key.

Build with `scripts/build-payment-history-windows-host.ps1` into a fresh absolute
directory outside the checkout. The package includes hashes and no secrets.
The isolated Windows CI test exercises the actual1GiB limit, descendant denial,
SCM virtual identity, DPAPI/private ACL and owned-child cleanup, with synthetic
data and an invalid-domain worker stub. Its launch case also checks delivery and
write access of the diagnostic path under the status ACL. The canonical5case
gate is `.github/workflows/asus019-worker-host.yml` →
`scripts/testing/asus019-worker-host-tests.ps1`, restricted to an owned disposable
admin runner. It does not qualify a live backend or the actual installed host.

Before installation, review/apply the scoped SQL, deploy the qualified staging
HTTP artifact, and produce a hashed `asus019-staging-ready-v1` receipt containing
the verified provisioner/config paths and SHA256. The installer validates all
package members and that receipt before administrative changes. It generates a
fresh key only after confirming the binding is absent, protects the key under
the service ACL, and supplies it to the existing Wrangler CLI through stdin.
No Supabase service key is present in the worker or the service environment.

Installation requires the Windows protected-desktop administrative consent.
Do not weaken UAC or execution policies. After service launch, verify actual
signed gateway/replay-cache activity and idle queue metadata separately; a
running process alone does not prove the backend works. No real financial
Apply/Undo/reimport is an installation test. Web writer authority stays local
until the separate evidenced cutover prerequisites are satisfied.

If installation fails, the service is stopped and its protected key is retained
for reconciliation. Do not regenerate or overwrite an unknown live key. Rollback
stops only this service and restores the previous reviewed staging Worker version;
additive SQL, original Getnet records, queues and protected credentials are kept.

API references: [Windows job objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects),
[private committed-memory limits](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information),
[per-service virtual accounts](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/configure-windows-service-accounts-and-permissions),
[Node LTS releases](https://nodejs.org/en/about/previous-releases).
