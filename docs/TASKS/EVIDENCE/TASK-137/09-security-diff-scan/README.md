# 09 - Security diff scan

## Stato

`REMEDIATION_RESCAN_PENDING`

## Snapshot storici immutabili

Il primo Changes scan pre-fix resta conservato in `pre-fix/`:

- base `38f02bd969e55df91ff41d3905661da8dfdb145a`;
- head vulnerabile `2f166b51e7d3ff68f8f01593cb68845788e7be9a`;
- worklist `35/35`;
- quattro finding Medium/high-confidence sul denied-audit Product Images.

La prima remediation e conservata in `post-fix/`. Non viene riutilizzata come
prova per i finding successivi.

## Scan consolidato release

Il Changes scan ufficiale `276dd0cb-1c47-4bae-b2c2-8e8343bfebb1` ha analizzato
la snapshot immutabile:

- range
  `38f02bd969e55df91ff41d3905661da8dfdb145a..3bd380c64b24b21fffa8922d61b0d1675156d7dc`;
- worklist completata `36/36`;
- coverage classificata `partial` dal report ufficiale;
- Deep Scan `OFF`;
- finding validati `3 High / 2 Medium / 2 Low`;
- SHA-256 report
  `4551a569759dff7dac1aef882ea55762007e648ce042317c50811d300c2573d1`.

I sette finding coprono isolamento cross-shop di supplier/category/history e
sync event, storico prezzi append-only, lifecycle shop, direzione tender POS e
permesso indipendente `pos.pay`. Remediation, PoC e regressioni sono nel ledger
`../13-release-security-remediation.md`.

## Nuovo scan post-remediation

Il nuovo gate obbligatorio e un **Changes scan** sul repository Admin Web:

- base esatta `38f02bd969e55df91ff41d3905661da8dfdb145a`;
- head: il commit `SELF` creato da questo freeze e risolto nuovamente prima
  dell'apertura del workspace;
- branch `validate/mac-final-admin-20260717T150455Z` clean e immutato durante
  l'esecuzione;
- scope repository `.`;
- Deep Scan `OFF`;
- focus: tenant catalog/history/event, shop lifecycle, price append-only e POS
  financial boundary.

Finche questo scan non conclude non viene dichiarato `PASS`, zero finding o
closure Security. Gli scanner repository-native e i gate funzionali restano
controlli distinti e non sostitutivi.
