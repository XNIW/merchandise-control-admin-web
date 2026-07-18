# TASK-138 Cross-platform parity

## Matrice finale

| Caso | Admin | Android | iOS |
|---|---|---|---|
| Product A zero image I/O/cache | `PASS_LOCAL_RUNTIME` | `PASS_JVM` | `PASS_SIMULATOR` |
| Product B thumb/main | `PASS_LOCAL_RUNTIME_VISUAL` | `PASS_CODE_EMULATOR_CONTRACT` | `PASS_CODE_SIMULATOR` |
| offline cache | `PASS_LOCAL_RUNTIME` | `PASS_JVM_EMULATOR` | `PASS_SIMULATOR` |
| expired URL one retry | `PASS_UNIT` | `PASS_JVM` | `PASS_SIMULATOR` |
| invalid MIME/decode no cache | `PASS_BROWSER_UNIT` | `PASS_JVM` | `PASS_SIMULATOR` |
| replace/stale/remove/purge | `PASS_CONTRACT_LIFECYCLE` | `PASS_JVM` | `PASS_SIMULATOR` |
| account/shop isolation | `PASS_UNIT` | `PASS_JVM_EMULATOR` | `PASS_SIMULATOR` |
| 200 visible-only/bounded | `PASS_BROWSER` | `PASS_JVM` | `PASS_SIMULATOR` |
| progress/cancel | `PASS_BROWSER_UNIT` | `PASS_JVM` | `PASS_SIMULATOR` |
| stesso shop Supabase non-production | `BLOCKED_ENV` | `IMPLEMENTED_NOT_CONNECTED` | `IMPLEMENTED_NOT_CONNECTED` |

## Interpretazione

Il contratto, i limiti e gli edge case sono allineati e verificati su tutti i
client. Solo Admin ha consumato la fixture locale persistente Product A/B nel
browser. Android e iOS hanno verificato lo stesso contratto tramite fixture
deterministiche JVM/Simulator e loopback, non tramite la stessa sessione
Supabase.

Non era disponibile un project ref non-production allowlistato, una sessione
condivisa o rete DNS affidabile; `github.com` era irrisolvibile e nessun target
staging poteva essere classificato sicuro. La live parity richiesta resta
quindi `BLOCKED_ENV`, non `PASS`.

Nessun full pull, blob o URL e stato aggiunto al sync. Poiche non si e eseguita
una mutazione cross-client sul target comune, la convergenza incrementale e
`IMPLEMENTED_NOT_CONNECTED` in questo task.
