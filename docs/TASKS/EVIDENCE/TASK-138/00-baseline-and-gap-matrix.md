# TASK-138 - Baseline black-box e gap matrix

Data: `2026-07-18`.

## Contesto

Le baseline sono state eseguite serialmente sugli SHA pubblicati nei tracking
ref locali, prima di qualunque modifica runtime TASK-138. Il solo codice scritto
prima dei run e documentazione di governance/evidence; nessuna patch
TypeScript/Kotlin/Swift e stata applicata.

## Admin Web

Comando:

```text
node scripts/testing/run-playwright-target.mjs local tests/e2e/task-137-product-catalog-images-local.spec.ts --project=chromium-desktop
```

Risultato reale:

```text
PASS target guardrails
1 passed (14.5s)
test runtime 9.9s
```

Copertura osservata: upload PNG sintetico, preprocessing, intent, due PUT,
finalize, no-op checksum, lettura/cache, offline cache, remove, duplicate remove
e cleanup. Il test e stato eseguito in un checkout temporaneo invariato per non
sovrascrivere lo screenshot storico TASK-137 con path hardcoded.

## Android

Primo tentativo:

```text
FAIL pre-build: SDK location not found
```

Classificazione: `BLOCKED_ENV` del worktree. Aggiunto il solo
`local.properties` ignorato con il path SDK gia usato dal checkout originale;
nessuna patch runtime.

Unit mirati:

```text
ProductImageCatalogContractTest 5/5
ProductImageCacheTest 5/5
ProductImageProcessorTest 4/4
BUILD SUCCESSFUL in 50s
```

Instrumentation serializzata su `Medium_Phone_API_35`:

```text
Starting 3 tests
Finished 3 tests
BUILD SUCCESSFUL in 30s
```

L'emulatore e stato arrestato dopo il run. La suite usa loopback, non Supabase
live o la fixture condivisa.

## iOS

Comando: `xcodebuild test` sul progetto/scheme
`iOSMerchandiseControl`, destination iPhone 16e Simulator, limitato alle
quattro classi Product Image.

Risultato reale:

```text
ProductImageAPIClientTests 6/6
ProductImageCacheTests 5/5
ProductImageProcessorTests 6/6
ProductImageSyncContractTests 5/5
Executed 22 tests, 0 failures
TEST SUCCEEDED
```

Metrica high-res campionata dal test:

```text
Clock Monotonic Time: 0.071474 s
Memory Peak Physical: 70143.072 kB
```

Il runtime rete e URLProtocol/Simulator; non e una prova Supabase live o device
fisico.

## Classificazione baseline

| Caso | Admin | Android | iOS |
|---|---|---|---|
| upload/finalize/remove base | PASS locale | PASS loopback | PASS URLProtocol |
| no-op | PASS locale | IMPLEMENTED_NOT_TESTED nel run | IMPLEMENTED_NOT_TESTED nel run |
| offline cache base | PASS locale | PASS unit cache | PASS unit cache |
| placeholder zero rete/cache | IMPLEMENTED_NOT_TESTED | IMPLEMENTED_NOT_TESTED | IMPLEMENTED_NOT_TESTED |
| thumb lista/main dettaglio visuale | IMPLEMENTED_NOT_TESTED | IMPLEMENTED_NOT_TESTED | IMPLEMENTED_NOT_TESTED |
| batch ≤100 + dedup | Admin parziale, NOT_IMPLEMENTED end-to-end | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| in-flight coalescing + limit | NOT_IMPLEMENTED | NOT_IMPLEMENTED | IMPLEMENTED_NOT_TESTED parziale |
| 200 prodotti visible-only | NOT_IMPLEMENTED | IMPLEMENTED_NOT_TESTED parziale | IMPLEMENTED_NOT_TESTED parziale |
| decode invalido no-cache | NOT_IMPLEMENTED | IMPLEMENTED_NOT_TESTED parziale | NOT_IMPLEMENTED prima della cache |
| purge logout/switch | NOT_IMPLEMENTED completo | NOT_IMPLEMENTED completo | NOT_IMPLEMENTED completo |
| progress dettagliato + cancel | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| same-shop Supabase cross-client | NOT_RUN | NOT_RUN | NOT_RUN |
| device fisico | N/A | NOT_RUN | NOT_RUN |

## Decisione

La fondazione TASK-137 e stabile nelle suite esistenti. I gap elencati sono
reali e non vengono mascherati dai PASS baseline. Prossimo gate: reset Supabase
locale mirato, migration/test backend e fixture multi-ruolo prima di qualunque
patch client.
