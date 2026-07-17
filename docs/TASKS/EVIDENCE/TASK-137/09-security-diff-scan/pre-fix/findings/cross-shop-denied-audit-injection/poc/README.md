# Cross-shop denied-audit PoC

This pgTAP test demonstrates the vulnerable database primitive on a disposable
local Supabase instance. It creates two shops inside one transaction, proves
that the attacker has no image read or write permission in the victim shop,
then invokes the service-role denial-audit RPC for all four affected operation
values.

## Requirements

- a local checkout of vulnerable revision
  `2f166b51e7d3ff68f8f01593cb68845788e7be9a`;
- Supabase CLI;
- that checkout's local Supabase database running with its migrations applied.

Do not run this test against staging, production, or a shared database.

## Run

From this report directory:

```sh
cd poc
supabase test db --local ./cross-shop-denied-audit.sql
```

Expected result on the vulnerable revision:

```text
cross-shop-denied-audit.sql .. ok
All tests successful.
Files=1, Tests=9
Result: PASS
```

The decisive assertions confirm four victim-shop audit rows and zero
attacker-shop rows. See `representative-output.txt` for the sanitized output
from the validated run.

On a fixed revision, the cross-shop RPC calls should be rejected and the
victim-shop audit count should remain zero. This vulnerable-behavior test is
therefore expected to fail those assertions after remediation.

## Cleanup

No manual cleanup is required. The script starts a transaction and always ends
with `rollback`.
