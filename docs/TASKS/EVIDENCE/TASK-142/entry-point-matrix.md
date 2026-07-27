# CATALOG-TEXT-001 entry-point matrix

Matrice redatta senza valori catalogo reali. `catalog_text_policy_v1` è l'unico
contratto; ogni write path deve terminare nel boundary DB staging.

## Admin Web

| Source | Parser / analysis | Preview / manual correction | Apply / local boundary | Server DB / outbound |
|---|---|---|---|---|
| Product create/edit | `catalogProductInput` -> `canonicalCatalogProductInput` | errori campo tipizzati | `createProduct` / `updateProduct` | RPC esistente -> trigger `catalog_text_00_policy_v1` |
| Supplier create/edit | `canonicalCatalogEntityName` | errori campo tipizzati | catalog mutation staff/owner | RPC esistente -> trigger DB |
| Category create/edit | `canonicalCatalogEntityName` | errori campo tipizzati | catalog mutation staff/owner | RPC esistente -> trigger DB |
| Inline product supplier/category | `lookupCatalogRelation` | errore prima del lookup/create | catalog mutation | RPC esistente -> trigger DB |
| Supplier XLS/XLSX/HTML workbook | raw cell -> display/identity policy | valore canonico, warning riga/campo, editor testo/prezzi/quantità | preview digest + sync preview | bulk/row RPC -> trigger DB |
| Android database workbook | raw multi-sheet cell -> display/identity policy | valore canonico, warning riga/campo, editor product/item/name/supplier/category | digest-bound database apply | bulk/row RPC -> trigger DB |
| POS supplier import JSON | strict body parser + typed catalog policy | fail-closed HTTP validation | idempotent import RPC | trigger DB |
| Catalog recovery/restore | persisted canonical values; existing authorization/recovery checks | nessuna trasformazione free-form | existing restore/update flow | trigger DB on catalog text update |
| Direct Android/iOS/Supabase writes | n/a | client policy first | RLS and existing atomic sync triggers | `BEFORE` canonical/strict trigger precedes union guards |
| Catalog pull | typed DB row parser + canonical equality check | n/a | fail-closed page mapping | only canonical persisted values emitted |
| Workbook/export | authoritative read model | n/a | formula-safe serialization | only canonical persisted values emitted |

## Android

| Source | Parser / analysis | Apply / local DB | Sync |
|---|---|---|---|
| Manual product/supplier/category | central Kotlin policy in editor/ViewModel | repository final defense before dirty/fingerprint | canonical pending/outbox |
| Supplier Excel / shared grid | analyzer -> Import Analysis warning/error | preview value is apply value | canonical pending/outbox |
| Full DB workbook / restore | database parser -> policy | bounded repository transaction | canonical pending/outbox |
| Inbound recovery | DTO mapper -> policy | fail-closed local persistence | no re-dirty loop |

Stato al checkpoint: implementazione Android consegnata a `REVIEW` nel task
`TASK-140`; fixture digest identico all'Admin. Suite JVM 860 totali
(855 eseguiti + 5 skip intenzionali), lint/build e 3/3 device test su Emulator
API 35 passati. Staging acceptance resta post-merge.

## iOS

| Source | Parser / analysis | Apply / SwiftData | Sync |
|---|---|---|---|
| Manual product/supplier/category | central Swift policy in editor/ViewModel | repository/final import boundary | pre-outbox/fingerprint policy |
| XLSX / generated sheet | analyzer -> Import Analysis warning/error | preview value is apply value | canonical pending/outbox |
| Full DB workbook / legacy CSV | parser -> policy | `ProductImportCore` final defense | canonical pending/outbox |
| Inbound/recovery | DTO mapper -> policy | fail-closed SwiftData persistence | no re-dirty loop |

Stato al checkpoint: task iOS `TASK-140`, fixture byte-identica, policy 7/7,
regressione policy/import/pending/outbound/inbound 204/204, integration 11/11
e full XCTest 1.308 eseguiti / 35 skip opt-in / zero failure. Release, Analyze
e smoke Simulator sono passati; XCUITest è `NOT_RUN / MISSING_TARGET` perché
il progetto non espone un target UI test. Staging acceptance resta post-merge.

## Win7POS read-only contract

- Nessun file o runtime Win7POS modificato/avviato.
- Validator letterale: C0/C1 e surrogate non appaiate rifiutati; limiti in
  UTF-16; policy CATALOG-TEXT-001 intenzionalmente più severa per
  zero-width/BOM/bidi.
- Paging da replicare nel gate staging: `limit=1000`, max 512 pagine full,
  summary/version pinned, cursor non vuoto/non ripetuto, tutte le lane drenate,
  preflight exactness e catalogo attivo non vuoto.
- Non includere checksum nel manifest finché il client Win7POS non può
  verificarlo.
